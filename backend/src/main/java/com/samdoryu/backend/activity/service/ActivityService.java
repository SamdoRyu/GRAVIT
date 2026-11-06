package com.samdoryu.backend.activity.service;

import com.samdoryu.backend.activity.domain.ActivityConfirmation;
import com.samdoryu.backend.activity.domain.ActivityKind;
import com.samdoryu.backend.activity.domain.ActivityRecord;
import com.samdoryu.backend.activity.domain.ActivityStatus;
import com.samdoryu.backend.activity.dto.ActivityCreateRequest;
import com.samdoryu.backend.activity.dto.ActivityNote;
import com.samdoryu.backend.activity.dto.ActivityRecordDto;
import com.samdoryu.backend.activity.repository.ActivityConfirmationRepository;
import com.samdoryu.backend.activity.repository.ActivityRecordRepository;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.dto.PageResponse;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 활동 기록 · 확인 · 수집 동의(FR-ACT-01~03 · CONTRACTS_API 「14」). 다른 패키지는 이 Service로만 활동 기록을 읽는다
 * (Snapshot {@code activityNotes} · 회고 리포트 {@code activityDistribution}).
 * 상태는 저장하지 않고 확인 행으로 계산한다 — 작성자가 아닌 팀원이 1명 이상 확인하면 {@code confirmed}.
 * 확인 전 활동은 사무실 메모지 · 리포트 분포에 나오지 않고, 팀 화면 어디에도 활동 시간 합계를 내지 않는다(P6).
 * 인가 검사 순서 1 · 2는 Controller가 끝낸 뒤 부른다 — 여기서는 대상(404) → 역할(403) → 상태(409)를 본다.
 */
@Service
public class ActivityService {

    private final ActivityRecordRepository activityRecordRepository;
    private final ActivityConfirmationRepository activityConfirmationRepository;
    private final WorkspaceService workspaceService;
    private final WorkspaceEventHub eventHub;

    public ActivityService(ActivityRecordRepository activityRecordRepository,
            ActivityConfirmationRepository activityConfirmationRepository, WorkspaceService workspaceService,
            WorkspaceEventHub eventHub) {
        this.activityRecordRepository = activityRecordRepository;
        this.activityConfirmationRepository = activityConfirmationRepository;
        this.workspaceService = workspaceService;
        this.eventHub = eventHub;
    }

    /** {@code PUT W/activity-consent} — 팀원 본인(강사 {@code forbidden_role}). 다시 동의하면 처음 시각은 새로 남는다. */
    @Transactional
    public boolean setConsent(WorkspaceAccess access, boolean consented) {
        Member me = workspaceService.requireMember(access.workspaceId(), access.requireTeamMember());
        if (consented) {
            me.giveActivityConsent(now());
        } else {
            me.withdrawActivityConsent();
        }
        return me.hasActivityConsent();
    }

    /** {@code GET W/activities} — 접근(팀원 · 지정된 강사). createdAt 내림차순, {@code status}가 없으면 전부. */
    @Transactional(readOnly = true)
    public PageResponse<ActivityRecordDto> list(Long workspaceId, ActivityStatus status, int page, int size) {
        List<ActivityRecord> records = activityRecordRepository
                .findByAuthorWorkspaceIdOrderByCreatedAtDescIdDesc(workspaceId);
        Map<Long, List<ActivityConfirmation>> confirmations = confirmationsOf(records);
        List<ActivityRecordDto> all = records.stream()
                .map(record -> ActivityRecordDto.of(record, confirmations.getOrDefault(record.getId(), List.of())))
                .filter(dto -> status == null || dto.status() == status)
                .toList();
        return PageResponse.slice(all, page, size);
    }

    /** {@code POST W/activities} — 팀원(강사 {@code forbidden_role}) → 수집 동의 안 함 {@code conflict}. 상태는 {@code pending}. */
    @Transactional
    public ActivityRecordDto create(WorkspaceAccess access, ActivityCreateRequest request) {
        Member me = workspaceService.requireMember(access.workspaceId(), access.requireTeamMember());
        if (!me.hasActivityConsent()) {
            throw new ApiException(ErrorCode.CONFLICT, "활동 기록 수집에 동의한 뒤 쓸 수 있어요");
        }
        ActivityRecord record = activityRecordRepository.save(
                new ActivityRecord(me, request.kind(), request.content(), request.durationMinutes(), now()));
        eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.ACTIVITIES);
        return ActivityRecordDto.of(record, List.of());
    }

    /**
     * {@code POST W/activities/{activityId}/confirm}(FR-ACT-02) — 다른 사무실 · 없는 활동 {@code not_found} → 강사
     * {@code forbidden_role} → 작성자 본인 {@code forbidden_role}. 이미 확인했으면 그대로 돌려준다.
     */
    @Transactional
    public ActivityRecordDto confirm(WorkspaceAccess access, Long activityId) {
        ActivityRecord record = activityRecordRepository.findByIdAndAuthorWorkspaceId(activityId, access.workspaceId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        Long meId = access.requireTeamMember();
        if (record.getAuthor().getId().equals(meId)) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE, "내가 쓴 활동은 다른 팀원이 확인해요");
        }
        if (!activityConfirmationRepository.existsByActivityRecordIdAndConfirmerId(activityId, meId)) {
            Member me = workspaceService.requireMember(access.workspaceId(), meId);
            try {
                activityConfirmationRepository.saveAndFlush(new ActivityConfirmation(record, me, now()));
            } catch (DataIntegrityViolationException e) {
                // 같은 사람이 동시에 두 번 확인 — (활동, 확인자) 유일 제약이 막는다
                throw new ApiException(ErrorCode.CONFLICT);
            }
            eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.ACTIVITIES);
        }
        return ActivityRecordDto.of(record, activityConfirmationRepository.findByActivityRecordId(activityId));
    }

    /**
     * Snapshot {@code activityNotes}(FR-ACT-03) — 확인된 활동만, 시간 · 내용 없이. {@code confirmedAt}은 첫 확인 시각,
     * 그 오름차순(같으면 활동 ID 순).
     */
    @Transactional(readOnly = true)
    public List<ActivityNote> listNotes(Long workspaceId) {
        List<ActivityRecord> records = activityRecordRepository
                .findByAuthorWorkspaceIdOrderByCreatedAtDescIdDesc(workspaceId);
        Map<Long, List<ActivityConfirmation>> confirmations = confirmationsOf(records);
        return records.stream()
                .filter(record -> confirmations.containsKey(record.getId()))
                .map(record -> new ActivityNote(Ids.toApi(record.getId()), Ids.toApi(record.getAuthor().getId()),
                        record.getKind(), firstConfirmedAt(confirmations.get(record.getId()))))
                .sorted(Comparator.comparing(ActivityNote::confirmedAt)
                        .thenComparing(note -> Long.valueOf(note.id())))
                .toList();
    }

    /**
     * 회고 리포트 {@code activityDistribution}(FR-ACT-03) — 본인의 확인된 활동만 유형별 분 합계. 유형 순서는 계약 enum 순서,
     * 기록이 없는 유형은 빠진다. 개인 리포트에만 쓴다 — 팀 화면에 내지 않는다(P6).
     *
     * @param memberId 이미 사무실 조건으로 찾은 팀원
     */
    @Transactional(readOnly = true)
    public Map<ActivityKind, Integer> confirmedMinutesByKind(Long memberId) {
        List<ActivityRecord> records = activityRecordRepository.findByAuthorId(memberId);
        Map<Long, List<ActivityConfirmation>> confirmations = confirmationsOf(records);
        Map<ActivityKind, Integer> minutes = new EnumMap<>(ActivityKind.class);
        records.stream()
                .filter(record -> confirmations.containsKey(record.getId()))
                .forEach(record -> minutes.merge(record.getKind(), record.getDurationMinutes(), Integer::sum));
        return minutes;
    }

    private Map<Long, List<ActivityConfirmation>> confirmationsOf(List<ActivityRecord> records) {
        if (records.isEmpty()) {
            return Map.of();
        }
        return activityConfirmationRepository
                .findByActivityRecordIdIn(records.stream().map(ActivityRecord::getId).toList()).stream()
                .collect(Collectors.groupingBy(confirmation -> confirmation.getActivityRecord().getId()));
    }

    private static Instant firstConfirmedAt(List<ActivityConfirmation> confirmations) {
        return confirmations.stream().map(ActivityConfirmation::getConfirmedAt).min(Comparator.naturalOrder())
                .orElseThrow();
    }

    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }
}

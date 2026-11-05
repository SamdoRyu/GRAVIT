package com.samdoryu.backend.meeting.service;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.meeting.domain.Standup;
import com.samdoryu.backend.meeting.dto.StandupDto;
import com.samdoryu.backend.meeting.dto.StandupPrefill;
import com.samdoryu.backend.meeting.dto.StandupSaveRequest;
import com.samdoryu.backend.meeting.repository.StandupRepository;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.sync.dto.GithubReviewDto;
import com.samdoryu.backend.sync.dto.SubmissionDto;
import com.samdoryu.backend.sync.dto.TaskDto;
import com.samdoryu.backend.sync.service.SyncedItemService;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Predicate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 스탠드업(FR-MTG-02). (사무실, 팀원, 날짜)마다 하나 — 쓰면 있으면 고치고 없으면 만든다. 날짜는 한국 시간 달력 날짜.
 * 인가 검사(접근 · 팀원)는 Controller가 끝낸 뒤 부른다.
 */
@Service
public class StandupService {

    private final StandupRepository standupRepository;
    private final SyncedItemService syncedItemService;
    private final WorkspaceEventHub eventHub;
    private final EntityManager entityManager;

    public StandupService(StandupRepository standupRepository, SyncedItemService syncedItemService,
            WorkspaceEventHub eventHub, EntityManager entityManager) {
        this.standupRepository = standupRepository;
        this.syncedItemService = syncedItemService;
        this.eventHub = eventHub;
        this.entityManager = entityManager;
    }

    /** {@code GET W/standups?date=} — 그날 쓴 팀원 것, memberId 순. */
    @Transactional(readOnly = true)
    public List<StandupDto> listByDate(Long workspaceId, LocalDate date) {
        return standupRepository.findByWorkspaceIdAndDateOrderByMemberIdAsc(workspaceId, date).stream()
                .map(StandupDto::of).toList();
    }

    /**
     * {@code GET W/standups/{date}/mine/prefill}(FR-MTG-01) — {@code date}의 전날(한국 시간 하루) 내 GitHub 활동을 동기화
     * 데이터에서 모은다. 내가 연 PR · 머지된 내 PR · 내가 제출한 리뷰 · 내가 담당자인 이슈의 닫힘.
     * <ul>
     *   <li>[구현 기본값] 이슈를 닫은 사람은 동기화 데이터에 없어서 담당자 기준으로 본다.</li>
     *   <li>{@code commit}은 아직 없다 — 사용자별 커밋 읽기가 GitHub 어댑터에 생기면 더한다(#34 후속).</li>
     * </ul>
     */
    @Transactional(readOnly = true)
    public StandupPrefill prefill(Long workspaceId, Long memberId, LocalDate date) {
        Instant from = date.minusDays(1).atStartOfDay(Standup.DATE_ZONE).toInstant();
        Instant to = date.atStartOfDay(Standup.DATE_ZONE).toInstant();
        Predicate<Instant> yesterday = at -> at != null && !at.isBefore(from) && at.isBefore(to);
        String me = Ids.toApi(memberId);
        // ponytail: 사무실의 이슈 · PR 전부를 읽어 거른다 — 팀 레포 규모(수백 건)면 충분, 커지면 기간 조건 쿼리로
        List<StandupPrefill.Item> items = new ArrayList<>();
        for (SubmissionDto pr : syncedItemService.listSubmissions(workspaceId)) {
            if (me.equals(pr.authorMemberId())) {
                if (yesterday.test(pr.githubCreatedAt())) {
                    items.add(item(StandupPrefill.Kind.PR_OPENED, pr.title(), pr.githubPrNumber(), pr.githubCreatedAt()));
                }
                if (yesterday.test(pr.mergedAt())) {
                    items.add(item(StandupPrefill.Kind.PR_MERGED, pr.title(), pr.githubPrNumber(), pr.mergedAt()));
                }
            }
            for (GithubReviewDto review : pr.reviews()) {
                if (me.equals(review.reviewerMemberId()) && yesterday.test(review.submittedAt())) {
                    items.add(item(StandupPrefill.Kind.REVIEW_SUBMITTED, pr.title(), pr.githubPrNumber(),
                            review.submittedAt()));
                }
            }
        }
        for (TaskDto issue : syncedItemService.listTasks(workspaceId)) {
            if (issue.assigneeMemberIds().contains(me) && yesterday.test(issue.closedAt())) {
                items.add(item(StandupPrefill.Kind.ISSUE_CLOSED, issue.title(), issue.githubIssueNumber(),
                        issue.closedAt()));
            }
        }
        items.sort(Comparator.comparing(StandupPrefill.Item::occurredAt));
        return new StandupPrefill(date, items);
    }

    private static StandupPrefill.Item item(StandupPrefill.Kind kind, String title, int githubNumber, Instant at) {
        return new StandupPrefill.Item(kind, title, githubNumber, at);
    }

    /**
     * {@code PUT W/standups/{date}/mine} — 내 스탠드업을 쓴다. 오늘(한국 시간)보다 뒤 날짜는 {@code invalid}.
     *
     * @param memberId 세션 사용자의 그 사무실 팀원 ID(강사는 Controller에서 이미 거부됨)
     */
    @Transactional
    public StandupDto saveMine(Long workspaceId, Long memberId, LocalDate date, StandupSaveRequest request) {
        Instant now = Instant.now();
        if (date.isAfter(LocalDate.ofInstant(now, Standup.DATE_ZONE))) {
            throw new ApiException(ErrorCode.INVALID, "오늘 이후 날짜의 스탠드업은 쓸 수 없어요");
        }
        // ponytail: 같은 사람이 같은 날을 동시에 처음 쓰면 (사무실, 팀원, 날짜) 유일 제약이 하나를 막는다(unavailable) —
        // 계약에 409가 없고 한 사람의 겹친 저장이라 다시 저장하면 된다
        Standup standup = standupRepository.findByWorkspaceIdAndMemberIdAndDate(workspaceId, memberId, date)
                .orElse(null);
        if (standup == null) {
            standup = standupRepository.save(new Standup(entityManager.getReference(Workspace.class, workspaceId),
                    entityManager.getReference(Member.class, memberId), date, request.yesterday(),
                    request.blockers(), now));
        } else {
            standup.rewrite(request.yesterday(), request.blockers(), now);
        }
        eventHub.publishChangeAfterCommit(workspaceId, SnapshotResource.STANDUPS);
        return StandupDto.of(standup);
    }
}

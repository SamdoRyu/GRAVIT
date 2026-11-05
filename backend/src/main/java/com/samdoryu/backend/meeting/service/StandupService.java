package com.samdoryu.backend.meeting.service;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.meeting.domain.Standup;
import com.samdoryu.backend.meeting.dto.StandupDto;
import com.samdoryu.backend.meeting.dto.StandupSaveRequest;
import com.samdoryu.backend.meeting.repository.StandupRepository;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 스탠드업(FR-MTG-02). (사무실, 팀원, 날짜)마다 하나 — 쓰면 있으면 고치고 없으면 만든다. 날짜는 한국 시간 달력 날짜.
 * 인가 검사(접근 · 팀원)는 Controller가 끝낸 뒤 부른다.
 */
@Service
public class StandupService {

    private final StandupRepository standupRepository;
    private final WorkspaceEventHub eventHub;
    private final EntityManager entityManager;

    public StandupService(StandupRepository standupRepository, WorkspaceEventHub eventHub,
            EntityManager entityManager) {
        this.standupRepository = standupRepository;
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

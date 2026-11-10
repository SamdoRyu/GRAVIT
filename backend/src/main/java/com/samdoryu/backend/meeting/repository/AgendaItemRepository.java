package com.samdoryu.backend.meeting.repository;

import com.samdoryu.backend.meeting.domain.AgendaItem;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 사무실 단위 — 항상 사무실 조건으로 찾는다(IDOR 방어). */
public interface AgendaItemRepository extends JpaRepository<AgendaItem, Long> {

    Optional<AgendaItem> findByIdAndWorkspaceId(Long id, Long workspaceId);

    /** 이 도움 요청에서 만든 안건 전부(거둔 것 포함) — 원본 도움 요청 영구 삭제(#315). */
    List<AgendaItem> findByWorkspaceIdAndSourceHelpRequestId(Long workspaceId, Long sourceHelpRequestId);

    /** Snapshot {@code agendaItems} — 거둔 것 포함 전부, raisedAt 오름차순. */
    List<AgendaItem> findByWorkspaceIdOrderByRaisedAtAscIdAsc(Long workspaceId);

    /** 회의에서 다룬 안건 — {@code MeetingDto.discussedAgendaItemIds}. 회의는 이미 사무실 조건으로 찾은 것이다. */
    List<AgendaItem> findByMeetingIdInOrderByIdAsc(Collection<Long> meetingIds);

    /** 강사 요청함 — 여러 사무실의 강사 피드백이 요청된 결정 기록을 사무실 · 올린 사람과 함께. 빈 목록으로 부르지 않는다. */
    @Query("select a from AgendaItem a join fetch a.workspace join fetch a.raisedBy"
            + " where a.workspace.id in :workspaceIds and a.feedbackRequestedAt is not null")
    List<AgendaItem> findFeedbackRequestedByWorkspaceIds(@Param("workspaceIds") Collection<Long> workspaceIds);
}

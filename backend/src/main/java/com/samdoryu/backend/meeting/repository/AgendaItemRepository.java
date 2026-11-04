package com.samdoryu.backend.meeting.repository;

import com.samdoryu.backend.meeting.domain.AgendaItem;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사무실 단위 — 항상 사무실 조건으로 찾는다(IDOR 방어). */
public interface AgendaItemRepository extends JpaRepository<AgendaItem, Long> {

    Optional<AgendaItem> findByIdAndWorkspaceId(Long id, Long workspaceId);

    /** Snapshot {@code agendaItems} — 거둔 것 포함 전부, raisedAt 오름차순. */
    List<AgendaItem> findByWorkspaceIdOrderByRaisedAtAscIdAsc(Long workspaceId);

    /** 회의에서 다룬 안건 — {@code MeetingDto.discussedAgendaItemIds}. 회의는 이미 사무실 조건으로 찾은 것이다. */
    List<AgendaItem> findByMeetingIdInOrderByIdAsc(Collection<Long> meetingIds);
}

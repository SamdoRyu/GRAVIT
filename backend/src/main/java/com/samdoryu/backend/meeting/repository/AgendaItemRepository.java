package com.samdoryu.backend.meeting.repository;

import com.samdoryu.backend.meeting.domain.AgendaItem;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사무실 단위 — 항상 사무실 조건으로 찾는다(IDOR 방어). */
public interface AgendaItemRepository extends JpaRepository<AgendaItem, Long> {

    Optional<AgendaItem> findByIdAndWorkspaceId(Long id, Long workspaceId);
}

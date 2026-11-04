package com.samdoryu.backend.help.repository;

import com.samdoryu.backend.help.domain.HelpRequest;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사무실 단위 — 항상 사무실 조건으로 찾는다(IDOR 방어). */
public interface HelpRequestRepository extends JpaRepository<HelpRequest, Long> {

    Optional<HelpRequest> findByIdAndWorkspaceId(Long id, Long workspaceId);

    /** Snapshot {@code helpRequests} — 전부, createdAt 오름차순. */
    List<HelpRequest> findByWorkspaceIdOrderByCreatedAtAscIdAsc(Long workspaceId);
}

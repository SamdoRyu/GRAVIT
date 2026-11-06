package com.samdoryu.backend.help.repository;

import com.samdoryu.backend.help.domain.HelpRequest;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 사무실 단위 — 항상 사무실 조건으로 찾는다(IDOR 방어). */
public interface HelpRequestRepository extends JpaRepository<HelpRequest, Long> {

    Optional<HelpRequest> findByIdAndWorkspaceId(Long id, Long workspaceId);

    /** Snapshot {@code helpRequests} — 전부, createdAt 오름차순. */
    List<HelpRequest> findByWorkspaceIdOrderByCreatedAtAscIdAsc(Long workspaceId);

    /** 강사 요청함 — 여러 사무실의 "강사에게 요청"이 켜진 글을 사무실 · 요청자와 함께. 빈 목록으로 부르지 않는다. */
    @Query("select h from HelpRequest h join fetch h.workspace join fetch h.requester"
            + " where h.workspace.id in :workspaceIds and h.instructorRequestedAt is not null")
    List<HelpRequest> findInstructorRequestedByWorkspaceIds(@Param("workspaceIds") Collection<Long> workspaceIds);
}

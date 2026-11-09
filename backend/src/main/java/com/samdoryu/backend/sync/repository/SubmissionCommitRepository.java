package com.samdoryu.backend.sync.repository;

import com.samdoryu.backend.sync.domain.SubmissionCommit;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SubmissionCommitRepository extends JpaRepository<SubmissionCommit, Long> {

    /** 동기화 — PR 하나의 커밋 중 이미 저장한 것(사무실 조건으로, PR마다 한 번에). */
    List<SubmissionCommit> findByWorkspaceIdAndShaIn(Long workspaceId, Collection<String> shas);

    /** 사용자별 커밋 — 그 팀원이 {@code [from, to)}에 작성한 커밋, 작성 시각 순(#261). */
    @Query("""
            select c from SubmissionCommit c
            where c.workspace.id = :workspaceId and c.authorMember.id = :memberId
              and c.authoredAt >= :from and c.authoredAt < :to
            order by c.authoredAt, c.id
            """)
    List<SubmissionCommit> findAuthoredBetween(@Param("workspaceId") Long workspaceId,
            @Param("memberId") Long memberId, @Param("from") Instant from, @Param("to") Instant to);
}

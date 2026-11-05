package com.samdoryu.backend.evaluation.repository;

import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EvaluationRoundRepository extends JpaRepository<EvaluationRound, Long> {

    /** 현재 회차 — 회차 번호가 가장 큰 것. */
    Optional<EvaluationRound> findFirstBySubmissionIdOrderByRoundNumberDesc(Long submissionId);

    /** {@code GET W/submissions/{id}/rounds} — 회차 번호 내림차순. */
    List<EvaluationRound> findBySubmissionIdOrderByRoundNumberDesc(Long submissionId);

    /** 사무실의 PR마다 현재 회차 하나(Snapshot {@code currentRound}) — 작성자 · 상태를 보려고 PR을 함께 읽는다. */
    @Query("""
            select r from EvaluationRound r join fetch r.submission s
            where s.workspace.id = :workspaceId
              and r.roundNumber = (select max(r2.roundNumber) from EvaluationRound r2 where r2.submission = s)
            """)
    List<EvaluationRound> findCurrentRoundsInWorkspace(@Param("workspaceId") Long workspaceId);
}

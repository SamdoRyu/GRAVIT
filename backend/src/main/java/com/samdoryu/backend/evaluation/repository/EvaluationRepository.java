package com.samdoryu.backend.evaluation.repository;

import com.samdoryu.backend.evaluation.domain.Evaluation;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EvaluationRepository extends JpaRepository<Evaluation, Long> {

    /** 내 평가 — 1인 1회. */
    Optional<Evaluation> findByRoundIdAndEvaluatorId(Long roundId, Long evaluatorUserId);

    /** 회차의 평가 전부 — 저장 순서. 응답으로 바꿀 때 평가자를 빼야 한다. */
    List<Evaluation> findByRoundIdOrderByIdAsc(Long roundId);

    /** 여러 회차의 평가를 한 번에 — 저장 순서. 응답으로 바꿀 때 평가자를 빼야 한다. */
    List<Evaluation> findByRoundIdInOrderByIdAsc(Collection<Long> roundIds);

    /** 한 사람이 이 사무실에서 남긴 평가 전부 — 저장 순서. 학습 타임라인(#172)의 본인 평가. */
    @Query("""
            select e from Evaluation e join fetch e.round r join fetch r.submission s
            where e.evaluator.id = :evaluatorUserId and s.workspace.id = :workspaceId
            order by e.id
            """)
    List<Evaluation> findGivenInWorkspace(@Param("workspaceId") Long workspaceId,
            @Param("evaluatorUserId") Long evaluatorUserId);
}

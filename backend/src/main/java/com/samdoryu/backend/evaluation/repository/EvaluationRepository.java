package com.samdoryu.backend.evaluation.repository;

import com.samdoryu.backend.evaluation.domain.Evaluation;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EvaluationRepository extends JpaRepository<Evaluation, Long> {

    /** 내 평가 — 1인 1회. */
    Optional<Evaluation> findByRoundIdAndEvaluatorId(Long roundId, Long evaluatorUserId);

    /** 회차의 평가 전부 — 저장 순서. 응답으로 바꿀 때 평가자를 빼야 한다. */
    List<Evaluation> findByRoundIdOrderByIdAsc(Long roundId);

    /** 여러 회차의 평가를 한 번에 — 저장 순서. 응답으로 바꿀 때 평가자를 빼야 한다. */
    List<Evaluation> findByRoundIdInOrderByIdAsc(Collection<Long> roundIds);
}

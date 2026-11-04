package com.samdoryu.backend.evaluation.repository;

import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EvaluationRoundRepository extends JpaRepository<EvaluationRound, Long> {

    /** 현재 회차 — 회차 번호가 가장 큰 것. */
    Optional<EvaluationRound> findFirstBySubmissionIdOrderByRoundNumberDesc(Long submissionId);

    /** {@code GET W/submissions/{id}/rounds} — 회차 번호 내림차순. */
    List<EvaluationRound> findBySubmissionIdOrderByRoundNumberDesc(Long submissionId);
}

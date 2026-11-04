package com.samdoryu.backend.evaluation.service;

import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 평가 회차(CONTRACTS_API 「9」). 지금은 다른 패키지가 쓰는 읽기만 있다 — 회차 열기 · 평가는 #19 · #46에서 더한다. */
@Service
public class EvaluationRoundService {

    private final EvaluationRoundRepository evaluationRoundRepository;

    public EvaluationRoundService(EvaluationRoundRepository evaluationRoundRepository) {
        this.evaluationRoundRepository = evaluationRoundRepository;
    }

    /** 제출의 현재 회차(회차 번호가 가장 큰 것) ID. 아직 회차가 없으면 null. */
    @Transactional(readOnly = true)
    public Long currentRoundId(Long submissionId) {
        return evaluationRoundRepository.findFirstBySubmissionIdOrderByRoundNumberDesc(submissionId)
                .map(EvaluationRound::getId)
                .orElse(null);
    }
}

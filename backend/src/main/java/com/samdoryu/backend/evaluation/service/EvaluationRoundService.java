package com.samdoryu.backend.evaluation.service;

import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.sync.domain.Submission;
import java.time.Instant;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 평가 회차(CONTRACTS_API 「9」). 지금은 다른 패키지가 쓰는 메서드만 있다 — 동기화 회차 열기 · 평가는 #19 · #46에서 더한다.
 * 회의 재평가 회차는 #37(A)이 먼저 더했다.
 */
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

    /**
     * 회의 결정 {@code revise_and_reevaluate}(FR-LRN-06) — 그때의 {@code headSha}로 새 회차를 열고 이전 회차를 닫는다.
     * 안건 결정과 같은 트랜잭션에서 부른다. 회차가 아직 없으면 1회차다.
     */
    @Transactional
    public void openMeetingReevaluateRound(Submission submission, Instant now) {
        Optional<EvaluationRound> current = evaluationRoundRepository
                .findFirstBySubmissionIdOrderByRoundNumberDesc(submission.getId());
        current.filter(round -> round.getClosedAt() == null).ifPresent(round -> round.close(now));
        int next = current.map(round -> round.getRoundNumber() + 1).orElse(1);
        evaluationRoundRepository.save(new EvaluationRound(submission, next, submission.getHeadSha(),
                RoundOpenedReason.MEETING_REEVALUATE, now));
    }
}

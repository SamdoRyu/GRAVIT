package com.samdoryu.backend.evaluation.dto;

import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.domain.Verdict;
import java.time.Instant;
import java.util.List;

/**
 * 평가 회차 — CONTRACTS_API 「9」 EvaluationRoundDto. 평가자 · 평가 ID · 시각은 담지 않는다(익명).
 * 채우는 매핑은 #19에서 더한다.
 *
 * @param headSha 회차를 시작한 커밋 — 회차 ID와 별개
 * @param reasons 추천 먼저, 그 안에서 저장 순서
 * @param myEvaluation 요청한 사람 자신의 평가만
 * @param canEvaluate 화면 표시용 — 서버는 평가 요청 때 다시 검사한다
 */
public record EvaluationRoundDto(
        String id,
        int roundNumber,
        String headSha,
        RoundOpenedReason openedReason,
        Instant openedAt,
        Instant closedAt,
        int recommendCount,
        int notRecommendCount,
        List<Reason> reasons,
        MyEvaluation myEvaluation,
        boolean canEvaluate) {

    /** CONTRACTS_API 「9」 EvaluationReason. */
    public record Reason(Verdict verdict, String reason) {
    }

    /** CONTRACTS_API 「9」 MyEvaluation. */
    public record MyEvaluation(Verdict verdict, String reason, Instant updatedAt) {
    }
}

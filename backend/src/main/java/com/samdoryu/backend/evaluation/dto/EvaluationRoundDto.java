package com.samdoryu.backend.evaluation.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.evaluation.domain.Evaluation;
import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.domain.Verdict;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/**
 * 평가 회차 — CONTRACTS_API 「9」 EvaluationRoundDto. 평가자 · 평가 ID · 시각은 담지 않는다(익명 — CONTRACTS.md 「5」).
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

    /** 추천 먼저, 그 안에서 저장 순서(평가 ID 오름차순). */
    private static final Comparator<Evaluation> REASON_ORDER = Comparator
            .comparing((Evaluation evaluation) -> evaluation.getVerdict() != Verdict.RECOMMEND)
            .thenComparing(Evaluation::getId);

    /** CONTRACTS_API 「9」 EvaluationReason. */
    public record Reason(Verdict verdict, String reason) {
    }

    /** CONTRACTS_API 「9」 MyEvaluation. */
    public record MyEvaluation(Verdict verdict, String reason, Instant updatedAt) {
    }

    /**
     * @param evaluations 그 회차의 평가 전부. 평가자는 {@code myEvaluation}을 고르는 데만 쓰고 응답에 담지 않는다
     * @param viewerUserId 요청한 사람 — 그 사람의 평가만 {@code myEvaluation}으로
     */
    public static EvaluationRoundDto of(EvaluationRound round, List<Evaluation> evaluations, Long viewerUserId,
            boolean canEvaluate) {
        MyEvaluation mine = evaluations.stream()
                .filter(evaluation -> evaluation.getEvaluator().getId().equals(viewerUserId))
                .findFirst()
                .map(evaluation -> new MyEvaluation(evaluation.getVerdict(), evaluation.getReason(),
                        evaluation.getUpdatedAt()))
                .orElse(null);
        int recommendCount = (int) evaluations.stream().filter(e -> e.getVerdict() == Verdict.RECOMMEND).count();
        return new EvaluationRoundDto(
                Ids.toApi(round.getId()),
                round.getRoundNumber(),
                round.getHeadSha(),
                round.getOpenedReason(),
                round.getOpenedAt(),
                round.getClosedAt(),
                recommendCount,
                evaluations.size() - recommendCount,
                evaluations.stream().sorted(REASON_ORDER)
                        .map(evaluation -> new Reason(evaluation.getVerdict(), evaluation.getReason()))
                        .toList(),
                mine,
                canEvaluate);
    }
}

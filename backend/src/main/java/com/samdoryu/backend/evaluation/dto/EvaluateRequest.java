package com.samdoryu.backend.evaluation.dto;

import com.samdoryu.backend.evaluation.domain.Verdict;
import jakarta.validation.constraints.NotNull;

/**
 * {@code PUT W/submissions/{submissionId}/evaluations/mine} 요청 — CONTRACTS_API 「9」 EvaluateRequest.
 * 이유 길이(앞뒤 공백을 뺀 뒤 1~200자)와 {@code roundId} 형식은 Service가 {@code invalid}로 검사한다.
 *
 * @param roundId 평가하려는 회차 — 그 사이 새 회차가 열렸으면 {@code conflict}
 */
public record EvaluateRequest(
        @NotNull String roundId,
        @NotNull Verdict verdict,
        @NotNull String reason) {
}

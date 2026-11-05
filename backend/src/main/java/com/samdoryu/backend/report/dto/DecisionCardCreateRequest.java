package com.samdoryu.backend.report.dto;

import jakarta.validation.constraints.NotNull;

/** {@code POST W/members/{memberId}/decision-cards} 요청 — CONTRACTS_API 「15」 {@code { submissionId: Id }}. 형식이 틀리면 {@code invalid}. */
public record DecisionCardCreateRequest(@NotNull String submissionId) {
}

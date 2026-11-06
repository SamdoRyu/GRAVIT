package com.samdoryu.backend.report.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** {@code POST W/members/{memberId}/decision-cards/{cardId}/follow-up-questions} 요청 — CONTRACTS_API 「15」 (1~1000자). */
public record FollowUpQuestionCreateRequest(@NotBlank @Size(max = 1000) String body) {
}

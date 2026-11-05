package com.samdoryu.backend.requirement.dto;

import jakarta.validation.constraints.NotNull;

/**
 * {@code POST W/requirement-links} 요청 — CONTRACTS_API 「8」 {@code { requirementId: Id; taskId: Id }}.
 * ID 형식은 Service가 {@code invalid}로 검사한다.
 */
public record RequirementLinkCreateRequest(@NotNull String requirementId, @NotNull String taskId) {
}

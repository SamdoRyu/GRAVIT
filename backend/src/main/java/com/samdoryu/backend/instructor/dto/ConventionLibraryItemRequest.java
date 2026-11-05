package com.samdoryu.backend.instructor.dto;

import com.samdoryu.backend.instructor.domain.ConventionTarget;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * {@code POST /api/convention-library} · {@code PUT /api/convention-library/{itemId}} 요청 — CONTRACTS_API 「17」
 * ConventionLibraryItemRequest. 계약 밖의 target 값은 본문을 읽을 때 {@code invalid}다.
 *
 * @param content 패턴 · 예시 · 템플릿 본문
 * @param description 없으면 null
 */
public record ConventionLibraryItemRequest(
        @NotNull ConventionTarget target,
        @NotNull @Size(min = 1, max = 100) String name,
        @NotNull @Size(min = 1, max = 20000) String content,
        @Size(max = 2000) String description) {
}

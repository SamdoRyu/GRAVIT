package com.samdoryu.backend.workspace.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * {@code PUT W/settings} 요청 — CONTRACTS_API.md 「7」 TeamSettings(전체 교체). 형식 · 범위 오류는 {@code invalid}.
 * 날짜 순서(끝 ≥ 시작)는 Service가 본다.
 *
 * @param specDocumentPath 없으면 null(FR-REQ-01). 1~300자
 * @param reviewWaitHours 정수 1~720 (P9)
 * @param noCommitHours 정수 1~720 (P9)
 */
public record TeamSettingsUpdateRequest(
        @NotNull LocalDate projectStartDate,
        @NotNull LocalDate projectEndDate,
        @Size(min = 1, max = 300) String specDocumentPath,
        @NotNull @Min(1) @Max(720) Integer reviewWaitHours,
        @NotNull @Min(1) @Max(720) Integer noCommitHours) {
}

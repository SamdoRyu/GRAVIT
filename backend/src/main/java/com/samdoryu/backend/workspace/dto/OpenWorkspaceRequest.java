package com.samdoryu.backend.workspace.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * {@code POST /api/workspaces} 요청 — CONTRACTS_API.md 「3」 OpenWorkspaceRequest. 형식 · 길이 오류는 {@code invalid}.
 *
 * @param specDocumentPath 건너뛰면 null(FR-REQ-01). 1~300자, 공백만은 안 됨(CONTRACTS.md 「5」)
 * @param activityConsent 레포 관리자(연 사람)의 활동 기록 수집 동의(FR-ACT · P12)
 */
public record OpenWorkspaceRequest(
        @NotNull String githubRepoId,
        @NotNull LocalDate projectStartDate,
        @NotNull LocalDate projectEndDate,
        @Size(max = 300) @Pattern(regexp = "(?s).*\\S.*") String specDocumentPath,
        @NotNull Boolean activityConsent) {
}

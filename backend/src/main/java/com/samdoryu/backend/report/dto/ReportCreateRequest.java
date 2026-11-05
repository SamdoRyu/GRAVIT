package com.samdoryu.backend.report.dto;

import com.samdoryu.backend.report.domain.ReportKind;
import jakarta.validation.constraints.NotNull;

/** `POST W/members/{memberId}/reports` 요청 — CONTRACTS_API 「15」. */
public record ReportCreateRequest(@NotNull ReportKind kind) {
}

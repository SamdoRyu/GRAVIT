package com.samdoryu.backend.report.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** `PUT W/members/{memberId}/reports/{reportId}/learning` 요청 — CONTRACTS_API 「15」. 0~5000자(비우기 허용). */
public record ReportLearningRequest(@NotNull @Size(max = 5000) String learning) {
}

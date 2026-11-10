package com.samdoryu.backend.report.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** `PUT W/members/{memberId}/reports/{reportId}/learning` 요청 — CONTRACTS_API 「15」. 느낀 점 1~5000자(#335 — 비우기 없음). */
public record ReportLearningRequest(@NotBlank @Size(max = 5000) String learning) {
}

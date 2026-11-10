package com.samdoryu.backend.report.dto;

import com.samdoryu.backend.report.domain.ReportKind;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * {@code POST W/members/{memberId}/reports} 요청 — CONTRACTS_API 「15」 RetroReportCreateRequest(#335).
 *
 * @param title 1~100자 — 앞뒤 공백은 Service가 뺀다
 * @param learning 느낀 점 1~5000자(FR-REP-02)
 * @param decisionCardIds 넣을 기술 결정 카드 — 본인 카드이고 카드의 배운 점이 있는 것(Service가 검사)
 */
public record ReportCreateRequest(
        @NotNull ReportKind kind,
        @NotBlank @Size(max = 100) String title,
        @NotBlank @Size(max = 5000) String learning,
        @NotNull List<@NotNull String> decisionCardIds) {
}

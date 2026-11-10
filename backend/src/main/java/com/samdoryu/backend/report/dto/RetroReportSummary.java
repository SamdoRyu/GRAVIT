package com.samdoryu.backend.report.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.report.domain.ReportKind;
import com.samdoryu.backend.report.domain.RetroReport;
import java.time.Instant;

/** 회고 리포트 목록 칸 — CONTRACTS_API 「15」 RetroReportSummary. */
public record RetroReportSummary(String id, ReportKind kind, String title, Instant createdAt) {

    public static RetroReportSummary of(RetroReport report) {
        return new RetroReportSummary(Ids.toApi(report.getId()), report.getKind(), report.getTitle(),
                report.getCreatedAt());
    }
}

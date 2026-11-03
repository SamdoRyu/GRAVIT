package com.samdoryu.backend.help.dto;

import com.samdoryu.backend.help.domain.HelpRequestStatus;
import java.time.Instant;

/** 도움 요청 요약 — `POST W/help-requests` 응답 · Snapshot `helpRequests` (CONTRACTS_API 「11」). */
public record HelpRequestSummary(
        String id,
        String requesterMemberId,
        String content,
        HelpRequestStatus status,
        boolean isAgendaCandidate,
        boolean instructorRequested,
        Instant instructorRequestedAt,
        String agendaItemId,
        String fromStandupId,
        int commentCount,
        Instant createdAt,
        Instant closedAt) {
}

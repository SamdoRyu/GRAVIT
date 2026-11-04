package com.samdoryu.backend.help.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.help.domain.HelpRequest;
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

    /** @param now 안건 후보 계산 기준 시각 */
    public static HelpRequestSummary of(HelpRequest helpRequest, Instant now) {
        return new HelpRequestSummary(
                Ids.toApi(helpRequest.getId()),
                Ids.toApi(helpRequest.getRequester().getId()),
                helpRequest.getContent(),
                helpRequest.getStatus(),
                helpRequest.isAgendaCandidate(now),
                helpRequest.isInstructorRequested(),
                helpRequest.getInstructorRequestedAt(),
                Ids.toApi(helpRequest.getAgendaItemId()),
                helpRequest.getFromStandup() == null ? null : Ids.toApi(helpRequest.getFromStandup().getId()),
                helpRequest.getCommentCount(),
                helpRequest.getCreatedAt(),
                helpRequest.getClosedAt());
    }
}

package com.samdoryu.backend.help.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.help.domain.HelpComment;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.domain.HelpRequestStatus;
import java.time.Instant;
import java.util.List;

/**
 * 도움 요청 상세 — `GET W/help-requests/{id}` (CONTRACTS_API 「11」 HelpRequestDetail).
 * 계약은 {@link HelpRequestSummary}를 넓힌 모양이라 요약 필드 12개를 그대로 펼쳐 둔다(record는 상속이 없다).
 *
 * @param comments createdAt 오름차순
 */
public record HelpRequestDetail(
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
        Instant closedAt,
        List<HelpCommentDto> comments,
        String helpfulCommentId,
        String learning) {

    public static HelpRequestDetail of(HelpRequest helpRequest, List<HelpComment> comments, Instant now) {
        HelpRequestSummary s = HelpRequestSummary.of(helpRequest, now);
        return new HelpRequestDetail(s.id(), s.requesterMemberId(), s.content(), s.status(), s.isAgendaCandidate(),
                s.instructorRequested(), s.instructorRequestedAt(), s.agendaItemId(), s.fromStandupId(),
                comments.size(), s.createdAt(), s.closedAt(),
                comments.stream().map(HelpCommentDto::of).toList(),
                helpRequest.getHelpfulComment() == null ? null : Ids.toApi(helpRequest.getHelpfulComment().getId()),
                helpRequest.getLearning());
    }
}

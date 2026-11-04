package com.samdoryu.backend.meeting.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.PrDecision;
import java.time.Instant;
import java.time.LocalDate;

/** 안건의 결정 기록 — CONTRACTS_API 「10」 AgendaDecisionDto. */
public record AgendaDecisionDto(
        String conclusion,
        String learning,
        PrDecision prDecision,
        String followUpAssigneeMemberId,
        LocalDate followUpDueDate,
        String meetingId,
        String decidedByMemberId,
        Instant decidedAt) {

    /** 결정 기록이 있는 안건({@code discussed})만 부른다. */
    static AgendaDecisionDto of(AgendaItem item) {
        return new AgendaDecisionDto(
                item.getConclusion(),
                item.getLearning(),
                item.getPrDecision(),
                item.getFollowUpAssignee() == null ? null : Ids.toApi(item.getFollowUpAssignee().getId()),
                item.getFollowUpDueDate(),
                item.getMeeting() == null ? null : Ids.toApi(item.getMeeting().getId()),
                Ids.toApi(item.getDecidedBy().getId()),
                item.getDecidedAt());
    }
}

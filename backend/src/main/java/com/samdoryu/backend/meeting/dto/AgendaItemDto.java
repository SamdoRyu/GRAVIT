package com.samdoryu.backend.meeting.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.AgendaStatus;
import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import java.time.Instant;
import java.util.List;

/** 안건 — CONTRACTS_API 「10」 AgendaItemDto. `POST W/agenda-items` 응답 · Snapshot {@code agendaItems}. */
public record AgendaItemDto(
        String id,
        AgendaKind kind,
        AgendaStatus status,
        String title,
        String background,
        String tried,
        String unresolvedReason,
        Source source,
        String evaluationRoundId,
        String raisedByMemberId,
        Instant raisedAt,
        AgendaDecisionDto decision,
        boolean feedbackRequested,
        Instant feedbackRequestedAt,
        List<InstructorFeedbackDto> instructorFeedbacks) {

    /** @param type {@code task} · {@code submission} · {@code help_request} */
    public record Source(String type, String id) {
    }

    /** @param feedbacks 이 안건의 강사 피드백, createdAt 오름차순 */
    public static AgendaItemDto of(AgendaItem item, List<InstructorFeedback> feedbacks) {
        return new AgendaItemDto(
                Ids.toApi(item.getId()),
                item.getKind(),
                item.getStatus(),
                item.getTitle(),
                item.getBackground(),
                item.getTried(),
                item.getUnresolvedReason(),
                sourceOf(item),
                Ids.toApi(item.getEvaluationRoundId()),
                Ids.toApi(item.getRaisedBy().getId()),
                item.getRaisedAt(),
                item.getStatus() == AgendaStatus.DISCUSSED ? AgendaDecisionDto.of(item) : null,
                item.getFeedbackRequestedAt() != null,
                item.getFeedbackRequestedAt(),
                feedbacks.stream().map(InstructorFeedbackDto::of).toList());
    }

    private static Source sourceOf(AgendaItem item) {
        if (item.getSourceTask() != null) {
            return new Source("task", Ids.toApi(item.getSourceTask().getId()));
        }
        if (item.getSourceSubmission() != null) {
            return new Source("submission", Ids.toApi(item.getSourceSubmission().getId()));
        }
        if (item.getSourceHelpRequestId() != null) {
            return new Source("help_request", Ids.toApi(item.getSourceHelpRequestId()));
        }
        return null;
    }
}

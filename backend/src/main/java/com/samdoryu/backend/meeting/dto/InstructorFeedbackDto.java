package com.samdoryu.backend.meeting.dto;

import com.samdoryu.backend.auth.dto.UserRef;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import java.time.Instant;

/** 결정 기록 아래 강사 피드백 — CONTRACTS_API 「10」 InstructorFeedbackDto. 팀 전체에게 보인다(FR-LRN-22). */
public record InstructorFeedbackDto(String id, UserRef instructor, String body, Instant createdAt) {

    public static InstructorFeedbackDto of(InstructorFeedback feedback) {
        return new InstructorFeedbackDto(
                Ids.toApi(feedback.getId()),
                UserRef.of(feedback.getInstructor()),
                feedback.getBody(),
                feedback.getCreatedAt());
    }
}

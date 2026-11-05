package com.samdoryu.backend.meeting.dto;

import jakarta.validation.constraints.Size;

/** `POST W/meetings/{meetingId}/end` 요청 — CONTRACTS_API 「10」. 회의 메모는 없어도 된다(0~5000자). */
public record MeetingEndRequest(@Size(max = 5000) String notes) {
}

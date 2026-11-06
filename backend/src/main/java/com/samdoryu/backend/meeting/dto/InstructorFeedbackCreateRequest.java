package com.samdoryu.backend.meeting.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** `POST W/agenda-items/{id}/instructor-feedback` 요청 — CONTRACTS_API 「10」. */
public record InstructorFeedbackCreateRequest(@NotBlank @Size(max = 2000) String body) {
}

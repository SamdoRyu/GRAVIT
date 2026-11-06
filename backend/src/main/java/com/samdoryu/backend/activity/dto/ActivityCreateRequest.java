package com.samdoryu.backend.activity.dto;

import com.samdoryu.backend.activity.domain.ActivityKind;
import com.samdoryu.backend.activity.domain.ActivityRecord;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * {@code POST W/activities} 요청 — CONTRACTS_API 「14」. 내용 1~500자(공백만은 {@code invalid} — CONTRACTS.md 「5」), 1~1440분.
 * 계약 밖의 {@code kind} 값은 본문을 읽을 때 {@code invalid}.
 */
public record ActivityCreateRequest(
        @NotNull ActivityKind kind,
        @NotBlank @Size(max = ActivityRecord.MAX_CONTENT_LENGTH) String content,
        @NotNull @Min(ActivityRecord.MIN_DURATION_MINUTES) @Max(ActivityRecord.MAX_DURATION_MINUTES)
        Integer durationMinutes) {
}

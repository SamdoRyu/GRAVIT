package com.samdoryu.backend.plan.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/** {@code PUT W/tasks/{taskId}/due-date} 요청 — CONTRACTS_API.md 「13」. 날짜 형식이 틀리면 {@code invalid}. */
public record TaskDueDateRequest(@NotNull LocalDate dueDate) {
}

package com.samdoryu.backend.plan.dto;

import com.samdoryu.backend.auth.dto.UserRef;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.plan.domain.TaskDueDate;
import java.time.Instant;
import java.time.LocalDate;

/** {@code PUT W/tasks/{taskId}/due-date} 응답 — CONTRACTS_API.md 「13」. */
public record TaskDueDateDto(String taskId, LocalDate dueDate, Instant updatedAt, UserRef updatedBy) {

    public static TaskDueDateDto of(TaskDueDate dueDate) {
        return new TaskDueDateDto(Ids.toApi(dueDate.getTask().getId()), dueDate.getDueDate(), dueDate.getUpdatedAt(),
                UserRef.of(dueDate.getUpdatedBy()));
    }
}

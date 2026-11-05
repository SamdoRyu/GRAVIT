package com.samdoryu.backend.plan.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.plan.dto.TaskDueDateDto;
import com.samdoryu.backend.plan.dto.TaskDueDateRequest;
import com.samdoryu.backend.plan.service.TaskDueDateEditService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 작업 마감 — CONTRACTS_API.md 「13」(FR-PLAN-03 · P14). 사무실 접근 뒤 고칠 수 있는 사람(레포 관리자 · 그 이슈의 담당자)은
 * {@link TaskDueDateEditService}가 본다. 강사의 쓰기는 {@code InstructorWriteGuard}가 먼저 막는다.
 */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/tasks/{taskId}/due-date")
public class TaskDueDateController {

    private final AuthorizationService authorizationService;
    private final TaskDueDateEditService taskDueDateEditService;

    public TaskDueDateController(AuthorizationService authorizationService,
            TaskDueDateEditService taskDueDateEditService) {
        this.authorizationService = authorizationService;
        this.taskDueDateEditService = taskDueDateEditService;
    }

    @PutMapping
    public TaskDueDateDto set(@PathVariable String workspaceId, @PathVariable String taskId,
            @Valid @RequestBody TaskDueDateRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return taskDueDateEditService.set(access, Ids.fromPath(taskId), request.dueDate());
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clear(@PathVariable String workspaceId, @PathVariable String taskId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        taskDueDateEditService.clear(access, Ids.fromPath(taskId));
    }
}

package com.samdoryu.backend.plan.service;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.plan.domain.TaskDueDate;
import com.samdoryu.backend.plan.dto.TaskDueDateDto;
import com.samdoryu.backend.plan.repository.TaskDueDateRepository;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.service.SyncedItemService;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 작업 마감 바꾸기 · 지우기 — CONTRACTS_API.md 「13」 · P14. 고칠 수 있는 사람은 레포 관리자(R2)와 그 이슈의 담당자 전원이고,
 * 그 밖의 참여자 · 강사는 {@code forbidden_role}. 다른 사무실의 이슈는 {@code not_found}. GitHub 이슈는 바뀌지 않는다.
 * 읽기({@link TaskDueDateService})와 나눈 것은 동기화 쪽이 읽기를 쓰기 때문이다 — 한 클래스면 sync ↔ plan이 서로를 부른다.
 */
@Service
public class TaskDueDateEditService {

    private final TaskDueDateRepository taskDueDateRepository;
    private final SyncedItemService syncedItemService;
    private final AppUserService appUserService;
    private final WorkspaceEventHub eventHub;

    public TaskDueDateEditService(TaskDueDateRepository taskDueDateRepository, SyncedItemService syncedItemService,
            AppUserService appUserService, WorkspaceEventHub eventHub) {
        this.taskDueDateRepository = taskDueDateRepository;
        this.syncedItemService = syncedItemService;
        this.appUserService = appUserService;
        this.eventHub = eventHub;
    }

    /** {@code PUT W/tasks/{taskId}/due-date} — 있으면 고치고 없으면 만든다. */
    @Transactional
    public TaskDueDateDto set(WorkspaceAccess access, Long taskId, LocalDate dueDate) {
        Task task = requireEditable(access, taskId);
        AppUser user = appUserService.require(access.userId());
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        TaskDueDate saved = taskDueDateRepository.findByTaskId(task.getId())
                .map(existing -> {
                    existing.change(dueDate, user, now);
                    return existing;
                })
                .orElseGet(() -> taskDueDateRepository.save(new TaskDueDate(task, dueDate, user, now)));
        eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.TASKS);
        return TaskDueDateDto.of(saved);
    }

    /** {@code DELETE W/tasks/{taskId}/due-date} — 마감이 없으면 그대로. */
    @Transactional
    public void clear(WorkspaceAccess access, Long taskId) {
        Task task = requireEditable(access, taskId);
        taskDueDateRepository.findByTaskId(task.getId()).ifPresent(dueDate -> {
            taskDueDateRepository.delete(dueDate);
            eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.TASKS);
        });
    }

    private Task requireEditable(WorkspaceAccess access, Long taskId) {
        Task task = syncedItemService.requireTask(access.workspaceId(), taskId);
        if (access.role() == WorkspaceRole.REPO_ADMIN) {
            return task;
        }
        if (access.memberId() == null || !syncedItemService.assigneeMemberIds(task).contains(access.memberId())) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE, "마감은 레포 관리자와 그 이슈의 담당자만 바꿀 수 있어요");
        }
        return task;
    }
}

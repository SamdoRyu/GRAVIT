package com.samdoryu.backend.workspace.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.workspace.dto.WorkspaceSnapshot;
import com.samdoryu.backend.workspace.service.WorkspaceSnapshotService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** 사무실 Snapshot — CONTRACTS_API 「5」. */
@RestController
public class WorkspaceSnapshotController {

    private final AuthorizationService authorizationService;
    private final WorkspaceSnapshotService workspaceSnapshotService;

    public WorkspaceSnapshotController(AuthorizationService authorizationService,
            WorkspaceSnapshotService workspaceSnapshotService) {
        this.authorizationService = authorizationService;
        this.workspaceSnapshotService = workspaceSnapshotService;
    }

    /** 접근 — 팀원 · 지정된 강사 · 시연 사무실의 심사용 계정. 권한 없는 사무실은 {@code not_found}. */
    @GetMapping("/api/workspaces/{workspaceId}/snapshot")
    public WorkspaceSnapshot get(@PathVariable String workspaceId) {
        return workspaceSnapshotService.load(authorizationService.requireWorkspaceAccess(workspaceId));
    }
}

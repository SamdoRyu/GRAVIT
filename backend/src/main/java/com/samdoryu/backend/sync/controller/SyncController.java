package com.samdoryu.backend.sync.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.sync.dto.SyncStatus;
import com.samdoryu.backend.sync.service.SyncService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 동기화 — CONTRACTS_API.md 「4」. */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}")
public class SyncController {

    private final AuthorizationService authorizationService;
    private final SyncService syncService;

    public SyncController(AuthorizationService authorizationService, SyncService syncService) {
        this.authorizationService = authorizationService;
        this.syncService = syncService;
    }

    /** 수동 동기화 — 팀원. 강사 {@code forbidden_role}(구현 기본값), 이미 진행 중 {@code conflict}. 끝나면 SSE {@code sync}. */
    @PostMapping("/sync")
    @ResponseStatus(HttpStatus.ACCEPTED)
    SyncStatus sync(@PathVariable String workspaceId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        access.requireTeamMember();
        return syncService.requestSync(access.workspaceId());
    }

    /** 접근 — 팀원 · 지정된 강사. */
    @GetMapping("/sync-status")
    SyncStatus status(@PathVariable String workspaceId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return syncService.status(access.workspaceId());
    }
}

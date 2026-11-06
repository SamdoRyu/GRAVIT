package com.samdoryu.backend.workspace.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.workspace.dto.TeamSettingsDto;
import com.samdoryu.backend.workspace.dto.TeamSettingsUpdateRequest;
import com.samdoryu.backend.workspace.service.TeamSettingsService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 팀 설정 — CONTRACTS_API.md 「7」. 읽기는 사무실 접근(팀원 · 지정된 강사), 바꾸기는 레포 관리자(R2)만
 * ({@link TeamSettingsService}). 강사의 쓰기는 {@code InstructorWriteGuard}가 먼저 막는다.
 */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/settings")
public class TeamSettingsController {

    private final AuthorizationService authorizationService;
    private final TeamSettingsService teamSettingsService;

    public TeamSettingsController(AuthorizationService authorizationService, TeamSettingsService teamSettingsService) {
        this.authorizationService = authorizationService;
        this.teamSettingsService = teamSettingsService;
    }

    @GetMapping
    public TeamSettingsDto get(@PathVariable String workspaceId) {
        return teamSettingsService.get(authorizationService.requireWorkspaceAccess(workspaceId));
    }

    @PutMapping
    public TeamSettingsDto replace(@PathVariable String workspaceId,
            @Valid @RequestBody TeamSettingsUpdateRequest request) {
        return teamSettingsService.replace(authorizationService.requireWorkspaceAccess(workspaceId), request);
    }
}

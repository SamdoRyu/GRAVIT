package com.samdoryu.backend.workspace.controller;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.security.SessionPrincipalUpdater;
import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.github.GithubUserToken;
import com.samdoryu.backend.sync.service.SyncService;
import com.samdoryu.backend.workspace.dto.OpenWorkspaceRequest;
import com.samdoryu.backend.workspace.dto.RepositoryChoiceResponse;
import com.samdoryu.backend.workspace.dto.WorkspaceListItem;
import com.samdoryu.backend.workspace.dto.WorkspaceSummary;
import com.samdoryu.backend.workspace.service.WorkspaceOpeningService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 사무실 · 레포 선택 — CONTRACTS_API.md 「3」. 모두 로그인 필요(Security). */
@RestController
public class WorkspaceController {

    private final AuthorizationService authorizationService;
    private final WorkspaceOpeningService workspaceOpeningService;
    private final SessionPrincipalUpdater sessionPrincipalUpdater;
    private final SyncService syncService;

    public WorkspaceController(AuthorizationService authorizationService,
            WorkspaceOpeningService workspaceOpeningService, SessionPrincipalUpdater sessionPrincipalUpdater,
            SyncService syncService) {
        this.authorizationService = authorizationService;
        this.workspaceOpeningService = workspaceOpeningService;
        this.sessionPrincipalUpdater = sessionPrincipalUpdater;
        this.syncService = syncService;
    }

    /** 강사 · 심사용 계정은 {@code organizations: []}. GitHub 오류 {@code 503 github_*}. */
    @GetMapping("/api/repositories")
    RepositoryChoiceResponse repositories(HttpServletRequest request) {
        return workspaceOpeningService.repositories(authorizationService.currentPrincipal(),
                GithubUserToken.from(request.getSession(false)));
    }

    /** 내가 들어갈 수 있는 열린 사무실 — {@code displayName} 오름차순. */
    @GetMapping("/api/workspaces")
    List<WorkspaceListItem> workspaces() {
        return workspaceOpeningService.myWorkspaces(authorizationService.currentPrincipal());
    }

    /**
     * 사무실 열기 — 레포 관리자(R2). 연 사람은 다시 로그인하지 않아도 들어가도록 세션에 그 사무실 역할을 넣고, 이어서 첫 동기화를
     * 시작한다(끝나면 SSE {@code sync}).
     */
    @PostMapping("/api/workspaces")
    @ResponseStatus(HttpStatus.CREATED)
    WorkspaceSummary open(@Valid @RequestBody OpenWorkspaceRequest body, HttpServletRequest request,
            HttpServletResponse response) {
        WorkspaceOpeningService.Opened opened = workspaceOpeningService.open(authorizationService.currentPrincipal(),
                GithubUserToken.from(request.getSession(false)), body, Instant.now().truncatedTo(ChronoUnit.MICROS));
        sessionPrincipalUpdater.addMembership(request, response, opened.workspaceId(), WorkspaceRole.REPO_ADMIN,
                opened.openerMemberId());
        syncService.requestSync(opened.workspaceId());
        return opened.summary();
    }
}

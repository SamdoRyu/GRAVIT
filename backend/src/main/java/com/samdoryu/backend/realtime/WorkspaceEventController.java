package com.samdoryu.backend.realtime;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * {@code GET W/events} — 사무실 변경 알림(SSE, CONTRACTS_API.md 「6」). 역할: 접근.
 * 연결할 때 로그인 · 사무실 접근을 검사한다(검사 순서 1 · 2). 놓친 이벤트는 재생하지 않는다 — 다시 연결하면 화면이 Snapshot을 다시 읽는다.
 */
@RestController
public class WorkspaceEventController {

    private final AuthorizationService authorizationService;
    private final WorkspaceEventHub eventHub;

    public WorkspaceEventController(AuthorizationService authorizationService, WorkspaceEventHub eventHub) {
        this.authorizationService = authorizationService;
        this.eventHub = eventHub;
    }

    @GetMapping(path = "/api/workspaces/{workspaceId}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter events(@PathVariable String workspaceId, HttpServletRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return eventHub.subscribe(access, authorizationService.currentPrincipal(), request.getSession().getId());
    }
}

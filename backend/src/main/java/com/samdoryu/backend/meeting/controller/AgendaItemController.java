package com.samdoryu.backend.meeting.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.meeting.dto.AgendaItemCreateRequest;
import com.samdoryu.backend.meeting.dto.AgendaItemDto;
import com.samdoryu.backend.meeting.service.AgendaItemService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 회의 안건 — CONTRACTS_API 「10」. */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/agenda-items")
public class AgendaItemController {

    private final AuthorizationService authorizationService;
    private final AgendaItemService agendaItemService;

    public AgendaItemController(AuthorizationService authorizationService, AgendaItemService agendaItemService) {
        this.authorizationService = authorizationService;
        this.agendaItemService = agendaItemService;
    }

    /** 팀원 — 강사는 {@code forbidden_role}. 개수 제한 없음(FR-LRN-14). */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AgendaItemDto create(@PathVariable String workspaceId, @Valid @RequestBody AgendaItemCreateRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        Long memberId = access.requireTeamMember();
        return agendaItemService.create(access.workspaceId(), memberId, request);
    }
}

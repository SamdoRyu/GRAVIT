package com.samdoryu.backend.help.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.help.dto.HelpCommentCreateRequest;
import com.samdoryu.backend.help.dto.HelpCommentDto;
import com.samdoryu.backend.help.dto.HelpRequestCloseRequest;
import com.samdoryu.backend.help.dto.HelpRequestCreateRequest;
import com.samdoryu.backend.help.dto.HelpRequestDetail;
import com.samdoryu.backend.help.dto.HelpRequestSummary;
import com.samdoryu.backend.help.service.HelpRequestService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 도움 요청 — CONTRACTS_API 「11」. */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/help-requests")
public class HelpRequestController {

    private final AuthorizationService authorizationService;
    private final HelpRequestService helpRequestService;

    public HelpRequestController(AuthorizationService authorizationService, HelpRequestService helpRequestService) {
        this.authorizationService = authorizationService;
        this.helpRequestService = helpRequestService;
    }

    /** 접근 — 팀원 · 지정된 강사. */
    @GetMapping("/{helpRequestId}")
    public HelpRequestDetail get(@PathVariable String workspaceId, @PathVariable String helpRequestId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return helpRequestService.getDetail(access.workspaceId(), Ids.fromPath(helpRequestId));
    }

    /** 팀원 — 강사는 {@code forbidden_role}. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public HelpRequestSummary create(@PathVariable String workspaceId,
            @Valid @RequestBody HelpRequestCreateRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        Long memberId = access.requireTeamMember();
        return helpRequestService.create(access.workspaceId(), memberId, request);
    }

    /** 팀원, 또는 지정된 강사 — "강사에게 요청"이 켜진 글만(그 밖의 강사는 {@code forbidden_role}). */
    @PostMapping("/{helpRequestId}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    public HelpCommentDto addComment(@PathVariable String workspaceId, @PathVariable String helpRequestId,
            @Valid @RequestBody HelpCommentCreateRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return helpRequestService.addComment(access, Ids.fromPath(helpRequestId), request);
    }

    /** 팀원 — 요청자만(그 밖의 팀원 · 강사는 {@code forbidden_role}). */
    @PostMapping("/{helpRequestId}/close")
    public HelpRequestDetail close(@PathVariable String workspaceId, @PathVariable String helpRequestId,
            @Valid @RequestBody HelpRequestCloseRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return helpRequestService.close(access, Ids.fromPath(helpRequestId), request);
    }
}

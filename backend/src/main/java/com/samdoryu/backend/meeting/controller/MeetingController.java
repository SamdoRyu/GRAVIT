package com.samdoryu.backend.meeting.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.meeting.dto.MeetingDto;
import com.samdoryu.backend.meeting.dto.MeetingEndRequest;
import com.samdoryu.backend.meeting.dto.MeetingStartRequest;
import com.samdoryu.backend.meeting.service.MeetingService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 회의 시작 · 종료 — CONTRACTS_API 「10」. */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/meetings")
public class MeetingController {

    private final AuthorizationService authorizationService;
    private final MeetingService meetingService;

    public MeetingController(AuthorizationService authorizationService, MeetingService meetingService) {
        this.authorizationService = authorizationService;
        this.meetingService = meetingService;
    }

    /** 팀원 — 강사는 {@code forbidden_role}. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MeetingDto start(@PathVariable String workspaceId, @Valid @RequestBody MeetingStartRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        access.requireTeamMember();
        return meetingService.start(access.workspaceId(), request);
    }

    /** 팀원 — 강사는 {@code forbidden_role}. 시작한 사람이 아니어도 끝낼 수 있다. */
    @PostMapping("/{meetingId}/end")
    public MeetingDto end(@PathVariable String workspaceId, @PathVariable String meetingId,
            @Valid @RequestBody MeetingEndRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        access.requireTeamMember();
        return meetingService.end(access.workspaceId(), Ids.fromPath(meetingId), request);
    }
}

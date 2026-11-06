package com.samdoryu.backend.report.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.dto.PageResponse;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.report.dto.TimelineEntry;
import com.samdoryu.backend.report.service.TimelineService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 학습 타임라인 — CONTRACTS_API 「15」. 본인 · 지정된 강사. 페이지 범위 밖은 {@code invalid}(CONTRACTS.md 「4」). */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/members/{memberId}/timeline")
public class TimelineController {

    private final AuthorizationService authorizationService;
    private final TimelineService timelineService;

    public TimelineController(AuthorizationService authorizationService, TimelineService timelineService) {
        this.authorizationService = authorizationService;
        this.timelineService = timelineService;
    }

    @GetMapping
    public PageResponse<TimelineEntry> timeline(@PathVariable String workspaceId, @PathVariable String memberId,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "" + PageResponse.DEFAULT_SIZE) @Min(1) @Max(PageResponse.MAX_SIZE) int size) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return timelineService.timeline(access, Ids.fromPath(memberId), page, size);
    }
}

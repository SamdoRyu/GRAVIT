package com.samdoryu.backend.report.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.report.dto.ReportCreateRequest;
import com.samdoryu.backend.report.dto.RetroReportDto;
import com.samdoryu.backend.report.dto.RetroReportSummary;
import com.samdoryu.backend.report.service.RetroReportService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 개인 회고 리포트 — CONTRACTS_API 「15」. 경로 팀원 · 본인 · 강사 검사는 Service가 공통 규칙 순서대로 한다. */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/members/{memberId}/reports")
public class RetroReportController {

    private final AuthorizationService authorizationService;
    private final RetroReportService retroReportService;

    public RetroReportController(AuthorizationService authorizationService, RetroReportService retroReportService) {
        this.authorizationService = authorizationService;
        this.retroReportService = retroReportService;
    }

    /** 본인 · 지정된 강사. */
    @GetMapping
    public List<RetroReportSummary> list(@PathVariable String workspaceId, @PathVariable String memberId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return retroReportService.list(access, Ids.fromPath(memberId));
    }

    /** 본인만. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RetroReportDto create(@PathVariable String workspaceId, @PathVariable String memberId,
            @Valid @RequestBody ReportCreateRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return retroReportService.create(access, Ids.fromPath(memberId), request.kind());
    }

    /** 본인 · 지정된 강사. */
    @GetMapping("/{reportId}")
    public RetroReportDto get(@PathVariable String workspaceId, @PathVariable String memberId,
            @PathVariable String reportId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return retroReportService.get(access, Ids.fromPath(memberId), Ids.fromPath(reportId));
    }
}

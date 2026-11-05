package com.samdoryu.backend.requirement.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.requirement.dto.RequirementLinkCreateRequest;
import com.samdoryu.backend.requirement.dto.RequirementLinkDto;
import com.samdoryu.backend.requirement.service.RequirementLinkService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 요구사항–이슈 연결 — CONTRACTS_API 「8」. 레포 관리자(R2)만. 목록은 Snapshot {@code requirementLinks}로 읽는다. */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/requirement-links")
public class RequirementLinkController {

    private final AuthorizationService authorizationService;
    private final RequirementLinkService requirementLinkService;

    public RequirementLinkController(AuthorizationService authorizationService,
            RequirementLinkService requirementLinkService) {
        this.authorizationService = authorizationService;
        this.requirementLinkService = requirementLinkService;
    }

    /** 새 연결은 {@code 201}, 같은 연결이 이미 있으면 {@code 200}과 기존 연결. */
    @PostMapping
    public ResponseEntity<RequirementLinkDto> link(@PathVariable String workspaceId,
            @Valid @RequestBody RequirementLinkCreateRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        RequirementLinkService.LinkResult result = requirementLinkService.link(access, request,
                Instant.now().truncatedTo(ChronoUnit.MICROS));
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.link());
    }

    @DeleteMapping("/{linkId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unlink(@PathVariable String workspaceId, @PathVariable String linkId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        requirementLinkService.unlink(access, Ids.fromPath(linkId));
    }
}

package com.samdoryu.backend.report.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.report.dto.DecisionCardCreateRequest;
import com.samdoryu.backend.report.dto.DecisionCardDto;
import com.samdoryu.backend.report.dto.DecisionCardUpdateRequest;
import com.samdoryu.backend.report.service.DecisionCardService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 기술 결정 카드 — CONTRACTS_API 「15」(FR-REP-07 · P11). 개인 API: 사무실 접근 → 경로 팀원(404) → 본인 · 강사(403)는
 * {@link DecisionCardService}가 본다. 강사의 쓰기는 {@code InstructorWriteGuard}가 먼저 막는다.
 */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/members/{memberId}/decision-cards")
public class DecisionCardController {

    private final AuthorizationService authorizationService;
    private final DecisionCardService decisionCardService;

    public DecisionCardController(AuthorizationService authorizationService, DecisionCardService decisionCardService) {
        this.authorizationService = authorizationService;
        this.decisionCardService = decisionCardService;
    }

    /** 본인 · 지정된 강사. */
    @GetMapping
    public List<DecisionCardDto> list(@PathVariable String workspaceId, @PathVariable String memberId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return decisionCardService.list(access, Ids.fromPath(memberId));
    }

    /** 본인만 — 머지되거나 닫힌 내 PR. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DecisionCardDto create(@PathVariable String workspaceId, @PathVariable String memberId,
            @Valid @RequestBody DecisionCardCreateRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return decisionCardService.create(access, Ids.fromPath(memberId), Ids.fromBody(request.submissionId()));
    }

    /** 본인만. */
    @PutMapping("/{cardId}")
    public DecisionCardDto update(@PathVariable String workspaceId, @PathVariable String memberId,
            @PathVariable String cardId, @Valid @RequestBody DecisionCardUpdateRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return decisionCardService.update(access, Ids.fromPath(memberId), Ids.fromPath(cardId),
                request.cells().toCells(), request.confirmed());
    }
}

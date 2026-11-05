package com.samdoryu.backend.evaluation.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.evaluation.dto.EvaluateRequest;
import com.samdoryu.backend.evaluation.dto.EvaluationRoundDto;
import com.samdoryu.backend.evaluation.service.EvaluationRoundService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** PR 평가 · 평가 회차 — CONTRACTS_API 「9」. */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/submissions/{submissionId}")
public class EvaluationController {

    private final AuthorizationService authorizationService;
    private final EvaluationRoundService evaluationRoundService;

    public EvaluationController(AuthorizationService authorizationService,
            EvaluationRoundService evaluationRoundService) {
        this.authorizationService = authorizationService;
        this.evaluationRoundService = evaluationRoundService;
    }

    /** 접근 — 강사도 읽는다. 회차 번호 내림차순. */
    @GetMapping("/rounds")
    public List<EvaluationRoundDto> listRounds(@PathVariable String workspaceId, @PathVariable String submissionId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return evaluationRoundService.listRounds(access, Ids.fromPath(submissionId));
    }

    /** 팀원 — 작성자 제외. 강사 · 작성자는 {@code forbidden_role}. */
    @PutMapping("/evaluations/mine")
    public EvaluationRoundDto evaluate(@PathVariable String workspaceId, @PathVariable String submissionId,
            @Valid @RequestBody EvaluateRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return evaluationRoundService.evaluate(access, Ids.fromPath(submissionId), request,
                Instant.now().truncatedTo(ChronoUnit.MICROS));
    }
}

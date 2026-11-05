package com.samdoryu.backend.instructor.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.dto.InstructorAssignmentDto;
import com.samdoryu.backend.instructor.dto.InstructorCandidateDto;
import com.samdoryu.backend.instructor.service.InstructorRosterService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 강사 지정 · 해제(FR-AUTH-06 · CONTRACTS_API 「7」). 경로의 {@code githubUserId}는 GitHub 사용자 ID — 로그인 이름이 아니다. */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}")
public class InstructorController {

    private final AuthorizationService authorizationService;
    private final InstructorRosterService instructorRosterService;

    public InstructorController(AuthorizationService authorizationService,
            InstructorRosterService instructorRosterService) {
        this.authorizationService = authorizationService;
        this.instructorRosterService = instructorRosterService;
    }

    /** 접근 — 팀원 · 지정된 강사. */
    @GetMapping("/instructors")
    public List<InstructorAssignmentDto> list(@PathVariable String workspaceId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return instructorRosterService.listCurrent(access.workspaceId());
    }

    /** R2 — 참여자 · 강사는 {@code forbidden_role}. */
    @GetMapping("/instructor-candidates")
    public List<InstructorCandidateDto> candidates(@PathVariable String workspaceId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        access.requireRepoAdmin();
        return instructorRosterService.candidates(access.workspaceId());
    }

    /** R2. 경로 형식 오류 {@code not_found}, 자기 자신 {@code conflict}, 허용 목록 밖 {@code invalid}. */
    @PutMapping("/instructors/{githubUserId}")
    public InstructorAssignmentDto assign(@PathVariable String workspaceId, @PathVariable String githubUserId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        Long target = Ids.fromPath(githubUserId);
        access.requireRepoAdmin();
        return instructorRosterService.assign(access.workspaceId(), access.userId(),
                authorizationService.currentPrincipal().githubUserId(), target, now());
    }

    /** R2. 현재 지정이 없으면 {@code not_found}. 행은 지우지 않는다. */
    @DeleteMapping("/instructors/{githubUserId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@PathVariable String workspaceId, @PathVariable String githubUserId) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        Long target = Ids.fromPath(githubUserId);
        access.requireRepoAdmin();
        instructorRosterService.revoke(access.workspaceId(), target, now());
    }

    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }
}

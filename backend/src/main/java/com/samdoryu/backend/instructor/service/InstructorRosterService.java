package com.samdoryu.backend.instructor.service;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.dto.InstructorAssignmentDto;
import com.samdoryu.backend.instructor.dto.InstructorCandidateDto;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사무실의 강사 지정 · 해제 · 목록(FR-AUTH-06 · CONTRACTS_API 「7」). 역할(R2) 검사는 Controller가 먼저 한다.
 * 지정 여부를 읽는 쪽(인가 · SSE)은 {@link InstructorAssignmentService} — SSE가 그것을 쓰므로 SSE를 보내는 쓰기는 여기에 둔다.
 * <ul>
 *   <li>후보는 서버 설정 허용 목록(GitHub 사용자 ID) 전원이다. 일반 학생은 강사로 지정할 수 없다(P1).</li>
 *   <li>해제는 해제 시각을 남기고 행을 지우지 않는다. 그 강사의 그 사무실 권한은 다음 요청부터 없다(지정은 요청마다 DB 확인).</li>
 *   <li>강사의 표시 정보(로그인 이름 · 이름 · 사진)는 그 강사가 로그인해 앱 사용자가 있을 때만 채운다.</li>
 * </ul>
 */
@Service
public class InstructorRosterService {

    private final InstructorAssignmentRepository instructorAssignmentRepository;
    private final AppUserService appUserService;
    private final WorkspaceService workspaceService;
    private final AppProperties appProperties;
    private final WorkspaceEventHub eventHub;

    public InstructorRosterService(InstructorAssignmentRepository instructorAssignmentRepository,
            AppUserService appUserService, WorkspaceService workspaceService, AppProperties appProperties,
            WorkspaceEventHub eventHub) {
        this.instructorAssignmentRepository = instructorAssignmentRepository;
        this.appUserService = appUserService;
        this.workspaceService = workspaceService;
        this.appProperties = appProperties;
        this.eventHub = eventHub;
    }

    /** {@code GET W/instructors} — 현재 지정만, assignedAt 오름차순. */
    @Transactional(readOnly = true)
    public List<InstructorAssignmentDto> listCurrent(Long workspaceId) {
        List<InstructorAssignment> current = currentAssignments(workspaceId);
        Map<Long, AppUser> users = appUserService.findGithubUsers(
                current.stream().map(InstructorAssignment::getInstructorGithubUserId).toList());
        return current.stream()
                .map(assignment -> InstructorAssignmentDto.of(assignment,
                        users.get(assignment.getInstructorGithubUserId())))
                .toList();
    }

    /** {@code GET W/instructor-candidates} — 허용 목록 전원, GitHub 사용자 ID 오름차순(구현 기본값). */
    @Transactional(readOnly = true)
    public List<InstructorCandidateDto> candidates(Long workspaceId) {
        List<Long> allowlist = appProperties.instructorGithubUserIds().stream().sorted().toList();
        Set<Long> assigned = currentAssignments(workspaceId).stream()
                .map(InstructorAssignment::getInstructorGithubUserId).collect(Collectors.toSet());
        Map<Long, AppUser> users = appUserService.findGithubUsers(allowlist);
        return allowlist.stream()
                .map(githubUserId -> InstructorCandidateDto.of(githubUserId, users.get(githubUserId),
                        assigned.contains(githubUserId)))
                .toList();
    }

    /**
     * {@code PUT W/instructors/{githubUserId}} — 이미 지정돼 있으면 그 지정을 그대로 돌려준다.
     * 요청한 사람 자신 {@code conflict}(자기 자신 확인이 먼저 — 레포 관리자는 허용 목록 계정일 수 없어 순서가 바뀌면 늘
     * {@code invalid}가 된다), 허용 목록 밖 {@code invalid}.
     *
     * @param requesterUserId 요청한 레포 관리자의 앱 사용자 ID — {@code assignedBy}
     * @param requesterGithubUserId 요청한 사람의 GitHub 사용자 ID. 심사용 계정은 null
     */
    @Transactional
    public InstructorAssignmentDto assign(Long workspaceId, Long requesterUserId, Long requesterGithubUserId,
            long githubUserId, Instant now) {
        if (Objects.equals(requesterGithubUserId, githubUserId)) {
            throw new ApiException(ErrorCode.CONFLICT, "자기 자신은 강사로 지정할 수 없어요");
        }
        if (!appProperties.isAllowlistedInstructor(githubUserId)) {
            throw new ApiException(ErrorCode.INVALID, "승인된 강사 계정이 아니에요");
        }
        InstructorAssignment assignment = instructorAssignmentRepository
                .findByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(workspaceId, githubUserId)
                .orElseGet(() -> create(workspaceId, requesterUserId, githubUserId, now));
        return InstructorAssignmentDto.of(assignment, appUserService.findGithubUsers(List.of(githubUserId))
                .get(githubUserId));
    }

    /** {@code DELETE W/instructors/{githubUserId}} — 현재 지정이 없으면 {@code not_found}. */
    @Transactional
    public void revoke(Long workspaceId, long githubUserId, Instant now) {
        InstructorAssignment assignment = instructorAssignmentRepository
                .findByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(workspaceId, githubUserId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        assignment.unassign(now);
        eventHub.publishChangeAfterCommit(workspaceId, SnapshotResource.INSTRUCTORS);
    }

    private InstructorAssignment create(Long workspaceId, Long requesterUserId, long githubUserId, Instant now) {
        InstructorAssignment created = instructorAssignmentRepository.save(new InstructorAssignment(
                workspaceService.requireWorkspace(workspaceId), githubUserId, appUserService.require(requesterUserId),
                now));
        eventHub.publishChangeAfterCommit(workspaceId, SnapshotResource.INSTRUCTORS);
        return created;
    }

    private List<InstructorAssignment> currentAssignments(Long workspaceId) {
        return instructorAssignmentRepository.findByWorkspaceIdAndUnassignedAtIsNullOrderByAssignedAtAscIdAsc(
                workspaceId);
    }
}

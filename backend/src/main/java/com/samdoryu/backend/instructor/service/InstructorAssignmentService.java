package com.samdoryu.backend.instructor.service;

import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 강사 지정(FR-AUTH-06). 다른 패키지는 이 Service로만 지정을 읽는다.
 * 지정 · 해제 · 목록 API({@code W/instructors} · {@code W/instructor-candidates})는 {@link InstructorRosterService}.
 */
@Service
public class InstructorAssignmentService {

    private final InstructorAssignmentRepository instructorAssignmentRepository;

    public InstructorAssignmentService(InstructorAssignmentRepository instructorAssignmentRepository) {
        this.instructorAssignmentRepository = instructorAssignmentRepository;
    }

    /** R4 — 그 사무실에 이 강사가 지금 지정돼 있는가. 세션에 두지 않고 요청마다 DB에서 확인한다(CONTRACTS.md 「6」). */
    @Transactional(readOnly = true)
    public boolean isCurrentlyAssigned(Long workspaceId, Long instructorGithubUserId) {
        return instructorAssignmentRepository.existsByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(
                workspaceId, instructorGithubUserId);
    }

    /**
     * 그 사무실에 지금 지정된 강사가 있는가 — 새 "강사에게 요청"의 조건(CONTRACTS_API 「11」). {@code GET W/instructors}와 같은
     * 기준(해제되지 않은 지정 행)이다. 시연 사무실의 심사용 강사는 지정 행이 없어 부르는 쪽이 따로 다룬다.
     */
    @Transactional(readOnly = true)
    public boolean hasCurrentInstructor(Long workspaceId) {
        return instructorAssignmentRepository.existsByWorkspaceIdAndUnassignedAtIsNull(workspaceId);
    }

    /** 이 강사가 지금 지정된 사무실 ID 전부 — {@code GET /api/workspaces}(강사는 지정된 사무실 전부). */
    @Transactional(readOnly = true)
    public List<Long> currentWorkspaceIds(Long instructorGithubUserId) {
        return instructorAssignmentRepository.findByInstructorGithubUserIdAndUnassignedAtIsNull(instructorGithubUserId)
                .stream().map(assignment -> assignment.getWorkspace().getId()).toList();
    }

    /** 지금 지정된 사무실이 하나 이상인가 — {@code MeResponse.isInstructor}의 재료. */
    @Transactional(readOnly = true)
    public boolean hasAnyCurrentAssignment(Long instructorGithubUserId) {
        return instructorAssignmentRepository.existsByInstructorGithubUserIdAndUnassignedAtIsNull(
                instructorGithubUserId);
    }
}

package com.samdoryu.backend.instructor.service;

import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 강사 지정(FR-AUTH-06). 다른 패키지는 이 Service로만 지정을 읽는다.
 * 지정 · 해제 API({@code PUT · DELETE W/instructors/{githubUserId}})는 강사 지정 Issue에서 더한다.
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
}

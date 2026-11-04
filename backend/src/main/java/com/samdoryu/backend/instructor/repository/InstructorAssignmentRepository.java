package com.samdoryu.backend.instructor.repository;

import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InstructorAssignmentRepository extends JpaRepository<InstructorAssignment, Long> {

    /** 현재 지정이 있는가 — 해제 시각이 없는 행. */
    boolean existsByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(Long workspaceId,
            Long instructorGithubUserId);
}

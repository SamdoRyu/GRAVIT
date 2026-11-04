package com.samdoryu.backend.instructor.repository;

import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InstructorAssignmentRepository extends JpaRepository<InstructorAssignment, Long> {

    /** 현재 지정이 있는가 — 해제 시각이 없는 행. */
    boolean existsByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(Long workspaceId,
            Long instructorGithubUserId);

    /** 어느 사무실이든 현재 지정이 있는가. */
    boolean existsByInstructorGithubUserIdAndUnassignedAtIsNull(Long instructorGithubUserId);

    /** 이 강사의 현재 지정 전부. */
    List<InstructorAssignment> findByInstructorGithubUserIdAndUnassignedAtIsNull(Long instructorGithubUserId);
}

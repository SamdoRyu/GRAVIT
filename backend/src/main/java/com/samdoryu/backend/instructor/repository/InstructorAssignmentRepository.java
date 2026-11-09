package com.samdoryu.backend.instructor.repository;

import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InstructorAssignmentRepository extends JpaRepository<InstructorAssignment, Long> {

    /** 현재 지정이 있는가 — 해제 시각이 없는 행. */
    boolean existsByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(Long workspaceId,
            Long instructorGithubUserId);

    /** 그 사무실에 현재 지정된 강사가 한 명이라도 있는가 — {@code GET W/instructors}와 같은 기준. */
    boolean existsByWorkspaceIdAndUnassignedAtIsNull(Long workspaceId);

    /** 어느 사무실이든 현재 지정이 있는가. */
    boolean existsByInstructorGithubUserIdAndUnassignedAtIsNull(Long instructorGithubUserId);

    /** 이 강사의 현재 지정 전부. */
    List<InstructorAssignment> findByInstructorGithubUserIdAndUnassignedAtIsNull(Long instructorGithubUserId);

    /** 그 사무실의 현재 지정 — {@code GET W/instructors}(assignedAt 오름차순, 같으면 id). */
    List<InstructorAssignment> findByWorkspaceIdAndUnassignedAtIsNullOrderByAssignedAtAscIdAsc(Long workspaceId);

    /** 그 사무실에서 이 강사의 현재 지정. */
    Optional<InstructorAssignment> findByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(Long workspaceId,
            Long instructorGithubUserId);
}

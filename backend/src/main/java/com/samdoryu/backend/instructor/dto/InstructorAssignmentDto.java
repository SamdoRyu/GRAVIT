package com.samdoryu.backend.instructor.dto;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.dto.UserRef;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import java.time.Instant;

/**
 * 사무실의 현재 강사 지정 — CONTRACTS_API 「7」 InstructorAssignmentDto.
 *
 * @param githubUserId 지정의 키 — 로그인 이름이 아님(CONTRACTS.md 「6」 식별자 원칙)
 * @param githubLogin 표시용 — 그 강사가 아직 로그인하지 않아 모르면 null
 * @param displayName 표시용 — 모르면 null
 * @param avatarUrl 표시용 — 모르면 null
 */
public record InstructorAssignmentDto(
        String githubUserId,
        String githubLogin,
        String displayName,
        String avatarUrl,
        Instant assignedAt,
        UserRef assignedBy) {

    /** @param instructor 그 GitHub 사용자 ID의 앱 사용자 — 로그인한 적이 없으면 null */
    public static InstructorAssignmentDto of(InstructorAssignment assignment, AppUser instructor) {
        return new InstructorAssignmentDto(
                Ids.toApi(assignment.getInstructorGithubUserId()),
                instructor == null ? null : instructor.getGithubLogin(),
                instructor == null ? null : instructor.getDisplayName(),
                instructor == null ? null : instructor.getAvatarUrl(),
                assignment.getAssignedAt(),
                UserRef.of(assignment.getAssignedBy()));
    }
}

package com.samdoryu.backend.instructor.dto;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.common.id.Ids;

/**
 * 강사로 지정할 수 있는 계정(서버 설정 허용 목록) — CONTRACTS_API 「7」 InstructorCandidateDto.
 *
 * @param githubLogin 표시용 — 그 강사가 로그인한 적이 없어 모르면 null(구현 기본값)
 * @param isAssigned 이 사무실에 지금 지정돼 있는가
 */
public record InstructorCandidateDto(String githubUserId, String githubLogin, String avatarUrl, boolean isAssigned) {

    /** @param instructor 그 GitHub 사용자 ID의 앱 사용자 — 로그인한 적이 없으면 null */
    public static InstructorCandidateDto of(long githubUserId, AppUser instructor, boolean assigned) {
        return new InstructorCandidateDto(
                Ids.toApi(githubUserId),
                instructor == null ? null : instructor.getGithubLogin(),
                instructor == null ? null : instructor.getAvatarUrl(),
                assigned);
    }
}

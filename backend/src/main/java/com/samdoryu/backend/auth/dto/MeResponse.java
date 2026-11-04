package com.samdoryu.backend.auth.dto;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.common.id.Ids;

/**
 * {@code GET /api/me} 응답 — CONTRACTS_API.md 「2」 MeResponse. 사무실별 역할은 넣지 않는다.
 * 엔드포인트는 GitHub 로그인 Issue(#64)에서 만든다.
 *
 * @param githubUserId GitHub 사용자 ID(문자열). 심사용 계정은 null
 * @param isInstructor 강사 요청함을 쓸 수 있는가 — 허용 목록(또는 심사용 강사)이고 지금 지정된 사무실이 하나 이상
 */
public record MeResponse(UserRef user, AccountType accountType, String githubUserId, boolean isInstructor) {

    public static MeResponse of(AppUser user, boolean isInstructor) {
        return new MeResponse(UserRef.of(user), user.getAccountType(), Ids.toApi(user.getGithubUserId()),
                isInstructor);
    }
}

package com.samdoryu.backend.auth.dto;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.common.id.Ids;

/**
 * 이름을 보여도 되는 사람(익명 대상이 아닌 기록의 작성자) — CONTRACTS_API.md 「1」 UserRef.
 *
 * @param githubLogin 심사용 계정은 null
 */
public record UserRef(String userId, String githubLogin, String displayName, String avatarUrl) {

    public static UserRef of(AppUser user) {
        return new UserRef(Ids.toApi(user.getId()), user.getGithubLogin(), user.getDisplayName(), user.getAvatarUrl());
    }
}

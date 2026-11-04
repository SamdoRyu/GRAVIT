package com.samdoryu.backend.github.dto;

import java.util.Map;
import java.util.Objects;
import org.springframework.security.oauth2.core.user.OAuth2User;

/**
 * GitHub 로그인으로 받은 계정 — {@code GET https://api.github.com/user}의 필요한 칸만(이메일은 받지 않는다 — NFR-04).
 *
 * @param githubUserId 바뀌지 않는 계정 키 — 사용자를 찾는 기준
 * @param login 표시용 로그인 이름(바뀔 수 있다)
 * @param name GitHub 프로필 이름. 비어 있으면 null
 */
public record GithubLoginProfile(long githubUserId, String login, String name, String avatarUrl) {

    public GithubLoginProfile {
        Objects.requireNonNull(login);
    }

    /** 화면 표시 이름 — 프로필 이름이 없으면 로그인 이름. */
    public String displayName() {
        return name == null || name.isBlank() ? login : name;
    }

    /** Spring Security가 읽어 온 GitHub 사용자 정보에서 꺼낸다. 형식이 틀리면 로그인 실패. */
    public static GithubLoginProfile from(OAuth2User user) {
        Map<String, Object> attributes = user.getAttributes();
        if (!(attributes.get("id") instanceof Number id) || !(attributes.get("login") instanceof String login)) {
            throw new IllegalArgumentException("GitHub 사용자 정보에 id · login이 없다");
        }
        return new GithubLoginProfile(id.longValue(), login, asString(attributes.get("name")),
                asString(attributes.get("avatar_url")));
    }

    private static String asString(Object value) {
        return value instanceof String s ? s : null;
    }
}

package com.samdoryu.backend.github.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;

/** GitHub {@code /user} 응답에서 로그인에 필요한 칸만 꺼내는지(DB 없음). */
class GithubLoginProfileTest {

    private static OAuth2User user(Map<String, Object> attributes) {
        return new DefaultOAuth2User(List.of(), attributes, "login");
    }

    @Test
    void readsIdLoginNameAndAvatar() {
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("id", 1001);
        attributes.put("login", "octo-kim");
        attributes.put("name", "김옥토");
        attributes.put("avatar_url", "https://avatars.githubusercontent.com/u/1001?v=4");
        attributes.put("email", "secret@example.com");

        GithubLoginProfile profile = GithubLoginProfile.from(user(attributes));

        assertThat(profile).isEqualTo(new GithubLoginProfile(1001L, "octo-kim", "김옥토",
                "https://avatars.githubusercontent.com/u/1001?v=4"));
        assertThat(profile.displayName()).isEqualTo("김옥토");
    }

    @Test
    void largeGithubIdsKeepAllDigits() {
        GithubLoginProfile profile = GithubLoginProfile.from(user(Map.of("id", 9_000_000_000L, "login", "big")));

        assertThat(profile.githubUserId()).isEqualTo(9_000_000_000L);
    }

    @Test
    void displayNameFallsBackToLogin() {
        assertThat(GithubLoginProfile.from(user(Map.of("id", 1, "login", "octo"))).displayName()).isEqualTo("octo");
        assertThat(GithubLoginProfile.from(user(Map.of("id", 1, "login", "octo", "name", "  "))).displayName())
                .isEqualTo("octo");
    }

    @Test
    void missingIdIsRejected() {
        assertThatThrownBy(() -> GithubLoginProfile.from(user(Map.of("login", "octo"))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> GithubLoginProfile.from(user(Map.of("id", "1001", "login", "octo"))))
                .isInstanceOf(IllegalArgumentException.class);
    }
}

package com.samdoryu.backend.common.security;

import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param origin 쓰기 요청을 받는 허용 출처({@code APP_ORIGIN}, NFR-05). 예: {@code http://localhost:5173}.
 *        GitHub 로그인이 끝나면 이 주소의 화면으로 돌려보낸다
 * @param instructorGithubUserIds 승인된 강사 계정의 GitHub 사용자 ID 허용 목록({@code INSTRUCTOR_GITHUB_USER_IDS}, P1).
 *        로그인 이름이 아니다. 비면 강사가 없다
 * @param reviewLoginEnabled 보안 심사용 ID/PW 로그인을 켠 환경인가({@code REVIEW_LOGIN_ENABLED}, 기본 꺼짐 — P15).
 *        로그인 경로 자체는 #63에서 만든다
 * @param githubAppSlug GitHub App 이름(URL의 slug, {@code GITHUB_APP_SLUG}) — 앱 설치 · 승인 요청 주소를 만든다(P2).
 *        비면 설치 주소를 내지 않는다
 */
@ConfigurationProperties("app")
public record AppProperties(String origin, Set<Long> instructorGithubUserIds, boolean reviewLoginEnabled,
        String githubAppSlug) {

    public AppProperties {
        instructorGithubUserIds = instructorGithubUserIds == null ? Set.of() : Set.copyOf(instructorGithubUserIds);
        githubAppSlug = githubAppSlug == null || githubAppSlug.isBlank() ? null : githubAppSlug.strip();
    }

    /** 서버 설정 허용 목록의 강사 계정인가 — GitHub 사용자 ID로만 판정한다. */
    public boolean isAllowlistedInstructor(Long githubUserId) {
        return githubUserId != null && instructorGithubUserIds.contains(githubUserId);
    }

    /** 조직에 앱을 설치 · 승인 요청하는 GitHub 페이지. 앱 이름을 설정하지 않았으면 null. */
    public String githubAppInstallUrl() {
        return githubAppSlug == null ? null : "https://github.com/apps/" + githubAppSlug + "/installations/new";
    }
}

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
 * @param masterAdminGithubLogin 전체 관리자(ROLE-03)의 GitHub 로그인 이름({@code MASTER_ADMIN_GITHUB_LOGIN}, FR-AUTH-03).
 *        비면 없다. <b>v1에는 이 값으로 여는 화면 · API · 추가 데이터 접근이 없다</b>(CONTRACTS.md 「4」 — 최소 권한부터).
 *        권한 판단에 쓰지 않는다. 필요한 권한이 생기면 그 기능을 만들 때 최소 범위로 더한다
 */
@ConfigurationProperties("app")
public record AppProperties(String origin, Set<Long> instructorGithubUserIds, boolean reviewLoginEnabled,
        String githubAppSlug, String masterAdminGithubLogin) {

    public AppProperties {
        instructorGithubUserIds = instructorGithubUserIds == null ? Set.of() : Set.copyOf(instructorGithubUserIds);
        githubAppSlug = blankToNull(githubAppSlug);
        masterAdminGithubLogin = blankToNull(masterAdminGithubLogin);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    /** 서버 설정 허용 목록의 강사 계정인가 — GitHub 사용자 ID로만 판정한다. */
    public boolean isAllowlistedInstructor(Long githubUserId) {
        return githubUserId != null && instructorGithubUserIds.contains(githubUserId);
    }

    /**
     * 서버 설정의 전체 관리자(ROLE-03)인가. GitHub 로그인 이름은 대소문자를 가리지 않는다.
     * 지금은 이 판정으로 열리는 권한이 없다 — 인가 검사({@code AuthorizationService})는 이 값을 보지 않는다.
     */
    public boolean isMasterAdmin(String githubLogin) {
        return masterAdminGithubLogin != null && githubLogin != null
                && masterAdminGithubLogin.equalsIgnoreCase(githubLogin.strip());
    }

    /** 조직에 앱을 설치 · 승인 요청하는 GitHub 페이지. 앱 이름을 설정하지 않았으면 null. */
    public String githubAppInstallUrl() {
        return githubAppSlug == null ? null : "https://github.com/apps/" + githubAppSlug + "/installations/new";
    }
}

package com.samdoryu.backend.auth.dto;

/**
 * {@code GET /api/login-options} 응답 — CONTRACTS_API.md 「2」 LoginOptions.
 *
 * @param githubLoginUrl 화면이 이동할 GitHub 로그인 시작 주소({@code /oauth2/authorization/github})
 * @param reviewLoginEnabled false면 화면이 심사용 로그인 폼을 숨긴다(숨김은 보안이 아니다 — 꺼진 환경에는 경로 자체가 없다)
 */
public record LoginOptions(String githubLoginUrl, boolean reviewLoginEnabled) {
}

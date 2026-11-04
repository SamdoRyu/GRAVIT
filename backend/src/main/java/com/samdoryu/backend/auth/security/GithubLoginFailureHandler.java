package com.samdoryu.backend.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;

/**
 * GitHub 로그인 실패(사용자가 거절 · state 불일치 · GitHub 오류) — 실패도 화면 주소로 {@code 302}(CONTRACTS_API.md 「2」).
 * 도착 화면은 PRD 「열린 질문」이라 실패를 나타내는 값을 주소에 붙이지 않는다. 로그에는 예외 종류만 남긴다(코드 · 토큰 없음).
 */
@Slf4j
public class GithubLoginFailureHandler implements AuthenticationFailureHandler {

    private final String redirectUrl;

    public GithubLoginFailureHandler(String redirectUrl) {
        this.redirectUrl = redirectUrl;
    }

    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException exception) throws IOException {
        log.warn("GitHub 로그인 실패: {}", exception.getClass().getSimpleName());
        response.sendRedirect(redirectUrl);
    }
}

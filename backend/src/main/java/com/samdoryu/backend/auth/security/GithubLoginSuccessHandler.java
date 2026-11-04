package com.samdoryu.backend.auth.security;

import com.samdoryu.backend.auth.service.AppPrincipal;
import com.samdoryu.backend.auth.service.GithubLoginService;
import com.samdoryu.backend.github.dto.GithubLoginProfile;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.context.SecurityContextRepository;

/**
 * GitHub 로그인 성공 — 세션의 인증을 앱 사용자({@link AppPrincipal})로 바꾸고 화면 주소로 {@code 302}(CONTRACTS_API.md 「2」).
 * 세션 ID는 이 처리 전에 Spring Security가 새로 발급한다(세션 고정 방지). GitHub 사용자 정보 원본은 세션에 남기지 않는다.
 */
@Slf4j
public class GithubLoginSuccessHandler implements AuthenticationSuccessHandler {

    private final GithubLoginService githubLoginService;
    private final SecurityContextRepository securityContextRepository;
    private final String redirectUrl;
    private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();

    public GithubLoginSuccessHandler(GithubLoginService githubLoginService,
            SecurityContextRepository securityContextRepository, String redirectUrl) {
        this.githubLoginService = githubLoginService;
        this.securityContextRepository = securityContextRepository;
        this.redirectUrl = redirectUrl;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException {
        SecurityContext context = contextHolder.createEmptyContext();
        try {
            AppPrincipal principal = githubLoginService.login(
                    GithubLoginProfile.from((OAuth2User) authentication.getPrincipal()));
            context.setAuthentication(principal.toAuthentication());
        } catch (IllegalArgumentException e) {
            // GitHub 사용자 정보 형식이 틀림 — 로그인하지 않은 상태로 화면에 돌려보낸다
            log.warn("GitHub 로그인 사용자 정보 처리 실패: {}", e.getClass().getSimpleName());
        }
        contextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        response.sendRedirect(redirectUrl);
    }
}

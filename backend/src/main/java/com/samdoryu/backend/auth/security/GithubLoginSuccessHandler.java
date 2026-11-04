package com.samdoryu.backend.auth.security;

import com.samdoryu.backend.auth.service.AppPrincipal;
import com.samdoryu.backend.auth.service.GithubLoginService;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.github.GithubUserClient;
import com.samdoryu.backend.github.GithubUserToken;
import com.samdoryu.backend.github.dto.GithubLoginProfile;
import com.samdoryu.backend.github.dto.GithubRepoPermission;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.context.SecurityContextRepository;

/**
 * GitHub 로그인 성공 — 세션의 인증을 앱 사용자({@link AppPrincipal})로 바꾸고 화면 주소로 {@code 302}(CONTRACTS_API.md 「2」).
 * 세션 ID는 이 처리 전에 Spring Security가 새로 발급한다(세션 고정 방지).
 * <ol>
 *   <li>사용자 토큰으로 레포 권한을 읽는다(허용 목록 강사 계정은 읽지 않는다). GitHub 호출은 DB 트랜잭션 밖에서 한다.</li>
 *   <li>사용자 · 역할을 정해 세션에 둔다. 사용자 토큰은 {@link GithubUserToken}으로 <b>서버 세션에만</b> 둔다 — 레포 선택 ·
 *       사무실 열기가 로그인 뒤에도 GitHub를 읽는다(#68). 강사 계정은 쓰지 않으므로 두지 않는다.</li>
 * </ol>
 * 레포 권한을 읽지 못하거나 GitHub 사용자 정보가 틀리면 <b>로그인하지 않은 상태</b>로 화면에 돌려보낸다 — 역할이 빠진
 * 반쪽 로그인을 만들지 않는다.
 */
@Slf4j
public class GithubLoginSuccessHandler implements AuthenticationSuccessHandler {

    private final GithubLoginService githubLoginService;
    private final GithubUserClient githubUserClient;
    private final OAuth2AuthorizedClientRepository authorizedClientRepository;
    private final SecurityContextRepository securityContextRepository;
    private final String redirectUrl;
    private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();

    public GithubLoginSuccessHandler(GithubLoginService githubLoginService, GithubUserClient githubUserClient,
            OAuth2AuthorizedClientRepository authorizedClientRepository,
            SecurityContextRepository securityContextRepository, String redirectUrl) {
        this.githubLoginService = githubLoginService;
        this.githubUserClient = githubUserClient;
        this.authorizedClientRepository = authorizedClientRepository;
        this.securityContextRepository = securityContextRepository;
        this.redirectUrl = redirectUrl;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
            Authentication authentication) throws IOException {
        SecurityContext context = contextHolder.createEmptyContext();
        try {
            GithubLoginProfile profile = GithubLoginProfile.from((OAuth2User) authentication.getPrincipal());
            String userToken = null;
            List<GithubRepoPermission> permissions = List.of();
            if (githubLoginService.needsRepoPermissions(profile)) {
                userToken = accessToken(authentication, request);
                permissions = githubUserClient.repositoryPermissions(userToken);
            }
            AppPrincipal principal = githubLoginService.login(profile, permissions);
            context.setAuthentication(principal.toAuthentication());
            if (userToken != null) {
                // 레포 선택 · 사무실 열기가 로그인 뒤에도 GitHub를 읽는다 — 서버 세션에만 둔다(#68)
                GithubUserToken.store(request.getSession(), userToken);
            }
        } catch (IllegalArgumentException | IllegalStateException | ApiException e) {
            // 사용자 정보 형식 오류 · 토큰 없음 · GitHub 오류 — 로그인하지 않은 상태로 화면에 돌려보낸다
            log.warn("GitHub 로그인 처리 실패: {}", e instanceof ApiException api
                    ? api.getErrorCode().code() : e.getClass().getSimpleName());
        } finally {
            if (authentication instanceof OAuth2AuthenticationToken token) {
                authorizedClientRepository.removeAuthorizedClient(token.getAuthorizedClientRegistrationId(),
                        authentication, request, response);
            }
        }
        contextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);

        response.sendRedirect(redirectUrl);
    }

    private String accessToken(Authentication authentication, HttpServletRequest request) {
        if (!(authentication instanceof OAuth2AuthenticationToken token)) {
            throw new IllegalStateException("GitHub 로그인 인증이 아니다");
        }
        OAuth2AuthorizedClient client = authorizedClientRepository.loadAuthorizedClient(
                token.getAuthorizedClientRegistrationId(), authentication, request);
        if (client == null) {
            throw new IllegalStateException("로그인 요청에 사용자 토큰이 없다");
        }
        return client.getAccessToken().getTokenValue();
    }
}

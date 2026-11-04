package com.samdoryu.backend.github;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;

/**
 * Spring의 OAuth 클라이언트 저장소 — 로그인 요청 안에서만 토큰을 들고 있다(요청 속성). Spring 기본값은 서버 메모리에
 * 사용자마다 토큰을 쌓아 두는데(로그아웃해도 남음) 그것을 막는다.
 * <p>
 * 로그인 성공 처리가 이 토큰으로 레포 권한을 읽고(#65), 그 사용자의 서버 세션에 {@link GithubUserToken}으로 옮긴 뒤(#68)
 * {@link #removeAuthorizedClient}로 지운다. 세션의 토큰은 로그아웃 · 만료 때 세션과 함께 사라진다(NFR-04).
 */
public class LoginRequestAuthorizedClientRepository implements OAuth2AuthorizedClientRepository {

    private static final String ATTRIBUTE = LoginRequestAuthorizedClientRepository.class.getName() + ".CLIENT";

    @Override
    @SuppressWarnings("unchecked")
    public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String clientRegistrationId,
            Authentication principal, HttpServletRequest request) {
        Object client = request.getAttribute(ATTRIBUTE);
        if (client instanceof OAuth2AuthorizedClient authorized
                && authorized.getClientRegistration().getRegistrationId().equals(clientRegistrationId)) {
            return (T) authorized;
        }
        return null;
    }

    @Override
    public void saveAuthorizedClient(OAuth2AuthorizedClient authorizedClient, Authentication principal,
            HttpServletRequest request, HttpServletResponse response) {
        request.setAttribute(ATTRIBUTE, authorizedClient);
    }

    @Override
    public void removeAuthorizedClient(String clientRegistrationId, Authentication principal,
            HttpServletRequest request, HttpServletResponse response) {
        request.removeAttribute(ATTRIBUTE);
    }
}

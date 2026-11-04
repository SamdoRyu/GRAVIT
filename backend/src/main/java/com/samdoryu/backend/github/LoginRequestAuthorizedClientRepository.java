package com.samdoryu.backend.github;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;

/**
 * GitHub 로그인으로 받은 사용자 토큰을 <b>그 로그인 요청 안에서만</b> 들고 있다(요청 속성). 세션 · DB · 서버 메모리에
 * 남기지 않는다 — 요청이 끝나면 사라진다(NFR-04). Spring 기본값은 서버 메모리에 사용자마다 토큰을 쌓아 둔다.
 * <p>
 * 로그인 성공 처리가 이 토큰으로 레포 권한을 한 번 읽고(#65) {@link #removeAuthorizedClient}로 지운다.
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

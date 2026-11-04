package com.samdoryu.backend.github;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;

/**
 * GitHub 로그인으로 받은 사용자 토큰을 보관하지 않는다. Spring 기본값은 서버 메모리에 사용자마다 토큰을 쌓아 두는데,
 * #64는 로그인 뒤 사용자 토큰을 쓰지 않는다(NFR-04 — 필요 없는 토큰을 남기지 않는다).
 * 로그인 때 레포 권한을 읽는 #65가 토큰이 필요하면 여기서 그 로그인 처리에만 넘기도록 바꾼다.
 */
class DiscardingAuthorizedClientRepository implements OAuth2AuthorizedClientRepository {

    @Override
    public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String clientRegistrationId,
            Authentication principal, HttpServletRequest request) {
        return null;
    }

    @Override
    public void saveAuthorizedClient(OAuth2AuthorizedClient authorizedClient, Authentication principal,
            HttpServletRequest request, HttpServletResponse response) {
        // 버린다
    }

    @Override
    public void removeAuthorizedClient(String clientRegistrationId, Authentication principal,
            HttpServletRequest request, HttpServletResponse response) {
        // 보관한 것이 없다
    }
}

package com.samdoryu.backend.github;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.endpoint.RestClientAuthorizationCodeTokenResponseClient;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.core.user.OAuth2User;

/**
 * GitHub 로그인 중 GitHub를 부르는 두 곳(CONTRACTS.md 「7」 — GitHub 호출은 github 패키지에서만).
 * <ul>
 *   <li>OAuth 코드 교환 — 허용된 {@code POST}(인증 요청)</li>
 *   <li>로그인한 사용자 정보 {@code GET /user} — 읽기</li>
 * </ul>
 * 받은 사용자 토큰은 그 로그인 요청 안에서 레포 권한을 읽는 데만 쓰고({@link GithubUserClient}) 세션 · 응답 · 로그에
 * 남기지 않는다(NFR-04). 테스트는 이 빈들을 가짜로 바꿔 실제 GitHub를 부르지 않는다.
 */
@Configuration
public class GithubOAuthClients {

    @Bean
    OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> githubAccessTokenResponseClient() {
        return new RestClientAuthorizationCodeTokenResponseClient();
    }

    @Bean
    OAuth2UserService<OAuth2UserRequest, OAuth2User> githubUserService() {
        return new DefaultOAuth2UserService();
    }

    @Bean
    OAuth2AuthorizedClientRepository githubAuthorizedClientRepository() {
        return new LoginRequestAuthorizedClientRepository();
    }
}

package com.samdoryu.backend.common.security;

import com.samdoryu.backend.auth.security.GithubLoginFailureHandler;
import com.samdoryu.backend.auth.security.GithubLoginSuccessHandler;
import com.samdoryu.backend.auth.service.AccountService;
import com.samdoryu.backend.auth.service.GithubLoginService;
import com.samdoryu.backend.common.error.ErrorResponseWriter;
import com.samdoryu.backend.github.GithubUserClient;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfFilter;

/**
 * 하나뿐인 Security 설정(CONTRACTS.md 「6」 세션 · 쿠키 · CSRF). GitHub OAuth와 심사용 로그인도 여기에 더한다.
 * 기본은 거부다 — 공개 경로는 이 파일에 하나씩 적는다.
 */
@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class SecurityConfig {

    /** 세션 쿠키 이름 — 로그아웃 때 지운다(Spring 기본값). */
    private static final String SESSION_COOKIE = "JSESSIONID";

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, AppProperties appProperties,
            ErrorResponseWriter errorResponseWriter, SecurityContextRepository securityContextRepository,
            GithubLoginService githubLoginService, GithubUserClient githubUserClient,
            OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> githubAccessTokenResponseClient,
            OAuth2UserService<OAuth2UserRequest, OAuth2User> githubUserService,
            OAuth2AuthorizedClientRepository githubAuthorizedClientRepository) throws Exception {
        JsonAccessDeniedHandler accessDeniedHandler = new JsonAccessDeniedHandler(errorResponseWriter);
        // 로그인이 끝나면(성공 · 실패 모두) 화면 주소로 돌려보낸다 — 도착 화면은 PRD 「열린 질문」
        String appHome = appProperties.origin() + "/";
        http
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/api/health", "/api/login-options").permitAll()
                        .anyRequest().authenticated())
                .securityContext(context -> context.securityContextRepository(securityContextRepository))
                // 쿠키 XSRF-TOKEN(화면이 읽음) → 헤더 X-XSRF-TOKEN. 로그인 · 로그아웃을 포함한 모든 쓰기에 요구한다.
                .csrf(csrf -> csrf.spa())
                .addFilterBefore(new OriginCheckFilter(appProperties.origin(), errorResponseWriter), CsrfFilter.class)
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(new JsonAuthenticationEntryPoint(errorResponseWriter))
                        .accessDeniedHandler(accessDeniedHandler))
                // GitHub 로그인 — 시작 /oauth2/authorization/github, 콜백 /login/oauth2/code/github(Spring 기본, 「10」).
                // 성공하면 세션 ID를 새로 발급한다(기본 changeSessionId). 기본 로그인 페이지는 만들지 않는다 — 화면은 SPA다.
                .oauth2Login(oauth2 -> oauth2
                        .loginPage(AccountService.GITHUB_LOGIN_URL)
                        .tokenEndpoint(token -> token.accessTokenResponseClient(githubAccessTokenResponseClient))
                        .userInfoEndpoint(userInfo -> userInfo.userService(githubUserService))
                        .authorizedClientRepository(githubAuthorizedClientRepository)
                        .successHandler(new GithubLoginSuccessHandler(githubLoginService, githubUserClient,
                                githubAuthorizedClientRepository, securityContextRepository, appHome))
                        .failureHandler(new GithubLoginFailureHandler(appHome)))
                // POST /api/logout만 받는다(CSRF가 켜져 있으면 Spring은 POST만 로그아웃으로 본다). 세션이 없어도 204.
                .logout(logout -> logout
                        .logoutUrl("/api/logout")
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT))
                        .deleteCookies(SESSION_COOKIE))
                .formLogin(formLogin -> formLogin.disable())
                .httpBasic(httpBasic -> httpBasic.disable())
                .requestCache(requestCache -> requestCache.disable());
        return http.build();
    }
}

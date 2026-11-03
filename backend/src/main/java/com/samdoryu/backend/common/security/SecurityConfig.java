package com.samdoryu.backend.common.security;

import com.samdoryu.backend.common.error.ErrorResponseWriter;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfFilter;

/**
 * 하나뿐인 Security 설정(CONTRACTS.md 「6」 세션 · 쿠키 · CSRF). GitHub OAuth와 심사용 로그인도 여기에 더한다.
 * 기본은 거부다 — 공개 경로는 이 파일에 하나씩 적는다.
 */
@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, AppProperties appProperties,
            ErrorResponseWriter errorResponseWriter) throws Exception {
        JsonAccessDeniedHandler accessDeniedHandler = new JsonAccessDeniedHandler(errorResponseWriter);
        http
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/api/health").permitAll()
                        .anyRequest().authenticated())
                // 쿠키 XSRF-TOKEN(화면이 읽음) → 헤더 X-XSRF-TOKEN. 로그인 · 로그아웃을 포함한 모든 쓰기에 요구한다.
                .csrf(csrf -> csrf.spa())
                .addFilterBefore(new OriginCheckFilter(appProperties.origin(), errorResponseWriter), CsrfFilter.class)
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(new JsonAuthenticationEntryPoint(errorResponseWriter))
                        .accessDeniedHandler(accessDeniedHandler))
                // 로그인 화면 · 리다이렉트는 SPA가 한다. POST /api/logout은 인증 Issue에서 더한다.
                .formLogin(formLogin -> formLogin.disable())
                .httpBasic(httpBasic -> httpBasic.disable())
                .logout(logout -> logout.disable())
                .requestCache(requestCache -> requestCache.disable());
        return http.build();
    }
}

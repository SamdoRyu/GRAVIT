package com.samdoryu.backend.auth.security;

import com.samdoryu.backend.auth.service.ReviewAccountService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

/**
 * {@code POST /api/review-login}(Spring Security 폼 로그인)의 아이디 · 비밀번호 확인. 성공하면 GitHub 로그인과 같은 모양의
 * 로그인 사용자({@code AppPrincipal})를 세션에 둔다. 실패 이유는 구분하지 않는다.
 */
public class ReviewLoginAuthenticationProvider implements AuthenticationProvider {

    private final ReviewAccountService reviewAccountService;

    public ReviewLoginAuthenticationProvider(ReviewAccountService reviewAccountService) {
        this.reviewAccountService = reviewAccountService;
    }

    @Override
    public Authentication authenticate(Authentication authentication) {
        String password = authentication.getCredentials() == null ? null : authentication.getCredentials().toString();
        // 비밀번호 확인(DB 밖) → 맞을 때만 계정 행 · 시연 사무실(DB 트랜잭션)
        return reviewAccountService.verify(authentication.getName(), password)
                .flatMap(spec -> reviewAccountService.login(spec, Instant.now().truncatedTo(ChronoUnit.MICROS)))
                .map(principal -> principal.toAuthentication())
                .orElseThrow(() -> new BadCredentialsException("심사용 로그인 실패"));
    }

    @Override
    public boolean supports(Class<?> authentication) {
        return UsernamePasswordAuthenticationToken.class.isAssignableFrom(authentication);
    }
}

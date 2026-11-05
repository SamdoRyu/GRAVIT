package com.samdoryu.backend.auth.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 보안 심사용 ID/PW 로그인 계정(P15). 켜고 끄는 것은 {@code app.review-login-enabled}.
 *
 * @param accounts {@code REVIEW_ACCOUNTS} — 형식은 {@code ReviewAccountSpec}. 비밀번호는 bcrypt 해시만이고 저장소에 커밋하지 않는다
 */
@ConfigurationProperties("app.review-login")
public record ReviewLoginProperties(String accounts) {
}

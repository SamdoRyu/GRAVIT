package com.samdoryu.backend.common.error;

import org.springframework.http.HttpStatus;

/**
 * 계약의 에러 code 전부(CONTRACTS.md 「6」). 새 code는 계약 변경이다.
 * 요청 출처 · CSRF 검사 실패는 {@link #INVALID}지만 403으로 낸다 — {@code ErrorResponseWriter}가 상태를 따로 받는다.
 */
public enum ErrorCode {

    INVALID("invalid", HttpStatus.BAD_REQUEST, "요청 값이 올바르지 않아요"),
    NOT_FOUND("not_found", HttpStatus.NOT_FOUND, "찾을 수 없어요"),
    CONFLICT("conflict", HttpStatus.CONFLICT, "지금 상태에서는 할 수 없는 요청이에요"),
    UNAVAILABLE("unavailable", HttpStatus.SERVICE_UNAVAILABLE, "잠시 뒤 다시 시도해 주세요"),
    UNAUTHORIZED("unauthorized", HttpStatus.UNAUTHORIZED, "로그인이 필요해요"),
    FORBIDDEN_ROLE("forbidden_role", HttpStatus.FORBIDDEN, "이 작업을 할 권한이 없어요"),
    GITHUB_UNAUTHORIZED("github_unauthorized", HttpStatus.SERVICE_UNAVAILABLE, "GitHub 인증에 실패했어요"),
    GITHUB_RATE_LIMITED("github_rate_limited", HttpStatus.SERVICE_UNAVAILABLE, "GitHub 호출 한도에 걸렸어요. 잠시 뒤 다시 시도해 주세요");

    private final String code;
    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(String code, HttpStatus status, String defaultMessage) {
        this.code = code;
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    /** JSON에 나가는 값(소문자 snake). */
    public String code() {
        return code;
    }

    public HttpStatus status() {
        return status;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}

package com.samdoryu.backend.common.error;

/**
 * 앱이 던지는 유일한 예외. {@link GlobalExceptionHandler}가 계약의 에러 응답으로 바꾼다.
 * message는 화면에 그대로 보이므로 내부 정보(스택 · SQL · 토큰)를 넣지 않는다.
 */
public class ApiException extends RuntimeException {

    private final ErrorCode errorCode;

    public ApiException(ErrorCode errorCode) {
        this(errorCode, errorCode.defaultMessage());
    }

    public ApiException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}

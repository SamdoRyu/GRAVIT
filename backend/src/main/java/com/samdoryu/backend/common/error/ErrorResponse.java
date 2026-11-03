package com.samdoryu.backend.common.error;

/** {@code { "error": { "code": "...", "message": "..." } }} — CONTRACTS_API.md 「1」 ErrorResponse. */
public record ErrorResponse(Body error) {

    public record Body(String code, String message) {
    }

    public static ErrorResponse of(ErrorCode errorCode, String message) {
        return new ErrorResponse(new Body(errorCode.code(), message));
    }

    public static ErrorResponse of(ErrorCode errorCode) {
        return of(errorCode, errorCode.defaultMessage());
    }
}

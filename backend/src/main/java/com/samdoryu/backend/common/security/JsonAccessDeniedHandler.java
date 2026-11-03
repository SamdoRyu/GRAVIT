package com.samdoryu.backend.common.security;

import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.error.ErrorResponseWriter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;

/** CSRF 토큰 없음 · 틀림은 {@code 403 invalid}, 그 밖의 거부는 {@code 403 forbidden_role}(CONTRACTS.md 「6」). */
public class JsonAccessDeniedHandler implements AccessDeniedHandler {

    private final ErrorResponseWriter errorResponseWriter;

    public JsonAccessDeniedHandler(ErrorResponseWriter errorResponseWriter) {
        this.errorResponseWriter = errorResponseWriter;
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            AccessDeniedException accessDeniedException) throws IOException {
        ErrorCode errorCode = accessDeniedException instanceof CsrfException ? ErrorCode.INVALID : ErrorCode.FORBIDDEN_ROLE;
        errorResponseWriter.write(response, HttpStatus.FORBIDDEN, errorCode);
    }
}

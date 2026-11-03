package com.samdoryu.backend.common.security;

import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.error.ErrorResponseWriter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

/** 인증 안 된 요청은 로그인 페이지로 보내지 않고 {@code 401 unauthorized} JSON(CONTRACTS.md 「6」). */
public class JsonAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ErrorResponseWriter errorResponseWriter;

    public JsonAuthenticationEntryPoint(ErrorResponseWriter errorResponseWriter) {
        this.errorResponseWriter = errorResponseWriter;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException authException) throws IOException {
        errorResponseWriter.write(response, ErrorCode.UNAUTHORIZED.status(), ErrorCode.UNAUTHORIZED);
    }
}

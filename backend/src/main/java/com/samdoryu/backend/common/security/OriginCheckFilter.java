package com.samdoryu.backend.common.security;

import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.error.ErrorResponseWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 쓰기 요청의 {@code Origin}이 허용 출처가 아니면 {@code 403 invalid}(CONTRACTS.md 「6」, NFR-05).
 * {@code Origin}이 없어도 거부한다 — 브라우저는 이 메서드들에 늘 {@code Origin}을 붙인다.
 * Spring Bean으로 등록하지 않는다(서블릿 필터로 두 번 걸리지 않게) — {@link SecurityConfig}가 만든다.
 */
public class OriginCheckFilter extends OncePerRequestFilter {

    private static final Set<String> WRITE_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

    private final String allowedOrigin;
    private final ErrorResponseWriter errorResponseWriter;

    public OriginCheckFilter(String allowedOrigin, ErrorResponseWriter errorResponseWriter) {
        this.allowedOrigin = allowedOrigin;
        this.errorResponseWriter = errorResponseWriter;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (WRITE_METHODS.contains(request.getMethod())
                && !allowedOrigin.equals(request.getHeader(HttpHeaders.ORIGIN))) {
            errorResponseWriter.write(response, HttpStatus.FORBIDDEN, ErrorCode.INVALID);
            return;
        }
        chain.doFilter(request, response);
    }
}

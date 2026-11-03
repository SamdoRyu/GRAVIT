package com.samdoryu.backend.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.containsStringIgnoringCase;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.common.error.ErrorCode;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * T3-a 공통 기반 — 실제 Security 필터 체인 · MVC로 확인한다(MySQL 필요).
 * 인증은 {@code @WithMockUser}(mock)다. 실제 로그인 흐름은 인증 Issue에서 검증한다.
 * CSRF는 spring-security-test의 {@code csrf()}를 쓰지 않는다 — 공유 컨텍스트의 토큰 저장소를 바꿔 버려
 * 이후 요청에 {@code XSRF-TOKEN} 쿠키가 나가지 않는다. 대신 화면과 같은 흐름(쿠키 → 헤더)으로 보낸다.
 */
@SpringBootTest(properties = "app.origin=" + CommonFoundationIntegrationTest.ORIGIN)
@AutoConfigureMockMvc
class CommonFoundationIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    private static final String CSRF_COOKIE = "XSRF-TOKEN";
    private static final String CSRF_HEADER = "X-XSRF-TOKEN";
    private static final String ECHO_BODY = "{\"name\":\"a\"}";

    @Autowired
    MockMvc mvc;

    /** 화면처럼 GET 응답의 {@code XSRF-TOKEN} 쿠키에서 토큰을 받는다. */
    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).startsWith(CSRF_COOKIE + "=");
        return setCookie.substring(CSRF_COOKIE.length() + 1, setCookie.indexOf(';'));
    }

    /** 쿠키 토큰과 헤더 토큰을 함께 보내는 JSON 쓰기 요청. */
    private MockHttpServletRequestBuilder jsonPost(String path, String cookieToken, String headerToken, String body) {
        return post(path)
                .cookie(new Cookie(CSRF_COOKIE, cookieToken))
                .header(CSRF_HEADER, headerToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    private MockHttpServletRequestBuilder validPost(String path, String body) throws Exception {
        String token = csrfToken();
        return jsonPost(path, token, token, body).header(HttpHeaders.ORIGIN, ORIGIN);
    }

    @Nested
    class Security {

        @Test
        void healthIsPublic() throws Exception {
            mvc.perform(get("/api/health"))
                    .andExpect(status().isOk())
                    .andExpect(content().json("{\"ok\":true}", JsonCompareMode.STRICT));
        }

        // Security는 쿠키를 Set-Cookie 헤더로 쓴다 — MockMvc의 cookie() matcher는 이를 읽지 못해 헤더를 직접 본다.
        @Test
        void csrfCookieIsReadableByTheScreen() throws Exception {
            mvc.perform(get("/api/health"))
                    .andExpect(header().string(HttpHeaders.SET_COOKIE, startsWith(CSRF_COOKIE + "=")))
                    .andExpect(header().string(HttpHeaders.SET_COOKIE, not(containsStringIgnoringCase("HttpOnly"))));
        }

        @Test
        void noSessionIs401JsonWithoutRedirect() throws Exception {
            mvc.perform(get("/api/me"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(header().doesNotExist(HttpHeaders.LOCATION))
                    // 로그인 전 화면도 이 응답에서 CSRF 쿠키를 받는다(CONTRACTS_API.md 「2」).
                    .andExpect(header().string(HttpHeaders.SET_COOKIE, startsWith(CSRF_COOKIE + "=")))
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                    .andExpect(jsonPath("$.error.code").value("unauthorized"))
                    .andExpect(jsonPath("$.error.message").isNotEmpty());
        }

        @Test
        @WithMockUser
        void writeWithoutCsrfIs403Invalid() throws Exception {
            mvc.perform(post("/api/test/echo").header(HttpHeaders.ORIGIN, ORIGIN)
                            .contentType(MediaType.APPLICATION_JSON).content(ECHO_BODY))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }

        @Test
        void writeWithoutCsrfAndSessionIs403Invalid() throws Exception {
            mvc.perform(post("/api/test/echo").header(HttpHeaders.ORIGIN, ORIGIN))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }

        @Test
        @WithMockUser
        void writeWithWrongCsrfHeaderIs403Invalid() throws Exception {
            mvc.perform(jsonPost("/api/test/echo", csrfToken(), "wrong-token", ECHO_BODY)
                            .header(HttpHeaders.ORIGIN, ORIGIN))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }

        @Test
        @WithMockUser
        void writeFromOtherOriginIs403Invalid() throws Exception {
            String token = csrfToken();
            mvc.perform(jsonPost("/api/test/echo", token, token, ECHO_BODY)
                            .header(HttpHeaders.ORIGIN, "https://evil.example"))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }

        @Test
        @WithMockUser
        void writeWithoutOriginIs403Invalid() throws Exception {
            String token = csrfToken();
            mvc.perform(jsonPost("/api/test/echo", token, token, ECHO_BODY))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }

        @Test
        @WithMockUser
        void writeWithCsrfAndOriginPasses() throws Exception {
            mvc.perform(validPost("/api/test/echo", ECHO_BODY))
                    .andExpect(status().isOk())
                    .andExpect(content().json(ECHO_BODY, JsonCompareMode.STRICT));
        }

        @Test
        void writeWithCsrfAndOriginButNoSessionIs401() throws Exception {
            mvc.perform(validPost("/api/test/echo", ECHO_BODY))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error.code").value("unauthorized"));
        }
    }

    @Nested
    @WithMockUser
    class Errors {

        @ParameterizedTest
        @EnumSource(ErrorCode.class)
        void apiExceptionBecomesContractErrorResponse(ErrorCode errorCode) throws Exception {
            mvc.perform(get("/api/test/errors/{code}", errorCode.name()))
                    .andExpect(status().is(errorCode.status().value()))
                    .andExpect(jsonPath("$.error.code").value(errorCode.code()))
                    .andExpect(jsonPath("$.error.message").value(errorCode.defaultMessage()));
        }

        @Test
        void unknownRequestFieldIs400Invalid() throws Exception {
            mvc.perform(validPost("/api/test/echo", "{\"name\":\"a\",\"nmae\":\"typo\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }

        @Test
        void malformedBodyIs400Invalid() throws Exception {
            mvc.perform(validPost("/api/test/echo", "{not json"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }

        @Test
        void pathIdIsConvertedAndReturnedAsString() throws Exception {
            mvc.perform(get("/api/test/items/42"))
                    .andExpect(status().isOk())
                    .andExpect(content().json("{\"id\":\"42\"}", JsonCompareMode.STRICT));
        }

        @Test
        void malformedPathIdIs404NotFound() throws Exception {
            mvc.perform(get("/api/test/items/t_1"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("not_found"));
        }

        @Test
        void unknownPathIs404NotFound() throws Exception {
            mvc.perform(get("/api/no-such-path"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("not_found"));
        }

        @Test
        void unexpectedExceptionIs503WithoutInternalDetail() throws Exception {
            mvc.perform(get("/api/test/boom"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.error.code").value("unavailable"))
                    .andExpect(content().string(not(containsString("internal detail"))));
        }

        @Test
        void instantIsUtcIsoStringEndingWithZ() throws Exception {
            mvc.perform(get("/api/test/time"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.at").value(endsWith("Z")))
                    .andExpect(jsonPath("$.at").value("2026-11-03T05:12:00Z"));
        }
    }
}

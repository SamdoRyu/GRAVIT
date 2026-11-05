package com.samdoryu.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * #63 심사용 로그인이 켜진 환경의 경로 — Security 설정(폼 로그인 · CSRF · Origin · 401 JSON)만 본다. DB를 읽기 전에 끝나는
 * 실패라 DB 없이도 돈다. 성공 흐름 · 시연 사무실 · 막힌 계정은 {@code ReviewLoginIntegrationTest}.
 */
@SpringBootTest(properties = {
        "app.origin=" + ReviewLoginEndpointTest.ORIGIN,
        "app.review-login-enabled=true"})
@AutoConfigureMockMvc
class ReviewLoginEndpointTest {

    static final String ORIGIN = "http://localhost:5173";
    private static final String PASSWORD = "student-" + System.nanoTime();

    @DynamicPropertySource
    static void reviewAccounts(DynamicPropertyRegistry registry) {
        String hash = new BCryptPasswordEncoder(4).encode(PASSWORD);
        registry.add("app.review-login.accounts", () -> "rev-student:participant:seed-lee:" + hash);
    }

    @Autowired MockMvc mvc;

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/login-options"))
                .andExpect(jsonPath("$.reviewLoginEnabled").value(true))
                .andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private ResultActions login(MockHttpSession session, String username, String password) throws Exception {
        String token = csrfToken();
        return mvc.perform(post("/api/review-login").session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("username", username).param("password", password));
    }

    /** 틀린 비밀번호 · 없는 아이디 — 같은 401 JSON(어느 값이 틀렸는지 말하지 않음), 리다이렉트 없음, 로그인되지 않는다. */
    @Test
    void wrongPasswordAndUnknownUserAreTheSame401() throws Exception {
        String[][] attempts = {{"rev-student", "wrong-password"}, {"nobody", PASSWORD}};
        for (String[] attempt : attempts) {
            MockHttpSession session = new MockHttpSession();
            String body = login(session, attempt[0], attempt[1])
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error.code").value("unauthorized"))
                    .andReturn().getResponse().getContentAsString();
            assertThat(body).doesNotContain(attempt[0]);
            mvc.perform(get("/api/me").session(session)).andExpect(status().isUnauthorized());
        }
    }

    /** 같은 CSRF · Origin 검사 — 없거나 틀리면 403 invalid, 로그인되지 않는다. */
    @Test
    void loginNeedsCsrfAndTheAppOrigin() throws Exception {
        MockHttpSession noCsrf = new MockHttpSession();
        mvc.perform(post("/api/review-login").session(noCsrf).header(HttpHeaders.ORIGIN, ORIGIN)
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("username", "rev-student").param("password", PASSWORD))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        mvc.perform(get("/api/me").session(noCsrf)).andExpect(status().isUnauthorized());

        String token = csrfToken();
        mvc.perform(post("/api/review-login").session(new MockHttpSession())
                        .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                        .header(HttpHeaders.ORIGIN, "https://evil.example")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("username", "rev-student").param("password", PASSWORD))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("invalid"));
    }

    /** 로그인 페이지를 따로 만들지 않는다 — GET은 로그인 처리기가 아니고, 다른 API처럼 세션이 없으면 401 JSON. */
    @Test
    void noLoginPageIsServed() throws Exception {
        mvc.perform(get("/api/review-login")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("unauthorized"));
        mvc.perform(get("/login")).andExpect(status().isUnauthorized());
    }
}

package com.samdoryu.backend.auth;

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
import org.springframework.test.web.servlet.MockMvc;

/**
 * 심사용 로그인이 꺼진 환경(기본) — 경로 자체가 없어 {@code 404 not_found}(CONTRACTS_API 「2」 · 「9」 인증).
 * 설정에 계정이 있어도 읽지 않는다. 화면 안내는 {@code reviewLoginEnabled: false}.
 */
@SpringBootTest(properties = {
        "app.origin=" + ReviewLoginDisabledTest.ORIGIN,
        "app.review-login-enabled=false",
        "app.review-login.accounts=rev-student:participant:seed-lee:not-a-hash"})
@AutoConfigureMockMvc
class ReviewLoginDisabledTest {

    static final String ORIGIN = "http://localhost:5173";

    @Autowired MockMvc mvc;

    @Test
    void reviewLoginRouteDoesNotExist() throws Exception {
        String setCookie = mvc.perform(get("/api/login-options"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reviewLoginEnabled").value(false))
                .andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));

        mvc.perform(post("/api/review-login")
                        .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                        .header(HttpHeaders.ORIGIN, ORIGIN)
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("username", "rev-student").param("password", "anything"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }
}

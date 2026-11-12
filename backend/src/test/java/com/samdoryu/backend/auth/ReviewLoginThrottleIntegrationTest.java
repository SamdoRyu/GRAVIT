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
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * #165 심사용 로그인 반복 실패 제한 — 실제 Security · MVC · MySQL. 여러 번 틀린 계정은 맞는 비밀번호도 같은 {@code 401}(잠김을
 * 드러내지 않음), 다른 계정은 그대로 로그인된다. 잠금 기록은 이 테스트의 컨텍스트에만 있다(계정도 이 클래스 전용).
 */
@SpringBootTest(properties = {
        "app.origin=" + ReviewLoginThrottleIntegrationTest.ORIGIN,
        "app.review-login-enabled=true"})
@AutoConfigureMockMvc
@Transactional
class ReviewLoginThrottleIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    private static final String GUESSED_PASSWORD = "guessed-" + System.nanoTime();
    private static final String OTHER_PASSWORD = "other-" + System.nanoTime();

    @DynamicPropertySource
    static void reviewAccounts(DynamicPropertyRegistry registry) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
        registry.add("app.review-login.accounts", () -> String.join(";",
                "rev-guessed:participant:seed-lee:" + encoder.encode(GUESSED_PASSWORD),
                "rev-other:participant:seed-kim:" + encoder.encode(OTHER_PASSWORD)));
    }

    @Autowired MockMvc mvc;

    private ResultActions login(String username, String password) throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        MockHttpSession session = new MockHttpSession();
        return mvc.perform(post("/api/review-login").session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("username", username).param("password", password)
                .with(request -> {
                    request.setRequestedSessionId(session.getId());
                    request.setRequestedSessionIdValid(true);
                    return request;
                }));
    }

    @Test
    void afterFiveWrongPasswordsTheRightOneIsTheSame401AndOtherAccountsStillLogIn() throws Exception {
        for (int i = 0; i < 5; i++) {
            login("rev-guessed", "wrong-" + i)
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error.code").value("unauthorized"));
        }

        login("rev-guessed", GUESSED_PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("unauthorized"))
                // 잠긴 동안에도 틀렸을 때와 같은 문구 — 잠겼다는 사실을 알리지 않는다
                .andExpect(jsonPath("$.error.message").value(ReviewLoginEndpointTest.REVIEW_LOGIN_FAILED));
        login("rev-other", OTHER_PASSWORD).andExpect(status().isNoContent());
    }
}

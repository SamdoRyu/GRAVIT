package com.samdoryu.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.auth.service.AppPrincipal;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.endpoint.OAuth2AccessTokenResponse;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;

/**
 * #64 GitHub 로그인 — 실제 Spring Security 흐름(인가 요청 → 콜백 → 세션 재발급 → /api/me → 로그아웃)을 돈다.
 * GitHub를 부르는 두 곳(코드 교환 · 사용자 정보)만 가짜다. 실제 GitHub App 로그인은 검증하지 않는다.
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + GithubLoginIntegrationTest.INSTRUCTOR_ID)
@AutoConfigureMockMvc
@Transactional
class GithubLoginIntegrationTest {

    static final long INSTRUCTOR_ID = 9001L;
    private static final String ORIGIN = "http://localhost:5173";
    private static final String HOME = ORIGIN + "/";

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired InstructorAssignmentRepository instructorAssignments;

    @MockitoBean OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> tokenClient;
    @MockitoBean OAuth2UserService<OAuth2UserRequest, OAuth2User> userService;
    /** 레포 권한 읽기 — 이 테스트에서는 권한 있는 레포가 없다(역할은 LoginRepoRolesIntegrationTest). */
    @MockitoBean com.samdoryu.backend.github.GithubUserClient githubUserClient;

    private void githubReturns(long id, String login, String name) {
        given(tokenClient.getTokenResponse(any())).willReturn(OAuth2AccessTokenResponse.withToken("gho_fake")
                .tokenType(OAuth2AccessToken.TokenType.BEARER).expiresIn(3600).build());
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("id", id);
        attributes.put("login", login);
        attributes.put("name", name);
        attributes.put("avatar_url", "https://avatars.githubusercontent.com/u/" + id + "?v=4");
        given(userService.loadUser(any())).willReturn(new DefaultOAuth2User(List.of(), attributes, "id"));
    }

    /** 로그인 시작 → GitHub 인가 주소로 302 → 같은 state로 콜백. 콜백 응답을 돌려준다. */
    private MvcResult loginThroughGithub(MockHttpSession session) throws Exception {
        String location = mvc.perform(get("/oauth2/authorization/github").session(session))
                .andExpect(status().isFound())
                .andReturn().getResponse().getRedirectedUrl();
        assertThat(location).startsWith("https://github.com/login/oauth/authorize");
        String state = URLDecoder.decode(
                UriComponentsBuilder.fromUriString(location).build().getQueryParams().getFirst("state"),
                StandardCharsets.UTF_8);

        // 브라우저처럼 세션 쿠키(요청한 세션 ID)를 함께 보낸다 — 세션 고정 방지는 요청한 세션 ID가 유효할 때 ID를 바꾼다
        return mvc.perform(get("/login/oauth2/code/github").param("code", "fake-code").param("state", state)
                        .session(session)
                        .with(request -> {
                            request.setRequestedSessionId(session.getId());
                            request.setRequestedSessionIdValid(true);
                            return request;
                        }))
                .andReturn();
    }

    private MockHttpSession loggedIn(long id, String login, String name) throws Exception {
        githubReturns(id, login, name);
        MockHttpSession session = new MockHttpSession();
        MvcResult callback = loginThroughGithub(session);
        assertThat(callback.getResponse().getStatus()).isEqualTo(302);
        return session;
    }

    /** CSRF 토큰 — 화면처럼 GET 응답의 쿠키에서 읽는다. */
    private String csrfToken(MockHttpSession session) throws Exception {
        String setCookie = String.join(";", mvc.perform(get("/api/login-options").session(session))
                .andReturn().getResponse().getHeaders("Set-Cookie"));
        int start = setCookie.indexOf("XSRF-TOKEN=") + "XSRF-TOKEN=".length();
        return setCookie.substring(start, setCookie.indexOf(';', start));
    }

    @Nested
    class Login {

        @Test
        void renewsTheSessionIdAndRedirectsToTheScreen() throws Exception {
            githubReturns(1001L, "octo-kim", "김옥토");
            MockHttpSession session = new MockHttpSession();
            String before = session.getId();

            MvcResult callback = loginThroughGithub(session);

            assertThat(callback.getResponse().getStatus()).isEqualTo(302);
            assertThat(callback.getResponse().getRedirectedUrl()).isEqualTo(HOME);
            assertThat(session.getId()).isNotEqualTo(before);
        }

        @Test
        void createsTheUserAndMeMatchesTheContractExample() throws Exception {
            MockHttpSession session = loggedIn(1001L, "octo-kim", "김옥토");

            String body = mvc.perform(get("/api/me").session(session))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.accountType").value("github"))
                    .andExpect(jsonPath("$.githubUserId").value("1001"))
                    .andExpect(jsonPath("$.isInstructor").value(false))
                    .andExpect(jsonPath("$.user.githubLogin").value("octo-kim"))
                    .andExpect(jsonPath("$.user.displayName").value("김옥토"))
                    .andReturn().getResponse().getContentAsString();

            // 계약 테스트 ② — 실제 응답 ↔ contract/examples/auth/me-response.json
            JsonNode actual = ContractShape.readTree(body);
            ContractShape.assertSameShape(ContractShape.readExample("auth", "me-response.json"), actual);
            ContractShape.assertCommonRules(actual);
            AppUser user = users.findByGithubUserId(1001L).orElseThrow();
            assertThat(actual.get("user").get("userId").asString()).isEqualTo(user.getId().toString());
        }

        @Test
        void sameGithubIdIsTheSameUserEvenAfterARename() throws Exception {
            loggedIn(1001L, "octo-kim", "김옥토");
            Long firstUserId = users.findByGithubUserId(1001L).orElseThrow().getId();

            MockHttpSession again = loggedIn(1001L, "octo-renamed", null);

            assertThat(users.findAll()).filteredOn(u -> Long.valueOf(1001L).equals(u.getGithubUserId())).hasSize(1);
            mvc.perform(get("/api/me").session(again))
                    .andExpect(jsonPath("$.user.userId").value(firstUserId.toString()))
                    .andExpect(jsonPath("$.user.githubLogin").value("octo-renamed"))
                    // 프로필 이름이 없으면 로그인 이름
                    .andExpect(jsonPath("$.user.displayName").value("octo-renamed"));
        }

        @Test
        void sessionHoldsOnlyTheAppPrincipalNotTheGithubToken() throws Exception {
            MockHttpSession session = loggedIn(1001L, "octo-kim", "김옥토");

            SecurityContext context = (SecurityContext) session.getAttribute(
                    HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
            assertThat(context.getAuthentication().getPrincipal()).isInstanceOf(AppPrincipal.class);
            for (String name : Collections.list(session.getAttributeNames())) {
                assertThat(String.valueOf(session.getAttribute(name))).doesNotContain("gho_fake");
            }
        }

        @Test
        void failedLoginRedirectsToTheScreenWithoutASession() throws Exception {
            given(tokenClient.getTokenResponse(any())).willThrow(
                    new OAuth2AuthenticationException(new OAuth2Error("invalid_grant")));
            MockHttpSession session = new MockHttpSession();

            MvcResult callback = loginThroughGithub(session);

            assertThat(callback.getResponse().getStatus()).isEqualTo(302);
            assertThat(callback.getResponse().getRedirectedUrl()).isEqualTo(HOME);
            mvc.perform(get("/api/me").session(session)).andExpect(status().isUnauthorized());
        }

        @Test
        void callbackWithAForgedStateDoesNotLogIn() throws Exception {
            githubReturns(1001L, "octo-kim", "김옥토");
            MockHttpSession session = new MockHttpSession();
            mvc.perform(get("/oauth2/authorization/github").session(session));

            mvc.perform(get("/login/oauth2/code/github").param("code", "c").param("state", "forged")
                            .session(session))
                    .andExpect(status().isFound())
                    .andExpect(redirectedUrl(HOME));
            mvc.perform(get("/api/me").session(session)).andExpect(status().isUnauthorized());
            assertThat(users.findByGithubUserId(1001L)).isEmpty();
        }
    }

    @Nested
    class Me {

        @Test
        void withoutSessionIs401Json() throws Exception {
            mvc.perform(get("/api/me"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(header().doesNotExist("Location"))
                    .andExpect(jsonPath("$.error.code").value("unauthorized"));
        }

        @Test
        void allowlistedAccountIsInstructorOnlyWhileAssignedSomewhere() throws Exception {
            MockHttpSession session = loggedIn(INSTRUCTOR_ID, "teacher", "강사");
            mvc.perform(get("/api/me").session(session)).andExpect(jsonPath("$.isInstructor").value(false));

            AppUser admin = users.saveAndFlush(AppUser.github(1002L, "admin", "팀장", null));
            Workspace ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, admin,
                    Instant.parse("2026-11-05T03:00:00Z")));
            InstructorAssignment assignment = instructorAssignments.saveAndFlush(new InstructorAssignment(ws,
                    INSTRUCTOR_ID, admin, Instant.parse("2026-11-05T03:00:00Z")));
            mvc.perform(get("/api/me").session(session)).andExpect(jsonPath("$.isInstructor").value(true));

            assignment.unassign(Instant.parse("2026-11-05T04:00:00Z"));
            instructorAssignments.saveAndFlush(assignment);
            mvc.perform(get("/api/me").session(session)).andExpect(jsonPath("$.isInstructor").value(false));
        }
    }

    @Nested
    class LoginOptionsEndpoint {

        @Test
        void isPublicAndHandsOutTheCsrfCookie() throws Exception {
            mvc.perform(get("/api/login-options"))
                    .andExpect(status().isOk())
                    .andExpect(content().json(
                            "{\"githubLoginUrl\":\"/oauth2/authorization/github\",\"reviewLoginEnabled\":false}",
                            JsonCompareMode.STRICT))
                    .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("XSRF-TOKEN=")));
        }
    }

    @Nested
    class Logout {

        @Test
        void postEndsTheSessionAndMeIs401Afterwards() throws Exception {
            MockHttpSession session = loggedIn(1001L, "octo-kim", "김옥토");
            String token = csrfToken(session);

            mvc.perform(post("/api/logout").session(session).cookie(new Cookie("XSRF-TOKEN", token))
                            .header("X-XSRF-TOKEN", token).header("Origin", ORIGIN))
                    .andExpect(status().isNoContent())
                    .andExpect(header().stringValues("Set-Cookie",
                            org.hamcrest.Matchers.hasItem(org.hamcrest.Matchers.startsWith("JSESSIONID=;"))));

            assertThat(session.isInvalid()).isTrue();
            mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
        }

        @Test
        void withoutSessionIsStill204() throws Exception {
            String token = csrfToken(new MockHttpSession());

            mvc.perform(post("/api/logout").cookie(new Cookie("XSRF-TOKEN", token))
                            .header("X-XSRF-TOKEN", token).header("Origin", ORIGIN))
                    .andExpect(status().isNoContent());
        }

        @Test
        void withoutCsrfIs403AndKeepsTheSession() throws Exception {
            MockHttpSession session = loggedIn(1001L, "octo-kim", "김옥토");

            mvc.perform(post("/api/logout").session(session).header("Origin", ORIGIN))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
            mvc.perform(get("/api/me").session(session)).andExpect(status().isOk());
        }

        /** 로그아웃은 POST만 — GET은 로그아웃이 아니다. */
        @Test
        void getDoesNotLogOut() throws Exception {
            MockHttpSession session = loggedIn(1001L, "octo-kim", "김옥토");

            mvc.perform(get("/api/logout").session(session)).andExpect(status().isNotFound());
            mvc.perform(get("/api/me").session(session)).andExpect(status().isOk());
        }
    }
}

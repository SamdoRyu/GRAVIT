package com.samdoryu.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.BDDMockito.then;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.ReviewAccount;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.auth.repository.ReviewAccountRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.github.GithubUserClient;
import com.samdoryu.backend.github.GithubUserToken;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * #63 보안 심사용 ID/PW 로그인 — 실제 Security · MVC · MySQL(CONTRACTS_API 「2」, CONTRACTS.md 「6」 · 「9」 인증 · 사무실 접근).
 * GitHub 로그인과 같은 세션 · CSRF · Origin · 인가 검사를 거친다. 계정 설정의 비밀번호와 해시는 테스트가 그때 만든다(저장소에
 * 두지 않는다). 시연 사무실은 첫 로그인 때 만들어지고 Seed로 채워진다 — 테스트 트랜잭션 안이라 끝나면 되돌린다.
 * 계약 테스트 ② — 심사용 계정의 {@code GET /api/me} ↔ contract/examples/auth/me-response.json.
 */
@SpringBootTest(properties = {
        "app.origin=" + ReviewLoginIntegrationTest.ORIGIN,
        "app.review-login-enabled=true"})
@AutoConfigureMockMvc
@Transactional
class ReviewLoginIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final String STUDENT_PASSWORD = "student-" + System.nanoTime();
    private static final String MENTOR_PASSWORD = "mentor-" + System.nanoTime();
    private static final String BLOCKED_PASSWORD = "blocked-" + System.nanoTime();

    @DynamicPropertySource
    static void reviewAccounts(DynamicPropertyRegistry registry) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
        registry.add("app.review-login.accounts", () -> String.join(";",
                "rev-student:participant:seed-lee:" + encoder.encode(STUDENT_PASSWORD),
                "rev-mentor:instructor::" + encoder.encode(MENTOR_PASSWORD),
                "rev-blocked:participant:seed-park:" + encoder.encode(BLOCKED_PASSWORD)));
    }

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired ReviewAccountRepository reviewAccounts;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;

    /** 실제 GitHub를 부르지 않는다 — 심사용 세션은 GitHub를 읽을 일이 없어야 한다(#250) */
    @MockitoBean GithubUserClient githubUserClient;

    private Workspace realWorkspace;

    @BeforeEach
    void setUp() {
        AppUser kim = users.saveAndFlush(AppUser.github(1001L, "kim", "김", null));
        realWorkspace = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "repo", 77L, kim, T0));
    }

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private ResultActions login(MockHttpSession session, String username, String password) throws Exception {
        String token = csrfToken();
        return mvc.perform(post("/api/review-login").session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("username", username).param("password", password)
                // 브라우저처럼 세션 쿠키(요청한 세션 ID)를 함께 보낸다 — 세션 고정 방지는 요청한 세션 ID가 유효할 때 ID를 바꾼다
                .with(request -> {
                    request.setRequestedSessionId(session.getId());
                    request.setRequestedSessionIdValid(true);
                    return request;
                }));
    }

    private MockHttpSession loggedIn(String username, String password) throws Exception {
        MockHttpSession session = new MockHttpSession();
        login(session, username, password).andExpect(status().isNoContent());
        return session;
    }

    private ResultActions write(MockHttpSession session, String path, String json) throws Exception {
        String token = csrfToken();
        return mvc.perform(post(path).session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private Long demoWorkspaceId() {
        List<Workspace> demos = workspaces.findByKind(WorkspaceKind.DEMO);
        assertThat(demos).as("시연 사무실은 하나").hasSize(1);
        return demos.get(0).getId();
    }

    private static final String AGENDA = "{\"kind\":\"other\",\"sourceId\":null,\"title\":\"심사 안건\","
            + "\"background\":null,\"tried\":null,\"unresolvedReason\":null}";

    /** 로그인할 때 세션 ID를 새로 발급하고, 그 세션으로 /api/me가 심사용 계정을 보인다. 로그아웃 뒤 401. */
    @Test
    void loginRenewsTheSessionAndMeShowsTheReviewAccount() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String before = session.getId();

        login(session, "rev-student", STUDENT_PASSWORD).andExpect(status().isNoContent());

        assertThat(session.getId()).isNotEqualTo(before);
        String response = mvc.perform(get("/api/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountType").value("review"))
                .andExpect(jsonPath("$.githubUserId").value(nullValue()))
                .andExpect(jsonPath("$.user.githubLogin").value(nullValue()))
                .andExpect(jsonPath("$.user.displayName").value("rev-student"))
                .andExpect(jsonPath("$.isInstructor").value(false))
                .andReturn().getResponse().getContentAsString();
        JsonNode actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("auth", "me-response.json"), actual);
        ContractShape.assertCommonRules(actual);
        // 비밀번호 해시는 설정 값 그대로 저장되고 평문은 어디에도 없다
        ReviewAccount account = reviewAccounts.findByUsername("rev-student").orElseThrow();
        assertThat(new BCryptPasswordEncoder().matches(STUDENT_PASSWORD, account.getPasswordHash())).isTrue();

        String token = csrfToken();
        mvc.perform(post("/api/logout").session(session)
                        .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                        .header(HttpHeaders.ORIGIN, ORIGIN))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/me").session(session)).andExpect(status().isUnauthorized());
    }

    /**
     * #250 — 로그아웃 없이 같은 브라우저 세션에서 심사용으로 로그인하면, 이전 GitHub 로그인의 토큰이 세션에 남지 않는다.
     * 그래서 그 세션으로 사무실을 열 수 없다(레포가 안 보이는 것과 같은 404).
     */
    @Test
    void loginDropsTheGithubTokenOfAnEarlierLoginInTheSameSession() throws Exception {
        MockHttpSession session = new MockHttpSession();
        GithubUserToken.store(session, "gho_previous");

        login(session, "rev-student", STUDENT_PASSWORD).andExpect(status().isNoContent());

        assertThat(GithubUserToken.from(session)).isEmpty();
        write(session, "/api/workspaces", "{\"githubRepoId\":\"5002\",\"projectStartDate\":\"2026-11-04\","
                + "\"projectEndDate\":\"2026-11-17\",\"specDocumentPath\":null,\"activityConsent\":true}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        assertThat(workspaces.findByGithubRepoId(5002L)).isEmpty();
        then(githubUserClient).shouldHaveNoInteractions();
    }

    /**
     * 운영자가 DB에서 막은 계정 — 설정에 있고 비밀번호가 맞아도 같은 401, 로그인되지 않는다. 틀린 비밀번호 · 없는 아이디 · CSRF ·
     * Origin은 {@code ReviewLoginEndpointTest}.
     */
    @Test
    void disabledAccountIsTheSame401() throws Exception {
        AppUser blockedUser = users.saveAndFlush(AppUser.review("rev-blocked"));
        ReviewAccount blocked = new ReviewAccount(blockedUser, "rev-blocked", "$2a$04$" + "x".repeat(53));
        blocked.disable();
        reviewAccounts.saveAndFlush(blocked);

        MockHttpSession session = new MockHttpSession();
        login(session, "rev-blocked", BLOCKED_PASSWORD)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("unauthorized"));
        mvc.perform(get("/api/me").session(session)).andExpect(status().isUnauthorized());
        assertThat(workspaces.findByKind(WorkspaceKind.DEMO)).as("실패한 로그인은 시연 사무실을 만들지 않는다").isEmpty();
    }

    /**
     * 참여자 심사 계정 — 시연 사무실만 보이고(실제 사무실 404), Seed 팀원(seed-lee)으로 쓴다. 시연 사무실은 첫 로그인 때 하나만
     * 만들어지고 Seed로 채워진다.
     */
    @Test
    void participantSeesOnlyTheDemoWorkspaceAndActsAsTheSeedMember() throws Exception {
        MockHttpSession session = loggedIn("rev-student", STUDENT_PASSWORD);
        Long demoId = demoWorkspaceId();
        Member seedLee = members.findByWorkspaceIdAndRemovedAtIsNull(demoId).stream()
                .filter(member -> "seed-lee".equals(member.getGithubLogin())).findFirst().orElseThrow();
        String demoPath = "/api/workspaces/" + Ids.toApi(demoId);

        mvc.perform(get("/api/workspaces").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(Ids.toApi(demoId)))
                .andExpect(jsonPath("$[0].kind").value("demo"))
                .andExpect(jsonPath("$[0].myRole").value("participant"));
        mvc.perform(get(demoPath + "/snapshot").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.viewer.role").value("participant"))
                .andExpect(jsonPath("$.viewer.memberId").value(Ids.toApi(seedLee.getId())))
                .andExpect(jsonPath("$.members", hasSize(4)))
                .andExpect(jsonPath("$.settings.specDocumentPath").value("docs/requirements.md"));
        write(session, demoPath + "/agenda-items", AGENDA)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.raisedByMemberId").value(Ids.toApi(seedLee.getId())));

        // 실제 사무실은 존재를 숨긴다
        mvc.perform(get("/api/workspaces/" + Ids.toApi(realWorkspace.getId()) + "/snapshot").session(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));

        // 다시 로그인해도 시연 사무실은 하나
        loggedIn("rev-student", STUDENT_PASSWORD);
        demoWorkspaceId();
    }

    /** 강사 심사 계정 — 시연 사무실을 강사로 읽고, 팀원 쓰기는 403. 역할은 요청마다 확인한다. */
    @Test
    void reviewInstructorReadsTheDemoWorkspaceButCannotWriteAsAMember() throws Exception {
        MockHttpSession session = loggedIn("rev-mentor", MENTOR_PASSWORD);
        Long demoId = demoWorkspaceId();
        String demoPath = "/api/workspaces/" + Ids.toApi(demoId);

        mvc.perform(get("/api/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountType").value("review"))
                .andExpect(jsonPath("$.isInstructor").value(true));
        mvc.perform(get("/api/workspaces").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].myRole").value("instructor"));
        mvc.perform(get(demoPath + "/snapshot").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.viewer.role").value("instructor"))
                .andExpect(jsonPath("$.viewer.memberId").value(nullValue()));
        write(session, demoPath + "/agenda-items", AGENDA)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        mvc.perform(get("/api/workspaces/" + Ids.toApi(realWorkspace.getId()) + "/snapshot").session(session))
                .andExpect(status().isNotFound());

        // 운영자가 계정을 막으면 다음 요청부터 강사 역할이 없다
        reviewAccounts.findByUsername("rev-mentor").orElseThrow().disable();
        reviewAccounts.flush();
        mvc.perform(get(demoPath + "/snapshot").session(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }
}

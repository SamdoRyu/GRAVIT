package com.samdoryu.backend.workspace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.never;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.github.GithubUserClient;
import com.samdoryu.backend.github.GithubUserToken;
import com.samdoryu.backend.github.dto.GithubAccount;
import com.samdoryu.backend.github.dto.GithubInstalledRepository;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * #68 — 레포 선택 · 내 사무실 목록 · 사무실 열기(CONTRACTS_API.md 「3」)를 실제 MySQL로 확인한다.
 * GitHub(사용자 토큰으로 읽기)는 가짜, 세션은 TestLogin + 세션의 GitHub 토큰. 첫 동기화는 같은 스레드에서 돈다 —
 * 실제 GitHub 어댑터가 아직 없어 실제 사무실 동기화는 {@code unavailable}로 기록된다.
 */
@SpringBootTest(properties = {
        "app.instructor-github-user-ids=" + WorkspaceOpeningIntegrationTest.INSTRUCTOR_ID,
        "app.github-app-slug=gitvillage-office"})
@AutoConfigureMockMvc
@Transactional
class WorkspaceOpeningIntegrationTest {

    static final long INSTRUCTOR_ID = 9001L;
    private static final String ORIGIN = "http://localhost:5173";
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final String TOKEN = "gho_user";

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;

    @MockitoBean GithubUserClient githubUserClient;
    @TestBean(name = "syncExecutor") TaskExecutor syncExecutor;

    static TaskExecutor syncExecutor() {
        return new SyncTaskExecutor();
    }

    private AppUser kim;

    /** 팀 조직(700): gitvillage(5001, admin) · notes(5002, 참여자). 개인 계정(1001): blog(5003, admin). 조직 800은 앱 미설치. */
    @BeforeEach
    void setUp() {
        kim = users.saveAndFlush(AppUser.github(1001L, "octo-kim", "김옥토", null));
        given(githubUserClient.installedRepositories(TOKEN)).willReturn(List.of(
                new GithubInstalledRepository(11, 700, "team-samdo", 5002, "notes", false),
                new GithubInstalledRepository(11, 700, "team-samdo", 5001, "gitvillage", true),
                new GithubInstalledRepository(12, 1001, "octo-kim", 5003, "blog", true)));
        given(githubUserClient.organizations(TOKEN)).willReturn(List.of(new GithubAccount(700, "team-samdo"),
                new GithubAccount(800, "another-team")));
        given(githubUserClient.repositoryAdminLogins(TOKEN, "team-samdo", "notes")).willReturn(List.of("lee"));
    }

    /** 학생 세션 — 로그인 성공 처리처럼 GitHub 토큰을 서버 세션에 둔다. */
    private MockHttpSession student() {
        MockHttpSession session = TestLogin.githubUser(kim.getId(), 1001L).session();
        GithubUserToken.store(session, TOKEN);
        return session;
    }

    private String csrfToken() throws Exception {
        String setCookie = String.join(";", mvc.perform(get("/api/login-options"))
                .andReturn().getResponse().getHeaders("Set-Cookie"));
        int start = setCookie.indexOf("XSRF-TOKEN=") + "XSRF-TOKEN=".length();
        return setCookie.substring(start, setCookie.indexOf(';', start));
    }

    private MockHttpServletRequestBuilder open(String body) throws Exception {
        String token = csrfToken();
        return post("/api/workspaces").cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static String request(String repoId, String start, String end, String spec, Boolean consent) {
        return "{\"githubRepoId\":\"" + repoId + "\",\"projectStartDate\":\"" + start + "\",\"projectEndDate\":\""
                + end + "\",\"specDocumentPath\":" + (spec == null ? "null" : "\"" + spec + "\"")
                + ",\"activityConsent\":" + consent + "}";
    }

    @Nested
    class Repositories {

        @Test
        void groupsInstalledReposByOwnerAndListsOrgsWithoutTheApp() throws Exception {
            workspaces.saveAndFlush(Workspace.github(5001L, "team-samdo", "gitvillage", 11L, kim, T0));

            mvc.perform(get("/api/repositories").session(student()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.organizations.length()").value(3))
                    // 이름 순: another-team · octo-kim · team-samdo
                    .andExpect(jsonPath("$.organizations[0].login").value("another-team"))
                    .andExpect(jsonPath("$.organizations[0].appInstalled").value(false))
                    .andExpect(jsonPath("$.organizations[0].installUrl")
                            .value("https://github.com/apps/gitvillage-office/installations/new"))
                    .andExpect(jsonPath("$.organizations[0].repositories").isEmpty())
                    .andExpect(jsonPath("$.organizations[1].login").value("octo-kim"))
                    .andExpect(jsonPath("$.organizations[2].githubOwnerId").value("700"))
                    .andExpect(jsonPath("$.organizations[2].appInstalled").value(true))
                    .andExpect(jsonPath("$.organizations[2].installUrl").value(nullValue()))
                    // 레포 이름 순: gitvillage(열림) · notes(안 열림, 참여자)
                    .andExpect(jsonPath("$.organizations[2].repositories[0].name").value("gitvillage"))
                    .andExpect(jsonPath("$.organizations[2].repositories[0].githubRepoId").value("5001"))
                    .andExpect(jsonPath("$.organizations[2].repositories[0].myRole").value("repo_admin"))
                    .andExpect(jsonPath("$.organizations[2].repositories[0].workspaceId").isString())
                    .andExpect(jsonPath("$.organizations[2].repositories[0].adminLogins").isEmpty())
                    .andExpect(jsonPath("$.organizations[2].repositories[1].myRole").value("participant"))
                    .andExpect(jsonPath("$.organizations[2].repositories[1].workspaceId").value(nullValue()))
                    .andExpect(jsonPath("$.organizations[2].repositories[1].adminLogins[0]").value("lee"));
        }

        @Test
        void instructorAndReviewAccountsGetAnEmptyListWithoutCallingGithub() throws Exception {
            mvc.perform(get("/api/repositories").session(TestLogin.githubUser(98L, INSTRUCTOR_ID).session()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.organizations").isEmpty());
            mvc.perform(get("/api/repositories").session(TestLogin.reviewUser(97L).session()))
                    .andExpect(jsonPath("$.organizations").isEmpty());
            then(githubUserClient).should(never()).installedRepositories(anyString());
        }

        @Test
        void studentWithoutAGithubTokenMustLogInAgain() throws Exception {
            mvc.perform(get("/api/repositories").session(TestLogin.githubUser(kim.getId(), 1001L).session()))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error.code").value("unauthorized"));
        }

        @Test
        void githubFailureIs503() throws Exception {
            given(githubUserClient.installedRepositories(TOKEN))
                    .willThrow(new ApiException(ErrorCode.GITHUB_RATE_LIMITED));

            mvc.perform(get("/api/repositories").session(student()))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.error.code").value("github_rate_limited"));
        }
    }

    @Nested
    class MyWorkspaces {

        @Test
        void studentSeesTheWorkspacesOfItsSessionRolesSortedByName() throws Exception {
            Workspace zeta = workspaces.saveAndFlush(Workspace.github(5101L, "team", "zeta", 1L, kim, T0));
            Workspace alpha = workspaces.saveAndFlush(Workspace.github(5102L, "team", "alpha", 1L, kim, T0));
            workspaces.saveAndFlush(Workspace.github(5103L, "team", "other", 1L, kim, T0));
            MockHttpSession session = TestLogin.githubUser(kim.getId(), 1001L)
                    .member(zeta.getId(), 1L, WorkspaceRole.PARTICIPANT)
                    .member(alpha.getId(), 2L, WorkspaceRole.REPO_ADMIN).session();

            mvc.perform(get("/api/workspaces").session(session))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[0].displayName").value("team/alpha"))
                    .andExpect(jsonPath("$[0].myRole").value("repo_admin"))
                    .andExpect(jsonPath("$[0].htmlUrl").value("https://github.com/team/alpha"))
                    .andExpect(jsonPath("$[1].displayName").value("team/zeta"))
                    .andExpect(jsonPath("$[1].myRole").value("participant"));
        }

        @Test
        void instructorSeesCurrentlyAssignedWorkspacesOnly() throws Exception {
            Workspace assigned = workspaces.saveAndFlush(Workspace.github(5101L, "team", "a", 1L, kim, T0));
            Workspace unassigned = workspaces.saveAndFlush(Workspace.github(5102L, "team", "b", 1L, kim, T0));
            instructorAssignments.saveAndFlush(new InstructorAssignment(assigned, INSTRUCTOR_ID, kim, T0));
            InstructorAssignment old = instructorAssignments.saveAndFlush(
                    new InstructorAssignment(unassigned, INSTRUCTOR_ID, kim, T0));
            old.unassign(T0.plusSeconds(60));
            instructorAssignments.saveAndFlush(old);

            mvc.perform(get("/api/workspaces").session(TestLogin.githubUser(98L, INSTRUCTOR_ID).session()))
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].displayName").value("team/a"))
                    .andExpect(jsonPath("$[0].myRole").value("instructor"));
        }

        @Test
        void reviewAccountSeesOnlyTheDemoWorkspace() throws Exception {
            Workspace demo = workspaces.saveAndFlush(Workspace.demo("시연 사무실", T0));
            Workspace real = workspaces.saveAndFlush(Workspace.github(5101L, "team", "a", 1L, kim, T0));
            MockHttpSession reviewer = TestLogin.reviewUser(97L).member(demo.getId(), 1L, WorkspaceRole.PARTICIPANT)
                    .member(real.getId(), 2L, WorkspaceRole.PARTICIPANT).session();

            mvc.perform(get("/api/workspaces").session(reviewer))
                    .andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].kind").value("demo"))
                    .andExpect(jsonPath("$[0].htmlUrl").value(nullValue()));
        }
    }

    @Nested
    class OpenWorkspace {

        @Test
        void repoAdminOpensTheWorkspaceAndCanEnterWithoutLoggingInAgain() throws Exception {
            MockHttpSession session = student();

            String body = mvc.perform(open(request("5001", "2026-11-04", "2026-11-17", "docs/requirements.md", true))
                            .session(session))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.kind").value("github"))
                    .andExpect(jsonPath("$.displayName").value("team-samdo/gitvillage"))
                    .andExpect(jsonPath("$.githubRepoId").value("5001"))
                    .andReturn().getResponse().getContentAsString();

            // 계약 테스트 ② — 실제 응답 ↔ workspace-snapshot.json의 workspace
            JsonNode actual = ContractShape.readTree(body);
            ContractShape.assertSameShape(
                    ContractShape.readExample("workspace", "workspace-snapshot.json").get("workspace"), actual);
            ContractShape.assertCommonRules(actual);

            Workspace opened = workspaces.findByGithubRepoId(5001L).orElseThrow();
            assertThat(opened.getGithubInstallationId()).isEqualTo(11L);
            assertThat(opened.getOpenedBy().getId()).isEqualTo(kim.getId());
            TeamSettings settings = teamSettings.findByWorkspaceId(opened.getId()).orElseThrow();
            assertThat(settings.getProjectEndDate()).isEqualTo(LocalDate.of(2026, 11, 17));
            assertThat(settings.getSpecDocumentPath()).isEqualTo("docs/requirements.md");
            Member opener = members.findByWorkspaceIdAndUserId(opened.getId(), kim.getId()).orElseThrow();
            assertThat(opener.isRepoAdmin()).isTrue();
            assertThat(opener.getDeskIndex()).isZero();
            assertThat(opener.getActivityConsentedAt()).isNotNull();

            // 같은 세션으로 바로 들어간다 — 첫 동기화는 실제 어댑터가 없어 unavailable로 기록됨
            String base = "/api/workspaces/" + actual.get("id").asString();
            mvc.perform(get(base + "/sync-status").session(session))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.state").value("idle"))
                    .andExpect(jsonPath("$.lastFailureCode").value("unavailable"));
            mvc.perform(get("/api/workspaces").session(session))
                    .andExpect(jsonPath("$[0].myRole").value("repo_admin"));
        }

        @Test
        void withoutConsentTheOpenerHasNoConsentTime() throws Exception {
            mvc.perform(open(request("5001", "2026-11-04", "2026-11-17", null, false)).session(student()))
                    .andExpect(status().isCreated());

            Workspace opened = workspaces.findByGithubRepoId(5001L).orElseThrow();
            assertThat(members.findByWorkspaceIdAndUserId(opened.getId(), kim.getId()).orElseThrow()
                    .getActivityConsentedAt()).isNull();
            assertThat(teamSettings.findByWorkspaceId(opened.getId()).orElseThrow().getSpecDocumentPath()).isNull();
        }

        @Test
        void participantIs403() throws Exception {
            mvc.perform(open(request("5002", "2026-11-04", "2026-11-17", null, true)).session(student()))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        }

        @Test
        void repoNotVisibleIs404() throws Exception {
            mvc.perform(open(request("9999", "2026-11-04", "2026-11-17", null, true)).session(student()))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("not_found"));
            mvc.perform(open(request("5001", "2026-11-04", "2026-11-17", null, true))
                            .session(TestLogin.reviewUser(97L).session()))
                    .andExpect(status().isNotFound());
        }

        /** 허용 목록 강사 계정은 콜라보레이터여도 레포 관리자가 아니다(P1). */
        @Test
        void allowlistedInstructorIs403() throws Exception {
            MockHttpSession instructor = TestLogin.githubUser(98L, INSTRUCTOR_ID).session();
            GithubUserToken.store(instructor, TOKEN);

            mvc.perform(open(request("5001", "2026-11-04", "2026-11-17", null, true)).session(instructor))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        }

        @Test
        void alreadyOpenIs409() throws Exception {
            workspaces.saveAndFlush(Workspace.github(5001L, "team-samdo", "gitvillage", 11L, kim, T0));

            mvc.perform(open(request("5001", "2026-11-04", "2026-11-17", null, true)).session(student()))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.code").value("conflict"));
        }

        @Test
        void invalidRequestsAre400() throws Exception {
            mvc.perform(open(request("5001", "2026-11-17", "2026-11-04", null, true)).session(student()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
            mvc.perform(open(request("abc", "2026-11-04", "2026-11-17", null, true)).session(student()))
                    .andExpect(status().isBadRequest());
            mvc.perform(open(request("5001", "2026-11-04", "2026-11-17", "a".repeat(301), true)).session(student()))
                    .andExpect(status().isBadRequest());
            mvc.perform(open(request("5001", "2026-11-04", "2026-11-17", null, null)).session(student()))
                    .andExpect(status().isBadRequest());
            assertThat(workspaces.findByGithubRepoId(5001L)).isEmpty();
            then(githubUserClient).should(never()).installedRepositories(any());
        }
    }
}

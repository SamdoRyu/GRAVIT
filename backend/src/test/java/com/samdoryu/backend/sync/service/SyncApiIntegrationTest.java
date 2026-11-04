package com.samdoryu.backend.sync.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.BDDMockito.given;
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
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.github.GithubReaderSelector;
import com.samdoryu.backend.github.dto.GithubCollaborator;
import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.github.seed.SeedGithubReader;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.sync.domain.SyncState;
import com.samdoryu.backend.sync.repository.SyncStateRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.core.task.TaskExecutor;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * #70 — {@code POST W/sync} · {@code GET W/sync-status} · 실패 기록 · 폴링을 실제 MySQL로 확인한다(CONTRACTS_API.md 「4」).
 * 백그라운드 실행은 테스트에서 같은 스레드로 돌린다({@link SyncTaskExecutor}) — 요청이 끝나면 동기화도 끝나 있다.
 * 시연 사무실은 실제 Seed, 실제 사무실은 가짜 어댑터.
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + SyncApiIntegrationTest.INSTRUCTOR_ID)
@AutoConfigureMockMvc
@Transactional
class SyncApiIntegrationTest {

    static final long INSTRUCTOR_ID = 9001L;
    private static final String ORIGIN = "http://localhost:5173";
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired SyncService syncService;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired SyncStateRepository syncStates;
    @Autowired TaskRepository tasks;
    @Autowired InstructorAssignmentRepository instructorAssignments;

    @MockitoBean GithubReaderSelector readerSelector;
    @TestBean(name = SyncConfig.SYNC_EXECUTOR) TaskExecutor syncExecutor;

    static TaskExecutor syncExecutor() {
        return new SyncTaskExecutor();
    }

    private String csrfToken() throws Exception {
        String setCookie = String.join(";", mvc.perform(get("/api/login-options"))
                .andReturn().getResponse().getHeaders("Set-Cookie"));
        int start = setCookie.indexOf("XSRF-TOKEN=") + "XSRF-TOKEN=".length();
        return setCookie.substring(start, setCookie.indexOf(';', start));
    }

    private MockHttpServletRequestBuilder postSync(Workspace ws) throws Exception {
        String token = csrfToken();
        return post("/api/workspaces/" + Ids.toApi(ws.getId()) + "/sync")
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token).header("Origin", ORIGIN);
    }

    private MockHttpServletRequestBuilder getStatus(Workspace ws) {
        return get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/sync-status");
    }

    /** 시연 사무실 — GitHub를 부르지 않고 Seed로 바로 성공한다(「10」 구현 기본값). */
    @Nested
    class DemoWorkspace {

        private Workspace demo;
        private MockHttpSession member;

        @BeforeEach
        void setUp() {
            given(readerSelector.forKind(WorkspaceKind.DEMO)).willReturn(new SeedGithubReader());
            demo = workspaces.saveAndFlush(Workspace.demo("시연 사무실", T0));
            member = TestLogin.reviewUser(97L).member(demo.getId(), 1L, WorkspaceRole.PARTICIPANT).session();
        }

        @Test
        void manualSyncAnswers202RunningAndThenSucceeds() throws Exception {
            mvc.perform(postSync(demo).session(member))
                    .andExpect(status().isAccepted())
                    .andExpect(jsonPath("$.state").value("running"));

            String body = mvc.perform(getStatus(demo).session(member))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.state").value("idle"))
                    .andExpect(jsonPath("$.isFailing").value(false))
                    .andExpect(jsonPath("$.lastFailureCode").value(nullValue()))
                    .andReturn().getResponse().getContentAsString();
            JsonNode actual = ContractShape.readTree(body);
            assertThat(actual.get("lastSucceededAt").isNull()).isFalse();
            assertThat(tasks.findByWorkspaceIdAndGithubIssueNumber(demo.getId(), 1)).isPresent();

            // 계약 테스트 ② — 실제 응답 ↔ workspace-snapshot.json의 sync
            ContractShape.assertSameShape(
                    ContractShape.readExample("workspace", "workspace-snapshot.json").get("sync"), actual);
            ContractShape.assertCommonRules(actual);
        }

        @Test
        void statusBeforeAnySyncIsIdleWithNothing() throws Exception {
            mvc.perform(getStatus(demo).session(member))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.state").value("idle"))
                    .andExpect(jsonPath("$.lastSucceededAt").value(nullValue()))
                    .andExpect(jsonPath("$.specWarnings").isEmpty());
        }

        @Test
        void alreadyRunningIs409() throws Exception {
            mvc.perform(getStatus(demo).session(member));
            syncStates.markRunningIfIdle(demo.getId());

            mvc.perform(postSync(demo).session(member))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.code").value("conflict"));
        }

        /** 강사는 수동 동기화를 할 수 없다(「10」 구현 기본값). 상태는 볼 수 있다. */
        @Test
        void instructorCannotSyncButCanReadTheStatus() throws Exception {
            AppUser opener = users.saveAndFlush(AppUser.github(1001L, "kim", "김", null));
            instructorAssignments.saveAndFlush(new InstructorAssignment(demo, INSTRUCTOR_ID, opener, T0));
            MockHttpSession instructor = TestLogin.githubUser(98L, INSTRUCTOR_ID).session();

            mvc.perform(postSync(demo).session(instructor))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
            mvc.perform(getStatus(demo).session(instructor)).andExpect(status().isOk());
        }
    }

    /** 실제 사무실 — 실패를 삼키지 않고 기록, 마지막 데이터 유지(FR-GH-05 · NFR-09). */
    @Nested
    class GithubWorkspace {

        private final FakeGithubReader fake = new FakeGithubReader();
        private Workspace ws;
        private MockHttpSession member;

        @BeforeEach
        void setUp() {
            given(readerSelector.forKind(WorkspaceKind.GITHUB)).willReturn(fake);
            AppUser kim = users.saveAndFlush(AppUser.github(1001L, "kim", "김", null));
            ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "repo", 77L, kim, T0));
            member = TestLogin.githubUser(kim.getId(), 1001L).member(ws.getId(), 1L, WorkspaceRole.REPO_ADMIN)
                    .session();
            fake.collaborators = List.of(new GithubCollaborator(new GithubUser(1001L, "kim", null), true));
            fake.issues = List.of(new GithubIssue(1, "이슈", false, null, List.of(), List.of(), T0, T0, null));
        }

        @Test
        void failureIsRecordedAndTheLastDataStays() throws Exception {
            mvc.perform(postSync(ws).session(member)).andExpect(status().isAccepted());
            SyncState afterSuccess = syncStates.findByWorkspaceId(ws.getId()).orElseThrow();
            Instant succeededAt = afterSuccess.getLastSucceededAt();
            assertThat(succeededAt).isNotNull();

            fake.failWith = new ApiException(ErrorCode.GITHUB_RATE_LIMITED);
            fake.issues = List.of();
            mvc.perform(postSync(ws).session(member)).andExpect(status().isAccepted());

            mvc.perform(getStatus(ws).session(member))
                    .andExpect(jsonPath("$.state").value("idle"))
                    .andExpect(jsonPath("$.isFailing").value(true))
                    .andExpect(jsonPath("$.lastFailureCode").value("github_rate_limited"))
                    .andExpect(jsonPath("$.lastFailureMessage").isNotEmpty())
                    .andExpect(jsonPath("$.lastSucceededAt").value(succeededAt.toString()));
            assertThat(tasks.findByWorkspaceIdAndGithubIssueNumber(ws.getId(), 1)).isPresent();
        }

        @Test
        void unexpectedErrorsAreRecordedAsUnavailable() throws Exception {
            fake.failWith = new IllegalStateException("어댑터 고장");

            mvc.perform(postSync(ws).session(member)).andExpect(status().isAccepted());

            mvc.perform(getStatus(ws).session(member))
                    .andExpect(jsonPath("$.lastFailureCode").value("unavailable"))
                    .andExpect(jsonPath("$.lastFailureMessage").value(ErrorCode.UNAVAILABLE.defaultMessage()))
                    .andExpect(jsonPath("$.isFailing").value(true));
        }

        @Test
        void pollingReadsEverythingFirstThenOnlyChangesSinceTheLastSuccess() {
            syncService.pollAll();
            Instant firstSuccess = syncStates.findByWorkspaceId(ws.getId()).orElseThrow().getLastSucceededAt();

            syncService.pollAll();

            assertThat(fake.sinceSeen).hasSize(2);
            assertThat(fake.sinceSeen.get(0)).isNull();
            assertThat(fake.sinceSeen.get(1)).isEqualTo(firstSuccess.minus(SyncService.POLL_OVERLAP));
        }

        @Test
        void pollingSkipsAWorkspaceThatIsAlreadySyncing() {
            syncService.status(ws.getId());
            syncStates.markRunningIfIdle(ws.getId());

            syncService.pollAll();

            assertThat(fake.sinceSeen).isEmpty();
        }
    }
}

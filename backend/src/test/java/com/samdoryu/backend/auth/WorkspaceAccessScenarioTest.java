package com.samdoryu.backend.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * #67 — CONTRACTS.md 「9」 계약 테스트의 사무실 접근 · IDOR 시나리오를 실제 API(도움 요청)와 실제 DB 행으로 확인한다.
 * 세션은 {@link TestLogin}(로그인 흐름 자체는 GithubLoginIntegrationTest · LoginRepoRolesIntegrationTest).
 * 이슈 · PR · 요구사항 · 안건 · 카드 API는 아직 없다 — 새 API의 인가 누락은 {@link WorkspaceEndpointGuardTest}가 잡고,
 * 각 API의 IDOR는 그 기능 Issue가 이 파일에 더한다.
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + WorkspaceAccessScenarioTest.INSTRUCTOR_ID)
@AutoConfigureMockMvc
@Transactional
class WorkspaceAccessScenarioTest {

    static final long INSTRUCTOR_ID = 9001L;
    private static final String ORIGIN = "http://localhost:5173";
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;

    private AppUser alice;
    private Workspace ws;
    private Workspace otherWs;
    private Workspace demo;
    private Member aliceHere;
    private Member bobHere;
    private MockHttpSession aliceSession;
    private String helpHere;
    private String helpElsewhere;

    @BeforeEach
    void setUp() throws Exception {
        alice = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bob = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, alice, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, alice, T0));
        demo = workspaces.saveAndFlush(Workspace.demo("시연 사무실", T0));
        aliceHere = members.saveAndFlush(Member.collaborator(ws, alice, 0, true, T0));
        bobHere = members.saveAndFlush(Member.collaborator(ws, bob, 1, false, T0));
        Member aliceElsewhere = members.saveAndFlush(Member.collaborator(otherWs, alice, 0, true, T0));

        aliceSession = TestLogin.githubUser(alice.getId(), 1001L)
                .member(ws.getId(), aliceHere.getId(), WorkspaceRole.REPO_ADMIN)
                .member(otherWs.getId(), aliceElsewhere.getId(), WorkspaceRole.REPO_ADMIN)
                .session();
        helpHere = createHelpRequest(ws);
        helpElsewhere = createHelpRequest(otherWs);
    }

    private String csrfToken() throws Exception {
        String setCookie = String.join(";", mvc.perform(get("/api/login-options"))
                .andReturn().getResponse().getHeaders("Set-Cookie"));
        int start = setCookie.indexOf("XSRF-TOKEN=") + "XSRF-TOKEN=".length();
        return setCookie.substring(start, setCookie.indexOf(';', start));
    }

    private MockHttpServletRequestBuilder write(MockHttpServletRequestBuilder builder, String body) throws Exception {
        String token = csrfToken();
        return builder.cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private String createHelpRequest(Workspace workspace) throws Exception {
        String body = mvc.perform(write(post(base(workspace) + "/help-requests"),
                        "{\"content\":\"세션이 자꾸 끊겨요\",\"fromStandupId\":null}").session(aliceSession))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ContractShape.readTree(body).get("id").asString();
    }

    private static String base(Workspace workspace) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId());
    }

    private String helpPath(Workspace workspace, String helpId) {
        return base(workspace) + "/help-requests/" + helpId;
    }

    private void expect404(MockHttpServletRequestBuilder request) throws Exception {
        mvc.perform(request).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("not_found"));
    }

    /** 「9」 사무실 접근 — 들어갈 수 없으면 모두 404(존재를 숨김). */
    @Nested
    class WorkspaceAccess {

        @Test
        void memberReadsItsWorkspace() throws Exception {
            mvc.perform(get(helpPath(ws, helpHere)).session(aliceSession)).andExpect(status().isOk());
        }

        @Test
        void notACollaboratorIs404() throws Exception {
            MockHttpSession stranger = TestLogin.githubUser(99L, 7777L).session();

            expect404(get(helpPath(ws, helpHere)).session(stranger));
        }

        @Test
        void instructorIs404UnlessCurrentlyAssigned() throws Exception {
            MockHttpSession instructor = TestLogin.githubUser(98L, INSTRUCTOR_ID).session();
            expect404(get(helpPath(ws, helpHere)).session(instructor));

            InstructorAssignment assignment = instructorAssignments.saveAndFlush(
                    new InstructorAssignment(ws, INSTRUCTOR_ID, alice, T0));
            mvc.perform(get(helpPath(ws, helpHere)).session(instructor)).andExpect(status().isOk());

            assignment.unassign(T0.plusSeconds(60));
            instructorAssignments.saveAndFlush(assignment);
            expect404(get(helpPath(ws, helpHere)).session(instructor));
        }

        /** 허용 목록 계정은 콜라보레이터 역할이 세션에 있어도 지정 없으면 404(P1). */
        @Test
        void allowlistedCollaboratorWithoutAssignmentIs404() throws Exception {
            MockHttpSession collaboratorInstructor = TestLogin.githubUser(98L, INSTRUCTOR_ID)
                    .member(ws.getId(), bobHere.getId(), WorkspaceRole.REPO_ADMIN).session();

            expect404(get(helpPath(ws, helpHere)).session(collaboratorInstructor));
        }

        /** 심사용 계정은 시연 사무실에만 — 세션에 실제 사무실 역할이 있어도 404(P15). */
        @Test
        void reviewAccountOnARealWorkspaceIs404() throws Exception {
            MockHttpSession reviewer = TestLogin.reviewUser(97L)
                    .member(ws.getId(), aliceHere.getId(), WorkspaceRole.PARTICIPANT)
                    .member(demo.getId(), 1L, WorkspaceRole.PARTICIPANT).session();

            expect404(get(helpPath(ws, helpHere)).session(reviewer));
            expect404(get(base(ws) + "/test-team-only").session(reviewer));
            mvc.perform(get(base(demo) + "/test-team-only").session(reviewer)).andExpect(status().isOk());
        }

        @Test
        void unregisteredUserOnTheDemoWorkspaceIs404() throws Exception {
            expect404(get(base(demo) + "/test-team-only").session(aliceSession));
            expect404(get(base(demo) + "/test-team-only").session(TestLogin.reviewUser(97L).session()));
        }
    }

    /** 「9」 IDOR — 다른 사무실의 ID를 내 사무실 경로에 넣으면 404, 같은 사무실 다른 학생의 개인 API는 403. */
    @Nested
    class Idor {

        @Test
        void otherWorkspacesHelpRequestInMyPathIs404() throws Exception {
            expect404(get(helpPath(ws, helpElsewhere)).session(aliceSession));
            expect404(write(post(helpPath(ws, helpElsewhere) + "/comments"), "{\"content\":\"도와줄게요\"}")
                    .session(aliceSession));
            // 같은 ID는 제 사무실 경로로는 보인다
            mvc.perform(get(helpPath(otherWs, helpElsewhere)).session(aliceSession)).andExpect(status().isOk());
        }

        @Test
        void otherStudentsPersonalApiIs403() throws Exception {
            MockHttpSession bob = TestLogin.githubUser(2L, 1002L)
                    .member(ws.getId(), bobHere.getId(), WorkspaceRole.PARTICIPANT).session();

            mvc.perform(get(base(ws) + "/members/" + Ids.toApi(aliceHere.getId()) + "/test-personal").session(bob))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
            mvc.perform(get(base(ws) + "/members/" + Ids.toApi(bobHere.getId()) + "/test-personal").session(bob))
                    .andExpect(status().isOk());
        }
    }
}

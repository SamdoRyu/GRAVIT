package com.samdoryu.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * #54 — 강사는 지금 지정된 조의 사무실을 전부 보고, 그 밖의 사무실은 존재도 모른다(FR-AUTH-07 · CONTRACTS.md 「6」).
 * {@code GET /api/workspaces}(CONTRACTS_API 「3」 — 강사는 지정된 사무실 전부)와 그 사무실 들어가기(Snapshot)를 실제
 * {@code instructor_assignment} 행으로 확인한다. 지정은 세션이 아니라 요청마다 DB에서 읽는다.
 *
 * <p>한 사무실의 지정 · 해제 · 개인 데이터는 {@link InstructorAssignmentAuthorizationTest}, 사무실 경로 404는
 * {@link WorkspaceAccessScenarioTest}, 학생 · 심사용 계정의 목록은 {@code WorkspaceOpeningIntegrationTest}가 본다.
 * 목록 한 줄의 DTO ↔ 계약(①)은 {@code WorkspaceListItemContractTest}.
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + InstructorWorkspacesIntegrationTest.INSTRUCTOR_ID
        + "," + InstructorWorkspacesIntegrationTest.OTHER_INSTRUCTOR_ID
        + "," + InstructorWorkspacesIntegrationTest.IDLE_INSTRUCTOR_ID)
@AutoConfigureMockMvc
@Transactional
class InstructorWorkspacesIntegrationTest {

    static final long INSTRUCTOR_ID = 9001L;
    static final long OTHER_INSTRUCTOR_ID = 9002L;
    static final long IDLE_INSTRUCTOR_ID = 9003L;
    private static final Instant T0 = Instant.parse("2026-11-06T01:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired InstructorAssignmentRepository instructorAssignments;

    private AppUser admin;
    private AppUser instructor;
    private Workspace zeta;
    private Workspace alpha;
    private Workspace released;
    private Workspace neverAssigned;
    private Workspace otherInstructorsOnly;
    private InstructorAssignment zetaAssignment;
    private InstructorAssignment alphaAssignment;
    private MockHttpSession instructorSession;

    /**
     * 강사(9001)는 zeta · alpha에 지금 지정, released는 해제됨, never는 지정된 적 없음.
     * others는 다른 강사(9002)만 지정. 이름 순서와 만든 순서를 일부러 다르게 둔다.
     */
    @BeforeEach
    void setUp() {
        admin = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        instructor = users.saveAndFlush(AppUser.github(INSTRUCTOR_ID, "teacher", "강사", null));
        zeta = workspace(5001L, "zeta");
        alpha = workspace(5002L, "alpha");
        released = workspace(5003L, "released");
        neverAssigned = workspace(5004L, "never");
        otherInstructorsOnly = workspace(5005L, "others");

        zetaAssignment = assign(zeta, INSTRUCTOR_ID);
        alphaAssignment = assign(alpha, INSTRUCTOR_ID);
        unassign(assign(released, INSTRUCTOR_ID));
        assign(otherInstructorsOnly, OTHER_INSTRUCTOR_ID);

        instructorSession = TestLogin.githubUser(instructor.getId(), INSTRUCTOR_ID).session();
    }

    private Workspace workspace(long githubRepoId, String repo) {
        Workspace workspace = workspaces.saveAndFlush(Workspace.github(githubRepoId, "team", repo, 1L, admin, T0));
        teamSettings.saveAndFlush(new TeamSettings(workspace, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17),
                null));
        return workspace;
    }

    private InstructorAssignment assign(Workspace workspace, long githubUserId) {
        return instructorAssignments.saveAndFlush(new InstructorAssignment(workspace, githubUserId, admin, T0));
    }

    private void unassign(InstructorAssignment assignment) {
        assignment.unassign(T0.plusSeconds(60));
        instructorAssignments.saveAndFlush(assignment);
    }

    private static String snapshotPath(Workspace workspace) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId()) + "/snapshot";
    }

    private JsonNode listWorkspaces(MockHttpSession session) throws Exception {
        String body = mvc.perform(get("/api/workspaces").session(session))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ContractShape.readTree(body);
    }

    private static List<String> displayNames(JsonNode list) {
        List<String> names = new ArrayList<>();
        list.forEach(item -> names.add(item.get("displayName").asString()));
        return names;
    }

    private void expectEnters(Workspace workspace, MockHttpSession session) throws Exception {
        mvc.perform(get(snapshotPath(workspace)).session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.workspace.id").value(Ids.toApi(workspace.getId())))
                .andExpect(jsonPath("$.viewer.role").value("instructor"))
                .andExpect(jsonPath("$.viewer.memberId").value(nullValue()));
    }

    private void expectHidden(Workspace workspace, MockHttpSession session) throws Exception {
        mvc.perform(get(snapshotPath(workspace)).session(session))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }

    private void expectIsInstructor(boolean expected) throws Exception {
        mvc.perform(get("/api/me").session(instructorSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isInstructor").value(expected));
    }

    /** 계약 ② — 목록 한 줄이 WorkspaceListItem 모양(스냅샷 예시의 workspace + myRole)이다. */
    @Test
    void listsEveryCurrentlyAssignedWorkspaceByNameWithTheInstructorRole() throws Exception {
        JsonNode list = listWorkspaces(instructorSession);

        assertThat(displayNames(list)).containsExactly("team/alpha", "team/zeta");
        assertThat(list.get(0).get("id").asString()).isEqualTo(Ids.toApi(alpha.getId()));
        assertThat(list.get(1).get("id").asString()).isEqualTo(Ids.toApi(zeta.getId()));
        JsonNode example = ContractShape.readExample("workspace", "workspace-list-item.json");
        for (JsonNode item : list) {
            assertThat(item.get("myRole").asString()).isEqualTo("instructor");
            ContractShape.assertSameShape(example, item);
            ContractShape.assertCommonRules(item);
        }
    }

    /** 목록에 나온 사무실은 모두 들어가고, 해제됐거나 · 지정된 적 없거나 · 다른 강사만 지정된 사무실은 404. */
    @Test
    void entersEveryListedWorkspaceAndNoOther() throws Exception {
        expectEnters(alpha, instructorSession);
        expectEnters(zeta, instructorSession);

        expectHidden(released, instructorSession);
        expectHidden(neverAssigned, instructorSession);
        expectHidden(otherInstructorsOnly, instructorSession);
    }

    /** 해제 직후 같은 세션의 다음 요청부터 목록에서 빠지고 404 — 마지막 지정이 풀리면 강사 요청함 대상도 아니다. */
    @Test
    void releasingAWorkspaceDropsItFromTheNextRequestInTheSameSession() throws Exception {
        expectIsInstructor(true);

        unassign(alphaAssignment);

        assertThat(displayNames(listWorkspaces(instructorSession))).containsExactly("team/zeta");
        expectHidden(alpha, instructorSession);
        expectEnters(zeta, instructorSession);
        expectIsInstructor(true);

        unassign(zetaAssignment);

        assertThat(listWorkspaces(instructorSession)).isEmpty();
        expectHidden(zeta, instructorSession);
        expectIsInstructor(false);
    }

    /** 해제 뒤 다시 지정하면 새 지정 행이 생긴다 — 예전 행이 남아 있어도 목록에는 한 번만. */
    @Test
    void reassignmentAfterReleaseListsTheWorkspaceOnce() throws Exception {
        assign(released, INSTRUCTOR_ID);

        assertThat(displayNames(listWorkspaces(instructorSession)))
                .containsExactly("team/alpha", "team/released", "team/zeta");
        expectEnters(released, instructorSession);
    }

    /**
     * 허용 목록 계정은 그 레포의 콜라보레이터여도 팀원 역할로 판정하지 않는다(P1 — 권한 상승 방지).
     * 세션에 팀원 역할이 있어도 목록은 지정된 사무실만, 역할은 {@code instructor}.
     */
    @Test
    void allowlistedCollaboratorSeesOnlyAssignedWorkspacesAsInstructor() throws Exception {
        MockHttpSession collaborator = TestLogin.githubUser(instructor.getId(), INSTRUCTOR_ID)
                .member(alpha.getId(), 1L, WorkspaceRole.REPO_ADMIN)
                .member(neverAssigned.getId(), 2L, WorkspaceRole.PARTICIPANT)
                .session();

        JsonNode list = listWorkspaces(collaborator);

        assertThat(displayNames(list)).containsExactly("team/alpha", "team/zeta");
        list.forEach(item -> assertThat(item.get("myRole").asString()).isEqualTo("instructor"));
        expectEnters(alpha, collaborator);
        expectHidden(neverAssigned, collaborator);
    }

    /** 지정이 하나도 없는 허용 목록 강사 — 빈 목록(에러 아님), 어느 사무실도 404. */
    @Test
    void instructorWithoutAssignmentsGetsAnEmptyList() throws Exception {
        MockHttpSession idle = TestLogin.githubUser(98L, IDLE_INSTRUCTOR_ID).session();

        assertThat(listWorkspaces(idle)).isEmpty();
        expectHidden(alpha, idle);
        expectHidden(otherInstructorsOnly, idle);
    }

    @Test
    void listWithoutSessionIs401() throws Exception {
        mvc.perform(get("/api/workspaces"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("unauthorized"));
    }
}

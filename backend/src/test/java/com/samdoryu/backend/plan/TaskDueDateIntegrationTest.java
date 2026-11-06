package com.samdoryu.backend.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.plan.domain.TaskDueDate;
import com.samdoryu.backend.plan.repository.TaskDueDateRepository;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskAssignee;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.TaskAssigneeRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * #39 작업 마감 바꾸기 · 지우기 — 실제 Security · MVC · MySQL(CONTRACTS_API 「13」 · P14). 테스트마다 트랜잭션을 되돌린다.
 * 고칠 수 있는 사람: 레포 관리자(R2) · 그 이슈의 담당자. 그 밖의 참여자 · 강사 {@code 403}, 다른 사무실 이슈 {@code 404}.
 * 계약 테스트 ② — 실제 응답 ↔ {@code contract/examples/plan/task-due-date.json}.
 */
@SpringBootTest(properties = {
        "app.origin=" + TaskDueDateIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + TaskDueDateIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class TaskDueDateIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant PAST = Instant.now().minus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired TaskRepository tasks;
    @Autowired TaskAssigneeRepository taskAssignees;
    @Autowired TaskDueDateRepository dueDates;
    @Autowired TeamSettingsRepository teamSettings;

    private Workspace ws;
    private Task issue;
    private Task otherIssue;
    private AppUser bobUser;
    private MockHttpSession admin;
    private MockHttpSession assignee;
    private MockHttpSession otherParticipant;
    private MockHttpSession instructor;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        AppUser carolUser = users.saveAndFlush(AppUser.github(1003L, "carol", "캐럴", null));
        AppUser instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, PAST));
        Workspace otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, bobUser, PAST));
        Member alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, PAST));
        Member bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, true, PAST));
        Member carol = members.saveAndFlush(Member.collaborator(ws, carolUser, 2, true, PAST));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, PAST));
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), null));
        issue = openIssue(ws, 12);
        otherIssue = openIssue(otherWs, 12);
        taskAssignees.saveAndFlush(new TaskAssignee(issue, bob, PAST));

        admin = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
        assignee = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
        otherParticipant = TestLogin.githubUser(carolUser.getId(), 1003L)
                .member(ws.getId(), carol.getId(), WorkspaceRole.PARTICIPANT).session();
        instructor = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private Task openIssue(Workspace workspace, int number) {
        return tasks.saveAndFlush(Task.builder().workspace(workspace).githubIssueNumber(number).title("이슈 " + number)
                .state(TaskState.OPEN).labelsJson("[]").githubCreatedAt(PAST).githubUpdatedAt(PAST)
                .stateChangedAt(PAST).syncedAt(PAST).build());
    }

    private String path(Task task) {
        return "/api/workspaces/" + Ids.toApi(ws.getId()) + "/tasks/" + Ids.toApi(task.getId()) + "/due-date";
    }

    private ResultActions write(MockHttpServletRequestBuilder request, MockHttpSession session) throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        return mvc.perform(request.session(session).cookie(new Cookie("XSRF-TOKEN", token))
                .header("X-XSRF-TOKEN", token).header(HttpHeaders.ORIGIN, ORIGIN));
    }

    private ResultActions set(Task task, MockHttpSession session, String body) throws Exception {
        return write(put(path(task)).contentType(MediaType.APPLICATION_JSON).content(body), session);
    }

    private Optional<TaskDueDate> stored() {
        em.flush();
        em.clear();
        return dueDates.findByTaskId(issue.getId());
    }

    @Test
    void repoAdminSetsTheDueDateAndTheResponseMatchesTheContractExample() throws Exception {
        String response = set(issue, admin, "{\"dueDate\":\"2026-11-07\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.taskId").value(Ids.toApi(issue.getId())))
                .andExpect(jsonPath("$.dueDate").value("2026-11-07"))
                .andExpect(jsonPath("$.updatedBy.githubLogin").value("alice"))
                .andReturn().getResponse().getContentAsString();

        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("plan", "task-due-date.json"), actual);
        ContractShape.assertCommonRules(actual);
        assertThat(stored()).get().extracting(TaskDueDate::getDueDate).isEqualTo(LocalDate.parse("2026-11-07"));
        // Snapshot의 tasks[].dueDate도 같은 값
        mvc.perform(get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/snapshot").session(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks[0].dueDate").value("2026-11-07"));
    }

    @Test
    void theIssuesAssigneeChangesAnExistingDueDateInPlace() throws Exception {
        set(issue, admin, "{\"dueDate\":\"2026-11-07\"}").andExpect(status().isOk());

        set(issue, assignee, "{\"dueDate\":\"2026-11-09\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dueDate").value("2026-11-09"))
                .andExpect(jsonPath("$.updatedBy.githubLogin").value("bob"));

        assertThat(dueDates.findAll()).hasSize(1);
        assertThat(stored()).get().satisfies(d -> {
            assertThat(d.getDueDate()).isEqualTo(LocalDate.parse("2026-11-09"));
            assertThat(d.getUpdatedBy().getId()).isEqualTo(bobUser.getId());
        });
    }

    @Test
    void otherParticipantsAndInstructorsAreForbidden() throws Exception {
        set(issue, otherParticipant, "{\"dueDate\":\"2026-11-07\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        set(issue, instructor, "{\"dueDate\":\"2026-11-07\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        write(delete(path(issue)), otherParticipant).andExpect(status().isForbidden());
        assertThat(stored()).isEmpty();
    }

    @Test
    void anIssueOfAnotherWorkspaceIsNotFound() throws Exception {
        set(otherIssue, admin, "{\"dueDate\":\"2026-11-07\"}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        write(delete(path(otherIssue)), admin).andExpect(status().isNotFound());
    }

    @Test
    void aMissingOrMalformedDateIsInvalid() throws Exception {
        for (String body : new String[] {"{}", "{\"dueDate\":null}", "{\"dueDate\":\"11/07\"}",
                "{\"dueDate\":\"2026-13-01\"}"}) {
            set(issue, admin, body)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }
        assertThat(stored()).isEmpty();
    }

    @Test
    void deletingRemovesTheDueDateAndDeletingAgainIsStill204() throws Exception {
        set(issue, assignee, "{\"dueDate\":\"2026-11-07\"}").andExpect(status().isOk());

        write(delete(path(issue)), assignee).andExpect(status().isNoContent());
        assertThat(stored()).isEmpty();
        write(delete(path(issue)), admin).andExpect(status().isNoContent());
        mvc.perform(get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/snapshot").session(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks[0].dueDate").value(nullValue()));
    }
}

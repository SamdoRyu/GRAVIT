package com.samdoryu.backend.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.AgendaStatus;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
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
import org.springframework.transaction.annotation.Transactional;

/**
 * #36 안건 올리기 — 실제 Security · MVC · MySQL(CONTRACTS_API 「10」, CONTRACTS.md 「6」 검사 순서).
 * 세션은 {@link TestLogin}, 쓰기는 화면과 같은 CSRF 쿠키 → 헤더 + Origin. 테스트마다 트랜잭션을 되돌린다.
 * 계약 테스트 ② — 실제 응답 ↔ {@code contract/examples/meeting/agenda-item.json}.
 */
@SpringBootTest(properties = {
        "app.origin=" + AgendaItemIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + AgendaItemIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class AgendaItemIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-05T01:20:00Z");
    private static final String SHA = "0123456789abcdef0123456789abcdef01234567";

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired TaskRepository tasks;
    @Autowired SubmissionRepository submissions;
    @Autowired EvaluationRoundRepository rounds;
    @Autowired AgendaItemRepository agendaItems;

    private Workspace ws;
    private Workspace otherWs;
    private Member alice;
    private Task task;
    private Task otherWsTask;
    private Submission pr;
    private MockHttpSession aliceSession;
    private MockHttpSession instructorSession;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, aliceUser, T0));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        Member aliceElsewhere = members.saveAndFlush(Member.collaborator(otherWs, aliceUser, 0, true, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, T0));

        task = tasks.saveAndFlush(task(ws, 1));
        otherWsTask = tasks.saveAndFlush(task(otherWs, 1));
        pr = submissions.saveAndFlush(submission(ws, 2, alice));

        // 앨리스는 두 사무실 모두 팀원 — 다른 사무실 원본을 내 사무실 경로로 넣는 IDOR를 본다.
        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN)
                .member(otherWs.getId(), aliceElsewhere.getId(), WorkspaceRole.REPO_ADMIN).session();
        instructorSession = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private static Task task(Workspace workspace, int number) {
        return Task.builder().workspace(workspace).githubIssueNumber(number).title("이슈").state(TaskState.OPEN)
                .labelsJson("[]").githubCreatedAt(T0).githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build();
    }

    private static Submission submission(Workspace workspace, int number, Member author) {
        return Submission.builder().workspace(workspace).githubPrNumber(number).title("PR")
                .authorGithubUserId(1001L).authorMember(author).state(SubmissionState.OPEN).headSha(SHA)
                .reviewRequestsJson("[]").reviewsJson("[]").labelsJson("[]").githubCreatedAt(T0)
                .githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build();
    }

    private String base(Workspace workspace) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId()) + "/agenda-items";
    }

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private ResultActions raise(Workspace workspace, MockHttpSession session, String body) throws Exception {
        String token = csrfToken();
        return mvc.perform(post(base(workspace)).session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String body(String kind, String sourceId, String title) {
        String source = sourceId == null ? "null" : "\"" + sourceId + "\"";
        return "{\"kind\":\"" + kind + "\",\"sourceId\":" + source + ",\"title\":\"" + title
                + "\",\"background\":\"배경\",\"tried\":null,\"unresolvedReason\":\"의견이 갈림\"}";
    }

    @Test
    void memberRaisesIssueAgenda() throws Exception {
        String response = raise(ws, aliceSession, body("issue", Ids.toApi(task.getId()), "로그인 이슈 범위"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("issue"))
                .andExpect(jsonPath("$.status").value("confirmed"))
                .andExpect(jsonPath("$.source.type").value("task"))
                .andExpect(jsonPath("$.source.id").value(Ids.toApi(task.getId())))
                .andExpect(jsonPath("$.evaluationRoundId").value(nullValue()))
                .andExpect(jsonPath("$.raisedByMemberId").value(Ids.toApi(alice.getId())))
                .andExpect(jsonPath("$.background").value("배경"))
                .andExpect(jsonPath("$.decision").value(nullValue()))
                .andExpect(jsonPath("$.feedbackRequested").value(false))
                .andExpect(jsonPath("$.instructorFeedbacks").value(empty()))
                .andReturn().getResponse().getContentAsString();

        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("meeting", "agenda-item.json"), actual);
        ContractShape.assertCommonRules(actual);

        em.flush();
        em.clear();
        AgendaItem saved = agendaItems.findByIdAndWorkspaceId(Ids.fromPath(actual.get("id").asString()), ws.getId())
                .orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(AgendaStatus.CONFIRMED);
        assertThat(saved.getSourceTask().getId()).isEqualTo(task.getId());
    }

    @Test
    void prAgendaRemembersTheCurrentRound() throws Exception {
        rounds.saveAndFlush(new EvaluationRound(pr, 1, SHA, RoundOpenedReason.NEW_PR, T0));
        EvaluationRound current = rounds.saveAndFlush(
                new EvaluationRound(pr, 2, SHA, RoundOpenedReason.MEETING_REEVALUATE, T0.plusSeconds(60)));

        raise(ws, aliceSession, body("pr", Ids.toApi(pr.getId()), "실패 응답 모양"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("pr"))
                .andExpect(jsonPath("$.source.type").value("submission"))
                .andExpect(jsonPath("$.source.id").value(Ids.toApi(pr.getId())))
                .andExpect(jsonPath("$.evaluationRoundId").value(Ids.toApi(current.getId())));
    }

    @Test
    void prWithoutAnyRoundHasNoRound() throws Exception {
        raise(ws, aliceSession, body("pr", Ids.toApi(pr.getId()), "회차 전"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.evaluationRoundId").value(nullValue()));
    }

    @Test
    void learningAndOtherHaveNoSource() throws Exception {
        raise(ws, aliceSession, body("learning", null, "CSRF 쿠키 배운 점"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("learning"))
                .andExpect(jsonPath("$.source").value(nullValue()));
        raise(ws, aliceSession, body("other", null, "회고 일정")).andExpect(status().isCreated());

        assertThat(agendaItems.findAll()).extracting(AgendaItem::getKind)
                .containsExactlyInAnyOrder(AgendaKind.LEARNING, AgendaKind.OTHER);
    }

    /** 「10」 — 종류와 원본이 맞지 않음 · help_request 종류 · 원본 ID 형식 오류는 400. 아무것도 만들지 않는다. */
    @Test
    void kindAndSourceMismatchIs400() throws Exception {
        String taskId = Ids.toApi(task.getId());
        for (String body : new String[] {
                body("issue", null, "원본 없음"),
                body("pr", null, "원본 없음"),
                body("learning", taskId, "원본 있음"),
                body("other", taskId, "원본 있음"),
                body("help_request", taskId, "도움 요청은 전환으로만"),
                body("issue", "abc", "형식 오류")}) {
            raise(ws, aliceSession, body).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }
        assertThat(agendaItems.count()).isZero();
    }

    @Test
    void invalidBodyIs400() throws Exception {
        raise(ws, aliceSession, body("other", null, "")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        raise(ws, aliceSession, body("other", null, "a".repeat(101))).andExpect(status().isBadRequest());
        raise(ws, aliceSession, body("meeting", null, "모르는 종류")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        assertThat(agendaItems.count()).isZero();
    }

    /** IDOR — 다른 사무실의 이슈를 내 사무실 경로로, 또는 없는 원본이면 404. */
    @Test
    void sourceOfAnotherWorkspaceOrMissingIs404() throws Exception {
        raise(ws, aliceSession, body("issue", Ids.toApi(otherWsTask.getId()), "남의 이슈"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        raise(ws, aliceSession, body("pr", "999999", "없는 PR")).andExpect(status().isNotFound());
        assertThat(agendaItems.count()).isZero();
    }

    @Test
    void instructorCannotRaise() throws Exception {
        raise(ws, instructorSession, body("other", null, "강사 안건")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        assertThat(agendaItems.count()).isZero();
    }
}

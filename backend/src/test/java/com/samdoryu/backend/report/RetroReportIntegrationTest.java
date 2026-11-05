package com.samdoryu.backend.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
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
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.InstructorFeedbackRepository;
import com.samdoryu.backend.report.domain.ReportKind;
import com.samdoryu.backend.report.domain.RetroReport;
import com.samdoryu.backend.report.repository.RetroReportRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskAssignee;
import com.samdoryu.backend.sync.domain.TaskClosedReason;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskAssigneeRepository;
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
 * #40 개인 회고 리포트 — 실제 Security · MVC · MySQL(CONTRACTS_API 「15」). 테스트마다 트랜잭션을 되돌린다.
 * 공통 접근 규칙: 경로 팀원(빠진 팀원 포함 · 아니면 404) → 읽기 본인 · 지정된 강사 / 쓰기 본인(403).
 * 계약 테스트 ② — 실제 응답 ↔ {@code contract/examples/report/retro-report.json}.
 */
@SpringBootTest(properties = {
        "app.origin=" + RetroReportIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + RetroReportIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class RetroReportIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-01T00:00:00Z");
    private static final String SHA = "0123456789abcdef0123456789abcdef01234567";

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired TaskRepository tasks;
    @Autowired TaskAssigneeRepository taskAssignees;
    @Autowired SubmissionRepository submissions;
    @Autowired AgendaItemRepository agendaItems;
    @Autowired InstructorFeedbackRepository instructorFeedbacks;
    @Autowired RetroReportRepository reports;

    private Workspace ws;
    private Workspace otherWs;
    private AppUser instructorUser;
    private Member alice;
    private Member bob;
    private Member carol;
    private Member aliceElsewhere;
    private MockHttpSession aliceSession;
    private MockHttpSession bobSession;
    private MockHttpSession instructorSession;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        AppUser carolUser = users.saveAndFlush(AppUser.github(1003L, "carol", "캐럴", null));
        instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, aliceUser, T0));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, T0));
        carol = members.saveAndFlush(Member.collaborator(ws, carolUser, 2, false, T0));
        carol.remove(T0.plusSeconds(60)); // 빠진 팀원 — 경로로는 여전히 찾는다
        aliceElsewhere = members.saveAndFlush(Member.collaborator(otherWs, aliceUser, 0, true, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, T0));

        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN)
                .member(otherWs.getId(), aliceElsewhere.getId(), WorkspaceRole.REPO_ADMIN).session();
        bobSession = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
        instructorSession = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private String base(Member member) {
        return "/api/workspaces/" + Ids.toApi(member.getWorkspace().getId()) + "/members/" + Ids.toApi(member.getId())
                + "/reports";
    }

    private ResultActions create(String path, MockHttpSession session, String kind) throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        return mvc.perform(post(path).session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"kind\":\"" + kind + "\"}"));
    }

    private void assign(int number, String labelsJson, boolean closed, Member assignee) {
        Task task = tasks.saveAndFlush(Task.builder().workspace(ws).githubIssueNumber(number).title("이슈 " + number)
                .state(closed ? TaskState.CLOSED : TaskState.OPEN)
                .closedReason(closed ? TaskClosedReason.COMPLETED : null).labelsJson(labelsJson)
                .githubCreatedAt(T0).githubUpdatedAt(T0).closedAt(closed ? T0.plusSeconds(3600) : null)
                .stateChangedAt(T0).syncedAt(T0).build());
        taskAssignees.saveAndFlush(new TaskAssignee(task, assignee, T0));
    }

    private void pr(int number, String labelsJson, Member author, long authorGithubId, boolean merged) {
        submissions.saveAndFlush(Submission.builder().workspace(ws).githubPrNumber(number).title("PR " + number)
                .authorGithubUserId(authorGithubId).authorMember(author)
                .state(merged ? SubmissionState.MERGED : SubmissionState.OPEN).headSha(SHA)
                .reviewRequestsJson("[]").reviewsJson("[]").labelsJson(labelsJson).githubCreatedAt(T0)
                .githubUpdatedAt(T0).mergedAt(merged ? T0.plusSeconds(7200) : null)
                .closedAt(merged ? T0.plusSeconds(7200) : null).stateChangedAt(T0).syncedAt(T0).build());
    }

    private AgendaItem agenda(Member raisedBy, String title, String conclusion, Instant decidedAt) {
        AgendaItem item = AgendaItem.withoutSource(ws, AgendaKind.OTHER, title, null, null, null, raisedBy, T0);
        if (conclusion != null) {
            item.decide(conclusion, "배운 점 " + title, null, null, null, null, bob, decidedAt);
        }
        return agendaItems.saveAndFlush(item);
    }

    /** 앨리스 몫: 이슈 1(닫힘, area:auth) · PR 1(머지, area:sync) · 안건 2(결론 1, 강사 피드백 1). 밥 몫은 빠진다. */
    private AgendaItem seedAliceActivity() {
        assign(1, "[\"area:auth\",\"priority:high\"]", true, alice);
        assign(2, "[\"area:plan\"]", false, bob);
        pr(5, "[\"area:sync\",\"area:auth\"]", alice, 1001L, true);
        pr(6, "[\"area:vote\"]", bob, 1002L, false);
        AgendaItem decided = agenda(alice, "실패 응답 모양", "계약 모양으로 맞춘다", T0.plusSeconds(600));
        agenda(alice, "회고 일정", null, null);
        agenda(bob, "밥의 안건", "밥의 결론", T0.plusSeconds(300));
        instructorFeedbacks.saveAndFlush(new InstructorFeedback(decided, instructorUser, "기준을 한 줄 남겨 두세요",
                T0.plusSeconds(900)));
        em.clear();
        return decided;
    }

    @Test
    void selfCreatesReportWithFieldsComputedFromOwnRecords() throws Exception {
        AgendaItem decided = seedAliceActivity();

        String response = create(base(alice), aliceSession, "final")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("final"))
                .andExpect(jsonPath("$.memberId").value(Ids.toApi(alice.getId())))
                .andExpect(jsonPath("$.summary").value("맡은 이슈 1개(닫힘 1) · 작성한 PR 1개(머지 1) · 올린 안건 2건(결론 1)"))
                .andExpect(jsonPath("$.areaLabels").value(contains("area:auth", "area:sync")))
                .andExpect(jsonPath("$.learning").value(nullValue()))
                .andExpect(jsonPath("$.agendaResults.length()").value(1))
                .andExpect(jsonPath("$.agendaResults[0].agendaItemId").value(Ids.toApi(decided.getId())))
                .andExpect(jsonPath("$.agendaResults[0].conclusion").value("계약 모양으로 맞춘다"))
                .andExpect(jsonPath("$.agendaResults[0].learning").value("배운 점 실패 응답 모양"))
                .andExpect(jsonPath("$.instructorFeedbacks.length()").value(1))
                .andExpect(jsonPath("$.instructorFeedbacks[0].instructor.githubLogin").value("instructor"))
                .andExpect(jsonPath("$.instructorFeedbacks[0].body").value("기준을 한 줄 남겨 두세요"))
                .andExpect(jsonPath("$.activityDistribution").value(empty()))
                .andExpect(jsonPath("$.decisionCards").value(empty()))
                .andReturn().getResponse().getContentAsString();
        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("report", "retro-report.json"), actual);
        ContractShape.assertCommonRules(actual);
        String reportId = actual.get("id").asString();

        mvc.perform(get(base(alice)).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(reportId))
                .andExpect(jsonPath("$[0].kind").value("final"));
        mvc.perform(get(base(alice) + "/" + reportId).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(reportId))
                .andExpect(jsonPath("$.agendaResults.length()").value(1));
    }

    /** 계산 칸은 읽을 때 계산 — 만든 뒤 생긴 결정도 보인다. 목록은 createdAt 내림차순. */
    @Test
    void computedFieldsFollowCurrentDataAndListIsNewestFirst() throws Exception {
        RetroReport midterm = reports.saveAndFlush(new RetroReport(alice, ReportKind.MIDTERM, T0));
        RetroReport finalReport = reports.saveAndFlush(new RetroReport(alice, ReportKind.FINAL, T0.plusSeconds(60)));
        mvc.perform(get(base(alice) + "/" + midterm.getId()).session(aliceSession))
                .andExpect(jsonPath("$.agendaResults").value(empty()));

        agenda(alice, "나중 안건", "나중 결론", T0.plusSeconds(120));
        em.clear();

        mvc.perform(get(base(alice) + "/" + midterm.getId()).session(aliceSession))
                .andExpect(jsonPath("$.kind").value("midterm"))
                .andExpect(jsonPath("$.agendaResults[0].conclusion").value("나중 결론"));
        mvc.perform(get(base(alice)).session(aliceSession))
                .andExpect(jsonPath("$[0].id").value(Ids.toApi(finalReport.getId())))
                .andExpect(jsonPath("$[1].id").value(Ids.toApi(midterm.getId())));
    }

    /** 쓰기는 본인만 — 다른 학생 · 강사 403. 읽기는 본인 · 지정된 강사 — 다른 학생 403. */
    @Test
    void onlySelfCreatesAndOnlySelfOrInstructorReads() throws Exception {
        RetroReport report = reports.saveAndFlush(new RetroReport(alice, ReportKind.FINAL, T0));

        create(base(alice), bobSession, "final").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        create(base(alice), instructorSession, "final").andExpect(status().isForbidden());
        assertThat(reports.count()).isEqualTo(1);

        mvc.perform(get(base(alice)).session(bobSession)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        mvc.perform(get(base(alice) + "/" + report.getId()).session(bobSession)).andExpect(status().isForbidden());

        mvc.perform(get(base(alice)).session(instructorSession)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(base(alice) + "/" + report.getId()).session(instructorSession)).andExpect(status().isOk())
                .andExpect(jsonPath("$.memberId").value(Ids.toApi(alice.getId())));
    }

    /** 경로 팀원: 빠진 팀원도 찾는다(강사가 읽음). 다른 사무실 팀원 · 없는 ID는 404, 다른 팀원의 리포트 ID도 404. */
    @Test
    void pathMemberAndReportMustBelongToThisWorkspace() throws Exception {
        mvc.perform(get(base(carol)).session(instructorSession)).andExpect(status().isOk());

        String otherWsMemberInThisWs = "/api/workspaces/" + Ids.toApi(ws.getId()) + "/members/"
                + Ids.toApi(aliceElsewhere.getId()) + "/reports";
        mvc.perform(get(otherWsMemberInThisWs).session(aliceSession)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        create(otherWsMemberInThisWs, aliceSession, "final").andExpect(status().isNotFound());
        mvc.perform(get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/members/999999/reports").session(aliceSession))
                .andExpect(status().isNotFound());

        RetroReport bobs = reports.saveAndFlush(new RetroReport(bob, ReportKind.FINAL, T0));
        mvc.perform(get(base(alice) + "/" + bobs.getId()).session(aliceSession)).andExpect(status().isNotFound());
    }

    @Test
    void unknownKindIs400() throws Exception {
        create(base(alice), aliceSession, "weekly").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        assertThat(reports.count()).isZero();
    }
}

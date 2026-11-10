package com.samdoryu.backend.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.InstructorFeedbackRepository;
import com.samdoryu.backend.report.domain.DecisionCard;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import com.samdoryu.backend.report.domain.FollowUpQuestion;
import com.samdoryu.backend.report.domain.ReportKind;
import com.samdoryu.backend.report.domain.RetroReport;
import com.samdoryu.backend.report.repository.DecisionCardRepository;
import com.samdoryu.backend.report.repository.FollowUpQuestionRepository;
import com.samdoryu.backend.report.repository.RetroReportRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionIssueLink;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskAssignee;
import com.samdoryu.backend.sync.domain.TaskClosedReason;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.SubmissionIssueLinkRepository;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskAssigneeRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
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
    @Autowired SubmissionIssueLinkRepository issueLinks;
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
    @Autowired DecisionCardRepository decisionCards;
    @Autowired FollowUpQuestionRepository followUpQuestions;

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

    /** 카드 없이 만들기 — 제목 "회고 리포트", 느낀 점 "느낀 점". */
    private ResultActions create(String path, MockHttpSession session, String kind) throws Exception {
        return createWith(path, session, "{\"kind\":\"" + kind + "\",\"title\":\"회고 리포트\",\"learning\":\"느낀 점\","
                + "\"decisionCardIds\":[]}");
    }

    private ResultActions createWith(String path, MockHttpSession session, String body) throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        return mvc.perform(post(path).session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** 저장소에 바로 — 제목은 종류로, 느낀 점 "느낀 점". */
    private RetroReport report(Member member, ReportKind kind, Instant createdAt, DecisionCard... cards) {
        return reports.saveAndFlush(new RetroReport(member, kind, kind == ReportKind.FINAL ? "최종 회고" : "중간 회고",
                "느낀 점", List.of(cards), createdAt));
    }

    private Task assign(int number, String labelsJson, boolean closed, Member assignee) {
        Task task = tasks.saveAndFlush(Task.builder().workspace(ws).githubIssueNumber(number).title("이슈 " + number)
                .state(closed ? TaskState.CLOSED : TaskState.OPEN)
                .closedReason(closed ? TaskClosedReason.COMPLETED : null).labelsJson(labelsJson)
                .githubCreatedAt(T0).githubUpdatedAt(T0).closedAt(closed ? T0.plusSeconds(3600) : null)
                .stateChangedAt(T0).syncedAt(T0).build());
        taskAssignees.saveAndFlush(new TaskAssignee(task, assignee, T0));
        return task;
    }

    private Submission pr(int number, String labelsJson, Member author, long authorGithubId, boolean merged) {
        return submissions.saveAndFlush(Submission.builder().workspace(ws).githubPrNumber(number).title("PR " + number)
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
                .andExpect(jsonPath("$.title").value("회고 리포트"))
                .andExpect(jsonPath("$.summary").doesNotExist())
                .andExpect(jsonPath("$.areaLabels").value(empty())) // 고른 카드가 없다 — 내 이슈 · PR이 있어도 비어 있다
                .andExpect(jsonPath("$.learning").value("느낀 점"))
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
                .andExpect(jsonPath("$[0].kind").value("final"))
                .andExpect(jsonPath("$[0].title").value("회고 리포트"));
        mvc.perform(get(base(alice) + "/" + reportId).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(reportId))
                .andExpect(jsonPath("$.agendaResults.length()").value(1));
    }

    /** {@code learning}이 있으면 배운 점을 쓴 카드(리포트에 고를 수 있음), 없으면 빈 카드. */
    private DecisionCard card(Member member, Submission submission, String goal, String learning) {
        DecisionCard card = new DecisionCard(member, submission, DecisionCardCells.EMPTY, T0.plusSeconds(1000));
        if (learning != null) {
            card.edit(new DecisionCardCells(goal, null, null, null, null, null, null, learning, null),
                    T0.plusSeconds(1100));
        }
        return decisionCards.saveAndFlush(card);
    }

    /**
     * #335 — 리포트에는 고른 카드만 PR 번호 순으로 들어가고, 담당 기능 영역은 고른 카드의 PR과 그 PR에 연결된 이슈의 {@code area:*}다.
     * 제목 앞뒤 공백은 뺀다. 계약 ② — 카드가 든 응답 모양.
     */
    @Test
    void reportCarriesOnlySelectedCardsInPrNumberOrderWithAreasFromThem() throws Exception {
        Submission pr9 = pr(9, "[\"area:sync\"]", alice, 1001L, true);
        Submission pr5 = pr(5, "[\"area:auth\"]", alice, 1001L, true);
        Submission pr7 = pr(7, "[\"area:vote\"]", alice, 1001L, true);
        Task linked = assign(3, "[\"area:plan\",\"priority:high\"]", true, alice);
        issueLinks.saveAndFlush(new SubmissionIssueLink(pr5, linked, "CLOSING_REFERENCE"));
        assign(4, "[\"area:report\"]", true, alice); // 고른 카드와 상관없는 내 이슈 — 영역에 들어가지 않는다
        DecisionCard card9 = card(alice, pr9, null, "동기화는 한 곳에서");
        DecisionCard card5 = card(alice, pr5, null, "실패 응답은 한 곳에서");
        card(alice, pr7, null, "고르지 않은 카드");
        followUpQuestions.saveAndFlush(new FollowUpQuestion(card5, instructorUser, "왜 그 방법을 골랐나요?",
                T0.plusSeconds(1200)));
        em.clear();

        String body = "{\"kind\":\"final\",\"title\":\"  1차 스프린트 회고  \",\"learning\":\"계약을 먼저 맞추면 덜 고친다\","
                + "\"decisionCardIds\":[\"" + Ids.toApi(card9.getId()) + "\",\"" + Ids.toApi(card5.getId()) + "\"]}";
        String response = createWith(base(alice), aliceSession, body)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("1차 스프린트 회고"))
                .andExpect(jsonPath("$.learning").value("계약을 먼저 맞추면 덜 고친다"))
                .andExpect(jsonPath("$.decisionCards.length()").value(2))
                .andExpect(jsonPath("$.decisionCards[0].id").value(Ids.toApi(card5.getId())))
                .andExpect(jsonPath("$.decisionCards[1].id").value(Ids.toApi(card9.getId())))
                .andExpect(jsonPath("$.decisionCards[0].cells.learning").value("실패 응답은 한 곳에서"))
                .andExpect(jsonPath("$.decisionCards[0].followUpQuestions[0].body").value("왜 그 방법을 골랐나요?"))
                .andExpect(jsonPath("$.areaLabels").value(contains("area:auth", "area:plan", "area:sync")))
                .andReturn().getResponse().getContentAsString();
        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("report", "retro-report.json"), actual);
        ContractShape.assertCommonRules(actual);

        mvc.perform(get(base(alice) + "/" + actual.get("id").asString()).session(instructorSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decisionCards.length()").value(2));
        mvc.perform(get(base(alice)).session(aliceSession))
                .andExpect(jsonPath("$[0].title").value("1차 스프린트 회고"));
    }

    /** 고를 수 없는 카드(배운 점이 빈 카드 · 남의 카드 · 없는 카드 · 중복 · 형식) · 빈 제목 · 빈 느낀 점 · 카드 목록 없음은 400. 리포트가 생기지 않는다. */
    @Test
    void unselectableCardsAndBlankTitleOrLearningAre400() throws Exception {
        DecisionCard mine = card(alice, pr(5, "[]", alice, 1001L, true), null, "배운 점");
        DecisionCard noLearning = card(alice, pr(7, "[]", alice, 1001L, true), null, null);
        DecisionCard bobs = card(bob, pr(6, "[]", bob, 1002L, true), null, "밥의 배움");
        String ok = "\"" + Ids.toApi(mine.getId()) + "\"";
        em.clear();

        for (String ids : new String[] {"\"" + Ids.toApi(noLearning.getId()) + "\"", "\"" + Ids.toApi(bobs.getId()) + "\"",
                "\"999999\"", ok + "," + ok, "\"x\""}) {
            createWith(base(alice), aliceSession,
                    "{\"kind\":\"final\",\"title\":\"t\",\"learning\":\"l\",\"decisionCardIds\":[" + ids + "]}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }
        for (String body : new String[] {
                "{\"kind\":\"final\",\"title\":\"  \",\"learning\":\"l\",\"decisionCardIds\":[]}",
                "{\"kind\":\"final\",\"title\":\"t\",\"learning\":\"\",\"decisionCardIds\":[]}",
                "{\"kind\":\"final\",\"title\":\"t\",\"learning\":\"l\"}",
                "{\"kind\":\"final\"}"}) {
            createWith(base(alice), aliceSession, body).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }
        assertThat(reports.count()).isZero();

        createWith(base(alice), aliceSession,
                "{\"kind\":\"final\",\"title\":\"t\",\"learning\":\"l\",\"decisionCardIds\":[" + ok + "]}")
                .andExpect(status().isCreated());
    }

    /** 계산 칸은 읽을 때 계산 — 만든 뒤 생긴 결정도 보인다. 목록은 createdAt 내림차순. */
    @Test
    void computedFieldsFollowCurrentDataAndListIsNewestFirst() throws Exception {
        RetroReport midterm = report(alice, ReportKind.MIDTERM, T0);
        RetroReport finalReport = report(alice, ReportKind.FINAL, T0.plusSeconds(60));
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
        RetroReport report = report(alice, ReportKind.FINAL, T0);

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

        RetroReport bobs = report(bob, ReportKind.FINAL, T0);
        mvc.perform(get(base(alice) + "/" + bobs.getId()).session(aliceSession)).andExpect(status().isNotFound());
    }

    @Test
    void unknownKindIs400() throws Exception {
        create(base(alice), aliceSession, "weekly").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        assertThat(reports.count()).isZero();
    }

    // ---- #41 내가 배운 점 직접 쓰기 -----------------------------------------------------------------

    private ResultActions writeLearning(String path, MockHttpSession session, String body) throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        return mvc.perform(put(path + "/learning").session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String learningOf(RetroReport report) {
        em.flush();
        em.clear();
        return reports.findById(report.getId()).orElseThrow().getLearning();
    }

    /** 본인이 쓰면 저장되고 리포트 전체가 돌아온다. 다시 쓰면 바꾸고, 빈 값으로는 비울 수 없다(#335 — 느낀 점 필수). */
    @Test
    void selfWritesLearningAndCanRewriteButNotClearIt() throws Exception {
        RetroReport report = report(alice, ReportKind.FINAL, T0);
        String path = base(alice) + "/" + report.getId();

        String response = writeLearning(path, aliceSession, "{\"learning\":\"에러 응답은 한 곳에서 정한다\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(Ids.toApi(report.getId())))
                .andExpect(jsonPath("$.learning").value("에러 응답은 한 곳에서 정한다"))
                .andReturn().getResponse().getContentAsString();
        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("report", "retro-report.json"), actual);
        ContractShape.assertCommonRules(actual);
        mvc.perform(get(path).session(instructorSession))
                .andExpect(jsonPath("$.learning").value("에러 응답은 한 곳에서 정한다"));

        writeLearning(path, aliceSession, "{\"learning\":\"" + "가".repeat(5000) + "\"}").andExpect(status().isOk());
        writeLearning(path, aliceSession, "{\"learning\":\"\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        writeLearning(path, aliceSession, "{\"learning\":\"   \"}").andExpect(status().isBadRequest());
        assertThat(learningOf(report)).isEqualTo("가".repeat(5000));
    }

    /** 본인만 — 다른 학생 · 강사 403, 다른 팀원의 리포트 404, 5000자 넘음 · 값 없음 400. 아무것도 바뀌지 않는다. */
    @Test
    void onlySelfWritesValidLearning() throws Exception {
        RetroReport report = report(alice, ReportKind.FINAL, T0);
        RetroReport bobs = report(bob, ReportKind.FINAL, T0);
        String path = base(alice) + "/" + report.getId();
        String body = "{\"learning\":\"남이 쓴 배운 점\"}";

        writeLearning(path, bobSession, body).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        writeLearning(path, instructorSession, body).andExpect(status().isForbidden());
        writeLearning(base(alice) + "/" + bobs.getId(), aliceSession, body).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        writeLearning(path, aliceSession, "{\"learning\":\"" + "가".repeat(5001) + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        writeLearning(path, aliceSession, "{}").andExpect(status().isBadRequest());

        assertThat(learningOf(report)).isEqualTo("느낀 점");
        assertThat(learningOf(bobs)).isEqualTo("느낀 점");
    }

    // ---- #42 마크다운 내보내기 · 팀원 이름 익명화 ------------------------------------------------------

    /**
     * 계산 칸이 마크다운으로 나오고, 팀원(빠진 캐럴 포함) 이름 · 로그인은 처음 나온 순서대로 "팀원 A"…, 강사는 "강사"로만.
     * 영문에 붙은 {@code alicebot}은 다른 단어라 그대로 둔다.
     */
    @Test
    void markdownHasComputedFieldsWithMemberNamesAnonymized() throws Exception {
        AgendaItem decided = agenda(alice, "@bob 질문과 앨리스 답", "밥과 Carol이 맞춘다 — alicebot은 그대로",
                T0.plusSeconds(600));
        instructorFeedbacks.saveAndFlush(new InstructorFeedback(decided, instructorUser, "앨리스에게 한 줄",
                T0.plusSeconds(900)));
        assign(1, "[\"area:auth\"]", true, alice);
        DecisionCard confirmed = card(alice, pr(5, "[]", alice, 1001L, true), "첫 줄\n둘째 줄", "밥에게 배운 점");
        followUpQuestions.saveAndFlush(new FollowUpQuestion(confirmed, instructorUser, "앨리스는 왜?",
                T0.plusSeconds(1200)));
        RetroReport report = report(alice, ReportKind.FINAL, T0, confirmed);
        em.clear();

        var response = mvc.perform(get(base(alice) + "/" + report.getId() + "/markdown").session(aliceSession))
                .andExpect(status().isOk())
                .andReturn().getResponse();
        assertThat(response.getContentType()).isEqualTo("text/markdown;charset=UTF-8");
        assertThat(response.getContentAsString(StandardCharsets.UTF_8))
                .contains("# 최종 회고\n\n- 만든 시각: 2026-11-01T00:00:00Z",
                        "## 느낀 점\n\n느낀 점\n\n## 담당 기능 영역\n\n- 없음", // 고른 카드의 PR에 area 라벨이 없다
                        "### @팀원 A 질문과 팀원 B 답",
                        "- 결론: 팀원 A과 팀원 C이 맞춘다 — alicebot은 그대로",
                        "- 배운 점: 배운 점 @팀원 A 질문과 팀원 B 답",
                        "- 2026-11-01T00:15:00Z 강사: 팀원 B에게 한 줄",
                        "## 기술 결정 카드\n\n### #5 PR 5\n\n"
                                + "- 무엇을 하려 했나: 첫 줄\n  둘째 줄\n- 내가 배운 점: 팀원 A에게 배운 점\n"
                                + "- 2026-11-01T00:20:00Z 강사 꼬리질문: 팀원 B는 왜?\n")
                .doesNotContain("앨리스", "밥", "캐럴", "@bob", "Carol", "instructor", "## 요약", "area:auth");
    }

    /** 읽기 규칙은 리포트 읽기와 같다 — 강사 200, 다른 학생 403, 다른 팀원의 리포트 · 다른 사무실 팀원 404(JSON 에러). */
    @Test
    void markdownFollowsReportReadRules() throws Exception {
        RetroReport report = report(alice, ReportKind.MIDTERM, T0);
        RetroReport bobs = report(bob, ReportKind.FINAL, T0);

        mvc.perform(get(base(alice) + "/" + report.getId() + "/markdown").session(instructorSession))
                .andExpect(status().isOk());
        mvc.perform(get(base(alice) + "/" + report.getId() + "/markdown").session(bobSession))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        mvc.perform(get(base(alice) + "/" + bobs.getId() + "/markdown").session(aliceSession))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        mvc.perform(get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/members/" + Ids.toApi(aliceElsewhere.getId())
                        + "/reports/" + report.getId() + "/markdown").session(aliceSession))
                .andExpect(status().isNotFound());
    }

    // ---- #43 본인과 강사만 — 해제된 강사 404 ----------------------------------------------------------

    private ResultActions send(MockHttpServletRequestBuilder request, MockHttpSession session, String body)
            throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        return mvc.perform(request.session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /**
     * 강사 지정은 요청마다 DB에서 본다(FR-REP-06 · P13) — 같은 세션이어도 해제 뒤에는 리포트 · 결정 카드(#62) 경로 전부 사무실째 404,
     * 다시 지정하면 다시 읽는다. 다른 학생 403은 위 #40 · #42 테스트와 {@code DecisionCardIntegrationTest}가 본다.
     */
    @Test
    void unassignedInstructorGets404OnEveryReportRoute() throws Exception {
        RetroReport report = report(alice, ReportKind.FINAL, T0);
        String path = base(alice) + "/" + report.getId();
        Submission merged = pr(5, "[]", alice, 1001L, true);
        DecisionCard card = card(alice, merged, null, "배운 점");
        String cardsPath = base(alice).replace("/reports", "/decision-cards");
        mvc.perform(get(path).session(instructorSession)).andExpect(status().isOk());
        mvc.perform(get(cardsPath).session(instructorSession)).andExpect(status().isOk());

        instructorAssignments.findByInstructorGithubUserIdAndUnassignedAtIsNull(INSTRUCTOR_GITHUB_ID)
                .forEach(assignment -> assignment.unassign(T0.plusSeconds(60)));
        em.flush();

        for (String read : new String[] {base(alice), path, path + "/markdown", cardsPath}) {
            mvc.perform(get(read).session(instructorSession)).andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("not_found"));
        }
        create(base(alice), instructorSession, "final").andExpect(status().isNotFound());
        writeLearning(path, instructorSession, "{\"learning\":\"해제된 강사\"}").andExpect(status().isNotFound());
        send(post(cardsPath), instructorSession, "{\"submissionId\":\"" + Ids.toApi(merged.getId()) + "\"}")
                .andExpect(status().isNotFound());
        send(put(cardsPath + "/" + Ids.toApi(card.getId())), instructorSession,
                "{\"cells\":{\"learning\":\"해제된 강사\"}}")
                .andExpect(status().isNotFound());

        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, alice.getUser(),
                T0.plusSeconds(120)));
        mvc.perform(get(path + "/markdown").session(instructorSession)).andExpect(status().isOk());
        mvc.perform(get(cardsPath).session(instructorSession)).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }
}

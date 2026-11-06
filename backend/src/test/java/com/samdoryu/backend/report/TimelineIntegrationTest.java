package com.samdoryu.backend.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.evaluation.domain.Evaluation;
import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.domain.Verdict;
import com.samdoryu.backend.evaluation.repository.EvaluationRepository;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.InstructorFeedbackRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * #172 학습 타임라인(FR-LRN-08) — 실제 Security · MVC · MySQL(CONTRACTS_API 「15」). 테스트마다 트랜잭션을 되돌린다.
 * 계약 테스트 ② — 실제 응답 ↔ {@code contract/examples/report/timeline-page.json}.
 */
@SpringBootTest(properties = {
        "app.origin=" + TimelineIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + TimelineIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class TimelineIntegrationTest {

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
    @Autowired SubmissionRepository submissions;
    @Autowired EvaluationRoundRepository rounds;
    @Autowired EvaluationRepository evaluations;
    @Autowired AgendaItemRepository agendaItems;
    @Autowired InstructorFeedbackRepository instructorFeedbacks;

    private Workspace ws;
    private AppUser aliceUser;
    private AppUser bobUser;
    private AppUser carolUser;
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
        aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        carolUser = users.saveAndFlush(AppUser.github(1003L, "carol", "캐럴", null));
        instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        Workspace otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, aliceUser, T0));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, T0));
        carol = members.saveAndFlush(Member.collaborator(ws, carolUser, 2, false, T0));
        aliceElsewhere = members.saveAndFlush(Member.collaborator(otherWs, aliceUser, 0, true, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, T0));

        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
        bobSession = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
        instructorSession = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private String path(Member member) {
        return "/api/workspaces/" + Ids.toApi(member.getWorkspace().getId()) + "/members/" + Ids.toApi(member.getId())
                + "/timeline";
    }

    private Submission pr(int number, Member author, long authorGithubId) {
        return submissions.saveAndFlush(Submission.builder().workspace(ws).githubPrNumber(number).title("PR " + number)
                .authorGithubUserId(authorGithubId).authorMember(author).state(SubmissionState.OPEN).headSha(SHA)
                .reviewRequestsJson("[]").reviewsJson("[]").labelsJson("[]").githubCreatedAt(T0)
                .githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build());
    }

    private EvaluationRound round(Submission submission, Instant openedAt) {
        return rounds.saveAndFlush(new EvaluationRound(submission, 1, SHA, RoundOpenedReason.NEW_PR, openedAt));
    }

    private void evaluate(EvaluationRound round, AppUser evaluator, Verdict verdict, String reason, Instant at) {
        evaluations.saveAndFlush(new Evaluation(round, evaluator, verdict, reason, at));
    }

    /**
     * 앨리스 몫(시각 순): 안건 올림 0 · 받은 평가 2(회차 100 — 평가 시각 150 · 160은 싣지 않음) · 남긴 평가 200 · 결정 600 ·
     * 강사 피드백 900. 밥이 올린 안건 · 밥이 받은 다른 평가는 빠진다.
     */
    private AgendaItem seed() {
        EvaluationRound alicePr = round(pr(5, alice, 1001L), T0.plusSeconds(100));
        evaluate(alicePr, bobUser, Verdict.NOT_RECOMMEND, "실패 응답 모양이 계약과 달라요", T0.plusSeconds(150));
        evaluate(alicePr, carolUser, Verdict.RECOMMEND, "테스트가 꼼꼼해요", T0.plusSeconds(160));
        EvaluationRound bobPr = round(pr(6, bob, 1002L), T0.plusSeconds(50));
        evaluate(bobPr, aliceUser, Verdict.RECOMMEND, "이름이 잘 읽혀요", T0.plusSeconds(200));
        evaluate(bobPr, carolUser, Verdict.NOT_RECOMMEND, "캐럴이 밥에게", T0.plusSeconds(210));

        AgendaItem item = AgendaItem.withoutSource(ws, AgendaKind.OTHER, "실패 응답 모양", "배경 한 줄", null, null, alice, T0);
        item.decide("계약 모양으로 맞춘다", null, null, null, null, null, bob, T0.plusSeconds(600));
        agendaItems.saveAndFlush(item);
        agendaItems.saveAndFlush(AgendaItem.withoutSource(ws, AgendaKind.OTHER, "밥의 안건", null, null, null, bob,
                T0.plusSeconds(700)));
        instructorFeedbacks.saveAndFlush(new InstructorFeedback(item, instructorUser, "기준을 한 줄 남겨 두세요",
                T0.plusSeconds(900)));
        em.clear();
        return item;
    }

    @Test
    void selfSeesOwnEntriesNewestFirstWithoutEvaluators() throws Exception {
        AgendaItem item = seed();
        String agendaId = Ids.toApi(item.getId());

        String response = mvc.perform(get(path(alice)).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalItems").value(6))
                .andExpect(jsonPath("$.totalPages").value(1))
                .andExpect(jsonPath("$.items[*].kind").value(contains("instructor_feedback", "agenda_decided",
                        "evaluation_given", "evaluation_received", "evaluation_received", "agenda_raised")))
                .andExpect(jsonPath("$.items[0].detail").value("기준을 한 줄 남겨 두세요"))
                .andExpect(jsonPath("$.items[0].ref.type").value("agenda_item"))
                .andExpect(jsonPath("$.items[0].ref.id").value(agendaId))
                .andExpect(jsonPath("$.items[0].verdict").value(nullValue()))
                .andExpect(jsonPath("$.items[1].detail").value("계약 모양으로 맞춘다"))
                .andExpect(jsonPath("$.items[2].title").value("#6 PR 6"))
                .andExpect(jsonPath("$.items[2].detail").value("이름이 잘 읽혀요"))
                .andExpect(jsonPath("$.items[2].occurredAt").value("2026-11-01T00:03:20Z"))
                // 받은 평가: 회차가 열린 시각, 회차 목록과 같은 "추천 먼저"
                .andExpect(jsonPath("$.items[3].occurredAt").value("2026-11-01T00:01:40Z"))
                .andExpect(jsonPath("$.items[3].verdict").value("recommend"))
                .andExpect(jsonPath("$.items[4].verdict").value("not_recommend"))
                .andExpect(jsonPath("$.items[4].title").value("#5 PR 5"))
                .andExpect(jsonPath("$.items[4].detail").value("실패 응답 모양이 계약과 달라요"))
                .andExpect(jsonPath("$.items[4].ref.type").value("submission"))
                .andExpect(jsonPath("$.items[5].title").value("실패 응답 모양"))
                .andExpect(jsonPath("$.items[5].detail").value("배경 한 줄"))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("report", "timeline-page.json"), actual);
        ContractShape.assertCommonRules(actual);
        // 평가자 · 평가 시각 없음, 다른 사람이 남긴 다른 평가도 없음(사람 ID 칸이 없는 것은 위 모양 비교가 본다)
        assertThat(response).doesNotContain("bob", "밥", "carol", "캐럴", "00:02:30Z", "00:02:40Z", "캐럴이 밥에게");
    }

    /** 강사가 볼 때도 그 학생이 남긴 평가가 보인다({@code myEvaluation}과 달리 요청한 사람 기준이 아니다). */
    @Test
    void instructorReadsStudentTimelineIncludingEvaluationsGiven() throws Exception {
        seed();
        mvc.perform(get(path(alice)).session(instructorSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(6))
                .andExpect(jsonPath("$.items[2].kind").value("evaluation_given"))
                .andExpect(jsonPath("$.items[2].detail").value("이름이 잘 읽혀요"));
    }

    @Test
    void otherStudentIs403AndPathMemberMustBelongToWorkspace() throws Exception {
        mvc.perform(get(path(alice)).session(bobSession)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));

        carol.remove(T0.plusSeconds(60)); // 빠진 팀원도 경로로 찾는다
        members.saveAndFlush(carol);
        mvc.perform(get(path(carol)).session(instructorSession)).andExpect(status().isOk())
                .andExpect(jsonPath("$.items").value(empty()))
                .andExpect(jsonPath("$.totalPages").value(0));

        String otherWsMember = "/api/workspaces/" + Ids.toApi(ws.getId()) + "/members/"
                + Ids.toApi(aliceElsewhere.getId()) + "/timeline";
        mvc.perform(get(otherWsMember).session(aliceSession)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));

        instructorAssignments.findByInstructorGithubUserIdAndUnassignedAtIsNull(INSTRUCTOR_GITHUB_ID)
                .forEach(assignment -> assignment.unassign(T0.plusSeconds(60)));
        em.flush();
        mvc.perform(get(path(alice)).session(instructorSession)).andExpect(status().isNotFound());
    }

    @Test
    void pagesAndRejectsOutOfRangeParams() throws Exception {
        seed();
        mvc.perform(get(path(alice)).param("page", "1").param("size", "4").session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(4))
                .andExpect(jsonPath("$.totalItems").value(6))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.items[*].kind").value(contains("evaluation_received", "agenda_raised")));
        mvc.perform(get(path(alice)).param("page", "5").session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").value(empty()))
                .andExpect(jsonPath("$.totalItems").value(6));

        for (String[] param : new String[][] {{"page", "-1"}, {"size", "0"}, {"size", "101"}, {"page", "x"}}) {
            mvc.perform(get(path(alice)).param(param[0], param[1]).session(aliceSession))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }
    }
}

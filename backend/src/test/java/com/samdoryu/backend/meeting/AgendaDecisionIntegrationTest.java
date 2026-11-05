package com.samdoryu.backend.meeting;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.domain.HelpRequestStatus;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.AgendaStatus;
import com.samdoryu.backend.meeting.domain.Meeting;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.MeetingRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
import org.springframework.transaction.annotation.Transactional;

/**
 * #37 결정 기록 — 실제 Security · MVC · MySQL(CONTRACTS_API 「10」 decision). 테스트마다 트랜잭션을 되돌린다.
 * 서버 {@code Instant.now()}와 비교되는 값(회차 닫힘 · 도움 요청 닫힘 CHECK)은 과거 시각으로 만든다.
 * 계약 테스트 ② — 실제 응답 ↔ {@code contract/examples/meeting/agenda-item.json}(결정 있음).
 */
@SpringBootTest(properties = {
        "app.origin=" + AgendaDecisionIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + AgendaDecisionIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class AgendaDecisionIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant PAST = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MICROS);
    private static final String SHA = "0123456789abcdef0123456789abcdef01234567";

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired SubmissionRepository submissions;
    @Autowired EvaluationRoundRepository rounds;
    @Autowired AgendaItemRepository agendaItems;
    @Autowired MeetingRepository meetings;
    @Autowired HelpRequestRepository helpRequests;

    private Workspace ws;
    private Workspace otherWs;
    private Member alice;
    private Member bob;
    private Member otherWsMember;
    private Submission pr;
    private MockHttpSession bobSession;
    private MockHttpSession instructorSession;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        AppUser instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, PAST));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, aliceUser, PAST));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, PAST));
        bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, PAST));
        otherWsMember = members.saveAndFlush(Member.collaborator(otherWs, bobUser, 0, false, PAST));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, PAST));
        pr = submissions.saveAndFlush(Submission.builder().workspace(ws).githubPrNumber(2).title("PR")
                .authorGithubUserId(1001L).authorMember(alice).state(SubmissionState.OPEN).headSha(SHA)
                .reviewRequestsJson("[]").reviewsJson("[]").labelsJson("[]").githubCreatedAt(PAST)
                .githubUpdatedAt(PAST).stateChangedAt(PAST).syncedAt(PAST).build());

        // 밥이 결정한다 — 올린 사람(앨리스)이 아니어도 된다.
        bobSession = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT)
                .member(otherWs.getId(), otherWsMember.getId(), WorkspaceRole.PARTICIPANT).session();
        instructorSession = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private AgendaItem other() {
        return agendaItems.saveAndFlush(
                AgendaItem.withoutSource(ws, AgendaKind.OTHER, "회고 일정", null, null, null, alice, PAST));
    }

    private AgendaItem prItem(Long roundId) {
        return agendaItems.saveAndFlush(
                AgendaItem.forSubmission(ws, pr, roundId, "실패 응답 모양", null, null, null, alice, PAST));
    }

    private ResultActions decide(Workspace workspace, MockHttpSession session, AgendaItem item, String body)
            throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        return mvc.perform(post("/api/workspaces/" + Ids.toApi(workspace.getId()) + "/agenda-items/"
                + Ids.toApi(item.getId()) + "/decision").session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String body(String prDecision, String followUpId, String meetingId) {
        return "{\"conclusion\":\"계약 모양으로 맞춘다\",\"learning\":\"전역 예외 처리 한 곳\",\"prDecision\":"
                + quoted(prDecision) + ",\"followUpAssigneeMemberId\":" + quoted(followUpId)
                + ",\"followUpDueDate\":\"2026-11-07\",\"meetingId\":" + quoted(meetingId) + "}";
    }

    private static String quoted(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }

    @Test
    void memberRecordsDecisionOnAgendaRaisedByAnother() throws Exception {
        AgendaItem item = other();
        Meeting meeting = meetings.saveAndFlush(new Meeting(ws, List.of(alice, bob), PAST));

        String response = decide(ws, bobSession, item, body(null, Ids.toApi(alice.getId()), Ids.toApi(meeting.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("discussed"))
                .andExpect(jsonPath("$.decision.conclusion").value("계약 모양으로 맞춘다"))
                .andExpect(jsonPath("$.decision.learning").value("전역 예외 처리 한 곳"))
                .andExpect(jsonPath("$.decision.prDecision").value(nullValue()))
                .andExpect(jsonPath("$.decision.followUpAssigneeMemberId").value(Ids.toApi(alice.getId())))
                .andExpect(jsonPath("$.decision.followUpDueDate").value("2026-11-07"))
                .andExpect(jsonPath("$.decision.meetingId").value(Ids.toApi(meeting.getId())))
                .andExpect(jsonPath("$.decision.decidedByMemberId").value(Ids.toApi(bob.getId())))
                .andReturn().getResponse().getContentAsString();

        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("meeting", "agenda-item.json"), actual);
        ContractShape.assertCommonRules(actual);

        em.flush();
        em.clear();
        assertThat(agendaItems.findByMeetingIdInOrderByIdAsc(List.of(meeting.getId())))
                .extracting(AgendaItem::getId).containsExactly(item.getId());
    }

    @Test
    void optionalFieldsMayBeNull() throws Exception {
        decide(ws, bobSession, other(), "{\"conclusion\":\"다음 주에 다시\",\"learning\":null,\"prDecision\":null,"
                + "\"followUpAssigneeMemberId\":null,\"followUpDueDate\":null,\"meetingId\":null}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision.learning").value(nullValue()))
                .andExpect(jsonPath("$.decision.meetingId").value(nullValue()));
    }

    /** revise_and_reevaluate — 같은 트랜잭션에서 이전 회차를 닫고 그때의 headSha로 다음 회차를 연다. */
    @Test
    void reviseAndReevaluateOpensNextRound() throws Exception {
        EvaluationRound first = rounds.saveAndFlush(new EvaluationRound(pr, 1, SHA, RoundOpenedReason.NEW_PR, PAST));
        AgendaItem item = prItem(first.getId());

        decide(ws, bobSession, item, body("revise_and_reevaluate", null, null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision.prDecision").value("revise_and_reevaluate"))
                .andExpect(jsonPath("$.evaluationRoundId").value(Ids.toApi(first.getId())));

        em.flush();
        em.clear();
        List<EvaluationRound> all = rounds.findBySubmissionIdOrderByRoundNumberDesc(pr.getId());
        assertThat(all).hasSize(2);
        assertThat(all.get(0).getRoundNumber()).isEqualTo(2);
        assertThat(all.get(0).getOpenedReason()).isEqualTo(RoundOpenedReason.MEETING_REEVALUATE);
        assertThat(all.get(0).getHeadSha()).isEqualTo(SHA);
        assertThat(all.get(0).getClosedAt()).isNull();
        assertThat(all.get(1).getClosedAt()).isNotNull();
    }

    @Test
    void reviseWithoutAnyRoundOpensFirstRound() throws Exception {
        decide(ws, bobSession, prItem(null), body("revise_and_reevaluate", null, null)).andExpect(status().isOk());

        assertThat(rounds.findBySubmissionIdOrderByRoundNumberDesc(pr.getId())).singleElement()
                .satisfies(round -> assertThat(round.getRoundNumber()).isEqualTo(1));
    }

    @Test
    void otherPrDecisionsOpenNoRound() throws Exception {
        decide(ws, bobSession, prItem(null), body("merge_as_is", null, null)).andExpect(status().isOk());
        decide(ws, bobSession, prItem(null), body("close_pr", null, null)).andExpect(status().isOk());

        assertThat(rounds.findBySubmissionIdOrderByRoundNumberDesc(pr.getId())).isEmpty();
    }

    /** 도움 요청 안건의 결정 → 그 도움 요청은 ended(같은 트랜잭션). */
    @Test
    void helpRequestAgendaEndsTheHelpRequest() throws Exception {
        HelpRequest help = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "CSRF가 막혀요", null, PAST));
        // 안건 전환(#51) 전이라 상태만 바로 옮긴다
        em.createNativeQuery("UPDATE help_request SET status = 'ON_AGENDA' WHERE id = ?")
                .setParameter(1, help.getId()).executeUpdate();
        AgendaItem item = agendaItems.saveAndFlush(AgendaItem.forHelpRequest(ws, help.getId(), "CSRF", alice, PAST));
        em.clear();

        decide(ws, bobSession, item, body(null, null, null)).andExpect(status().isOk())
                .andExpect(jsonPath("$.source.type").value("help_request"));

        em.flush();
        em.clear();
        HelpRequest ended = helpRequests.findById(help.getId()).orElseThrow();
        assertThat(ended.getStatus()).isEqualTo(HelpRequestStatus.ENDED);
        assertThat(ended.getClosedAt()).isNotNull();
    }

    @Test
    void notConfirmedIs409() throws Exception {
        AgendaItem item = other();
        decide(ws, bobSession, item, body(null, null, null)).andExpect(status().isOk());
        decide(ws, bobSession, item, body(null, null, null)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
    }

    /** 「10」 — PR 결정이 PR 안건에 없음 · 다른 종류에 있음 · 후속 담당자가 지금 팀원이 아님(다른 사무실 팀원 포함) · 본문 오류는 400. */
    @Test
    void invalidDecisionIs400AndChangesNothing() throws Exception {
        AgendaItem prAgenda = prItem(null);
        AgendaItem otherAgenda = other();
        decide(ws, bobSession, prAgenda, body(null, null, null)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        decide(ws, bobSession, otherAgenda, body("merge_as_is", null, null)).andExpect(status().isBadRequest());
        decide(ws, bobSession, otherAgenda, body(null, Ids.toApi(otherWsMember.getId()), null))
                .andExpect(status().isBadRequest());
        decide(ws, bobSession, otherAgenda, body(null, "abc", null)).andExpect(status().isBadRequest());
        decide(ws, bobSession, otherAgenda, "{\"conclusion\":\"\"}").andExpect(status().isBadRequest());
        decide(ws, bobSession, otherAgenda, body("later", null, null)).andExpect(status().isBadRequest());

        em.flush();
        em.clear();
        assertThat(agendaItems.findAll()).extracting(AgendaItem::getStatus).containsOnly(AgendaStatus.CONFIRMED);
    }

    /** IDOR — 다른 사무실 안건을 내 사무실 경로로, 다른 사무실 회의를 다룬 회의로 넣으면 404. */
    @Test
    void agendaOrMeetingOfAnotherWorkspaceIs404() throws Exception {
        AgendaItem elsewhere = agendaItems.saveAndFlush(
                AgendaItem.withoutSource(otherWs, AgendaKind.OTHER, "남의 안건", null, null, null, otherWsMember, PAST));
        Meeting otherMeeting = meetings.saveAndFlush(new Meeting(otherWs, List.of(), PAST));

        decide(ws, bobSession, elsewhere, body(null, null, null)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        decide(ws, bobSession, other(), body(null, null, Ids.toApi(otherMeeting.getId())))
                .andExpect(status().isNotFound());
    }

    @Test
    void instructorCannotDecide() throws Exception {
        decide(ws, instructorSession, other(), body(null, null, null)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
    }
}

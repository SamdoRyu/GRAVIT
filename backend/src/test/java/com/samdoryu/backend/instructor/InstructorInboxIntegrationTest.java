package com.samdoryu.backend.instructor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.help.domain.HelpComment;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.repository.HelpCommentRepository;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.InstructorFeedbackRepository;
import com.samdoryu.backend.report.domain.DecisionCard;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import com.samdoryu.backend.report.repository.DecisionCardRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.time.Duration;
import java.time.Instant;
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
 * #58 FR-LRN-23 — 강사 요청함 {@code GET /api/instructor/inbox}(CONTRACTS_API 「16」)를 실제 Security · MVC · MySQL로 본다.
 * 원본은 도움 요청 "강사에게 요청"(#56) · 결정 기록 피드백 요청(#57) · 카드 꼬리질문 요청(#59)이고, 요청함은 저장하지 않고 매번
 * 계산한다. 범위는 지금 지정된 사무실(요청마다 DB 확인)이다. 심사용 강사의 시연 사무실 범위는
 * {@code InstructorInboxAuthorizationTest}, 한 줄의 DTO ↔ 계약(①)은 {@code InboxItemContractTest}.
 *
 * <pre>
 *  사무실 a(지정)   카드 꼬리질문 요청 +6h · 답 없음 / 결정 피드백 요청 +4h · 피드백 +5h /
 *                  도움 요청 +1h · 강사 답변 +3h · +2h(첫 답 +2h) / 요청 안 한 도움 요청 · 안건 · 카드
 *  사무실 b(지정)   도움 요청 +2h · 답 없음(첫 줄 120자)
 *  사무실 c(해제)   도움 요청 +7h          사무실 d(다른 강사만 지정)  도움 요청 +8h
 * </pre>
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + InstructorInboxIntegrationTest.INSTRUCTOR_ID + ","
        + InstructorInboxIntegrationTest.OTHER_INSTRUCTOR_ID + "," + InstructorInboxIntegrationTest.IDLE_INSTRUCTOR_ID)
@AutoConfigureMockMvc
@Transactional
class InstructorInboxIntegrationTest {

    static final long INSTRUCTOR_ID = 9001L;
    static final long OTHER_INSTRUCTOR_ID = 9002L;
    static final long IDLE_INSTRUCTOR_ID = 9003L;
    private static final Instant T0 = Instant.parse("2026-11-06T00:00:00Z");
    private static final String SHA = "0123456789abcdef0123456789abcdef01234567";
    private static final String LONG_FIRST_LINE = "가".repeat(120);

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired HelpRequestRepository helpRequests;
    @Autowired HelpCommentRepository helpComments;
    @Autowired AgendaItemRepository agendaItems;
    @Autowired InstructorFeedbackRepository instructorFeedbacks;
    @Autowired SubmissionRepository submissions;
    @Autowired DecisionCardRepository cards;

    private AppUser aliceUser;
    private AppUser instructor;
    private Workspace a;
    private Workspace b;
    private Member alice;
    private Member bob;
    private Member carol;
    private InstructorAssignment aAssignment;
    private InstructorAssignment bAssignment;
    private HelpRequest answeredHelp;
    private HelpRequest otherWorkspaceHelp;
    private HelpRequest othersOnlyHelp;
    private AgendaItem feedbackItem;
    private DecisionCard card;
    private MockHttpSession instructorSession;

    private static Instant at(long hours) {
        return T0.plus(Duration.ofHours(hours));
    }

    @BeforeEach
    void setUp() {
        aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        AppUser carolUser = users.saveAndFlush(AppUser.github(1003L, "carol", "캐럴", null));
        instructor = users.saveAndFlush(AppUser.github(INSTRUCTOR_ID, "teacher", "강사", null));

        a = workspaces.saveAndFlush(Workspace.github(5001L, "team", "a", null, aliceUser, T0));
        b = workspaces.saveAndFlush(Workspace.github(5002L, "team", "b", null, aliceUser, T0));
        Workspace released = workspaces.saveAndFlush(Workspace.github(5003L, "team", "c", null, aliceUser, T0));
        Workspace othersOnly = workspaces.saveAndFlush(Workspace.github(5004L, "team", "d", null, aliceUser, T0));
        alice = members.saveAndFlush(Member.collaborator(a, aliceUser, 0, true, T0));
        bob = members.saveAndFlush(Member.collaborator(a, bobUser, 1, false, T0));
        carol = members.saveAndFlush(Member.collaborator(b, carolUser, 0, true, T0));
        Member aliceInC = members.saveAndFlush(Member.collaborator(released, aliceUser, 0, true, T0));
        Member aliceInD = members.saveAndFlush(Member.collaborator(othersOnly, aliceUser, 0, true, T0));

        aAssignment = instructorAssignments.saveAndFlush(new InstructorAssignment(a, INSTRUCTOR_ID, aliceUser, T0));
        bAssignment = instructorAssignments.saveAndFlush(new InstructorAssignment(b, INSTRUCTOR_ID, aliceUser, T0));
        InstructorAssignment old = new InstructorAssignment(released, INSTRUCTOR_ID, aliceUser, T0);
        old.unassign(T0.plusSeconds(60));
        instructorAssignments.saveAndFlush(old);
        instructorAssignments.saveAndFlush(new InstructorAssignment(othersOnly, OTHER_INSTRUCTOR_ID, aliceUser, T0));

        // 사무실 a — 도움 요청(답 있음) · 결정 피드백(답 있음) · 카드 꼬리질문(답 없음), 그리고 요청 안 한 원본들
        answeredHelp = help(a, alice, "\n  세션이 자꾸 끊겨요  \n로그를 붙입니다", at(1));
        helpComments.saveAndFlush(new HelpComment(answeredHelp, bobUser, bob, "저도 그래요", at(1).plusSeconds(600)));
        helpComments.saveAndFlush(new HelpComment(answeredHelp, instructor, null, "두 번째 답", at(3)));
        helpComments.saveAndFlush(new HelpComment(answeredHelp, instructor, null, "첫 답", at(2)));
        helpRequests.saveAndFlush(new HelpRequest(a, bob, "요청 안 한 글", null, T0));

        feedbackItem = decided(a, bob, "로그인 실패 응답 모양", at(4));
        instructorFeedbacks.saveAndFlush(new InstructorFeedback(feedbackItem, instructor, "좋은 결정이에요", at(5)));
        decided(a, bob, "피드백 요청 안 한 결정", null);

        card = cards.saveAndFlush(new DecisionCard(alice, mergedPr(a, 15, "로그인 에러 응답 통일"),
                DecisionCardCells.EMPTY, T0));
        card.requestFollowUp(at(6));
        cards.saveAndFlush(card);
        cards.saveAndFlush(new DecisionCard(alice, mergedPr(a, 16, "요청 안 한 카드"), DecisionCardCells.EMPTY, T0));

        otherWorkspaceHelp = help(b, carol, LONG_FIRST_LINE + "\n둘째 줄", at(2));
        help(released, aliceInC, "해제된 사무실 글", at(7));
        othersOnlyHelp = help(othersOnly, aliceInD, "다른 강사의 사무실 글", at(8));

        instructorSession = TestLogin.githubUser(instructor.getId(), INSTRUCTOR_ID).session();
    }

    private HelpRequest help(Workspace workspace, Member requester, String content, Instant requestedAt) {
        HelpRequest help = new HelpRequest(workspace, requester, content, null, T0);
        help.requestInstructor(requestedAt);
        return helpRequests.saveAndFlush(help);
    }

    /** 결정된 안건 — {@code feedbackRequestedAt}이 null이면 피드백을 요청하지 않은 결정. */
    private AgendaItem decided(Workspace workspace, Member raisedBy, String title, Instant feedbackRequestedAt) {
        AgendaItem item = AgendaItem.withoutSource(workspace, AgendaKind.OTHER, title, null, null, null, raisedBy, T0);
        item.decide("이렇게 한다", null, null, null, null, null, raisedBy, T0.plusSeconds(60));
        if (feedbackRequestedAt != null) {
            item.requestFeedback(feedbackRequestedAt);
        }
        return agendaItems.saveAndFlush(item);
    }

    private Submission mergedPr(Workspace workspace, int number, String title) {
        return submissions.saveAndFlush(Submission.builder().workspace(workspace).githubPrNumber(number)
                .title(title).authorGithubUserId(1001L).authorMember(alice)
                .state(SubmissionState.MERGED).headSha(SHA).reviewRequestsJson("[]").reviewsJson("[]")
                .labelsJson("[]").githubCreatedAt(T0).githubUpdatedAt(T0).mergedAt(T0.plusSeconds(600))
                .closedAt(T0.plusSeconds(600)).stateChangedAt(T0).syncedAt(T0).build());
    }

    private JsonNode inbox(String query) throws Exception {
        String body = mvc.perform(get("/api/instructor/inbox" + query).session(instructorSession))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ContractShape.readTree(body);
    }

    private static List<String> targets(JsonNode list) {
        List<String> targets = new ArrayList<>();
        list.forEach(item -> targets.add(item.get("kind").asString() + ":" + item.get("targetId").asString()));
        return targets;
    }

    private static String target(String kind, Long id) {
        return kind + ":" + Ids.toApi(id);
    }

    /** 계약 ② — 지금 지정된 사무실(a · b)의 요청만, requestedAt 내림차순. 한 줄의 모든 필드를 본다. */
    @Test
    void listsRequestsOfCurrentlyAssignedWorkspacesNewestFirst() throws Exception {
        JsonNode list = inbox("");

        assertThat(targets(list)).containsExactly(
                target("follow_up_question", card.getId()),
                target("decision_feedback", feedbackItem.getId()),
                target("help_request", otherWorkspaceHelp.getId()),
                target("help_request", answeredHelp.getId()));

        JsonNode cardItem = list.get(0);
        assertThat(cardItem.get("workspaceId").asString()).isEqualTo(Ids.toApi(a.getId()));
        assertThat(cardItem.get("workspaceDisplayName").asString()).isEqualTo("team/a");
        assertThat(cardItem.get("ownerMemberId").asString()).isEqualTo(Ids.toApi(alice.getId()));
        assertThat(cardItem.get("title").asString()).isEqualTo("로그인 에러 응답 통일");
        assertThat(cardItem.get("requestedAt").asString()).isEqualTo("2026-11-06T06:00:00Z");
        assertThat(cardItem.get("answeredAt").isNull()).isTrue();

        JsonNode feedback = list.get(1);
        assertThat(feedback.get("ownerMemberId").asString()).isEqualTo(Ids.toApi(bob.getId()));
        assertThat(feedback.get("title").asString()).isEqualTo("로그인 실패 응답 모양");
        assertThat(feedback.get("requestedAt").asString()).isEqualTo("2026-11-06T04:00:00Z");
        assertThat(feedback.get("answeredAt").asString()).isEqualTo("2026-11-06T05:00:00Z");

        JsonNode otherHelp = list.get(2);
        assertThat(otherHelp.get("workspaceId").asString()).isEqualTo(Ids.toApi(b.getId()));
        assertThat(otherHelp.get("workspaceDisplayName").asString()).isEqualTo("team/b");
        assertThat(otherHelp.get("ownerMemberId").asString()).isEqualTo(Ids.toApi(carol.getId()));
        assertThat(otherHelp.get("title").asString()).isEqualTo("가".repeat(100));

        // 학생 코멘트는 답이 아니다 — 강사 답변 중 가장 이른 시각
        JsonNode help = list.get(3);
        assertThat(help.get("ownerMemberId").asString()).isEqualTo(Ids.toApi(alice.getId()));
        assertThat(help.get("title").asString()).isEqualTo("세션이 자꾸 끊겨요");
        assertThat(help.get("requestedAt").asString()).isEqualTo("2026-11-06T01:00:00Z");
        assertThat(help.get("answeredAt").asString()).isEqualTo("2026-11-06T02:00:00Z");

        for (JsonNode item : list) {
            assertThat(item.propertyNames()).containsExactlyInAnyOrder("kind", "workspaceId", "workspaceDisplayName",
                    "targetId", "ownerMemberId", "title", "requestedAt", "answeredAt");
            ContractShape.assertCommonRules(item);
        }
    }

    @Test
    void answeredFiltersByWhetherAnyInstructorAnswerExists() throws Exception {
        assertThat(targets(inbox("?answered=true"))).containsExactly(
                target("decision_feedback", feedbackItem.getId()),
                target("help_request", answeredHelp.getId()));
        assertThat(targets(inbox("?answered=false"))).containsExactly(
                target("follow_up_question", card.getId()),
                target("help_request", otherWorkspaceHelp.getId()));
    }

    /** 저장하지 않는 계산 값 — 강사가 답을 쓰면 다음 요청부터 답한 것으로 나온다. */
    @Test
    void anAnswerMovesTheItemToAnsweredOnTheNextRequest() throws Exception {
        helpComments.saveAndFlush(new HelpComment(otherWorkspaceHelp, instructor, null, "로그를 볼게요", at(9)));

        assertThat(targets(inbox("?answered=false"))).containsExactly(target("follow_up_question", card.getId()));
        assertThat(inbox("?answered=true").get(1).get("answeredAt").asString()).isEqualTo("2026-11-06T09:00:00Z");
    }

    /**
     * #272 — 답 없이 닫힌(resolved · ended) 도움 요청은 빠진다. 답이 있었던 글은 닫혀도 답한 것 · 전부에 남고,
     * on_agenda는 아직 답할 수 있어 답할 요청에 있다(계약 「16」).
     */
    @Test
    void helpRequestsClosedWithoutAnAnswerLeaveTheInbox() throws Exception {
        otherWorkspaceHelp.close(null, "스스로 해결", at(9));
        helpRequests.saveAndFlush(otherWorkspaceHelp);
        HelpRequest endedHelp = help(a, bob, "회의에서 끝난 글", at(9));
        endedHelp.moveToAgenda();
        endedHelp.endByAgendaDecision(at(10));
        helpRequests.saveAndFlush(endedHelp);
        HelpRequest onAgendaHelp = help(a, bob, "안건으로 간 글", at(11));
        onAgendaHelp.moveToAgenda();
        helpRequests.saveAndFlush(onAgendaHelp);
        answeredHelp.close(null, "답 덕분에 해결", at(12));
        helpRequests.saveAndFlush(answeredHelp);

        assertThat(targets(inbox("?answered=false"))).containsExactly(
                target("help_request", onAgendaHelp.getId()),
                target("follow_up_question", card.getId()));
        assertThat(targets(inbox("?answered=true"))).containsExactly(
                target("decision_feedback", feedbackItem.getId()),
                target("help_request", answeredHelp.getId()));
        assertThat(targets(inbox(""))).hasSize(4)
                .doesNotContain(target("help_request", otherWorkspaceHelp.getId()),
                        target("help_request", endedHelp.getId()));
    }

    /** 해제 직후 같은 세션의 다음 요청부터 그 사무실 것이 빠지고, 지정이 하나도 없으면 강사 요청함을 쓸 수 없다. */
    @Test
    void releasingAWorkspaceDropsItsRequestsAndTheLastReleaseForbidsTheInbox() throws Exception {
        bAssignment.unassign(at(10));
        instructorAssignments.saveAndFlush(bAssignment);

        assertThat(targets(inbox(""))).doesNotContain(target("help_request", otherWorkspaceHelp.getId()))
                .hasSize(3);

        aAssignment.unassign(at(10));
        instructorAssignments.saveAndFlush(aAssignment);

        mvc.perform(get("/api/instructor/inbox").session(instructorSession))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
    }

    /** 다른 강사는 자기 사무실(d)의 요청만 본다. 요청이 하나도 없는 지정 사무실(quiet)은 아무것도 더하지 않는다. */
    @Test
    void anotherInstructorSeesOnlyItsOwnWorkspaces() throws Exception {
        Workspace quiet = workspaces.saveAndFlush(Workspace.github(5005L, "team", "quiet", null, aliceUser, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(quiet, OTHER_INSTRUCTOR_ID, aliceUser, T0));
        MockHttpSession other = TestLogin.githubUser(98L, OTHER_INSTRUCTOR_ID).session();

        String body = mvc.perform(get("/api/instructor/inbox").session(other))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(targets(ContractShape.readTree(body))).containsExactly(target("help_request", othersOnlyHelp.getId()));
    }

    @Test
    void studentsAndUnassignedInstructorsAreForbidden() throws Exception {
        MockHttpSession student = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(a.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
        MockHttpSession idle = TestLogin.githubUser(99L, IDLE_INSTRUCTOR_ID).session();

        for (MockHttpSession session : List.of(student, idle)) {
            mvc.perform(get("/api/instructor/inbox").session(session))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        }
    }

    @Test
    void withoutASessionIs401() throws Exception {
        mvc.perform(get("/api/instructor/inbox"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("unauthorized"));
    }

    @Test
    void answeredMustBeTrueOrFalse() throws Exception {
        mvc.perform(get("/api/instructor/inbox?answered=maybe").session(instructorSession))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
    }
}

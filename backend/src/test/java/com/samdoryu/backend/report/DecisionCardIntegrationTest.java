package com.samdoryu.backend.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.nullValue;
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
import com.samdoryu.backend.evaluation.domain.Evaluation;
import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.domain.Verdict;
import com.samdoryu.backend.evaluation.repository.EvaluationRepository;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.Meeting;
import com.samdoryu.backend.meeting.domain.PrDecision;
import com.samdoryu.backend.meeting.domain.Standup;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.MeetingRepository;
import com.samdoryu.backend.meeting.repository.StandupRepository;
import com.samdoryu.backend.report.domain.DecisionCard;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import com.samdoryu.backend.report.repository.DecisionCardRepository;
import com.samdoryu.backend.report.repository.FollowUpQuestionRepository;
import com.samdoryu.backend.requirement.domain.Requirement;
import com.samdoryu.backend.requirement.domain.RequirementLink;
import com.samdoryu.backend.requirement.repository.RequirementLinkRepository;
import com.samdoryu.backend.requirement.repository.RequirementRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionIssueLink;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.SubmissionIssueLinkRepository;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
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
import tools.jackson.databind.JsonNode;

/**
 * #62 FR-REP-07 · P11 — 기술 결정 카드 만들기 · 읽기 · 고치기. 실제 Security · MVC · MySQL(CONTRACTS_API 「15」).
 * <ul>
 *   <li>만들기: 머지되거나 닫힌 내 PR → {@code 201}, 9칸은 앱이 가진 재료를 규칙대로(요구사항 · 평가 이유 · 회의 결정 · 회의 메모 ·
 *       스탠드업 막힌 것 · 링크). 내 PR 아님 {@code 403}, 열린 PR · 같은 PR 카드 {@code 409}, 다른 사무실 PR {@code 404}.</li>
 *   <li>공통 접근 규칙: 팀원 아님 {@code 404}, 읽기 본인 · 지정된 강사, 쓰기 본인만(다른 학생 · 강사 {@code 403}).</li>
 *   <li>고치기: 9칸 통째로, {@code confirmed: true}인데 배운 점이 비면 {@code 400}.</li>
 *   <li>계약 ② — 실제 응답 ↔ {@code contract/examples/report/retro-report.json}의 {@code decisionCards[0]} 모양.
 *       평가자 식별 값이 응답에 없다(익명성).</li>
 *   <li>#59 FR-REP-11 꼬리질문: 요청은 본인만({@code 200}, 다시 요청해도 처음 시각). 꼬리질문은 지정된 강사만, 요청된 카드에만
 *       {@code 201} — 요청 안 된 카드 · 본인 · 다른 학생 {@code 403}, 1~1000자 밖 {@code 400}. 9칸과 따로 붙는다.</li>
 * </ul>
 */
@SpringBootTest(properties = {
        "app.origin=" + DecisionCardIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + DecisionCardIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class DecisionCardIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-01T00:00:00Z");
    private static final String SHA = "0123456789abcdef0123456789abcdef01234567";

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired TaskRepository tasks;
    @Autowired SubmissionRepository submissions;
    @Autowired SubmissionIssueLinkRepository issueLinks;
    @Autowired RequirementRepository requirements;
    @Autowired RequirementLinkRepository requirementLinks;
    @Autowired EvaluationRoundRepository rounds;
    @Autowired EvaluationRepository evaluations;
    @Autowired MeetingRepository meetings;
    @Autowired AgendaItemRepository agendaItems;
    @Autowired StandupRepository standups;
    @Autowired DecisionCardRepository cards;
    @Autowired FollowUpQuestionRepository followUpQuestions;

    private Workspace ws;
    private AppUser bobUser;
    private Member alice;
    private Member bob;
    private Member aliceElsewhere;
    private Submission mergedPr;
    private Submission openPr;
    private Submission bobsPr;
    private Submission otherWorkspacePr;
    private MockHttpSession aliceSession;
    private MockHttpSession bobSession;
    private MockHttpSession instructorSession;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        AppUser instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        Workspace otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, aliceUser, T0));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, T0));
        aliceElsewhere = members.saveAndFlush(Member.collaborator(otherWs, aliceUser, 0, true, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, T0));

        mergedPr = pr(ws, 15, alice, SubmissionState.MERGED);
        openPr = pr(ws, 16, alice, SubmissionState.OPEN);
        bobsPr = pr(ws, 17, bob, SubmissionState.CLOSED);
        otherWorkspacePr = pr(otherWs, 18, aliceElsewhere, SubmissionState.MERGED);

        // 재료: 연결 이슈 #12 → 요구사항, 평가 이유, PR 안건의 회의 결정 · 회의 메모, 스탠드업 막힌 것
        Task issue = tasks.saveAndFlush(Task.builder().workspace(ws).githubIssueNumber(12).title("로그인 실패 응답")
                .state(TaskState.OPEN).labelsJson("[]").githubCreatedAt(T0).githubUpdatedAt(T0)
                .stateChangedAt(T0).syncedAt(T0).build());
        issueLinks.saveAndFlush(new SubmissionIssueLink(mergedPr, issue, "CLOSING_REFERENCE"));
        Requirement login = requirements.saveAndFlush(new Requirement(ws, "FR-AUTH-01", "## FR-AUTH-01 GitHub 로그인",
                "GitHub 로그인", 0, T0));
        requirementLinks.saveAndFlush(new RequirementLink(login, issue, aliceUser, T0));

        EvaluationRound round = rounds.saveAndFlush(new EvaluationRound(mergedPr, 1, SHA, RoundOpenedReason.NEW_PR, T0));
        evaluations.saveAndFlush(new Evaluation(round, bobUser, Verdict.NOT_RECOMMEND, "실패 응답 모양이 계약과 달라요", T0));

        Meeting meeting = new Meeting(ws, List.of(alice, bob), T0.plusSeconds(3600));
        meeting.end("전역 예외 처리 한 곳으로 가자", T0.plusSeconds(7200));
        meetings.saveAndFlush(meeting);
        AgendaItem agenda = AgendaItem.forSubmission(ws, mergedPr, round.getId(), "실패 응답 모양", null, null, null,
                alice, T0.plusSeconds(1800));
        agenda.decide("에러 응답을 계약 모양으로 맞추고 다시 평가받는다", "에러 응답은 한 곳에서 정한다",
                PrDecision.REVISE_AND_REEVALUATE, null, null, meeting, bob, T0.plusSeconds(5400));
        agendaItems.saveAndFlush(agenda);

        standups.saveAndFlush(new Standup(ws, alice, LocalDate.of(2026, 11, 2), "어제", "#12 에러 모양을 모르겠다", T0));
        standups.saveAndFlush(new Standup(ws, bob, LocalDate.of(2026, 11, 2), "어제", "#12 밥의 막힘", T0));

        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN)
                .member(otherWs.getId(), aliceElsewhere.getId(), WorkspaceRole.REPO_ADMIN).session();
        bobSession = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
        instructorSession = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private Submission pr(Workspace workspace, int number, Member author, SubmissionState state) {
        boolean ended = state == SubmissionState.MERGED || state == SubmissionState.CLOSED;
        return submissions.saveAndFlush(Submission.builder().workspace(workspace).githubPrNumber(number)
                .title("PR " + number).authorGithubUserId(author.getUser().getGithubUserId()).authorMember(author)
                .state(state).headSha(SHA).reviewRequestsJson("[]").reviewsJson("[]").labelsJson("[]")
                .githubCreatedAt(T0).githubUpdatedAt(T0)
                .mergedAt(state == SubmissionState.MERGED ? T0.plusSeconds(9000) : null)
                .closedAt(ended ? T0.plusSeconds(9000) : null).stateChangedAt(T0).syncedAt(T0).build());
    }

    private String cardsPath(Member member) {
        return "/api/workspaces/" + Ids.toApi(member.getWorkspace().getId()) + "/members/" + Ids.toApi(member.getId())
                + "/decision-cards";
    }

    /** CSRF 쿠키 → 헤더, 허용 출처(CONTRACTS.md 「6」). */
    private ResultActions write(MockHttpServletRequestBuilder request, MockHttpSession session, String json)
            throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        return mvc.perform(request.session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private ResultActions create(Member member, MockHttpSession session, Submission submission) throws Exception {
        return write(post(cardsPath(member)), session,
                "{\"submissionId\":\"" + Ids.toApi(submission.getId()) + "\"}");
    }

    private static String updateBody(String learning, boolean confirmed) {
        String learningJson = learning == null ? "null" : "\"" + learning + "\"";
        return "{\"cells\":{\"goal\":\"고친 목표\",\"initialApproach\":\"컨트롤러마다 try-catch\",\"feedbackReceived\":null,"
                + "\"meetingDecision\":null,\"finalChange\":\"전역 예외 처리\",\"rationale\":null,\"blockedMoment\":null,"
                + "\"learning\":" + learningJson + ",\"source\":null},\"confirmed\":" + confirmed + "}";
    }

    private DecisionCard savedCard() {
        return cards.saveAndFlush(new DecisionCard(alice, mergedPr, DecisionCardCells.EMPTY, T0));
    }

    // ---- 만들기 ----

    @Test
    void theAuthorMakesACardFromAMergedPrFilledFromTheAppsMaterials() throws Exception {
        String body = create(alice, aliceSession, mergedPr)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.memberId").value(Ids.toApi(alice.getId())))
                .andExpect(jsonPath("$.submissionId").value(Ids.toApi(mergedPr.getId())))
                .andExpect(jsonPath("$.cells.goal").value("GitHub 로그인"))
                .andExpect(jsonPath("$.cells.initialApproach").value(nullValue()))
                .andExpect(jsonPath("$.cells.feedbackReceived").value("비추천: 실패 응답 모양이 계약과 달라요"))
                .andExpect(jsonPath("$.cells.meetingDecision")
                        .value("에러 응답을 계약 모양으로 맞추고 다시 평가받는다\n배운 점: 에러 응답은 한 곳에서 정한다"))
                .andExpect(jsonPath("$.cells.rationale").value("전역 예외 처리 한 곳으로 가자"))
                // 본인 스탠드업만 — 밥의 "#12 밥의 막힘"은 들어가지 않는다
                .andExpect(jsonPath("$.cells.blockedMoment").value("2026-11-02: #12 에러 모양을 모르겠다"))
                .andExpect(jsonPath("$.cells.source").value(endsWith("/issues/12")))
                .andExpect(jsonPath("$.confirmed").value(false))
                .andExpect(jsonPath("$.followUpRequested").value(false))
                .andExpect(jsonPath("$.followUpQuestions.length()").value(0))
                .andReturn().getResponse().getContentAsString();

        JsonNode card = ContractShape.readTree(body);
        assertThat(card.get("cells").get("source").asString()).startsWith("https://github.com/samdoryu/a/pull/15\n");
        for (String empty : List.of("initialApproach", "finalChange", "learning")) {
            assertThat(card.get("cells").get(empty).isNull()).as(empty).isTrue();
        }
        // 계약 ② — 예시 카드와 같은 키(최상위 · cells)
        JsonNode example = ContractShape.readTree(Files.readString(
                Path.of("..", "contract", "examples", "report", "retro-report.json"))).get("decisionCards").get(0);
        assertThat(card.propertyNames()).containsExactlyInAnyOrderElementsOf(example.propertyNames());
        assertThat(card.get("cells").propertyNames())
                .containsExactlyInAnyOrderElementsOf(example.get("cells").propertyNames());
        ContractShape.assertCommonRules(card);
        // 익명성 — 평가자(밥)의 GitHub 이름이 응답 어디에도 없다(카드에는 사람 정보가 꼬리질문 강사뿐)
        assertThat(body).doesNotContain("bob");
    }

    @Test
    void createRulesFollowTheContract() throws Exception {
        create(alice, aliceSession, openPr)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("conflict"));
        create(alice, aliceSession, bobsPr)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("forbidden_role"));
        // 다른 사무실의 PR ID를 내 사무실 경로에 — 존재를 숨긴다
        create(alice, aliceSession, otherWorkspacePr)
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("not_found"));
        write(post(cardsPath(alice)), aliceSession, "{\"submissionId\":\"abc\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("invalid"));

        create(alice, aliceSession, mergedPr).andExpect(status().isCreated());
        create(alice, aliceSession, mergedPr)
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("conflict"));
        assertThat(cards.findByMemberIdOrderByCreatedAtDescIdDesc(alice.getId())).hasSize(1);
    }

    @Test
    void onlyTheOwnerCreates() throws Exception {
        create(alice, bobSession, mergedPr)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("forbidden_role"));
        create(alice, instructorSession, mergedPr)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("forbidden_role"));
        // 다른 사무실의 팀원 ID를 경로에 — 404
        write(post(cardsPath(ws, aliceElsewhere)), aliceSession,
                "{\"submissionId\":\"" + Ids.toApi(mergedPr.getId()) + "\"}")
                .andExpect(status().isNotFound());
        assertThat(cards.findAll()).isEmpty();
    }

    private String cardsPath(Workspace workspace, Member member) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId()) + "/members/" + Ids.toApi(member.getId())
                + "/decision-cards";
    }

    // ---- 읽기 ----

    @Test
    void theOwnerAndTheAssignedInstructorReadAnotherStudentCannot() throws Exception {
        DecisionCard older = savedCard();
        DecisionCard newer = cards.saveAndFlush(new DecisionCard(alice, bobsPr, DecisionCardCells.EMPTY,
                T0.plusSeconds(60)));

        for (MockHttpSession session : List.of(aliceSession, instructorSession)) {
            mvc.perform(get(cardsPath(alice)).session(session))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].id").value(Ids.toApi(newer.getId())))
                    .andExpect(jsonPath("$[1].id").value(Ids.toApi(older.getId())));
        }
        mvc.perform(get(cardsPath(alice)).session(bobSession))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("forbidden_role"));
    }

    // ---- 고치기 ----

    @Test
    void theOwnerEditsAndConfirmsWithALearning() throws Exception {
        DecisionCard card = savedCard();
        String path = cardsPath(alice) + "/" + Ids.toApi(card.getId());

        write(put(path), aliceSession, updateBody(null, true))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("invalid"));
        write(put(path), aliceSession, updateBody("   ", true))
                .andExpect(status().isBadRequest());

        write(put(path), aliceSession, updateBody("에러 응답은 한 곳에서", true))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cells.goal").value("고친 목표"))
                .andExpect(jsonPath("$.cells.initialApproach").value("컨트롤러마다 try-catch"))
                .andExpect(jsonPath("$.cells.learning").value("에러 응답은 한 곳에서"))
                .andExpect(jsonPath("$.confirmed").value(true))
                .andExpect(jsonPath("$.confirmedAt").isNotEmpty());

        write(put(path), aliceSession, updateBody("에러 응답은 한 곳에서", false))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confirmed").value(false))
                .andExpect(jsonPath("$.confirmedAt").value(nullValue()));
    }

    @Test
    void editRulesFollowTheContract() throws Exception {
        DecisionCard card = savedCard();
        String path = cardsPath(alice) + "/" + Ids.toApi(card.getId());

        write(put(path), bobSession, updateBody("배움", true))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("forbidden_role"));
        write(put(path), instructorSession, updateBody("배움", true))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("forbidden_role"));
        // 다른 팀원 경로로 같은 카드 ID — 404
        write(put(cardsPath(bob) + "/" + Ids.toApi(card.getId())), bobSession, updateBody("배움", true))
                .andExpect(status().isNotFound());
        write(put(path), aliceSession, updateBody("a".repeat(2001), false))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("invalid"));

        assertThat(cards.findById(card.getId()).orElseThrow().getCells()).isEqualTo(DecisionCardCells.EMPTY);
    }

    // ---- #59 꼬리질문 요청 · 쓰기 ----

    @Test
    void theOwnerRequestsAFollowUpAndTheAssignedInstructorWritesAQuestion() throws Exception {
        DecisionCard card = savedCard();
        String path = cardsPath(alice) + "/" + Ids.toApi(card.getId());

        String requested = write(post(path + "/follow-up-request"), aliceSession, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.followUpRequested").value(true))
                .andExpect(jsonPath("$.followUpRequestedAt").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        String requestedAt = ContractShape.readTree(requested).get("followUpRequestedAt").asString();
        // 다시 요청해도 처음 요청 시각 그대로
        write(post(path + "/follow-up-request"), aliceSession, "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.followUpRequestedAt").value(requestedAt));

        String body = write(post(path + "/follow-up-questions"), instructorSession,
                "{\"body\":\"이 결정을 다시 한다면 무엇을 바꾸겠어요?\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.body").value("이 결정을 다시 한다면 무엇을 바꾸겠어요?"))
                .andExpect(jsonPath("$.instructor.githubLogin").value("instructor"))
                .andReturn().getResponse().getContentAsString();

        // 계약 ② — 「15」 FollowUpQuestionDto · 「1」 UserRef
        JsonNode question = ContractShape.readTree(body);
        assertThat(question.propertyNames()).containsExactlyInAnyOrder("id", "instructor", "body", "createdAt");
        assertThat(question.get("instructor").propertyNames()).containsExactlyInAnyOrder(
                "userId", "githubLogin", "displayName", "avatarUrl");
        ContractShape.assertCommonRules(question);

        // 카드에 따로 붙는다 — 본인 · 강사 모두 목록에서 본다. 9칸 · 수정 시각은 그대로
        for (MockHttpSession session : List.of(aliceSession, instructorSession)) {
            mvc.perform(get(cardsPath(alice)).session(session))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].followUpQuestions.length()").value(1))
                    .andExpect(jsonPath("$[0].followUpQuestions[0].id").value(question.get("id").asString()))
                    .andExpect(jsonPath("$[0].updatedAt").value("2026-11-01T00:00:00Z"));
        }
        assertThat(cards.findById(card.getId()).orElseThrow().getCells()).isEqualTo(DecisionCardCells.EMPTY);
    }

    @Test
    void followUpRulesFollowTheContract() throws Exception {
        DecisionCard card = savedCard();
        String path = cardsPath(alice) + "/" + Ids.toApi(card.getId());
        String question = "{\"body\":\"질문\"}";

        // 요청 안 된 카드 — 강사도 403
        write(post(path + "/follow-up-questions"), instructorSession, question)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("forbidden_role"));
        // 요청은 본인만 — 강사(InstructorWriteGuard) · 다른 학생 403
        write(post(path + "/follow-up-request"), instructorSession, "")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("forbidden_role"));
        write(post(path + "/follow-up-request"), bobSession, "")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("forbidden_role"));

        write(post(path + "/follow-up-request"), aliceSession, "").andExpect(status().isOk());

        // 꼬리질문은 강사가 직접 쓴다 — 본인 · 다른 학생 403
        write(post(path + "/follow-up-questions"), aliceSession, question)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("forbidden_role"));
        write(post(path + "/follow-up-questions"), bobSession, question)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("forbidden_role"));
        // 길이 1~1000자
        write(post(path + "/follow-up-questions"), instructorSession, "{\"body\":\"\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("invalid"));
        write(post(path + "/follow-up-questions"), instructorSession, "{\"body\":\"" + "a".repeat(1001) + "\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("invalid"));
        // 다른 팀원 경로로 같은 카드 ID — 404
        write(post(cardsPath(bob) + "/" + Ids.toApi(card.getId()) + "/follow-up-questions"), instructorSession,
                question)
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("not_found"));

        assertThat(followUpQuestions.findAll()).isEmpty();
    }
}

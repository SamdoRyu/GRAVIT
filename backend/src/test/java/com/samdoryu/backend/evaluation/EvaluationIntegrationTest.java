package com.samdoryu.backend.evaluation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;
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
import com.samdoryu.backend.evaluation.domain.Evaluation;
import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.domain.Verdict;
import com.samdoryu.backend.evaluation.repository.EvaluationRepository;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
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
import tools.jackson.databind.JsonNode;

/**
 * #19 · #20 PR 평가 — 실제 Security · MVC · MySQL(CONTRACTS_API 「9」, CONTRACTS.md 「3」 평가 회차 · 「5」 익명성 ·
 * 「6」 검사 순서). 세션은 {@link TestLogin}, 쓰기는 화면과 같은 CSRF 쿠키 → 헤더 + Origin. 테스트마다 트랜잭션을 되돌린다.
 * 계약 테스트 ② — 실제 응답 ↔ Snapshot 예시의 {@code submissions[0].currentRound}.
 */
@SpringBootTest(properties = {
        "app.origin=" + EvaluationIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + EvaluationIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class EvaluationIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-05T01:20:00Z");
    private static final String SHA = "0123456789abcdef0123456789abcdef01234567";

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired SubmissionRepository submissions;
    @Autowired EvaluationRoundRepository rounds;
    @Autowired EvaluationRepository evaluations;

    private Workspace ws;
    private Workspace otherWs;
    private AppUser carolUser;
    private Member alice;
    private Submission pr;
    private EvaluationRound oldRound;
    private EvaluationRound currentRound;
    private MockHttpSession aliceSession;
    private MockHttpSession bobSession;
    private MockHttpSession carolSession;
    private MockHttpSession instructorSession;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        carolUser = users.saveAndFlush(AppUser.github(1003L, "carol", "캐럴", null));
        AppUser instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, aliceUser, T0));
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), null));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        Member bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, T0));
        Member carol = members.saveAndFlush(Member.collaborator(ws, carolUser, 2, false, T0));
        Member bobElsewhere = members.saveAndFlush(Member.collaborator(otherWs, bobUser, 0, false, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, T0));

        // 앨리스의 PR — 1회차(지난) · 2회차(현재, 같은 headSha — 회의 재평가)
        pr = submissions.saveAndFlush(submission(ws, 5, SubmissionState.OPEN, alice, 1001L));
        oldRound = rounds.saveAndFlush(new EvaluationRound(pr, 1, SHA, RoundOpenedReason.NEW_PR, T0));
        oldRound.close(T0.plusSeconds(60));
        currentRound = rounds.saveAndFlush(
                new EvaluationRound(pr, 2, SHA, RoundOpenedReason.MEETING_REEVALUATE, T0.plusSeconds(60)));
        evaluations.saveAndFlush(new Evaluation(oldRound, bobUser, Verdict.NOT_RECOMMEND, "지난 회차 의견", T0));

        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
        bobSession = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT)
                .member(otherWs.getId(), bobElsewhere.getId(), WorkspaceRole.PARTICIPANT).session();
        carolSession = TestLogin.githubUser(carolUser.getId(), 1003L)
                .member(ws.getId(), carol.getId(), WorkspaceRole.PARTICIPANT).session();
        instructorSession = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private static Submission submission(Workspace workspace, int number, SubmissionState state, Member author,
            Long authorGithubUserId) {
        return Submission.builder().workspace(workspace).githubPrNumber(number).title("PR " + number)
                .authorGithubUserId(authorGithubUserId).authorMember(author).state(state).headSha(SHA)
                .reviewRequestsJson("[]").reviewsJson("[]").labelsJson("[]").githubCreatedAt(T0)
                .githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build();
    }

    private String base(Workspace workspace, Submission submission) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId()) + "/submissions/" + Ids.toApi(submission.getId());
    }

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private ResultActions evaluate(Workspace workspace, Submission submission, MockHttpSession session, String body)
            throws Exception {
        String token = csrfToken();
        return mvc.perform(put(base(workspace, submission) + "/evaluations/mine").session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String body(EvaluationRound round, String verdict, String reason) {
        return "{\"roundId\":\"" + Ids.toApi(round.getId()) + "\",\"verdict\":\"" + verdict + "\",\"reason\":\""
                + reason + "\"}";
    }

    private ResultActions listRounds(MockHttpSession session) throws Exception {
        return mvc.perform(get(base(ws, pr) + "/rounds").session(session));
    }

    @Test
    void memberEvaluatesTheCurrentRoundAndCanChangeIt() throws Exception {
        String response = evaluate(ws, pr, bobSession, body(currentRound, "not_recommend", "  실패 응답 모양이 계약과 달라요  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(Ids.toApi(currentRound.getId())))
                .andExpect(jsonPath("$.roundNumber").value(2))
                .andExpect(jsonPath("$.headSha").value(SHA))
                .andExpect(jsonPath("$.openedReason").value("meeting_reevaluate"))
                .andExpect(jsonPath("$.recommendCount").value(0))
                .andExpect(jsonPath("$.notRecommendCount").value(1))
                .andExpect(jsonPath("$.reasons[0].reason").value("실패 응답 모양이 계약과 달라요"))
                .andExpect(jsonPath("$.myEvaluation.verdict").value("not_recommend"))
                .andExpect(jsonPath("$.myEvaluation.reason").value("실패 응답 모양이 계약과 달라요"))
                .andExpect(jsonPath("$.canEvaluate").value(true))
                .andReturn().getResponse().getContentAsString();

        JsonNode actual = ContractShape.readTree(response);
        JsonNode example = ContractShape.readExample("workspace", "workspace-snapshot.json")
                .get("submissions").get(0).get("currentRound");
        ContractShape.assertSameShape(example, actual);
        ContractShape.assertCommonRules(actual);
        assertThat(actual.get("reasons").get(0).propertyNames()).containsExactlyInAnyOrder("verdict", "reason");

        // 같은 회차를 다시 평가하면 같은 행을 고친다(1인 1회)
        evaluate(ws, pr, bobSession, body(currentRound, "recommend", "고친 뒤 좋아졌어요"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recommendCount").value(1))
                .andExpect(jsonPath("$.notRecommendCount").value(0))
                .andExpect(jsonPath("$.myEvaluation.verdict").value("recommend"));
        em.flush();
        em.clear();
        assertThat(evaluations.findByRoundIdOrderByIdAsc(currentRound.getId())).singleElement()
                .satisfies(saved -> assertThat(saved.getReason()).isEqualTo("고친 뒤 좋아졌어요"));
        // 지난 회차 평가는 그대로 남는다
        assertThat(evaluations.findByRoundIdOrderByIdAsc(oldRound.getId())).hasSize(1);
    }

    @Test
    void roundsAreListedNewestFirstWithoutEvaluatorsAndOnlyCurrentCountsAsOpen() throws Exception {
        evaluate(ws, pr, carolSession, body(currentRound, "recommend", "세션 만료 처리가 명확해요"))
                .andExpect(status().isOk());

        String response = listRounds(bobSession)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].roundNumber").value(contains(2, 1)))
                .andExpect(jsonPath("$[0].recommendCount").value(1))
                .andExpect(jsonPath("$[0].myEvaluation").value(nullValue()))
                .andExpect(jsonPath("$[0].canEvaluate").value(true))
                .andExpect(jsonPath("$[0].closedAt").value(nullValue()))
                .andExpect(jsonPath("$[1].notRecommendCount").value(1))
                .andExpect(jsonPath("$[1].myEvaluation.reason").value("지난 회차 의견"))
                .andExpect(jsonPath("$[1].canEvaluate").value(false))
                .andExpect(jsonPath("$[1].closedAt").value("2026-11-05T01:21:00Z"))
                .andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain("carol", "evaluator");
        ContractShape.assertCommonRules(ContractShape.readTree(response));

        // 강사는 읽기만 — 평가할 수 없다고 보인다
        listRounds(instructorSession)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].canEvaluate").value(false))
                .andExpect(jsonPath("$[0].myEvaluation").value(nullValue()));
        // 작성자도 평가할 수 없다고 보인다
        listRounds(aliceSession).andExpect(jsonPath("$[0].canEvaluate").value(false));
    }

    @Test
    void snapshotCarriesTheCurrentRoundSummary() throws Exception {
        evaluate(ws, pr, carolSession, body(currentRound, "recommend", "세션 만료 처리가 명확해요"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/snapshot").session(carolSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.submissions[0].currentRound.id").value(Ids.toApi(currentRound.getId())))
                .andExpect(jsonPath("$.submissions[0].currentRound.recommendCount").value(1))
                .andExpect(jsonPath("$.submissions[0].currentRound.myEvaluation.reason").value("세션 만료 처리가 명확해요"))
                .andExpect(jsonPath("$.submissions[0].currentRound.canEvaluate").value(true));
        mvc.perform(get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/snapshot").session(aliceSession))
                .andExpect(jsonPath("$.submissions[0].currentRound.myEvaluation").value(nullValue()))
                .andExpect(jsonPath("$.submissions[0].currentRound.canEvaluate").value(false));
    }

    @Test
    void authorAndInstructorCannotEvaluate() throws Exception {
        evaluate(ws, pr, aliceSession, body(currentRound, "recommend", "제 PR 좋아요"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        evaluate(ws, pr, instructorSession, body(currentRound, "recommend", "좋아요"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
    }

    /** 작성자 팀원 매칭이 비어 있어도 GitHub 사용자 ID가 같으면 작성자다. */
    @Test
    void authorIsRecognisedByGithubUserIdEvenWithoutAMemberMatch() throws Exception {
        Submission unmatched = submissions.saveAndFlush(submission(ws, 6, SubmissionState.OPEN, null, 1003L));
        EvaluationRound round = rounds.saveAndFlush(new EvaluationRound(unmatched, 1, SHA, RoundOpenedReason.NEW_PR, T0));

        evaluate(ws, unmatched, carolSession, body(round, "recommend", "좋아요"))
                .andExpect(status().isForbidden());
    }

    @Test
    void pastRoundAndClosedPullRequestsConflict() throws Exception {
        evaluate(ws, pr, bobSession, body(oldRound, "recommend", "지난 회차에"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));

        Submission merged = submissions.saveAndFlush(submission(ws, 7, SubmissionState.MERGED, alice, 1001L));
        EvaluationRound mergedRound = rounds.saveAndFlush(
                new EvaluationRound(merged, 1, SHA, RoundOpenedReason.NEW_PR, T0));
        evaluate(ws, merged, bobSession, body(mergedRound, "recommend", "머지된 뒤에"))
                .andExpect(status().isConflict());

        // 회차가 아직 없는 PR — 현재 회차가 아니다
        Submission noRound = submissions.saveAndFlush(submission(ws, 8, SubmissionState.DRAFT, alice, 1001L));
        evaluate(ws, noRound, bobSession, body(currentRound, "recommend", "회차 전에"))
                .andExpect(status().isConflict());
        assertThat(evaluations.findByRoundIdOrderByIdAsc(currentRound.getId())).isEmpty();
    }

    @Test
    void reasonIsRequiredForBothVerdictsAndInputIsValidated() throws Exception {
        evaluate(ws, pr, bobSession, body(currentRound, "recommend", "   "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        evaluate(ws, pr, bobSession, body(currentRound, "not_recommend", ""))
                .andExpect(status().isBadRequest());
        evaluate(ws, pr, bobSession, body(currentRound, "recommend", "가".repeat(201)))
                .andExpect(status().isBadRequest());
        evaluate(ws, pr, bobSession, "{\"roundId\":\"" + Ids.toApi(currentRound.getId())
                + "\",\"verdict\":\"recommend\"}")
                .andExpect(status().isBadRequest());
        evaluate(ws, pr, bobSession, body(currentRound, "clean", "좋아요"))
                .andExpect(status().isBadRequest());
        evaluate(ws, pr, bobSession, "{\"roundId\":\"abc\",\"verdict\":\"recommend\",\"reason\":\"좋아요\"}")
                .andExpect(status().isBadRequest());
        // 앞뒤 공백을 뺀 200자는 된다
        evaluate(ws, pr, bobSession, body(currentRound, "recommend", " " + "가".repeat(200) + " "))
                .andExpect(status().isOk());
    }

    @Test
    void otherWorkspacesPullRequestIsNotFound() throws Exception {
        // 밥은 두 사무실 모두 팀원 — 내 사무실 PR을 다른 사무실 경로로 넣는 IDOR
        evaluate(otherWs, pr, bobSession, body(currentRound, "recommend", "좋아요"))
                .andExpect(status().isNotFound());
        mvc.perform(get(base(otherWs, pr) + "/rounds").session(bobSession))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/submissions/abc/rounds").session(bobSession))
                .andExpect(status().isNotFound());
    }

    @Test
    void writesNeedCsrf() throws Exception {
        mvc.perform(put(base(ws, pr) + "/evaluations/mine").session(bobSession)
                        .header(HttpHeaders.ORIGIN, ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content(body(currentRound, "recommend", "좋아요")))
                .andExpect(status().isForbidden());
        assertThat(evaluations.findByRoundIdOrderByIdAsc(currentRound.getId())).isEmpty();
    }
}

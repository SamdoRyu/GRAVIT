package com.samdoryu.backend;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.PrDecision;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.report.domain.ReportKind;
import com.samdoryu.backend.report.domain.RetroReport;
import com.samdoryu.backend.report.repository.RetroReportRepository;
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
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
import tools.jackson.databind.node.ObjectNode;

/**
 * #29 사람별 평가 합계 없음 · 평가자 익명(FR-LRN-09 · CONTRACTS.md 「5」 익명성) — 실제 Security · MVC · MySQL.
 * 캐럴이 평가한 뒤, 평가가 실리는 지금 있는 응답(회차 목록 · Snapshot의 현재 회차 · 안건 · 기술 결정 카드 · 회고 리포트 JSON ·
 * 마크다운 · 학습 타임라인)을 작성자 · 다른 팀원 · 강사로 읽어 캐럴을 가리키는 값(로그인 · 이름 · GitHub 사용자 ID · 팀원 ID ·
 * 사용자 ID)이 없는지 본다. Snapshot의 팀원 명단({@code members})은 평가와 무관한 명단이라 뺀다. 강사 요청함은 그 API가 생길 때 더한다.
 * 사람별 합계 · 순위 필드 이름은 {@link NoRankingFieldsTest}가 본다.
 */
@SpringBootTest(properties = {
        "app.origin=" + EvaluatorAnonymityIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + EvaluatorAnonymityIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class EvaluatorAnonymityIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final long EVALUATOR_GITHUB_ID = 7303L;
    private static final Instant T0 = Instant.parse("2026-11-01T00:00:00Z");
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
    @Autowired AgendaItemRepository agendaItems;
    @Autowired RetroReportRepository reports;

    private Workspace ws;
    private Member alice;
    private AppUser carolUser;
    private Member carol;
    private Submission pr;
    private EvaluationRound round;
    private MockHttpSession aliceSession;
    private MockHttpSession bobSession;
    private MockHttpSession carolSession;
    private MockHttpSession instructorSession;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        carolUser = users.saveAndFlush(AppUser.github(EVALUATOR_GITHUB_ID, "carol", "캐럴", null));
        AppUser instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 10, 27), LocalDate.of(2026, 11, 17), null));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        Member bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, T0));
        carol = members.saveAndFlush(Member.collaborator(ws, carolUser, 2, false, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, T0));

        pr = submissions.saveAndFlush(prValues(null));
        round = rounds.saveAndFlush(new EvaluationRound(pr, 1, SHA, RoundOpenedReason.NEW_PR, T0));

        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
        bobSession = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
        carolSession = TestLogin.githubUser(carolUser.getId(), EVALUATOR_GITHUB_ID)
                .member(ws.getId(), carol.getId(), WorkspaceRole.PARTICIPANT).session();
        instructorSession = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    /** 앨리스의 PR 5 — {@code mergedAt}이 없으면 열림, 있으면 머지(동기화로 덮어쓸 임시 값). */
    private Submission prValues(Instant mergedAt) {
        return Submission.builder().workspace(ws).githubPrNumber(5).title("PR 5")
                .authorGithubUserId(1001L).authorMember(alice)
                .state(mergedAt == null ? SubmissionState.OPEN : SubmissionState.MERGED).headSha(SHA)
                .reviewRequestsJson("[]").reviewsJson("[]").labelsJson("[]").githubCreatedAt(T0)
                .githubUpdatedAt(T0).mergedAt(mergedAt).closedAt(mergedAt)
                .stateChangedAt(mergedAt == null ? T0 : mergedAt).syncedAt(T0).build();
    }

    @Test
    void noResponseCarriesTheEvaluator() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        String workspacePath = "/api/workspaces/" + Ids.toApi(ws.getId());
        send(put(workspacePath + "/submissions/" + Ids.toApi(pr.getId()) + "/evaluations/mine"), carolSession, token,
                "{\"roundId\":\"" + Ids.toApi(round.getId())
                        + "\",\"verdict\":\"not_recommend\",\"reason\":\"세션 만료 처리가 빠졌어요\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notRecommendCount").value(1));
        // 카드는 머지 · 닫힌 PR로만 만든다 — 평가 뒤 머지된 것으로 동기화
        submissions.findById(pr.getId()).orElseThrow().overwriteFrom(prValues(T0.plusSeconds(150)));

        AgendaItem agenda = AgendaItem.forSubmission(ws, pr, round.getId(), "PR 5 비추천 이유 논의", null, null, null,
                alice, T0.plusSeconds(60));
        agenda.decide("세션 만료를 고친 뒤 머지", "만료 처리를 먼저 정한다", PrDecision.MERGE_AS_IS, null, null, null, alice,
                T0.plusSeconds(120));
        agendaItems.saveAndFlush(agenda);
        RetroReport report = reports.saveAndFlush(new RetroReport(alice, ReportKind.FINAL, T0.plusSeconds(180)));
        em.flush();
        em.clear();

        // 앨리스가 카드를 만들면 받은 평가 칸에 이유가 옮겨지고(평가자 없음), 배운 점을 써서 확인하면 리포트에도 실린다
        String cardsPath = workspacePath + "/members/" + Ids.toApi(alice.getId()) + "/decision-cards";
        ObjectNode card = (ObjectNode) ContractShape.readTree(send(post(cardsPath), aliceSession, token,
                "{\"submissionId\":\"" + Ids.toApi(pr.getId()) + "\"}")
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(card.get("cells").get("feedbackReceived").asString()).contains("세션 만료 처리가 빠졌어요");
        assertNoEvaluator(card);
        ((ObjectNode) card.get("cells")).put("learning", "만료 처리를 먼저 정한다");
        send(put(cardsPath + "/" + card.get("id").asString()), aliceSession, token,
                "{\"cells\":" + card.get("cells") + ",\"confirmed\":true}")
                .andExpect(status().isOk());
        em.flush();
        em.clear();

        String roundsPath = workspacePath + "/submissions/" + Ids.toApi(pr.getId()) + "/rounds";
        String reportPath = workspacePath + "/members/" + Ids.toApi(alice.getId()) + "/reports/"
                + Ids.toApi(report.getId());
        for (MockHttpSession reader : List.of(aliceSession, bobSession, instructorSession)) {
            String roundsJson = read(roundsPath, reader);
            assertThat(roundsJson).contains("세션 만료 처리가 빠졌어요"); // 이유는 실리고 평가자는 없다
            assertNoEvaluator(ContractShape.readTree(roundsJson));

            ObjectNode snapshot = (ObjectNode) ContractShape.readTree(read(workspacePath + "/snapshot", reader));
            assertThat(snapshot.get("agendaItems")).hasSize(1);
            snapshot.remove("members");
            assertNoEvaluator(snapshot);
        }
        for (MockHttpSession reader : List.of(aliceSession, instructorSession)) {
            String timelineJson = read(workspacePath + "/members/" + Ids.toApi(alice.getId()) + "/timeline", reader);
            assertThat(timelineJson).contains("세션 만료 처리가 빠졌어요");
            assertNoEvaluator(ContractShape.readTree(timelineJson));

            String cardsJson = read(cardsPath, reader);
            assertThat(cardsJson).contains("세션 만료 처리가 빠졌어요");
            assertNoEvaluator(ContractShape.readTree(cardsJson));

            JsonNode reportJson = ContractShape.readTree(read(reportPath, reader));
            assertThat(reportJson.get("decisionCards")).hasSize(1);
            assertNoEvaluator(reportJson);
            String markdown = read(reportPath + "/markdown", reader);
            assertThat(markdown).contains("세션 만료를 고친 뒤 머지", "세션 만료 처리가 빠졌어요")
                    .doesNotContain("carol", "캐럴", String.valueOf(EVALUATOR_GITHUB_ID));
        }
    }

    private ResultActions send(MockHttpServletRequestBuilder request, MockHttpSession session, String token,
            String body) throws Exception {
        return mvc.perform(request.session(session).cookie(new Cookie("XSRF-TOKEN", token))
                .header("X-XSRF-TOKEN", token).header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String read(String path, MockHttpSession session) throws Exception {
        return mvc.perform(get(path).session(session)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    /** 이름 · 로그인 · GitHub 사용자 ID는 글자로, 팀원 ID · 사용자 ID는 그 값을 담는 칸({@code …MemberId(s)} · {@code …UserId})에서 찾는다. */
    private void assertNoEvaluator(JsonNode response) {
        assertThat(response.toString()).doesNotContain("carol", "캐럴", String.valueOf(EVALUATOR_GITHUB_ID));
        List<String> personIds = new ArrayList<>();
        collectPersonIds(response, null, personIds);
        assertThat(personIds).doesNotContain(Ids.toApi(carol.getId()), Ids.toApi(carolUser.getId()));
    }

    private static void collectPersonIds(JsonNode node, String fieldName, List<String> out) {
        String name = fieldName == null ? "" : fieldName.toLowerCase(Locale.ROOT);
        boolean personIdField = name.endsWith("memberid") || name.endsWith("memberids") || name.endsWith("userid");
        if (node.isObject()) {
            for (Map.Entry<String, JsonNode> entry : node.properties()) {
                collectPersonIds(entry.getValue(), entry.getKey(), out);
            }
        } else if (node.isArray()) {
            for (JsonNode element : node) {
                collectPersonIds(element, fieldName, out);
            }
        } else if (personIdField && node.isString()) {
            out.add(node.asString());
        }
    }
}

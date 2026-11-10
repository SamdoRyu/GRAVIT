package com.samdoryu.backend.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.report.domain.DecisionCard;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import com.samdoryu.backend.report.repository.DecisionCardRepository;
import com.samdoryu.backend.report.repository.FollowUpQuestionRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * #44 FR-REP-10 · NFR-06 · P5 — 기술 결정 카드와 강사 꼬리질문은 본인과 지정된 강사만(CONTRACTS_API 「15」 공통 접근 규칙 ·
 * CONTRACTS.md 「9」 개인 데이터). 실제 Security · MVC · MySQL로 카드 경로 다섯 개 × 행위자를 표로 본다.
 *
 * <pre>
 *                        목록 GET  만들기 POST  고치기 PUT  꼬리질문 요청  꼬리질문 쓰기
 *  본인(앨리스)            200      201          200        200            403
 *  같은 사무실 다른 학생    403      403          403        403            403
 *  지정된 강사             200      403          403        403            201
 *  해제된 강사             404      404          404        404            404
 *  지정된 적 없는 강사      404      404          404        404            404
 *  다른 사무실 팀원         404      404          404        404            404
 *  로그인 안 함            401      401          401        401            401
 * </pre>
 * 지정 · 해제는 세션이 아니라 요청마다 DB에서 읽는다(P13). 거부된 요청 뒤 카드 · 꼬리질문은 그대로다.
 * 면접 질문 · 답(FR-REP-08 · 09)은 v1 후순위라 API가 없다 — v1의 "질문"은 강사 꼬리질문(FR-REP-11)이다.
 * 각 경로의 세부 규칙(409 · 400 등)은 {@code DecisionCardIntegrationTest}, 리포트 경로의 해제 강사는 {@code RetroReportIntegrationTest}.
 */
@SpringBootTest(properties = {
        "app.origin=" + DecisionCardAccessIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + DecisionCardAccessIntegrationTest.INSTRUCTOR_GITHUB_ID + ","
                + DecisionCardAccessIntegrationTest.RELEASED_GITHUB_ID + ","
                + DecisionCardAccessIntegrationTest.NEVER_ASSIGNED_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class DecisionCardAccessIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    static final long RELEASED_GITHUB_ID = 9002L;
    static final long NEVER_ASSIGNED_GITHUB_ID = 9003L;
    private static final Instant T0 = Instant.parse("2026-11-01T00:00:00Z");
    private static final String SHA = "0123456789abcdef0123456789abcdef01234567";

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired SubmissionRepository submissions;
    @Autowired DecisionCardRepository cards;
    @Autowired FollowUpQuestionRepository followUpQuestions;

    private Member alice;
    private Submission cardlessPr;
    private DecisionCard card;
    private String cardsPath;
    private String cardPath;

    private MockHttpSession aliceSession;
    private MockHttpSession bobSession;
    private MockHttpSession instructorSession;
    private MockHttpSession releasedSession;
    private MockHttpSession neverAssignedSession;
    private MockHttpSession outsiderSession;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        AppUser daveUser = users.saveAndFlush(AppUser.github(1004L, "dave", "데이브", null));
        AppUser instructor = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        AppUser released = users.saveAndFlush(AppUser.github(RELEASED_GITHUB_ID, "released", "해제된 강사", null));
        AppUser neverAssigned = users.saveAndFlush(
                AppUser.github(NEVER_ASSIGNED_GITHUB_ID, "stranger", "지정 안 된 강사", null));

        Workspace ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        Workspace otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, daveUser, T0));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        Member bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, T0));
        Member dave = members.saveAndFlush(Member.collaborator(otherWs, daveUser, 0, true, T0));

        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, T0));
        InstructorAssignment releasedAssignment = new InstructorAssignment(ws, RELEASED_GITHUB_ID, aliceUser, T0);
        releasedAssignment.unassign(T0.plusSeconds(60));
        instructorAssignments.saveAndFlush(releasedAssignment);
        // 지정된 적 없는 강사도 다른 사무실에는 지정돼 있다 — 이 사무실 접근과는 상관없다
        instructorAssignments.saveAndFlush(new InstructorAssignment(otherWs, NEVER_ASSIGNED_GITHUB_ID, daveUser, T0));

        Submission carded = mergedPr(ws, 15, alice);
        cardlessPr = mergedPr(ws, 16, alice);
        card = cards.saveAndFlush(new DecisionCard(alice, carded, DecisionCardCells.EMPTY, T0));
        card.requestFollowUp(T0.plusSeconds(30)); // 꼬리질문 쓰기 칸이 "요청 안 됨"이 아니라 역할로 갈리게
        cards.saveAndFlush(card);

        cardsPath = "/api/workspaces/" + Ids.toApi(ws.getId()) + "/members/" + Ids.toApi(alice.getId())
                + "/decision-cards";
        cardPath = cardsPath + "/" + Ids.toApi(card.getId());

        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
        bobSession = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
        instructorSession = TestLogin.githubUser(instructor.getId(), INSTRUCTOR_GITHUB_ID).session();
        releasedSession = TestLogin.githubUser(released.getId(), RELEASED_GITHUB_ID).session();
        neverAssignedSession = TestLogin.githubUser(neverAssigned.getId(), NEVER_ASSIGNED_GITHUB_ID).session();
        outsiderSession = TestLogin.githubUser(daveUser.getId(), 1004L)
                .member(otherWs.getId(), dave.getId(), WorkspaceRole.REPO_ADMIN).session();
    }

    private Submission mergedPr(Workspace workspace, int number, Member author) {
        return submissions.saveAndFlush(Submission.builder().workspace(workspace).githubPrNumber(number)
                .title("PR " + number).authorGithubUserId(author.getUser().getGithubUserId()).authorMember(author)
                .state(SubmissionState.MERGED).headSha(SHA).reviewRequestsJson("[]").reviewsJson("[]")
                .labelsJson("[]").githubCreatedAt(T0).githubUpdatedAt(T0).mergedAt(T0.plusSeconds(600))
                .closedAt(T0.plusSeconds(600)).stateChangedAt(T0).syncedAt(T0).build());
    }

    /** 카드 경로 다섯 개 — 이름 → 요청. 쓰기는 CSRF 쿠키 → 헤더 · 허용 출처를 갖춘다(거부가 CSRF 때문이 아니게). */
    private Map<String, MockHttpServletRequestBuilder> routes() {
        String updateBody = "{\"cells\":{\"goal\":\"바뀐 목표\",\"learning\":\"바뀐 배운 점\"}}";
        return Map.of(
                "목록", get(cardsPath),
                "만들기", write(post(cardsPath), "{\"submissionId\":\"" + Ids.toApi(cardlessPr.getId()) + "\"}"),
                "고치기", write(put(cardPath), updateBody),
                "꼬리질문 요청", write(post(cardPath + "/follow-up-request"), ""),
                "꼬리질문 쓰기", write(post(cardPath + "/follow-up-questions"), "{\"body\":\"이 결정을 다시 한다면?\"}"));
    }

    private MockHttpServletRequestBuilder write(MockHttpServletRequestBuilder request, String body) {
        try {
            String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse()
                    .getHeader(HttpHeaders.SET_COOKIE);
            String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
            return request.cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                    .header(HttpHeaders.ORIGIN, ORIGIN).contentType(MediaType.APPLICATION_JSON).content(body);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private MockHttpServletResponse call(String route, MockHttpSession session) throws Exception {
        MockHttpServletRequestBuilder request = routes().get(route);
        if (session != null) {
            request.session(session);
        }
        return mvc.perform(request).andReturn().getResponse();
    }

    /** 행위자 한 명의 기대 상태 — 경로 이름 → (상태, 에러 code 또는 null). */
    private void assertRow(String actor, MockHttpSession session, Map<String, Integer> expected) throws Exception {
        for (Map.Entry<String, Integer> cell : expected.entrySet()) {
            MockHttpServletResponse response = call(cell.getKey(), session);
            assertThat(response.getStatus()).as("%s — %s", actor, cell.getKey()).isEqualTo(cell.getValue());
            String code = switch (cell.getValue()) {
                case 401 -> "unauthorized";
                case 403 -> "forbidden_role";
                case 404 -> "not_found";
                default -> null;
            };
            if (code != null) {
                assertThat(response.getContentAsString()).as("%s — %s", actor, cell.getKey())
                        .contains("\"code\":\"" + code + "\"");
            }
        }
    }

    private static Map<String, Integer> all(int status) {
        return Map.of("목록", status, "만들기", status, "고치기", status, "꼬리질문 요청", status, "꼬리질문 쓰기", status);
    }

    @Test
    void everyoneButTheOwnerAndTheAssignedInstructorIsRefusedAndNothingChanges() throws Exception {
        assertRow("로그인 안 함", null, all(401));
        assertRow("같은 사무실 다른 학생", bobSession, all(403));
        assertRow("해제된 강사", releasedSession, all(404));
        assertRow("지정된 적 없는 강사", neverAssignedSession, all(404));
        assertRow("다른 사무실 팀원", outsiderSession, all(404));

        // 거부 뒤 그대로 — 카드 하나, 9칸 · 수정 시각 그대로, 꼬리질문 없음
        assertThat(cards.findAll()).singleElement().satisfies(only -> {
            assertThat(only.getId()).isEqualTo(card.getId());
            assertThat(only.getCells()).isEqualTo(DecisionCardCells.EMPTY);
            assertThat(only.getUpdatedAt()).isEqualTo(T0);
        });
        assertThat(followUpQuestions.findAll()).isEmpty();
    }

    @Test
    void theAssignedInstructorReadsAndWritesOnlyFollowUpQuestions() throws Exception {
        assertRow("지정된 강사", instructorSession, Map.of(
                "목록", 200, "만들기", 403, "고치기", 403, "꼬리질문 요청", 403, "꼬리질문 쓰기", 201));

        assertThat(cards.findAll()).singleElement()
                .satisfies(only -> assertThat(only.getCells()).isEqualTo(DecisionCardCells.EMPTY));
        assertThat(followUpQuestions.findAll()).singleElement()
                .satisfies(question -> assertThat(question.getInstructor().getGithubLogin()).isEqualTo("instructor"));
    }

    @Test
    void theOwnerDoesEverythingButWriteFollowUpQuestions() throws Exception {
        assertRow("본인", aliceSession, Map.of(
                "목록", 200, "만들기", 201, "고치기", 200, "꼬리질문 요청", 200, "꼬리질문 쓰기", 403));

        assertThat(cards.findAll()).hasSize(2);
        assertThat(followUpQuestions.findAll()).isEmpty();
    }

    @Test
    void releasingTheInstructorClosesTheCardsAtTheNextRequestInTheSameSession() throws Exception {
        // 지정은 세션에 두지 않는다 — 같은 세션이어도 해제 다음 요청부터 사무실째 404(P13)
        mvc.perform(get(cardsPath).session(instructorSession)).andExpect(jsonPath("$.length()").value(1));
        instructorAssignments.findAll().stream()
                .filter(a -> a.getInstructorGithubUserId() == INSTRUCTOR_GITHUB_ID && a.isCurrent())
                .forEach(a -> a.unassign(T0.plusSeconds(120)));
        instructorAssignments.flush();

        assertRow("방금 해제된 강사", instructorSession, all(404));
        assertThat(followUpQuestions.findAll()).isEmpty();
    }
}

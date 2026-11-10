package com.samdoryu.backend.help;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
import com.samdoryu.backend.help.domain.HelpComment;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.domain.HelpRequestStatus;
import com.samdoryu.backend.help.dto.HelpRequestSummary;
import com.samdoryu.backend.help.repository.HelpCommentRepository;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.help.service.HelpRequestService;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaStatus;
import com.samdoryu.backend.meeting.domain.Standup;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.StandupRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * #47 도움 요청 만들기 · 읽기, #48 코멘트, #49 닫기, #56 강사에게 요청 —실제 Security · MVC · MySQL(CONTRACTS_API 「11」, CONTRACTS.md 「6」 검사 순서).
 * 세션은 {@link TestLogin}, 쓰기는 화면과 같은 CSRF 쿠키 → 헤더 + Origin. 테스트마다 트랜잭션을 되돌린다.
 * 계약 테스트 ② — 실제 응답 ↔ {@code contract/examples/help}.
 */
@SpringBootTest(properties = {
        "app.origin=" + HelpRequestIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + HelpRequestIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class HelpRequestIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-05T01:20:00Z");
    private static final LocalDate DAY = LocalDate.parse("2026-11-05");

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired StandupRepository standups;
    @Autowired AgendaItemRepository agendaItems;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired HelpRequestRepository helpRequests;
    @Autowired HelpCommentRepository helpComments;
    @Autowired HelpRequestService helpRequestService;

    private Workspace ws;
    private Workspace otherWs;
    private AppUser aliceUser;
    private AppUser bobUser;
    private AppUser instructorUser;
    private Member alice;
    private Member bob;
    private Member aliceElsewhere;
    private Standup aliceStandup;
    private Standup bobStandup;
    private Standup otherWsStandup;
    private MockHttpSession aliceSession;
    private MockHttpSession bobSession;
    private MockHttpSession instructorSession;

    @BeforeEach
    void setUp() {
        aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, aliceUser, T0));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, T0));
        aliceElsewhere = members.saveAndFlush(Member.collaborator(otherWs, aliceUser, 0, true, T0));
        aliceStandup = standups.saveAndFlush(new Standup(ws, alice, DAY, "로그인 붙임", "세션이 끊김", T0));
        bobStandup = standups.saveAndFlush(new Standup(ws, bob, DAY, "", "막힘", T0));
        otherWsStandup = standups.saveAndFlush(new Standup(otherWs, aliceElsewhere, DAY, "", "막힘", T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, T0));

        // 앨리스는 ws에서만 팀원으로 로그인한 세션 — otherWs 역할은 세션에 없다.
        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
        bobSession = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
        instructorSession = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private String base(Workspace workspace) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId()) + "/help-requests";
    }

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private ResultActions create(Workspace workspace, MockHttpSession session, String body) throws Exception {
        String token = csrfToken();
        return mvc.perform(post(base(workspace)).session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String body(String content, Standup fromStandup) {
        String standupId = fromStandup == null ? "null" : "\"" + Ids.toApi(fromStandup.getId()) + "\"";
        return "{\"content\":\"" + content + "\",\"fromStandupId\":" + standupId + "}";
    }

    private ResultActions comment(Workspace workspace, HelpRequest helpRequest, MockHttpSession session, String content)
            throws Exception {
        String token = csrfToken();
        return mvc.perform(post(base(workspace) + "/" + Ids.toApi(helpRequest.getId()) + "/comments").session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"" + content + "\"}"));
    }

    private HelpRequestStatus statusOf(HelpRequest helpRequest) {
        flushAndClear();
        return helpRequests.findById(helpRequest.getId()).orElseThrow().getStatus();
    }

    /** 상태 · 강사 요청을 바꾸는 API는 다른 Issue(#49 · #51 · #56) 몫이라 테스트 준비는 DB로 한다. */
    private void setColumn(HelpRequest helpRequest, String assignment) {
        em.flush();
        em.createNativeQuery("update help_request set " + assignment + " where id = ?1")
                .setParameter(1, helpRequest.getId()).executeUpdate();
        em.clear();
    }

    /** 영속성 컨텍스트를 비워 다음 읽기가 DB(계산 열 포함)에서 오게 한다. */
    private void flushAndClear() {
        em.flush();
        em.clear();
    }

    @Test
    void memberCreatesOpenHelpRequestFromOwnStandup() throws Exception {
        String response = create(ws, aliceSession, body("세션이 끊겨요", aliceStandup))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.requesterMemberId").value(Ids.toApi(alice.getId())))
                .andExpect(jsonPath("$.status").value("open"))
                .andExpect(jsonPath("$.isAgendaCandidate").value(false))
                .andExpect(jsonPath("$.instructorRequested").value(false))
                .andExpect(jsonPath("$.fromStandupId").value(Ids.toApi(aliceStandup.getId())))
                .andExpect(jsonPath("$.commentCount").value(0))
                .andReturn().getResponse().getContentAsString();

        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("help", "help-request-summary.json"), actual);
        ContractShape.assertCommonRules(actual);

        flushAndClear();
        HelpRequest saved = helpRequests.findByIdAndWorkspaceId(Ids.fromPath(actual.get("id").asString()), ws.getId())
                .orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(HelpRequestStatus.OPEN);
        assertThat(saved.getRequester().getId()).isEqualTo(alice.getId());
    }

    @Test
    void createWithoutStandupIsAllowed() throws Exception {
        create(ws, aliceSession, body("질문", null))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fromStandupId").value(nullValue()));
    }

    @Test
    void someoneElsesStandupIs403() throws Exception {
        create(ws, aliceSession, body("질문", bobStandup))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        assertThat(helpRequests.count()).isZero();
    }

    @Test
    void standupOfAnotherWorkspaceIs404() throws Exception {
        create(ws, aliceSession, body("질문", otherWsStandup))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }

    @Test
    void instructorCannotCreate() throws Exception {
        create(ws, instructorSession, body("질문", null))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
    }

    @Test
    void workspaceWithoutAccessIs404() throws Exception {
        create(otherWs, aliceSession, body("질문", null))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }

    @Test
    void invalidBodyIs400() throws Exception {
        create(ws, aliceSession, body("", null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        create(ws, aliceSession, "{\"content\":\"a\",\"fromStandupId\":\"abc\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        // #175 공백만인 본문도 invalid, 저장 안 됨(CONTRACTS.md 「5」)
        long before = helpRequests.count();
        create(ws, aliceSession, "{\"content\":\" \\n\\t \",\"fromStandupId\":null}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        assertThat(helpRequests.count()).isEqualTo(before);
    }

    @Test
    void detailShowsCommentsInOrderAndConvertedAgenda() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "세션이 끊겨요", aliceStandup, T0));
        helpComments.saveAndFlush(new HelpComment(helpRequest, instructorUser, null, "쿠키 설정을 보세요",
                T0.plusSeconds(120)));
        helpComments.saveAndFlush(new HelpComment(helpRequest, bobUser, bob, "same-site 확인", T0.plusSeconds(60)));
        AgendaItem agenda = agendaItems.saveAndFlush(
                AgendaItem.forHelpRequest(ws, helpRequest.getId(), "세션 끊김", alice, T0.plusSeconds(180)));
        flushAndClear();

        String response = mvc.perform(get(base(ws) + "/" + helpRequest.getId()).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.commentCount").value(2))
                .andExpect(jsonPath("$.agendaItemId").value(Ids.toApi(agenda.getId())))
                .andExpect(jsonPath("$.comments[0].authorMemberId").value(Ids.toApi(bob.getId())))
                .andExpect(jsonPath("$.comments[0].isInstructorAnswer").value(false))
                .andExpect(jsonPath("$.comments[0].author.displayName").value("밥"))
                .andExpect(jsonPath("$.comments[1].authorMemberId").value(nullValue()))
                .andExpect(jsonPath("$.comments[1].isInstructorAnswer").value(true))
                .andReturn().getResponse().getContentAsString();

        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("help", "help-request-detail.json"), actual);
        ContractShape.assertCommonRules(actual);
    }

    @Test
    void assignedInstructorCanRead() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));

        mvc.perform(get(base(ws) + "/" + helpRequest.getId()).session(instructorSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.comments").isEmpty());
    }

    /** IDOR — 다른 사무실의 도움 요청 ID를 내 사무실 경로에 넣으면 404. */
    @Test
    void helpRequestOfAnotherWorkspaceIs404() throws Exception {
        HelpRequest elsewhere = helpRequests.saveAndFlush(new HelpRequest(otherWs, aliceElsewhere, "질문", null, T0));

        mvc.perform(get(base(ws) + "/" + elsewhere.getId()).session(aliceSession))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        mvc.perform(get(base(otherWs) + "/" + elsewhere.getId()).session(aliceSession))
                .andExpect(status().isNotFound());
    }

    /** Snapshot {@code helpRequests} 조각 — 이 사무실 것만, createdAt 오름차순, 48시간 후보 계산. */
    @Test
    void snapshotPieceListsWorkspaceHelpRequestsInCreatedOrder() {
        HelpRequest later = helpRequests.saveAndFlush(new HelpRequest(ws, bob, "나중", null, T0.plusSeconds(10)));
        HelpRequest earlier = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "먼저", null, T0));
        flushAndClear();

        List<HelpRequestSummary> summaries = helpRequestService.listSummaries(ws.getId(), aliceUser.getId(),
                T0.plus(Duration.ofHours(48)));

        assertThat(summaries).extracting(HelpRequestSummary::id)
                .containsExactly(Ids.toApi(earlier.getId()), Ids.toApi(later.getId()));
        assertThat(summaries).extracting(HelpRequestSummary::isAgendaCandidate).containsExactly(true, false);
        assertThat(helpRequestService.listSummaries(otherWs.getId(), aliceUser.getId(), T0)).isEmpty();
    }

    // ---- #48 코멘트 ----------------------------------------------------------------------------

    @Test
    void otherMembersFirstCommentStartsDiscussion() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "세션이 끊겨요", null, T0));

        String response = comment(ws, helpRequest, bobSession, "same-site 확인해 보세요")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.authorMemberId").value(Ids.toApi(bob.getId())))
                .andExpect(jsonPath("$.author.displayName").value("밥"))
                .andExpect(jsonPath("$.isInstructorAnswer").value(false))
                .andExpect(jsonPath("$.content").value("same-site 확인해 보세요"))
                .andReturn().getResponse().getContentAsString();

        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(
                ContractShape.readExample("help", "help-request-detail.json").get("comments").get(0), actual);
        ContractShape.assertCommonRules(actual);
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.DISCUSSING);
        assertThat(helpComments.findByHelpRequestIdOrderByCreatedAtAscIdAsc(helpRequest.getId())).hasSize(1);
    }

    @Test
    void requesterOwnCommentKeepsOpen() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));

        comment(ws, helpRequest, aliceSession, "추가 정보예요").andExpect(status().isCreated());

        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.OPEN);
    }

    @Test
    void resolvedOrEndedIs409() throws Exception {
        HelpRequest resolved = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "해결됨", null, T0));
        HelpRequest ended = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "종료됨", null, T0));
        setColumn(resolved, "status = 'RESOLVED'");
        setColumn(ended, "status = 'ENDED'");

        comment(ws, resolved, bobSession, "늦었지만").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
        comment(ws, ended, bobSession, "늦었지만").andExpect(status().isConflict());
        assertThat(helpComments.count()).isZero();
    }

    @Test
    void instructorOnUnrequestedHelpIs403() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));

        comment(ws, helpRequest, instructorSession, "답변").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        assertThat(helpComments.count()).isZero();
    }

    @Test
    void instructorAnswerOnRequestedHelpKeepsStatus() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));
        setColumn(helpRequest, "instructor_requested_at = '2026-11-05 02:00:00'");

        comment(ws, helpRequest, instructorSession, "쿠키 설정을 보세요")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.isInstructorAnswer").value(true))
                .andExpect(jsonPath("$.authorMemberId").value(nullValue()))
                .andExpect(jsonPath("$.author.displayName").value("강사"));

        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.OPEN);
    }

    /** IDOR — 다른 사무실의 도움 요청에 내 사무실 경로로 코멘트하면 404. */
    @Test
    void commentOnHelpRequestOfAnotherWorkspaceIs404() throws Exception {
        HelpRequest elsewhere = helpRequests.saveAndFlush(new HelpRequest(otherWs, aliceElsewhere, "질문", null, T0));

        comment(ws, elsewhere, aliceSession, "코멘트").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        assertThat(helpComments.count()).isZero();
    }

    @Test
    void emptyCommentIs400() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));

        comment(ws, helpRequest, bobSession, "").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
    }

    // ---- #49 닫기 ------------------------------------------------------------------------------

    /** 닫는 시각은 서버의 지금이라 닫을 글은 과거에 만든다 — DB CHECK {@code closed_at >= created_at}. */
    private static final Instant OPENED = Instant.now().minus(Duration.ofHours(1));

    private ResultActions close(Workspace workspace, HelpRequest helpRequest, MockHttpSession session, String body)
            throws Exception {
        String token = csrfToken();
        return mvc.perform(post(base(workspace) + "/" + Ids.toApi(helpRequest.getId()) + "/close").session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String closeBody(HelpComment helpful, String learning) {
        String helpfulId = helpful == null ? "null" : "\"" + Ids.toApi(helpful.getId()) + "\"";
        return "{\"helpfulCommentId\":" + helpfulId + ",\"learning\":\"" + learning + "\"}";
    }

    @Test
    void requesterClosesWithHelpfulComment() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "세션이 끊겨요", null, OPENED));
        HelpComment bobs = helpComments.saveAndFlush(new HelpComment(helpRequest, bobUser, bob, "same-site 확인",
                T0.plusSeconds(60)));
        setColumn(helpRequest, "status = 'DISCUSSING'");

        String response = close(ws, helpRequest, aliceSession, closeBody(bobs, "SameSite는 쿠키마다 정한다"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("resolved"))
                .andExpect(jsonPath("$.helpfulCommentId").value(Ids.toApi(bobs.getId())))
                .andExpect(jsonPath("$.learning").value("SameSite는 쿠키마다 정한다"))
                .andExpect(jsonPath("$.closedAt").isString())
                .andExpect(jsonPath("$.comments.length()").value(1))
                .andReturn().getResponse().getContentAsString();

        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("help", "help-request-detail.json"), actual);
        ContractShape.assertCommonRules(actual);
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.RESOLVED);
    }

    @Test
    void closeWithoutHelpfulCommentIsAllowed() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, OPENED));

        close(ws, helpRequest, aliceSession, closeBody(null, "혼자 해결함"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("resolved"))
                .andExpect(jsonPath("$.helpfulCommentId").value(nullValue()));
    }

    @Test
    void onlyRequesterCanClose() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, OPENED));

        close(ws, helpRequest, bobSession, closeBody(null, "배움")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        close(ws, helpRequest, instructorSession, closeBody(null, "배움")).andExpect(status().isForbidden());
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.OPEN);
    }

    @Test
    void closingOutsideOpenOrDiscussingIs409() throws Exception {
        HelpRequest resolved = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "해결됨", null, OPENED));
        HelpRequest onAgenda = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "안건으로 감", null, OPENED));
        setColumn(resolved, "status = 'RESOLVED'");
        setColumn(onAgenda, "status = 'ON_AGENDA'");

        close(ws, resolved, aliceSession, closeBody(null, "배움")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
        close(ws, onAgenda, aliceSession, closeBody(null, "배움")).andExpect(status().isConflict());
    }

    @Test
    void helpfulCommentMustBeAnotherMembersCommentOnThisHelpRequest() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, OPENED));
        HelpRequest otherHelp = helpRequests.saveAndFlush(new HelpRequest(ws, bob, "다른 글", null, OPENED));
        HelpComment onOtherHelp = helpComments.saveAndFlush(new HelpComment(otherHelp, bobUser, bob, "다른 글 답",
                T0.plusSeconds(10)));
        HelpComment instructorAnswer = helpComments.saveAndFlush(new HelpComment(helpRequest, instructorUser, null,
                "강사 답", T0.plusSeconds(20)));
        HelpComment own = helpComments.saveAndFlush(new HelpComment(helpRequest, aliceUser, alice, "내 보충",
                T0.plusSeconds(30)));

        for (HelpComment notAllowed : List.of(onOtherHelp, instructorAnswer, own)) {
            close(ws, helpRequest, aliceSession, closeBody(notAllowed, "배움")).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }
        close(ws, helpRequest, aliceSession, "{\"helpfulCommentId\":\"abc\",\"learning\":\"배움\"}")
                .andExpect(status().isBadRequest());
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.OPEN);
    }

    /** IDOR — 다른 사무실의 도움 요청을 내 사무실 경로로 닫으면 404. */
    @Test
    void closingHelpRequestOfAnotherWorkspaceIs404() throws Exception {
        HelpRequest elsewhere = helpRequests.saveAndFlush(new HelpRequest(otherWs, aliceElsewhere, "질문", null, OPENED));

        close(ws, elsewhere, aliceSession, closeBody(null, "배움")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }

    @Test
    void emptyLearningIs400() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, OPENED));

        close(ws, helpRequest, aliceSession, closeBody(null, "")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
    }

    // ---- #56 강사에게 요청 ------------------------------------------------------------------------

    private ResultActions requestInstructor(Workspace workspace, HelpRequest helpRequest, MockHttpSession session)
            throws Exception {
        String token = csrfToken();
        return mvc.perform(post(base(workspace) + "/" + Ids.toApi(helpRequest.getId()) + "/instructor-request")
                .session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN));
    }

    /** 요청자가 켜면 그 글에 지정된 강사가 답할 수 있고, 켜기도 강사 답변도 상태를 바꾸지 않는다. */
    @Test
    void requesterTurnsOnInstructorRequestThenInstructorAnswers() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));

        String response = requestInstructor(ws, helpRequest, aliceSession)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(Ids.toApi(helpRequest.getId())))
                .andExpect(jsonPath("$.instructorRequested").value(true))
                .andExpect(jsonPath("$.instructorRequestedAt").isString())
                .andExpect(jsonPath("$.status").value("open"))
                .andReturn().getResponse().getContentAsString();
        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("help", "help-request-summary.json"), actual);
        ContractShape.assertCommonRules(actual);

        comment(ws, helpRequest, instructorSession, "쿠키 설정을 보세요").andExpect(status().isCreated())
                .andExpect(jsonPath("$.isInstructorAnswer").value(true));
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.OPEN);
    }

    @Test
    void alreadyRequestedKeepsTheFirstTime() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));
        setColumn(helpRequest, "instructor_requested_at = '2026-11-05 02:00:00'");

        requestInstructor(ws, helpRequest, aliceSession).andExpect(status().isOk())
                .andExpect(jsonPath("$.instructorRequested").value(true))
                .andExpect(jsonPath("$.instructorRequestedAt").value("2026-11-05T02:00:00Z"));
    }

    @Test
    void onlyRequesterCanRequestInstructor() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));

        requestInstructor(ws, helpRequest, bobSession).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        requestInstructor(ws, helpRequest, instructorSession).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        flushAndClear();
        assertThat(helpRequests.findById(helpRequest.getId()).orElseThrow().isInstructorRequested()).isFalse();
    }

    /** IDOR — 다른 사무실의 도움 요청을 내 사무실 경로로 켜면 404. */
    @Test
    void requestingInstructorOnHelpRequestOfAnotherWorkspaceIs404() throws Exception {
        HelpRequest elsewhere = helpRequests.saveAndFlush(new HelpRequest(otherWs, aliceElsewhere, "질문", null, T0));

        requestInstructor(ws, elsewhere, aliceSession).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }

    /** #272 — 강사가 답할 수 없는 글(resolved · ended)은 이미 켜져 있어도 409. on_agenda는 켤 수 있다(계약 「11」). */
    @Test
    void instructorRequestNeedsAStatusTheInstructorCanAnswer() throws Exception {
        HelpRequest resolved = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "해결된 글", null, T0));
        HelpRequest ended = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "회의에서 끝난 글", null, T0));
        HelpRequest onAgenda = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "안건으로 간 글", null, T0));
        setColumn(resolved, "status = 'RESOLVED'");
        setColumn(ended, "status = 'ENDED', instructor_requested_at = '2026-11-05 02:00:00'");
        setColumn(onAgenda, "status = 'ON_AGENDA'");

        requestInstructor(ws, resolved, bobSession).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        requestInstructor(ws, resolved, aliceSession).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
        requestInstructor(ws, ended, aliceSession).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
        requestInstructor(ws, onAgenda, aliceSession).andExpect(status().isOk())
                .andExpect(jsonPath("$.instructorRequested").value(true))
                .andExpect(jsonPath("$.status").value("on_agenda"));

        flushAndClear();
        assertThat(helpRequests.findById(resolved.getId()).orElseThrow().isInstructorRequested()).isFalse();
    }

    /** #272 — 지정된 강사가 없으면 새로 켤 수 없다(409). 이미 켜진 글은 해제 뒤에도 그대로 200 — 처음 시각 유지. */
    @Test
    void withoutAnAssignedInstructorOnlyANewRequestIsAConflict() throws Exception {
        instructorAssignments.findByWorkspaceIdAndUnassignedAtIsNullOrderByAssignedAtAscIdAsc(ws.getId())
                .forEach(assignment -> {
                    assignment.unassign(T0.plusSeconds(60));
                    instructorAssignments.saveAndFlush(assignment);
                });
        HelpRequest fresh = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "새 질문", null, T0));
        HelpRequest already = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "켜 둔 질문", null, T0));
        setColumn(already, "instructor_requested_at = '2026-11-05 02:00:00'");

        requestInstructor(ws, fresh, aliceSession).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
        requestInstructor(ws, already, aliceSession).andExpect(status().isOk())
                .andExpect(jsonPath("$.instructorRequestedAt").value("2026-11-05T02:00:00Z"));

        flushAndClear();
        assertThat(helpRequests.findById(fresh.getId()).orElseThrow().isInstructorRequested()).isFalse();
    }

    /** #272 — 시연 사무실은 심사용 강사 계정이 강사라 지정 행이 없어도 켤 수 있다. */
    @Test
    void demoWorkspaceCanRequestWithoutAnAssignmentRow() throws Exception {
        Workspace demo = workspaces.saveAndFlush(Workspace.demo("시연 사무실", T0));
        Member kim = members.saveAndFlush(Member.demoSeed(demo, "seed-kim", "김", null, 0));
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(demo, kim, "질문", null, T0));
        MockHttpSession kimSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(demo.getId(), kim.getId(), WorkspaceRole.PARTICIPANT).session();

        requestInstructor(demo, helpRequest, kimSession).andExpect(status().isOk())
                .andExpect(jsonPath("$.instructorRequested").value(true));
    }

    // ---- #51 안건으로 전환 ------------------------------------------------------------------------

    private ResultActions toAgenda(Workspace workspace, HelpRequest helpRequest, MockHttpSession session, String title)
            throws Exception {
        String token = csrfToken();
        return mvc.perform(post(base(workspace) + "/" + Ids.toApi(helpRequest.getId()) + "/to-agenda")
                .session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"" + title + "\"}"));
    }

    /** 전환 → 안건(confirmed) + 도움 요청 on_agenda(한 트랜잭션). 그 안건을 결정하면 도움 요청은 ended. */
    @Test
    void requesterConvertsToAgendaThenDecisionEndsIt() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "세션이 끊겨요", null, T0));

        String response = toAgenda(ws, helpRequest, aliceSession, "세션 끊김")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("help_request"))
                .andExpect(jsonPath("$.status").value("confirmed"))
                .andExpect(jsonPath("$.title").value("세션 끊김"))
                .andExpect(jsonPath("$.source.type").value("help_request"))
                .andExpect(jsonPath("$.source.id").value(Ids.toApi(helpRequest.getId())))
                .andExpect(jsonPath("$.raisedByMemberId").value(Ids.toApi(alice.getId())))
                .andExpect(jsonPath("$.decision").value(nullValue()))
                .andReturn().getResponse().getContentAsString();
        var actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("meeting", "agenda-item.json"), actual);
        ContractShape.assertCommonRules(actual);
        String agendaItemId = actual.get("id").asString();

        flushAndClear();
        mvc.perform(get(base(ws) + "/" + helpRequest.getId()).session(aliceSession))
                .andExpect(jsonPath("$.status").value("on_agenda"))
                .andExpect(jsonPath("$.agendaItemId").value(agendaItemId))
                .andExpect(jsonPath("$.isAgendaCandidate").value(false));

        String token = csrfToken();
        mvc.perform(post("/api/workspaces/" + Ids.toApi(ws.getId()) + "/agenda-items/" + agendaItemId + "/decision")
                .session(bobSession).cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"conclusion\":\"SameSite=Lax로 맞춘다\",\"learning\":null,\"prDecision\":null,"
                        + "\"followUpAssigneeMemberId\":null,\"followUpDueDate\":null,\"meetingId\":null}"))
                .andExpect(status().isOk());
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.ENDED);
    }

    /** 48시간 후보 확정도 같은 API — discussing도 전환된다. 후보 표시는 사라진다. */
    @Test
    void agendaCandidateInDiscussionIsConfirmedTheSameWay() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "배포가 안 돼요", null,
                Instant.now().minus(Duration.ofHours(49))));
        comment(ws, helpRequest, bobSession, "로그 볼게요").andExpect(status().isCreated());
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.DISCUSSING);
        mvc.perform(get(base(ws) + "/" + helpRequest.getId()).session(aliceSession))
                .andExpect(jsonPath("$.isAgendaCandidate").value(true));

        toAgenda(ws, helpRequest, aliceSession, "배포 실패").andExpect(status().isCreated());

        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.ON_AGENDA);
        mvc.perform(get(base(ws) + "/" + helpRequest.getId()).session(aliceSession))
                .andExpect(jsonPath("$.isAgendaCandidate").value(false));
    }

    /** 「11」 — 요청자가 아님 · 강사 403. 아무것도 만들지 않는다. */
    @Test
    void onlyRequesterCanConvert() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));

        toAgenda(ws, helpRequest, bobSession, "남의 글").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        toAgenda(ws, helpRequest, instructorSession, "강사").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));

        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.OPEN);
        assertThat(agendaItems.count()).isZero();
    }

    /** open · discussing 밖(이미 전환 · 해결 · 끝남)은 409. 두 번째 안건은 생기지 않는다. */
    @Test
    void convertingOutsideOpenOrDiscussingIs409() throws Exception {
        HelpRequest converted = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));
        toAgenda(ws, converted, aliceSession, "첫 전환").andExpect(status().isCreated());
        toAgenda(ws, converted, aliceSession, "두 번째").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));

        HelpRequest resolved = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));
        setColumn(resolved, "status = 'RESOLVED'");
        HelpRequest ended = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));
        setColumn(ended, "status = 'ENDED'");
        toAgenda(ws, resolved, aliceSession, "해결됨").andExpect(status().isConflict());
        toAgenda(ws, ended, aliceSession, "끝남").andExpect(status().isConflict());

        assertThat(agendaItems.count()).isEqualTo(1);
    }

    @Test
    void titleMustBe1To100Chars() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));

        toAgenda(ws, helpRequest, aliceSession, "").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        toAgenda(ws, helpRequest, aliceSession, "a".repeat(101)).andExpect(status().isBadRequest());
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.OPEN);
    }

    /** IDOR — 다른 사무실의 도움 요청을 내 사무실 경로로 전환하면 404. */
    @Test
    void convertingHelpRequestOfAnotherWorkspaceIs404() throws Exception {
        HelpRequest elsewhere = helpRequests.saveAndFlush(new HelpRequest(otherWs, aliceElsewhere, "질문", null, T0));

        toAgenda(ws, elsewhere, aliceSession, "남의 사무실").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        assertThat(agendaItems.count()).isZero();
    }

    // ---- #313 전환된 안건 거두기 → 도움 요청 복구 · 다시 올리기 ------------------------------------------

    private ResultActions withdraw(String agendaItemId, MockHttpSession session) throws Exception {
        String token = csrfToken();
        return mvc.perform(post("/api/workspaces/" + Ids.toApi(ws.getId()) + "/agenda-items/" + agendaItemId
                + "/withdraw").session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN).contentType(MediaType.APPLICATION_JSON).content(""));
    }

    private String raise(HelpRequest helpRequest, String title) throws Exception {
        String response = toAgenda(ws, helpRequest, aliceSession, title).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return ContractShape.readTree(response).get("id").asString();
    }

    private List<AgendaStatus> agendaStatusesOf(HelpRequest helpRequest) {
        flushAndClear();
        return agendaItems.findByWorkspaceIdOrderByRaisedAtAscIdAsc(ws.getId()).stream()
                .filter(item -> helpRequest.getId().equals(item.getSourceHelpRequestId()))
                .map(AgendaItem::getStatus).toList();
    }

    /** 거두면 안건은 withdrawn(행은 남음), 도움 요청은 open · 안건 없음. 다시 올리고 거두기를 반복할 수 있다. */
    @Test
    void withdrawingRestoresOpenAndTheHelpRequestCanBeRaisedAgain() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "세션이 끊겨요", null, T0));
        String first = raise(helpRequest, "세션 끊김");

        withdraw(first, aliceSession).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("withdrawn"));
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.OPEN);
        mvc.perform(get(base(ws) + "/" + helpRequest.getId()).session(aliceSession))
                .andExpect(jsonPath("$.status").value("open"))
                .andExpect(jsonPath("$.agendaItemId").value(nullValue()));

        String second = raise(helpRequest, "세션 끊김 다시");
        assertThat(second).isNotEqualTo(first);
        flushAndClear(); // 테스트 트랜잭션은 요청 사이에 영속성 컨텍스트를 나눠 쓴다 — 계산 열(agendaItemId)을 DB에서 다시 읽게
        mvc.perform(get(base(ws) + "/" + helpRequest.getId()).session(aliceSession))
                .andExpect(jsonPath("$.status").value("on_agenda"))
                .andExpect(jsonPath("$.agendaItemId").value(second));

        withdraw(second, aliceSession).andExpect(status().isOk());
        String third = raise(helpRequest, "세 번째");
        assertThat(agendaStatusesOf(helpRequest))
                .containsExactly(AgendaStatus.WITHDRAWN, AgendaStatus.WITHDRAWN, AgendaStatus.CONFIRMED);
        assertThat(helpRequestService.listSummaries(ws.getId(), aliceUser.getId(), Instant.now()))
                .filteredOn(summary -> summary.id().equals(Ids.toApi(helpRequest.getId())))
                .extracting(HelpRequestSummary::agendaItemId).containsExactly(third);
    }

    /**
     * 거두면 전환 직전 상태 그대로 — on_agenda 동안 다른 팀원 코멘트가 달려도 open에서 올렸으면 open(다시 계산하지 않음).
     * 거두기와 다시 올리기를 되풀이해도 그때마다 그 직전 상태로 돌아온다.
     */
    @Test
    void withdrawingReturnsToTheStatusRightBeforeEachConversion() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "테스트가 깨져요", null, T0));
        String fromOpen = raise(helpRequest, "테스트 실패");
        comment(ws, helpRequest, bobSession, "안건 전에 볼게요").andExpect(status().isCreated());
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.ON_AGENDA);
        withdraw(fromOpen, aliceSession).andExpect(status().isOk());
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.OPEN);

        comment(ws, helpRequest, bobSession, "이제 같이 봐요").andExpect(status().isCreated());
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.DISCUSSING);
        withdraw(raise(helpRequest, "테스트 실패 다시"), aliceSession).andExpect(status().isOk());
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.DISCUSSING);

        withdraw(raise(helpRequest, "세 번째"), aliceSession).andExpect(status().isOk());
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.DISCUSSING);
        assertThat(helpRequests.findById(helpRequest.getId()).orElseThrow().getStatusBeforeAgenda()).isNull();
    }

    /**
     * 기준 사례 — discussing · 48시간 지남 · 강사 요청 안 함 → 안건 후보 확정 → 거두기. Snapshot · 상세가 다시 안건 후보로 보인다
     * (화면의 「논의 중」 · 「안건 후보」 라벨과 「강사에게 요청」 · 「안건 후보 확정」 · 「해결로 닫기」 버튼은 이 값을 따른다 — #314).
     */
    @Test
    void agendaCandidateComesBackAsACandidateAfterWithdrawing() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "배포가 안 돼요", null,
                Instant.now().minus(Duration.ofHours(49))));
        comment(ws, helpRequest, bobSession, "로그 볼게요").andExpect(status().isCreated());
        String agendaItemId = raise(helpRequest, "배포 실패");

        withdraw(agendaItemId, aliceSession).andExpect(status().isOk());

        flushAndClear();
        mvc.perform(get(base(ws) + "/" + helpRequest.getId()).session(aliceSession))
                .andExpect(jsonPath("$.status").value("discussing"))
                .andExpect(jsonPath("$.isAgendaCandidate").value(true))
                .andExpect(jsonPath("$.instructorRequested").value(false))
                .andExpect(jsonPath("$.agendaItemId").value(nullValue()));
        HelpRequestSummary summary = helpRequestService.listSummaries(ws.getId(), aliceUser.getId(), Instant.now()).stream()
                .filter(s -> s.id().equals(Ids.toApi(helpRequest.getId()))).findFirst().orElseThrow();
        assertThat(summary.status()).isEqualTo(HelpRequestStatus.DISCUSSING);
        assertThat(summary.isAgendaCandidate()).isTrue();
        assertThat(summary.instructorRequested()).isFalse();
        assertThat(summary.agendaItemId()).isNull();
    }

    /**
     * 거두기 전후로 본문 · 코멘트(강사 답변 포함) · commentCount · createdAt · "강사에게 요청"이 같다. 안건으로 올린 뒤 켠
     * "강사에게 요청"도 켜진 채 남는다. agendaItemId만 null이 된다.
     */
    @Test
    void withdrawingKeepsContentCommentsAndInstructorRequest() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "빌드가 느려요", null, T0));
        comment(ws, helpRequest, aliceSession, "캐시를 꺼 봤어요").andExpect(status().isCreated());
        String agendaItemId = raise(helpRequest, "빌드 속도");
        requestInstructor(ws, helpRequest, aliceSession).andExpect(status().isOk());
        comment(ws, helpRequest, instructorSession, "강사 답변").andExpect(status().isCreated());
        comment(ws, helpRequest, bobSession, "저도 느려요").andExpect(status().isCreated());

        flushAndClear();
        var before = ContractShape.readTree(mvc.perform(get(base(ws) + "/" + helpRequest.getId()).session(aliceSession))
                .andReturn().getResponse().getContentAsString());
        withdraw(agendaItemId, aliceSession).andExpect(status().isOk());
        flushAndClear();
        var after = ContractShape.readTree(mvc.perform(get(base(ws) + "/" + helpRequest.getId()).session(aliceSession))
                .andReturn().getResponse().getContentAsString());

        for (String field : List.of("content", "comments", "commentCount", "createdAt", "instructorRequested",
                "instructorRequestedAt")) {
            assertThat(after.get(field)).as(field).isEqualTo(before.get(field));
        }
        assertThat(after.get("commentCount").asInt()).isEqualTo(3);
        assertThat(after.get("instructorRequested").asBoolean()).isTrue();
        assertThat(before.get("agendaItemId").asString()).isEqualTo(agendaItemId);
        assertThat(after.get("agendaItemId").isNull()).isTrue();
        assertThat(after.get("status").asString()).isEqualTo("open");
    }

    /** 기존 검사 순서 그대로 — 올린 사람이 아니면 403, 이미 거둔 안건은 409. 도움 요청은 바뀌지 않는다. */
    @Test
    void withdrawErrorsLeaveTheHelpRequestAlone() throws Exception {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));
        String agendaItemId = raise(helpRequest, "질문");

        withdraw(agendaItemId, bobSession).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        withdraw(agendaItemId, instructorSession).andExpect(status().isForbidden());
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.ON_AGENDA);

        withdraw(agendaItemId, aliceSession).andExpect(status().isOk());
        withdraw(agendaItemId, aliceSession).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
        assertThat(statusOf(helpRequest)).isEqualTo(HelpRequestStatus.OPEN);
    }

    /** DB 유일 규칙(V6) — 도움 요청당 거두지 않은 안건은 하나. 거둔 행은 몇 개든 남는다. */
    @Test
    void onlyOneNotWithdrawnAgendaItemPerHelpRequest() {
        HelpRequest helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, T0));
        AgendaItem withdrawn = AgendaItem.forHelpRequest(ws, helpRequest.getId(), "첫 번째", alice, T0);
        withdrawn.withdraw();
        agendaItems.saveAndFlush(withdrawn);
        agendaItems.saveAndFlush(AgendaItem.forHelpRequest(ws, helpRequest.getId(), "두 번째", alice, T0));

        assertThatThrownBy(() -> agendaItems.saveAndFlush(
                AgendaItem.forHelpRequest(ws, helpRequest.getId(), "세 번째", alice, T0)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}

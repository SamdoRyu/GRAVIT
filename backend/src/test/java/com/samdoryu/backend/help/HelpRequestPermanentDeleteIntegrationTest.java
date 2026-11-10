package com.samdoryu.backend.help;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.help.domain.HelpComment;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.repository.HelpCommentRepository;
import com.samdoryu.backend.help.repository.HelpRequestHiddenRepository;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaStatus;
import com.samdoryu.backend.meeting.domain.InstructorFeedback;
import com.samdoryu.backend.meeting.domain.Meeting;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.InstructorFeedbackRepository;
import com.samdoryu.backend.meeting.repository.MeetingRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * #315 ② 모두에게서 영구 삭제 {@code DELETE W/help-requests/{id}}를 실제 Security · MVC · MySQL로 본다. 요청자만, 상태와
 * 상관없이 도움 요청 · 코멘트(남의 코멘트 · 강사 답변 포함) · 도움이 된 코멘트 연결 · 모든 사용자의 숨김 행을 실제로 지운다. 이
 * 요청의 안건은 남기고 원본 연결과 원문 제목만 지운다(결정 전이면 거둠). 커밋 · 롤백 · 변경 알림은
 * {@code HelpRequestDeleteCommitIntegrationTest}. 테스트마다 트랜잭션을 되돌린다.
 */
@SpringBootTest(properties = {
        "app.origin=" + HelpRequestPermanentDeleteIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + HelpRequestPermanentDeleteIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class HelpRequestPermanentDeleteIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-10T01:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired HelpRequestRepository helpRequests;
    @Autowired HelpCommentRepository helpComments;
    @Autowired HelpRequestHiddenRepository hiddenRows;
    @Autowired AgendaItemRepository agendaItems;
    @Autowired InstructorFeedbackRepository instructorFeedbacks;
    @Autowired MeetingRepository meetings;

    private Workspace ws;
    private Workspace otherWs;
    private AppUser aliceUser;
    private AppUser bobUser;
    private AppUser instructorUser;
    private Member alice;
    private Member bob;
    private Member aliceElsewhere;

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
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, T0));
    }

    private MockHttpSession aliceSession() {
        return TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
    }

    private MockHttpSession bobSession() {
        return TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
    }

    private MockHttpSession instructorSession() {
        return TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private static String base(Workspace workspace) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId());
    }

    private static String path(Workspace workspace, Long helpRequestId) {
        return base(workspace) + "/help-requests/" + Ids.toApi(helpRequestId);
    }

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private ResultActions deleteRequest(Workspace workspace, Long helpRequestId, MockHttpSession session)
            throws Exception {
        String token = csrfToken();
        return mvc.perform(delete(path(workspace, helpRequestId)).session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN));
    }

    private void flushAndClear() {
        em.flush();
        em.clear();
    }

    private void setStatus(HelpRequest helpRequest, String status) {
        em.flush();
        em.createNativeQuery("update help_request set status = ?1 where id = ?2")
                .setParameter(1, status).setParameter(2, helpRequest.getId()).executeUpdate();
        em.clear();
    }

    private long commentsOf(HelpRequest helpRequest) {
        return ((Number) em.createNativeQuery("select count(*) from help_comment where help_request_id = ?1")
                .setParameter(1, helpRequest.getId()).getSingleResult()).longValue();
    }

    private long hiddenRowsOf(HelpRequest helpRequest) {
        return ((Number) em.createNativeQuery("select count(*) from help_request_hidden where help_request_id = ?1")
                .setParameter(1, helpRequest.getId()).getSingleResult()).longValue();
    }

    /**
     * 닫힌(resolved) 요청 — 팀원 코멘트(도움이 된 코멘트) · 강사 답변 · 두 사람의 숨김 행이 있다. 요청자가 지우면 전부 사라지고,
     * 상세 404 · Snapshot · 강사 요청함 어디에도 없다. 다시 지우면 404.
     */
    @Test
    void requesterDeletesTheRequestWithAllItsCommentsAndHiddenRows() throws Exception {
        HelpRequest help = new HelpRequest(ws, alice, "세션이 끊겨요", null, T0);
        help.requestInstructor(T0.plusSeconds(10));
        help = helpRequests.saveAndFlush(help);
        HelpComment helpful = helpComments.saveAndFlush(
                new HelpComment(help, bobUser, bob, "same-site 확인", T0.plusSeconds(60)));
        helpComments.saveAndFlush(new HelpComment(help, instructorUser, null, "쿠키 설정을 보세요", T0.plusSeconds(90)));
        help.close(helpful, "SameSite 기본값", T0.plusSeconds(120));
        HelpRequest kept = helpRequests.saveAndFlush(new HelpRequest(ws, bob, "빌드가 느려요", null, T0));
        helpComments.saveAndFlush(new HelpComment(kept, aliceUser, alice, "캐시", T0.plusSeconds(30)));
        hiddenRows.insertIfAbsent(help.getId(), bobUser.getId(), T0.plusSeconds(200));
        hiddenRows.insertIfAbsent(help.getId(), instructorUser.getId(), T0.plusSeconds(200));
        flushAndClear();
        String id = Ids.toApi(help.getId());

        deleteRequest(ws, help.getId(), aliceSession())
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        flushAndClear();
        assertThat(helpRequests.existsById(help.getId())).isFalse();
        assertThat(commentsOf(help)).isZero();
        assertThat(hiddenRowsOf(help)).isZero();
        assertThat(helpRequests.existsById(kept.getId())).isTrue();
        assertThat(commentsOf(kept)).isEqualTo(1);

        mvc.perform(get(path(ws, help.getId())).session(bobSession()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        mvc.perform(get(base(ws) + "/snapshot").session(bobSession()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.helpRequests[*].id", not(hasItem(id))))
                .andExpect(jsonPath("$.helpRequests[*].id", hasItem(Ids.toApi(kept.getId()))));
        mvc.perform(get("/api/instructor/inbox").session(instructorSession()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].targetId", not(hasItem(id))));

        deleteRequest(ws, help.getId(), aliceSession())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }

    /**
     * 연결 안건 — 결정 전(confirmed)은 거두고, 결정 기록(discussed) · 그 강사 피드백 · 회의와 거둔 안건은 그대로 남는다. 모두 원본
     * 연결이 끊기고 제목은 고정 문구가 된다. 사람이 적은 결론은 그대로다.
     */
    @Test
    void linkedAgendaItemsStayWithoutTheSourceAndTheCopiedTitle() throws Exception {
        HelpRequest ended = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "세션이 끊겨요\n로그 첨부", null, T0));
        AgendaItem withdrawn = AgendaItem.forHelpRequest(ws, ended.getId(), "세션이 끊겨요", alice, T0.plusSeconds(60));
        withdrawn.withdraw();
        agendaItems.saveAndFlush(withdrawn);
        Meeting meeting = meetings.saveAndFlush(new Meeting(ws, List.of(alice, bob), T0.plusSeconds(100)));
        AgendaItem discussed = AgendaItem.forHelpRequest(ws, ended.getId(), "세션이 끊겨요", alice, T0.plusSeconds(90));
        discussed.decide("쿠키 SameSite를 Lax로", "세션 쿠키 속성", null, null, null, meeting, bob, T0.plusSeconds(150));
        discussed.requestFeedback(T0.plusSeconds(160));
        agendaItems.saveAndFlush(discussed);
        instructorFeedbacks.saveAndFlush(new InstructorFeedback(discussed, instructorUser, "좋은 결정", T0.plusSeconds(170)));
        setStatus(ended, "ENDED");

        HelpRequest onAgenda = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "빌드 캐시", null, T0));
        AgendaItem confirmed = agendaItems.saveAndFlush(
                AgendaItem.forHelpRequest(ws, onAgenda.getId(), "빌드 캐시", alice, T0.plusSeconds(60)));
        setStatus(onAgenda, "ON_AGENDA");
        long meetingCount = meetings.count();
        long feedbackCount = instructorFeedbacks.count();

        deleteRequest(ws, ended.getId(), aliceSession()).andExpect(status().isNoContent());
        deleteRequest(ws, onAgenda.getId(), aliceSession()).andExpect(status().isNoContent());

        flushAndClear();
        AgendaItem afterWithdrawn = agendaItems.findById(withdrawn.getId()).orElseThrow();
        AgendaItem afterDiscussed = agendaItems.findById(discussed.getId()).orElseThrow();
        AgendaItem afterConfirmed = agendaItems.findById(confirmed.getId()).orElseThrow();
        assertThat(List.of(afterWithdrawn, afterDiscussed, afterConfirmed)).allSatisfy(item -> {
            assertThat(item.getSourceHelpRequestId()).isNull();
            assertThat(item.getTitle()).isEqualTo(AgendaItem.DELETED_HELP_REQUEST_TITLE);
        });
        assertThat(afterWithdrawn.getStatus()).isEqualTo(AgendaStatus.WITHDRAWN);
        assertThat(afterConfirmed.getStatus()).isEqualTo(AgendaStatus.WITHDRAWN);
        assertThat(afterDiscussed.getStatus()).isEqualTo(AgendaStatus.DISCUSSED);
        assertThat(afterDiscussed.getConclusion()).isEqualTo("쿠키 SameSite를 Lax로");
        assertThat(afterDiscussed.getMeeting().getId()).isEqualTo(meeting.getId());
        assertThat(meetings.count()).isEqualTo(meetingCount);
        assertThat(instructorFeedbacks.count()).isEqualTo(feedbackCount);
        assertThat(helpRequests.existsById(ended.getId())).isFalse();
        assertThat(helpRequests.existsById(onAgenda.getId())).isFalse();

        mvc.perform(get(base(ws) + "/snapshot").session(bobSession()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.agendaItems[?(@.id == '%s')].source",
                        Ids.toApi(discussed.getId())).value(hasItem(nullValue())))
                .andExpect(jsonPath("$.agendaItems[?(@.id == '%s')].title",
                        Ids.toApi(discussed.getId())).value(hasItem(AgendaItem.DELETED_HELP_REQUEST_TITLE)));
    }

    @Test
    void anotherMemberOrTheInstructorIsForbiddenAndNothingIsDeleted() throws Exception {
        HelpRequest help = new HelpRequest(ws, alice, "세션이 끊겨요", null, T0);
        help.requestInstructor(T0.plusSeconds(10));
        help = helpRequests.saveAndFlush(help);
        helpComments.saveAndFlush(new HelpComment(help, bobUser, bob, "same-site 확인", T0.plusSeconds(60)));
        AgendaItem confirmed = agendaItems.saveAndFlush(
                AgendaItem.forHelpRequest(ws, help.getId(), "세션", alice, T0.plusSeconds(90)));
        setStatus(help, "ON_AGENDA");

        deleteRequest(ws, help.getId(), bobSession())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        deleteRequest(ws, help.getId(), instructorSession())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));

        flushAndClear();
        assertThat(helpRequests.existsById(help.getId())).isTrue();
        assertThat(commentsOf(help)).isEqualTo(1);
        AgendaItem after = agendaItems.findById(confirmed.getId()).orElseThrow();
        assertThat(after.getStatus()).isEqualTo(AgendaStatus.CONFIRMED);
        assertThat(after.getSourceHelpRequestId()).isEqualTo(help.getId());
        assertThat(after.getTitle()).isEqualTo("세션");
    }

    /** 다른 사무실의 도움 요청 · 없는 ID는 404 — 요청자가 같은 사람이어도 경로의 사무실 것이 아니면 숨긴다(IDOR). */
    @Test
    void anotherWorkspacesRequestOrUnknownIdIsNotFound() throws Exception {
        HelpRequest elsewhere = helpRequests.saveAndFlush(new HelpRequest(otherWs, aliceElsewhere, "다른 방", null, T0));

        deleteRequest(ws, elsewhere.getId(), aliceSession())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        deleteRequest(ws, elsewhere.getId() + 1000, aliceSession()).andExpect(status().isNotFound());

        flushAndClear();
        assertThat(helpRequests.existsById(elsewhere.getId())).isTrue();
    }

    @Test
    void deleteWithoutCsrfTokenIsRejected() throws Exception {
        HelpRequest help = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "세션이 끊겨요", null, T0));

        mvc.perform(delete(path(ws, help.getId())).session(aliceSession()).header(HttpHeaders.ORIGIN, ORIGIN))
                .andExpect(status().isForbidden());

        flushAndClear();
        assertThat(helpRequests.existsById(help.getId())).isTrue();
    }
}

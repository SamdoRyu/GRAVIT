package com.samdoryu.backend.help;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * #315 ① · #333 나에게서만 삭제 — {@code PUT W/help-requests/{id}/hidden}을 실제 Security · MVC · MySQL로 본다. 뺀 사람의
 * Snapshot · 강사 요청함에서만 빠지고, 다른 사람의 응답과 원본 · 코멘트 행은 그대로다. 제외는 서버에 남으므로 새 세션(다시
 * 로그인)에서도 같고, 되돌리는 API(숨김 목록 · 해제)는 없다. 테스트마다 트랜잭션을 되돌린다.
 */
@SpringBootTest(properties = {
        "app.origin=" + HelpRequestHideIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + HelpRequestHideIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class HelpRequestHideIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-10T01:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired HelpRequestRepository helpRequests;
    @Autowired HelpCommentRepository helpComments;
    @Autowired HelpRequestHiddenRepository hiddenRows;

    private Workspace ws;
    private Workspace otherWs;
    private AppUser aliceUser;
    private AppUser bobUser;
    private AppUser instructorUser;
    private Member alice;
    private Member bob;
    private Member aliceElsewhere;
    private HelpRequest help;
    private HelpRequest other;

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
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), null)); // Snapshot에 필요

        help = new HelpRequest(ws, alice, "세션이 끊겨요", null, T0);
        help.requestInstructor(T0.plusSeconds(30));
        help = helpRequests.saveAndFlush(help);
        helpComments.saveAndFlush(new HelpComment(help, bobUser, bob, "same-site 확인", T0.plusSeconds(60)));
        other = helpRequests.saveAndFlush(new HelpRequest(ws, bob, "빌드가 느려요", null, T0.plusSeconds(10)));
    }

    /** 요청마다 새 세션 — 서버에 남은 숨김이 세션과 상관없는지 함께 본다. */
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

    private static String hiddenPath(Workspace workspace, Long helpRequestId) {
        return base(workspace) + "/help-requests/" + Ids.toApi(helpRequestId) + "/hidden";
    }

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private ResultActions write(MockHttpServletRequestBuilder request, MockHttpSession session) throws Exception {
        String token = csrfToken();
        return mvc.perform(request.session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN));
    }

    private ResultActions hide(Workspace workspace, Long helpRequestId, MockHttpSession session) throws Exception {
        return write(put(hiddenPath(workspace, helpRequestId)), session);
    }

    private ResultActions snapshot(MockHttpSession session) throws Exception {
        return mvc.perform(get(base(ws) + "/snapshot").session(session)).andExpect(status().isOk());
    }

    private void flushAndClear() {
        em.flush();
        em.clear();
    }

    @Test
    void hidingRemovesItOnlyFromTheHidersSnapshotAndKeepsTheRows() throws Exception {
        long comments = helpComments.count();
        String id = Ids.toApi(help.getId());

        hide(ws, help.getId(), bobSession()).andExpect(status().isNoContent());
        hide(ws, help.getId(), bobSession()).andExpect(status().isNoContent()); // 이미 숨김 — 그대로

        flushAndClear();
        snapshot(bobSession())
                .andExpect(jsonPath("$.helpRequests[*].id", not(hasItem(id))))
                .andExpect(jsonPath("$.helpRequests[*].id", hasItem(Ids.toApi(other.getId()))));
        snapshot(aliceSession()).andExpect(jsonPath("$.helpRequests[*].id", hasItem(id)));
        assertThat(helpRequests.existsById(help.getId())).isTrue();
        assertThat(helpComments.count()).isEqualTo(comments);
        assertThat(hiddenRows.count()).isEqualTo(1);
        // 목록 · 배지 · 요청함에서만 빠진다 — 회의실 안건(도움 요청 구) 등에서 직접 열면 상세는 읽힌다
        mvc.perform(get(base(ws) + "/help-requests/" + id).session(bobSession())).andExpect(status().isOk());
    }

    /**
     * #333 — 숨김 목록 · 숨김 해제 API는 없다. 지운 경로로 보내도 제외 행은 남고, 다시 로그인해도(새 세션) 계속 빠진다.
     * 다른 사람에게는 원문 · 코멘트가 그대로 보인다.
     */
    @Test
    void noHiddenListNoUnhideAndItStaysExcludedAfterLoggingInAgain() throws Exception {
        String id = Ids.toApi(help.getId());
        hide(ws, help.getId(), bobSession()).andExpect(status().isNoContent());
        flushAndClear();

        mvc.perform(get(base(ws) + "/help-requests/hidden").session(bobSession()))
                .andExpect(status().is4xxClientError());
        write(delete(hiddenPath(ws, help.getId())), bobSession()).andExpect(status().is4xxClientError());
        flushAndClear();

        assertThat(hiddenRows.count()).isEqualTo(1);
        snapshot(bobSession()).andExpect(jsonPath("$.helpRequests[*].id", not(hasItem(id))));
        snapshot(aliceSession()).andExpect(jsonPath("$.helpRequests[*].id", hasItem(id)));
        mvc.perform(get(base(ws) + "/help-requests/" + id).session(aliceSession()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("세션이 끊겨요"))
                .andExpect(jsonPath("$.comments[*].content", hasItem("same-site 확인")));
    }

    /** 강사도 자기 화면에서만 숨긴다 — 강사의 Snapshot · 요청함에서 빠지고 팀원 화면은 그대로. */
    @Test
    void instructorHidesFromOwnSnapshotAndInbox() throws Exception {
        String id = Ids.toApi(help.getId());
        mvc.perform(get("/api/instructor/inbox").session(instructorSession()))
                .andExpect(jsonPath("$[*].targetId", hasItem(id)));

        hide(ws, help.getId(), instructorSession()).andExpect(status().isNoContent());
        flushAndClear();

        mvc.perform(get("/api/instructor/inbox").session(instructorSession()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].targetId", not(hasItem(id))));
        snapshot(instructorSession()).andExpect(jsonPath("$.helpRequests[*].id", not(hasItem(id))));
        snapshot(aliceSession()).andExpect(jsonPath("$.helpRequests[*].id", hasItem(id)));
    }

    /** 숨겨도 그 요청의 상태 변화는 그대로 일어난다 — 숨긴 사람이 아닌 사람의 코멘트로 discussing. */
    @Test
    void hiddenRequestStillChanges() throws Exception {
        hide(ws, other.getId(), aliceSession()).andExpect(status().isNoContent());
        write(post(base(ws) + "/help-requests/" + Ids.toApi(other.getId()) + "/comments")
                        .contentType("application/json").content("{\"content\":\"캐시를 보세요\"}"), aliceSession())
                .andExpect(status().isCreated());
        flushAndClear();

        snapshot(bobSession()).andExpect(jsonPath("$.helpRequests[?(@.id == '%s')].status",
                Ids.toApi(other.getId())).value(hasItem("discussing")));
    }

    /** 다른 사무실의 도움 요청 · 없는 ID는 404, 숨김 행도 생기지 않는다(IDOR). */
    @Test
    void anotherWorkspacesRequestOrUnknownIdIsNotFound() throws Exception {
        HelpRequest elsewhere = helpRequests.saveAndFlush(new HelpRequest(otherWs, aliceElsewhere, "다른 방", null, T0));

        hide(ws, elsewhere.getId(), aliceSession())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        hide(ws, elsewhere.getId() + 1000, aliceSession()).andExpect(status().isNotFound());

        assertThat(hiddenRows.count()).isZero();
    }

    /** 쓰기 요청이라 CSRF 토큰이 없으면 거부되고 숨김 행이 생기지 않는다. */
    @Test
    void hideWithoutCsrfTokenIsRejected() throws Exception {
        mvc.perform(put(hiddenPath(ws, help.getId())).session(bobSession()).header(HttpHeaders.ORIGIN, ORIGIN))
                .andExpect(status().isForbidden());

        assertThat(hiddenRows.count()).isZero();
    }
}

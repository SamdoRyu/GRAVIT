package com.samdoryu.backend.help;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.help.domain.HelpComment;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.repository.HelpCommentRepository;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * #315 ② — 커밋까지 봐야 하는 것: 영구 삭제가 한 트랜잭션인지(중간에 실패하면 안건 · 코멘트 · 숨김 · 도움 요청이 모두 그대로),
 * 커밋 뒤 변경 알림이 두 조각을 함께 알리는지. 운영처럼 Service가 가장 바깥 트랜잭션이 되게 테스트 트랜잭션 없이 돈다(그래서 만든
 * 행은 직접 지운다).
 */
@SpringBootTest(properties = "app.origin=" + HelpRequestDeleteCommitIntegrationTest.ORIGIN)
@AutoConfigureMockMvc
class HelpRequestDeleteCommitIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    private static final Instant T0 = Instant.parse("2026-11-10T01:00:00Z");
    private static final long GH = 873_150L;

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired HelpRequestRepository helpRequests;
    @Autowired HelpCommentRepository helpComments;
    @Autowired AgendaItemRepository agendaItems;
    @MockitoSpyBean WorkspaceEventHub eventHub;

    private AppUser aliceUser;
    private AppUser bobUser;
    private Workspace ws;
    private Workspace otherWs;
    private Member alice;
    private Member bob;
    private Member aliceElsewhere;
    private HelpRequest helpRequest;
    private AgendaItem confirmed;

    @BeforeEach
    void setUp() {
        aliceUser = users.saveAndFlush(AppUser.github(GH, "delete-alice", "앨리스", null));
        bobUser = users.saveAndFlush(AppUser.github(GH + 1, "delete-bob", "밥", null));
        ws = workspaces.saveAndFlush(Workspace.github(GH + 2, "samdoryu", "delete-315", null, aliceUser, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(GH + 3, "samdoryu", "delete-315-b", null, aliceUser, T0));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, false, T0));
        aliceElsewhere = members.saveAndFlush(Member.collaborator(otherWs, aliceUser, 0, true, T0));
        helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "세션이 끊겨요", null, T0));
        helpComments.saveAndFlush(new HelpComment(helpRequest, bobUser, bob, "same-site 확인", T0.plusSeconds(60)));
        confirmed = agendaItems.saveAndFlush(
                AgendaItem.forHelpRequest(ws, helpRequest.getId(), "세션이 끊겨요", alice, T0.plusSeconds(90)));
        jdbc.update("UPDATE help_request SET status = 'ON_AGENDA', status_before_agenda = 'DISCUSSING' WHERE id = ?",
                helpRequest.getId());
        jdbc.update("INSERT INTO help_request_hidden (help_request_id, user_id, hidden_at) VALUES (?, ?, ?)",
                helpRequest.getId(), bobUser.getId(), Timestamp.from(T0.plusSeconds(120)));
    }

    /** 안건을 두 사무실 모두 먼저 지운다 — 실패 재현용 안건은 다른 사무실에서 이 사무실의 도움 요청을 가리킨다. */
    @AfterEach
    void cleanUp() {
        Long[] workspaceIds = {ws.getId(), otherWs.getId()};
        for (Long workspaceId : workspaceIds) {
            jdbc.update("DELETE FROM agenda_item WHERE workspace_id = ?", workspaceId);
        }
        for (Long workspaceId : workspaceIds) {
            jdbc.update("DELETE h FROM help_request_hidden h JOIN help_request r ON r.id = h.help_request_id"
                    + " WHERE r.workspace_id = ?", workspaceId);
            jdbc.update("DELETE c FROM help_comment c JOIN help_request r ON r.id = c.help_request_id"
                    + " WHERE r.workspace_id = ?", workspaceId);
            jdbc.update("DELETE FROM help_request WHERE workspace_id = ?", workspaceId);
            jdbc.update("DELETE FROM team_member WHERE workspace_id = ?", workspaceId);
            jdbc.update("DELETE FROM workspace WHERE id = ?", workspaceId);
        }
        jdbc.update("DELETE FROM app_user WHERE id IN (?, ?)", aliceUser.getId(), bobUser.getId());
    }

    private int deleteAsAlice() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        return mvc.perform(delete("/api/workspaces/" + Ids.toApi(ws.getId()) + "/help-requests/"
                        + Ids.toApi(helpRequest.getId()))
                        .session(TestLogin.githubUser(aliceUser.getId(), GH)
                                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session())
                        .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                        .header(HttpHeaders.ORIGIN, ORIGIN))
                .andReturn().getResponse().getStatus();
    }

    private int count(String sql) {
        return jdbc.queryForObject(sql, Integer.class, helpRequest.getId());
    }

    /** 커밋 뒤 DB에 도움 요청 · 코멘트 · 숨김 행이 없고, 안건은 거둔 채 원본 연결이 끊긴다. 알림은 두 조각을 함께. */
    @Test
    void deleteCommitsEverythingAndAnnouncesBothResources() throws Exception {
        assertThat(deleteAsAlice()).isEqualTo(204);

        assertThat(count("SELECT COUNT(*) FROM help_request WHERE id = ?")).isZero();
        assertThat(count("SELECT COUNT(*) FROM help_comment WHERE help_request_id = ?")).isZero();
        assertThat(count("SELECT COUNT(*) FROM help_request_hidden WHERE help_request_id = ?")).isZero();
        assertThat(jdbc.queryForMap("SELECT status, title, source_help_request_id FROM agenda_item WHERE id = ?",
                confirmed.getId()))
                .containsEntry("status", "WITHDRAWN")
                .containsEntry("title", AgendaItem.DELETED_HELP_REQUEST_TITLE)
                .containsEntry("source_help_request_id", null);
        verify(eventHub).publishChangeAfterCommit(eq(ws.getId()), eq(SnapshotResource.HELP_REQUESTS),
                eq(SnapshotResource.AGENDA_ITEMS));
    }

    /**
     * 마지막 단계(도움 요청 행 삭제)가 실패하면 서버 오류이고 앞 단계까지 모두 롤백된다. 실패를 만들려고 다른 사무실의 거둔 안건이 이
     * 요청을 가리키게 둔다(같은 사무실끼리만 참조 규칙을 어긴 데이터 — 연결 끊기는 사무실 조건으로만 하므로 외래키가 남는다).
     */
    @Test
    void whenTheLastStepFailsNothingIsDeleted() throws Exception {
        jdbc.update("INSERT INTO agenda_item (workspace_id, kind, status, title, source_help_request_id,"
                + " raised_by_member_id, raised_at) VALUES (?, 'HELP_REQUEST', 'WITHDRAWN', '다른 방', ?, ?, ?)",
                otherWs.getId(), helpRequest.getId(), aliceElsewhere.getId(), Timestamp.from(T0.plusSeconds(100)));

        assertThat(deleteAsAlice()).isGreaterThanOrEqualTo(500);

        assertThat(count("SELECT COUNT(*) FROM help_request WHERE id = ?")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM help_comment WHERE help_request_id = ?")).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM help_request_hidden WHERE help_request_id = ?")).isEqualTo(1);
        assertThat(jdbc.queryForMap("SELECT status, title, source_help_request_id FROM agenda_item WHERE id = ?",
                confirmed.getId()))
                .containsEntry("status", "CONFIRMED")
                .containsEntry("title", "세션이 끊겨요")
                .containsEntry("source_help_request_id", helpRequest.getId());
        verify(eventHub, never()).publishChangeAfterCommit(eq(ws.getId()), any(SnapshotResource[].class));
    }
}

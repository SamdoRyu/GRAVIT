package com.samdoryu.backend.help;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * #313 — 커밋까지 봐야 하는 것: 안건 거두기 · 도움 요청 복구가 한 트랜잭션인지(한쪽이 실패하면 둘 다 롤백), 동시에 다시
 * 올리면 하나만 되는지(V6 유일 제약), 변경 알림이 두 조각을 함께 알리는지. 운영처럼 Service가 가장 바깥 트랜잭션이 되게
 * 테스트 트랜잭션 없이 돈다(그래서 만든 행은 직접 지운다).
 */
@SpringBootTest(properties = "app.origin=" + HelpAgendaWithdrawCommitIntegrationTest.ORIGIN)
@AutoConfigureMockMvc
class HelpAgendaWithdrawCommitIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    private static final Instant T0 = Instant.parse("2026-11-05T01:20:00Z");
    private static final long GH = 873_130L;

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired HelpRequestRepository helpRequests;
    @MockitoSpyBean WorkspaceEventHub eventHub;

    private AppUser aliceUser;
    private Workspace ws;
    private Member alice;
    private HelpRequest helpRequest;

    @BeforeEach
    void setUp() {
        aliceUser = users.saveAndFlush(AppUser.github(GH, "withdraw-alice", "앨리스", null));
        ws = workspaces.saveAndFlush(Workspace.github(GH + 1, "samdoryu", "withdraw-313", null, aliceUser, T0));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, T0));
        helpRequest = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "세션이 끊겨요", null, T0));
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("DELETE FROM agenda_item WHERE workspace_id = ?", ws.getId());
        jdbc.update("DELETE FROM help_request WHERE workspace_id = ?", ws.getId());
        jdbc.update("DELETE FROM team_member WHERE workspace_id = ?", ws.getId());
        jdbc.update("DELETE FROM workspace WHERE id = ?", ws.getId());
        jdbc.update("DELETE FROM app_user WHERE id = ?", aliceUser.getId());
    }

    /** 요청마다 새 세션 — 동시에 보내는 요청이 세션 객체를 나눠 쓰지 않게. */
    private MockHttpSession aliceSession() {
        return TestLogin.githubUser(aliceUser.getId(), GH).member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN)
                .session();
    }

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private MvcResult send(String path, String body, String token) throws Exception {
        return mvc.perform(post(path).session(aliceSession())
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN).contentType(MediaType.APPLICATION_JSON).content(body))
                .andReturn();
    }

    private MvcResult toAgenda(String token) throws Exception {
        return send("/api/workspaces/" + Ids.toApi(ws.getId()) + "/help-requests/" + Ids.toApi(helpRequest.getId())
                + "/to-agenda", "{\"title\":\"세션 끊김\"}", token);
    }

    private MvcResult withdraw(long agendaItemId, String token) throws Exception {
        return send("/api/workspaces/" + Ids.toApi(ws.getId()) + "/agenda-items/" + Ids.toApi(agendaItemId)
                + "/withdraw", "", token);
    }

    private Long activeAgendaItemId() {
        return jdbc.queryForObject("SELECT MAX(id) FROM agenda_item WHERE source_help_request_id = ?"
                + " AND status = 'CONFIRMED'", Long.class, helpRequest.getId());
    }

    private String helpStatus() {
        return jdbc.queryForObject("SELECT status FROM help_request WHERE id = ?", String.class, helpRequest.getId());
    }

    /** 거두면 커밋 뒤 DB에서 안건 WITHDRAWN · 도움 요청 OPEN이고, 변경 알림은 agendaItems · helpRequests를 함께 알린다. */
    @Test
    void withdrawCommitsBothRowsAndAnnouncesBothResources() throws Exception {
        String token = csrfToken();
        assertThat(toAgenda(token).getResponse().getStatus()).isEqualTo(201);
        long agendaItemId = activeAgendaItemId();
        clearInvocations(eventHub); // 안건 올리기도 같은 두 조각을 알린다 — 거두기의 알림만 본다

        assertThat(withdraw(agendaItemId, token).getResponse().getStatus()).isEqualTo(200);

        assertThat(jdbc.queryForObject("SELECT status FROM agenda_item WHERE id = ?", String.class, agendaItemId))
                .isEqualTo("WITHDRAWN");
        assertThat(helpStatus()).isEqualTo("OPEN");
        verify(eventHub).publishChangeAfterCommit(eq(ws.getId()), eq(SnapshotResource.AGENDA_ITEMS),
                eq(SnapshotResource.HELP_REQUESTS));
    }

    /** 도움 요청 복구가 실패하면(상태가 이미 on_agenda가 아님) 서버 오류이고 안건 거두기도 롤백된다 — 둘 다 그대로. */
    @Test
    void whenRestoringTheHelpRequestFailsTheWithdrawRollsBack() throws Exception {
        String token = csrfToken();
        assertThat(toAgenda(token).getResponse().getStatus()).isEqualTo(201);
        long agendaItemId = activeAgendaItemId();
        jdbc.update("UPDATE help_request SET status = 'RESOLVED', status_before_agenda = NULL, learning = '닫음',"
                + " closed_at = ? WHERE id = ?", Timestamp.from(T0), helpRequest.getId());

        assertThat(withdraw(agendaItemId, token).getResponse().getStatus()).isGreaterThanOrEqualTo(500);

        assertThat(jdbc.queryForObject("SELECT status FROM agenda_item WHERE id = ?", String.class, agendaItemId))
                .isEqualTo("CONFIRMED");
        assertThat(helpStatus()).isEqualTo("RESOLVED");
    }

    /** 거둔 뒤 같은 도움 요청을 동시에 두 번 올리면 하나만 201, 하나는 409 — 거두지 않은 안건은 늘 하나. 여러 번 반복한다. */
    @Test
    void concurrentReRaisesCreateExactlyOneActiveAgendaItem() throws Exception {
        String token = csrfToken();
        assertThat(toAgenda(token).getResponse().getStatus()).isEqualTo(201);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int round = 0; round < 3; round++) {
                assertThat(withdraw(activeAgendaItemId(), token).getResponse().getStatus()).isEqualTo(200);
                CountDownLatch start = new CountDownLatch(1);
                List<Future<Integer>> results = new ArrayList<>();
                for (int t = 0; t < 2; t++) {
                    results.add(pool.submit(() -> {
                        start.await();
                        return toAgenda(token).getResponse().getStatus();
                    }));
                }
                start.countDown();
                List<Integer> statuses = new ArrayList<>();
                for (Future<Integer> result : results) {
                    statuses.add(result.get(30, TimeUnit.SECONDS));
                }
                assertThat(statuses).containsExactlyInAnyOrder(201, 409);
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM agenda_item WHERE source_help_request_id = ?"
                        + " AND status <> 'WITHDRAWN'", Integer.class, helpRequest.getId())).isEqualTo(1);
                assertThat(helpStatus()).isEqualTo("ON_AGENDA");
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM agenda_item WHERE source_help_request_id = ?"
                + " AND status = 'WITHDRAWN'", Integer.class, helpRequest.getId())).isEqualTo(3);
    }
}

package com.samdoryu.backend.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import com.samdoryu.backend.sync.dto.SyncStatus;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.web.session.HttpSessionDestroyedEvent;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 사무실 SSE({@code GET W/events}, CONTRACTS_API.md 「6」) — 연결 검사 · 이벤트 모양 · keep-alive · 연결 닫기.
 * 세션은 TestLogin, 강사 지정은 가짜. 이벤트 본문에는 자원 종류 · 동기화 상태만 있다.
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + WorkspaceEventHubTest.INSTRUCTOR_ID)
@AutoConfigureMockMvc
class WorkspaceEventHubTest {

    static final long INSTRUCTOR_ID = 9001L;
    private static final Long WS = 41L;

    @Autowired MockMvc mvc;
    @Autowired WorkspaceEventHub hub;
    @MockitoBean InstructorAssignmentService instructorAssignmentService;

    private MvcResult connect(MockHttpSession session) throws Exception {
        return mvc.perform(get("/api/workspaces/" + WS + "/events").session(session))
                .andExpect(request().asyncStarted())
                .andReturn();
    }

    private static MockHttpSession member() {
        return TestLogin.githubUser(7L, 1001L).member(WS, 10L, WorkspaceRole.PARTICIPANT).session();
    }

    @Test
    void memberReceivesSyncAndChangeEventsWithOnlyStatusAndResourceKinds() throws Exception {
        MvcResult stream = connect(member());

        hub.publishSync(WS, new SyncStatus("idle", Instant.parse("2026-11-05T03:00:05Z"), null, null, null, false,
                List.of()));
        hub.publishChangeAfterCommit(WS, SnapshotResource.TASKS, SnapshotResource.HELP_REQUESTS);
        String body = stream.getResponse().getContentAsString();

        assertThat(body).contains("event:sync", "\"state\":\"idle\"", "\"lastSucceededAt\":\"2026-11-05T03:00:05Z\"");
        assertThat(body).contains("event:change", "\"resources\":[\"tasks\",\"help_requests\"]");
        assertThat(stream.getResponse().getContentType()).startsWith("text/event-stream");
    }

    @Test
    void otherWorkspacesDoNotReceiveTheEvent() throws Exception {
        MvcResult stream = connect(member());

        hub.publishChangeAfterCommit(WS + 1, SnapshotResource.TASKS);

        assertThat(stream.getResponse().getContentAsString()).doesNotContain("event:change");
    }

    @Test
    void withoutAccessTheStreamIsNotOpened() throws Exception {
        mvc.perform(get("/api/workspaces/" + WS + "/events")).andExpect(status().isUnauthorized());
        MockHttpSession stranger = TestLogin.githubUser(8L, 1002L).member(WS + 1, 11L, WorkspaceRole.PARTICIPANT)
                .session();
        mvc.perform(get("/api/workspaces/" + WS + "/events").session(stranger)).andExpect(status().isNotFound());
    }

    /** 연결하자마자 주석 하나를 보내 응답 헤더가 바로 나간다 — 첫 keep-alive(최대 30초)까지 화면이 "연결 중"에 머물지 않게. */
    @Test
    void connectingSendsAPingCommentAtOnce() throws Exception {
        MvcResult stream = connect(member());

        assertThat(stream.getResponse().getContentAsString()).isEqualTo(":ping\n\n");
        assertThat(stream.getResponse().getContentType()).startsWith("text/event-stream");
    }

    @Test
    void keepAliveSendsAPingComment() throws Exception {
        MvcResult stream = connect(member());

        hub.keepAlive();

        assertThat(stream.getResponse().getContentAsString()).contains(":ping");
    }

    @Test
    void endedSessionClosesItsStreams() throws Exception {
        MockHttpSession session = member();
        connect(session);
        int before = hub.connectionCount(WS);

        hub.onSessionDestroyed(new HttpSessionDestroyedEvent(session));

        assertThat(hub.connectionCount(WS)).isEqualTo(before - 1);
    }

    /** 강사 지정이 풀리면 다음 keep-alive 때 연결을 닫는다(지정은 요청마다 DB 확인). */
    @Test
    void unassignedInstructorsStreamIsClosedOnTheNextKeepAlive() throws Exception {
        given(instructorAssignmentService.isCurrentlyAssigned(WS, INSTRUCTOR_ID)).willReturn(true);
        MockHttpSession instructor = TestLogin.githubUser(9L, INSTRUCTOR_ID).session();
        connect(instructor);
        int connected = hub.connectionCount(WS);

        given(instructorAssignmentService.isCurrentlyAssigned(WS, INSTRUCTOR_ID)).willReturn(false);
        hub.keepAlive();

        assertThat(hub.connectionCount(WS)).isEqualTo(connected - 1);
    }
}

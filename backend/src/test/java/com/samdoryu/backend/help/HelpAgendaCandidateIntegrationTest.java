package com.samdoryu.backend.help;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.domain.HelpRequestStatus;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * #50 48시간 미해결 도움 요청 = 안건 후보(FR-LRN-18) — 실제 API 응답의 {@code isAgendaCandidate}.
 * 후보 여부는 저장하지 않고 읽을 때 서버의 지금 시각으로 계산하므로, 글의 생성 시각을 지금 기준으로 둔다.
 * 기준값은 {@link HelpRequestStatus#AGENDA_CANDIDATE_AFTER} 한 곳이다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class HelpAgendaCandidateIntegrationTest {

    private static final Duration AFTER = HelpRequestStatus.AGENDA_CANDIDATE_AFTER;

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired HelpRequestRepository helpRequests;

    private Workspace ws;
    private Member alice;
    private MockHttpSession aliceSession;

    @BeforeEach
    void setUp() {
        Instant opened = Instant.now().minus(Duration.ofDays(7));
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, opened));
        alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, opened));
        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.PARTICIPANT).session();
    }

    private HelpRequest createdAgo(Duration age) {
        return helpRequests.saveAndFlush(new HelpRequest(ws, alice, "질문", null, Instant.now().minus(age)));
    }

    private ResultActions detail(HelpRequest helpRequest) throws Exception {
        return mvc.perform(get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/help-requests/"
                + Ids.toApi(helpRequest.getId())).session(aliceSession));
    }

    private void setStatus(HelpRequest helpRequest, HelpRequestStatus status) {
        em.flush();
        em.createNativeQuery("update help_request set status = ?1 where id = ?2")
                .setParameter(1, status.name()).setParameter(2, helpRequest.getId()).executeUpdate();
        em.clear();
    }

    @Test
    void openHelpRequestOlderThan48HoursIsCandidate() throws Exception {
        detail(createdAgo(AFTER.plusMinutes(1))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("open"))
                .andExpect(jsonPath("$.isAgendaCandidate").value(true));
    }

    @Test
    void youngerThan48HoursIsNotCandidate() throws Exception {
        detail(createdAgo(AFTER.minusMinutes(1))).andExpect(status().isOk())
                .andExpect(jsonPath("$.isAgendaCandidate").value(false));
    }

    @Test
    void discussingStaysCandidateButResolvedOrConvertedIsNot() throws Exception {
        HelpRequest discussing = createdAgo(AFTER.plusHours(1));
        HelpRequest resolved = createdAgo(AFTER.plusHours(1));
        HelpRequest onAgenda = createdAgo(AFTER.plusHours(1));
        setStatus(discussing, HelpRequestStatus.DISCUSSING);
        setStatus(resolved, HelpRequestStatus.RESOLVED);
        setStatus(onAgenda, HelpRequestStatus.ON_AGENDA);

        detail(discussing).andExpect(jsonPath("$.isAgendaCandidate").value(true));
        detail(resolved).andExpect(jsonPath("$.isAgendaCandidate").value(false));
        detail(onAgenda).andExpect(jsonPath("$.isAgendaCandidate").value(false));
    }
}

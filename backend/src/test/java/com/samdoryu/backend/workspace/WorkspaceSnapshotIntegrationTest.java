package com.samdoryu.backend.workspace;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.Meeting;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.MeetingRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * #103 {@code GET W/snapshot} 1단계 — 실제 Security · MVC · MySQL(CONTRACTS_API 「5」).
 * 계약 테스트 ② — 실제 응답 ↔ {@code contract/examples/workspace/workspace-snapshot.json}(목록 요소는 각 예시 JSON).
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + WorkspaceSnapshotIntegrationTest.INSTRUCTOR_GITHUB_ID)
@AutoConfigureMockMvc
@Transactional
class WorkspaceSnapshotIntegrationTest {

    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-05T01:20:00Z");

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired HelpRequestRepository helpRequests;
    @Autowired AgendaItemRepository agendaItems;
    @Autowired MeetingRepository meetings;

    private Workspace ws;
    private Workspace otherWs;
    private Member alice;
    private Member bob;
    private Member carol;
    private Member dave;
    private AppUser instructorUser;
    private MockHttpSession aliceSession;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        AppUser carolUser = users.saveAndFlush(AppUser.github(1003L, "carol", "캐럴", null));
        AppUser daveUser = users.saveAndFlush(AppUser.github(1004L, "dave", "데이브", null));
        instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, aliceUser, T0));
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), null));

        // 정렬 확인용: 자리 1 · 자리 0 · 자리 없음 · 빠진 팀원
        alice = Member.collaborator(ws, aliceUser, 1, true, T0);
        alice.giveActivityConsent(T0);
        alice = members.saveAndFlush(alice);
        bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 0, false, T0));
        carol = members.saveAndFlush(Member.collaborator(ws, carolUser, null, false, T0));
        dave = Member.collaborator(ws, daveUser, 2, false, T0);
        dave.remove(T0);
        dave = members.saveAndFlush(dave);
        Member aliceElsewhere = members.saveAndFlush(Member.collaborator(otherWs, aliceUser, 0, true, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, T0));
        helpRequests.saveAndFlush(new HelpRequest(otherWs, aliceElsewhere, "다른 사무실 질문", null, T0));

        aliceSession = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
    }

    private String snapshotPath(Workspace workspace) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId()) + "/snapshot";
    }

    private Meeting endedMeeting(Instant startedAt) {
        Meeting meeting = new Meeting(ws, List.of(alice, bob), startedAt);
        meeting.end("메모", startedAt.plus(Duration.ofMinutes(30)));
        return meetings.saveAndFlush(meeting);
    }

    @Test
    void memberReadsTheWorkspaceSnapshot() throws Exception {
        HelpRequest help = helpRequests.saveAndFlush(new HelpRequest(ws, alice, "세션이 끊겨요", null, T0));
        AgendaItem later = agendaItems.saveAndFlush(
                AgendaItem.withoutSource(ws, AgendaKind.OTHER, "회고 일정", null, null, null, bob, T0.plusSeconds(60)));
        AgendaItem earlier = agendaItems.saveAndFlush(
                AgendaItem.withoutSource(ws, AgendaKind.LEARNING, "CSRF 배운 점", null, null, null, alice, T0));
        Meeting ended = endedMeeting(T0);
        Meeting ongoing = meetings.saveAndFlush(new Meeting(ws, List.of(carol), T0.plus(Duration.ofHours(2))));
        // 결정 기록 API는 #37 몫이라 DB로 준비한다 — 끝난 회의에서 다룬 안건
        em.createNativeQuery("update agenda_item set status = 'DISCUSSED', conclusion = '정리함', "
                        + "decided_at = '2026-11-05 01:50:00', decided_by_member_id = ?1, meeting_id = ?2 where id = ?3")
                .setParameter(1, alice.getId()).setParameter(2, ended.getId()).setParameter(3, earlier.getId())
                .executeUpdate();
        em.clear();

        String response = mvc.perform(get(snapshotPath(ws)).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.workspace.id").value(Ids.toApi(ws.getId())))
                .andExpect(jsonPath("$.viewer.userId").value(Ids.toApi(alice.getUser().getId())))
                .andExpect(jsonPath("$.viewer.role").value("repo_admin"))
                .andExpect(jsonPath("$.viewer.memberId").value(Ids.toApi(alice.getId())))
                .andExpect(jsonPath("$.viewer.activityConsented").value(true))
                .andExpect(jsonPath("$.settings.projectStartDate").value("2026-11-04"))
                .andExpect(jsonPath("$.settings.reviewWaitHours").value(48))
                .andExpect(jsonPath("$.sync.state").value("idle"))
                .andExpect(jsonPath("$.members[*].id").value(contains(Ids.toApi(bob.getId()),
                        Ids.toApi(alice.getId()), Ids.toApi(carol.getId()), Ids.toApi(dave.getId()))))
                .andExpect(jsonPath("$.members[2].deskIndex").value(nullValue()))
                .andExpect(jsonPath("$.members[3].removedAt").isString())
                .andExpect(jsonPath("$.agendaItems[*].id").value(contains(Ids.toApi(earlier.getId()),
                        Ids.toApi(later.getId()))))
                .andExpect(jsonPath("$.agendaItems[0].status").value("discussed"))
                .andExpect(jsonPath("$.meetings[*].id").value(contains(Ids.toApi(ended.getId()),
                        Ids.toApi(ongoing.getId()))))
                .andExpect(jsonPath("$.meetings[0].status").value("ended"))
                .andExpect(jsonPath("$.meetings[0].discussedAgendaItemIds").value(contains(Ids.toApi(earlier.getId()))))
                .andExpect(jsonPath("$.meetings[1].status").value("ongoing"))
                .andExpect(jsonPath("$.meetings[1].attendeeMemberIds").value(contains(Ids.toApi(carol.getId()))))
                .andExpect(jsonPath("$.helpRequests[*].id").value(contains(Ids.toApi(help.getId()))))
                // 1단계 — 아직 채우지 않는 조각
                .andExpect(jsonPath("$.tasks").value(empty()))
                .andExpect(jsonPath("$.submissions").value(empty()))
                .andExpect(jsonPath("$.requirements").value(empty()))
                .andExpect(jsonPath("$.requirementLinks").value(empty()))
                .andExpect(jsonPath("$.activityNotes").value(empty()))
                .andExpect(jsonPath("$.flow.openSubmissionCount").value(0))
                .andExpect(jsonPath("$.generatedAt").isString())
                .andReturn().getResponse().getContentAsString();

        JsonNode actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("workspace", "workspace-snapshot.json"), actual);
        ContractShape.assertSameShape(ContractShape.readExample("meeting", "agenda-item.json"),
                actual.get("agendaItems").get(0));
        ContractShape.assertSameShape(ContractShape.readExample("meeting", "meeting.json"), actual.get("meetings").get(0));
        ContractShape.assertSameShape(ContractShape.readExample("help", "help-request-summary.json"),
                actual.get("helpRequests").get(0));
        ContractShape.assertCommonRules(actual);
    }

    @Test
    void viewerWithoutConsentOrAsInstructor() throws Exception {
        MockHttpSession bobSession = TestLogin.githubUser(bob.getUser().getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
        mvc.perform(get(snapshotPath(ws)).session(bobSession)).andExpect(status().isOk())
                .andExpect(jsonPath("$.viewer.role").value("participant"))
                .andExpect(jsonPath("$.viewer.activityConsented").value(false));

        MockHttpSession instructorSession = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
        mvc.perform(get(snapshotPath(ws)).session(instructorSession)).andExpect(status().isOk())
                .andExpect(jsonPath("$.viewer.role").value("instructor"))
                .andExpect(jsonPath("$.viewer.memberId").value(nullValue()))
                .andExpect(jsonPath("$.viewer.activityConsented").value(false));
    }

    /** 「5」 — 진행 중 + 최근 끝난 회의 20개, startedAt 오름차순. 더 오래 끝난 회의는 빠진다. */
    @Test
    void meetingsAreOngoingPlusTwentyMostRecentlyEnded() throws Exception {
        for (int i = 0; i < 22; i++) {
            endedMeeting(T0.plus(Duration.ofHours(i)));
        }
        meetings.saveAndFlush(new Meeting(ws, List.of(), T0.plus(Duration.ofDays(2))));

        mvc.perform(get(snapshotPath(ws)).session(aliceSession)).andExpect(status().isOk())
                .andExpect(jsonPath("$.meetings", hasSize(21)))
                .andExpect(jsonPath("$.meetings[0].startedAt").value("2026-11-05T03:20:00Z"))
                .andExpect(jsonPath("$.meetings[20].status").value("ongoing"));
    }

    /** 권한 없는 사무실은 존재를 숨긴다 — 다른 사무실 데이터는 어느 조각에도 섞이지 않는다(위 성공 테스트의 helpRequests). */
    @Test
    void workspaceWithoutAccessIs404() throws Exception {
        mvc.perform(get(snapshotPath(otherWs)).session(aliceSession)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }
}

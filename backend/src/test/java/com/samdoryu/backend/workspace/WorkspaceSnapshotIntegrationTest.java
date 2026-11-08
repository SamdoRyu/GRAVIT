package com.samdoryu.backend.workspace;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.samdoryu.backend.plan.domain.TaskDueDate;
import com.samdoryu.backend.plan.repository.TaskDueDateRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionIssueLink;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskAssignee;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.SubmissionIssueLinkRepository;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskAssigneeRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
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
    @Autowired TaskRepository tasks;
    @Autowired SubmissionRepository submissions;
    @Autowired TaskAssigneeRepository taskAssignees;
    @Autowired SubmissionIssueLinkRepository links;
    @Autowired TaskDueDateRepository dueDates;

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
                // 이슈 · PR이 없는 사무실 — tasks · submissions는 tasksAndSubmissionsPieces
                .andExpect(jsonPath("$.tasks").value(empty()))
                .andExpect(jsonPath("$.submissions").value(empty()))
                // 아직 채우지 않는 조각(#14 · #18 · FR-ACT)
                .andExpect(jsonPath("$.requirements").value(empty()))
                .andExpect(jsonPath("$.requirementLinks").value(empty()))
                .andExpect(jsonPath("$.activityNotes").value(empty()))
                .andExpect(jsonPath("$.flow.openSubmissionCount").value(0))
                .andExpect(jsonPath("$.flow.averageReviewWaitHours").value(nullValue())) // 열린 PR 없음
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

    /**
     * #103 2단계 — tasks · submissions 조각. 정렬(번호 순), 대표 담당자 순서(GitHub 사용자 ID 작은 사람 먼저), 우선순위(가장 높은
     * 라벨), 마감, PR–이슈 연결(양쪽), 리뷰 요청 · 리뷰의 팀원 짝짓기(팀원 아니면 빠짐 · null), 주소, 열린 PR 수(Draft 포함).
     */
    @Test
    void tasksAndSubmissionsPieces() throws Exception {
        Task second = tasks.saveAndFlush(task(ws, 2, "[]"));
        Task first = tasks.saveAndFlush(task(ws, 1, "[\"area:auth\",\"priority:low\",\"priority:high\"]"));
        tasks.saveAndFlush(task(otherWs, 1, "[]"));
        taskAssignees.saveAndFlush(new TaskAssignee(first, bob, T0));
        taskAssignees.saveAndFlush(new TaskAssignee(first, alice, T0));
        dueDates.saveAndFlush(new TaskDueDate(first, LocalDate.of(2026, 11, 7), alice.getUser(), T0));
        Submission open = submissions.saveAndFlush(submission(5, SubmissionState.OPEN,
                "[{\"githubUserId\":1002,\"login\":\"bob\"},{\"githubUserId\":7777,\"login\":\"stranger\"}]",
                "[{\"reviewerGithubUserId\":1003,\"reviewerGithubLogin\":\"carol\",\"state\":\"approved\","
                        + "\"submittedAt\":\"2026-11-05T02:00:00Z\"},"
                        + "{\"reviewerGithubUserId\":8888,\"reviewerGithubLogin\":\"outsider\",\"state\":\"commented\","
                        + "\"submittedAt\":\"2026-11-05T02:10:00Z\"}]"));
        submissions.saveAndFlush(submission(3, SubmissionState.DRAFT, "[]", "[]"));
        submissions.saveAndFlush(submission(4, SubmissionState.CLOSED, "[]", "[]"));
        links.saveAndFlush(new SubmissionIssueLink(open, first, "CLOSING_REFERENCE"));
        em.clear();

        String response = mvc.perform(get(snapshotPath(ws)).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks[*].githubIssueNumber").value(contains(1, 2)))
                .andExpect(jsonPath("$.tasks[0].id").value(Ids.toApi(first.getId())))
                .andExpect(jsonPath("$.tasks[0].assigneeMemberIds").value(contains(Ids.toApi(alice.getId()),
                        Ids.toApi(bob.getId()))))
                .andExpect(jsonPath("$.tasks[0].labels").value(contains("area:auth", "priority:low", "priority:high")))
                .andExpect(jsonPath("$.tasks[0].priority").value("high"))
                .andExpect(jsonPath("$.tasks[0].dueDate").value("2026-11-07"))
                .andExpect(jsonPath("$.tasks[0].linkedSubmissionIds").value(contains(Ids.toApi(open.getId()))))
                // isBlocked는 응답 시각 기준이라 고정 시각 T0 데이터로는 보지 않는다 — blockedSignalUsesTeamSettings
                .andExpect(jsonPath("$.tasks[0].htmlUrl").value("https://github.com/samdoryu/a/issues/1"))
                .andExpect(jsonPath("$.tasks[1].id").value(Ids.toApi(second.getId())))
                .andExpect(jsonPath("$.tasks[1].assigneeMemberIds").value(empty()))
                .andExpect(jsonPath("$.tasks[1].priority").value(nullValue()))
                .andExpect(jsonPath("$.tasks[1].dueDate").value(nullValue()))
                .andExpect(jsonPath("$.submissions[*].githubPrNumber").value(contains(3, 4, 5)))
                .andExpect(jsonPath("$.submissions[2].authorMemberId").value(Ids.toApi(alice.getId())))
                .andExpect(jsonPath("$.submissions[2].state").value("open"))
                .andExpect(jsonPath("$.submissions[2].reviewRequestedMemberIds").value(contains(Ids.toApi(bob.getId()))))
                .andExpect(jsonPath("$.submissions[2].reviews[0].reviewerMemberId").value(Ids.toApi(carol.getId())))
                .andExpect(jsonPath("$.submissions[2].reviews[0].state").value("approved"))
                .andExpect(jsonPath("$.submissions[2].reviews[1].reviewerMemberId").value(nullValue()))
                .andExpect(jsonPath("$.submissions[2].reviews[1].reviewerGithubLogin").value("outsider"))
                .andExpect(jsonPath("$.submissions[2].linkedTaskIds").value(contains(Ids.toApi(first.getId()))))
                .andExpect(jsonPath("$.submissions[2].suggestedReviewerMemberIds").value(empty()))
                .andExpect(jsonPath("$.submissions[2].htmlUrl").value("https://github.com/samdoryu/a/pull/5"))
                .andExpect(jsonPath("$.submissions[2].currentRound").value(nullValue()))
                .andExpect(jsonPath("$.submissions[0].state").value("draft"))
                .andExpect(jsonPath("$.flow.openSubmissionCount").value(2))
                // #249 평균 리뷰 대기 — Draft 제외 열린 PR 5만: T0(01:20) → 첫 센 리뷰 carol 02:00 = 40분 → 0.7
                .andExpect(jsonPath("$.flow.averageReviewWaitHours").value(0.7))
                .andReturn().getResponse().getContentAsString();

        JsonNode actual = ContractShape.readTree(response);
        // 예시의 tasks[0] · submissions[0](리뷰 요소 없음)과 같은 모양 — 리뷰 요소는 계약 GithubReviewDto 키로 본다
        ContractShape.assertSameShape(ContractShape.readExample("workspace", "workspace-snapshot.json"), actual);
        ContractShape.assertCommonRules(actual);
        assertThat(actual.get("submissions").get(2).get("reviews").get(0).propertyNames())
                .containsExactlyInAnyOrder("reviewerMemberId", "reviewerGithubLogin", "state", "submittedAt");
    }

    /**
     * #22 막힘 신호 — 응답 시각 기준, 기준값은 팀 설정. 담당자 있는 이슈 · 리뷰 없는 열린 PR이 60시간 멈춰 있으면 기본 48시간에서
     * 막힘이고 막힌 팀원(담당자 · 작성자)이 members 순서로 나온다. 팀 설정을 72시간으로 바꾸면 코드 수정 없이 풀린다.
     */
    @Test
    void blockedSignalUsesTeamSettings() throws Exception {
        Instant sixtyHoursAgo = Instant.now().minus(Duration.ofHours(60));
        Task assigned = tasks.saveAndFlush(taskChangedAt(1, sixtyHoursAgo));
        tasks.saveAndFlush(taskChangedAt(2, sixtyHoursAgo));                // 담당자 없음 — 백로그는 막히지 않는다
        taskAssignees.saveAndFlush(new TaskAssignee(assigned, bob, T0));
        Submission waiting = submissions.saveAndFlush(Submission.builder().workspace(ws).githubPrNumber(5)
                .title("PR 5").authorGithubUserId(1001L).authorGithubLogin("alice").authorMember(alice)
                .state(SubmissionState.OPEN).headSha("0123456789abcdef0123456789abcdef01234567")
                .reviewRequestsJson("[]").reviewsJson("[]").labelsJson("[]").githubCreatedAt(sixtyHoursAgo)
                .githubUpdatedAt(sixtyHoursAgo).stateChangedAt(sixtyHoursAgo).syncedAt(T0).build());
        em.clear();

        mvc.perform(get(snapshotPath(ws)).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks[0].id").value(Ids.toApi(assigned.getId())))
                .andExpect(jsonPath("$.tasks[0].isBlocked").value(true))
                .andExpect(jsonPath("$.tasks[1].isBlocked").value(false))
                .andExpect(jsonPath("$.submissions[0].id").value(Ids.toApi(waiting.getId())))
                .andExpect(jsonPath("$.submissions[0].isBlocked").value(true))
                .andExpect(jsonPath("$.flow.blockedMemberIds").value(contains(Ids.toApi(bob.getId()),
                        Ids.toApi(alice.getId()))));

        TeamSettings settings = teamSettings.findByWorkspaceId(ws.getId()).orElseThrow();
        settings.replace(settings.getProjectStartDate(), settings.getProjectEndDate(), null, 72, 72);
        teamSettings.saveAndFlush(settings);
        em.clear();

        mvc.perform(get(snapshotPath(ws)).session(aliceSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks[0].isBlocked").value(false))
                .andExpect(jsonPath("$.submissions[0].isBlocked").value(false))
                .andExpect(jsonPath("$.flow.blockedMemberIds").value(empty()));
    }

    private Task taskChangedAt(int number, Instant changedAt) {
        return Task.builder().workspace(ws).githubIssueNumber(number).title("이슈 " + number)
                .state(TaskState.OPEN).labelsJson("[]").githubCreatedAt(changedAt).githubUpdatedAt(changedAt)
                .stateChangedAt(changedAt).syncedAt(T0).build();
    }

    private static Task task(Workspace workspace, int number, String labelsJson) {
        return Task.builder().workspace(workspace).githubIssueNumber(number).title("이슈 " + number)
                .state(TaskState.OPEN).labelsJson(labelsJson).githubCreatedAt(T0).githubUpdatedAt(T0)
                .stateChangedAt(T0).syncedAt(T0).build();
    }

    private Submission submission(int number, SubmissionState state, String reviewRequestsJson, String reviewsJson) {
        return Submission.builder().workspace(ws).githubPrNumber(number).title("PR " + number)
                .authorGithubUserId(1001L).authorGithubLogin("alice").authorMember(alice).state(state)
                .headSha("0123456789abcdef0123456789abcdef01234567").reviewRequestsJson(reviewRequestsJson)
                .reviewsJson(reviewsJson).labelsJson("[]").githubCreatedAt(T0).githubUpdatedAt(T0)
                .stateChangedAt(T0).syncedAt(T0).build();
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

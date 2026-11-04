package com.samdoryu.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.AgendaStatus;
import com.samdoryu.backend.meeting.domain.Meeting;
import com.samdoryu.backend.meeting.domain.Standup;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.MeetingRepository;
import com.samdoryu.backend.meeting.repository.StandupRepository;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionIssueLink;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskAssignee;
import com.samdoryu.backend.sync.domain.TaskClosedReason;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.SubmissionIssueLinkRepository;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskAssigneeRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * #7 T4-b — 이슈 · PR 앱 모델, 회의 · 안건 · 스탠드업 테이블을 실제 MySQL로 확인한다(CONTRACTS.md 「2」 · 「3」).
 * 테스트마다 트랜잭션을 되돌린다.
 */
@SpringBootTest
@Transactional
class WorkflowSchemaIntegrationTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00.123456Z");
    private static final String SHA = "0123456789abcdef0123456789abcdef01234567";

    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired TaskRepository tasks;
    @Autowired TaskAssigneeRepository taskAssignees;
    @Autowired SubmissionRepository submissions;
    @Autowired SubmissionIssueLinkRepository links;
    @Autowired MeetingRepository meetings;
    @Autowired AgendaItemRepository agendaItems;
    @Autowired StandupRepository standups;

    private Workspace ws;
    private Workspace otherWs;
    private Member alice;
    private Member bob;

    @BeforeEach
    void setUp() {
        AppUser a = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser b = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, a, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, a, T0));
        alice = members.saveAndFlush(Member.collaborator(ws, a, 0, true, T0));
        bob = members.saveAndFlush(Member.collaborator(ws, b, 1, false, T0));
    }

    private Task task(Workspace workspace, int number) {
        return tasks.saveAndFlush(Task.builder().workspace(workspace).githubIssueNumber(number).title("이슈 " + number)
                .state(TaskState.OPEN).labelsJson("[\"priority:high\"]").githubCreatedAt(T0).githubUpdatedAt(T0)
                .stateChangedAt(T0).syncedAt(T0).build());
    }

    private Submission submission(Workspace workspace, int number) {
        return submissions.saveAndFlush(Submission.builder().workspace(workspace).githubPrNumber(number)
                .title("PR " + number).authorGithubUserId(1001L).authorGithubLogin("alice").authorMember(alice)
                .state(SubmissionState.OPEN).headSha(SHA).reviewRequestsJson("[]").reviewsJson("[]").labelsJson("[]")
                .githubCreatedAt(T0).githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build());
    }

    @Test
    void savesAndReadsBackEveryWorkflowEntity() {
        Task closed = tasks.saveAndFlush(Task.builder().workspace(ws).githubIssueNumber(7).title("닫힌 이슈")
                .state(TaskState.CLOSED).closedReason(TaskClosedReason.NOT_PLANNED).labelsJson("[]")
                .githubCreatedAt(T0).githubUpdatedAt(T0).closedAt(T0).stateChangedAt(T0).syncedAt(T0).build());
        taskAssignees.saveAndFlush(new TaskAssignee(closed, alice, T0));
        taskAssignees.saveAndFlush(new TaskAssignee(closed, bob, T0));
        Submission pr = submission(ws, 9);
        links.saveAndFlush(new SubmissionIssueLink(pr, closed, "CLOSING_REFERENCE"));
        Meeting meeting = meetings.saveAndFlush(new Meeting(ws, List.of(alice, bob), T0));
        AgendaItem agenda = agendaItems.saveAndFlush(AgendaItem.forSubmission(ws, pr, null, "실패 응답 모양을 바꿀까?",
                null, "로컬에서 401 확인", "의견이 갈림", alice, T0));
        standups.saveAndFlush(new Standup(ws, alice, LocalDate.of(2026, 11, 5), "", "CI가 느려요", T0));
        em.clear();

        Task readTask = tasks.findByWorkspaceIdAndGithubIssueNumber(ws.getId(), 7).orElseThrow();
        assertThat(readTask.getClosedReason()).isEqualTo(TaskClosedReason.NOT_PLANNED);
        assertThat(readTask.getSyncedAt()).isEqualTo(T0);
        assertThat(taskAssignees.findByTaskId(readTask.getId())).hasSize(2);
        assertThat(tasks.findByIdAndWorkspaceId(readTask.getId(), otherWs.getId())).isEmpty();

        Submission readPr = submissions.findByWorkspaceIdAndGithubPrNumber(ws.getId(), 9).orElseThrow();
        assertThat(readPr.getHeadSha()).isEqualTo(SHA);
        assertThat(readPr.getAuthorMember().getId()).isEqualTo(alice.getId());
        assertThat(links.findBySubmissionId(readPr.getId())).singleElement()
                .extracting(link -> link.getTask().getId()).isEqualTo(readTask.getId());

        Meeting readMeeting = meetings.findByIdAndWorkspaceId(meeting.getId(), ws.getId()).orElseThrow();
        assertThat(readMeeting.isOngoing()).isTrue();
        assertThat(readMeeting.getAttendees()).extracting(m -> m.getId())
                .containsExactlyInAnyOrder(alice.getId(), bob.getId());

        AgendaItem readAgenda = agendaItems.findByIdAndWorkspaceId(agenda.getId(), ws.getId()).orElseThrow();
        assertThat(readAgenda.getKind()).isEqualTo(AgendaKind.PR);
        assertThat(readAgenda.getStatus()).isEqualTo(AgendaStatus.CONFIRMED);
        assertThat(readAgenda.getSourceSubmission().getId()).isEqualTo(readPr.getId());
        assertThat(agendaItems.findByIdAndWorkspaceId(agenda.getId(), otherWs.getId())).isEmpty();

        Standup readStandup = standups.findByWorkspaceIdAndMemberIdAndDate(ws.getId(), alice.getId(),
                LocalDate.of(2026, 11, 5)).orElseThrow();
        assertThat(readStandup.getYesterday()).isEmpty();
        assertThat(readStandup.getBlockers()).isEqualTo("CI가 느려요");
    }

    @Nested
    class UniqueConstraints {

        @Test
        void issueNumberIsUniquePerWorkspaceOnly() {
            task(ws, 1);
            task(otherWs, 1);

            assertThatThrownBy(() -> task(ws, 1)).isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void prNumberIsUniquePerWorkspace() {
            submission(ws, 1);

            assertThatThrownBy(() -> submission(ws, 1)).isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void assigneeIsUniquePerTaskAndMember() {
            Task t = task(ws, 1);
            taskAssignees.saveAndFlush(new TaskAssignee(t, alice, T0));

            assertThatThrownBy(() -> taskAssignees.saveAndFlush(new TaskAssignee(t, alice, T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void linkIsUniquePerSubmissionAndTask() {
            Task t = task(ws, 1);
            Submission pr = submission(ws, 2);
            links.saveAndFlush(new SubmissionIssueLink(pr, t, "CLOSING_REFERENCE"));

            assertThatThrownBy(() -> links.saveAndFlush(new SubmissionIssueLink(pr, t, "CONNECTED")))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void standupIsUniquePerMemberAndDate() {
            LocalDate day = LocalDate.of(2026, 11, 5);
            standups.saveAndFlush(new Standup(ws, alice, day, "a", null, T0));
            standups.saveAndFlush(new Standup(ws, alice, day.plusDays(1), "b", null, T0));
            standups.saveAndFlush(new Standup(ws, bob, day, "c", null, T0));

            assertThatThrownBy(() -> standups.saveAndFlush(new Standup(ws, alice, day, "d", null, T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void oneOngoingMeetingPerWorkspace() {
            Meeting first = meetings.saveAndFlush(new Meeting(ws, List.of(), T0));
            meetings.saveAndFlush(new Meeting(otherWs, List.of(), T0));
            assertThat(meetings.existsByWorkspaceIdAndEndedAtIsNull(ws.getId())).isTrue();

            first.end("메모", T0.plusSeconds(600));
            meetings.saveAndFlush(first);
            assertThat(meetings.existsByWorkspaceIdAndEndedAtIsNull(ws.getId())).isFalse();
            meetings.saveAndFlush(new Meeting(ws, List.of(alice), T0.plusSeconds(900)));

            assertThatThrownBy(() -> meetings.saveAndFlush(new Meeting(ws, List.of(), T0.plusSeconds(1200))))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    /** DB CHECK 제약 — Entity를 거치지 않은 쓰기도 막는다. */
    @Nested
    class CheckConstraints {

        private static final String INSERT_AGENDA = "INSERT INTO agenda_item (workspace_id, kind, status, title,"
                + " source_task_id, source_submission_id, raised_by_member_id, raised_at)"
                + " VALUES (?, ?, 'CONFIRMED', 't', ?, ?, ?, '2026-11-05 03:00:00')";

        @Test
        void agendaWithMatchingSourcePasses() {
            Task t = task(ws, 1);

            assertThat(jdbc.update(INSERT_AGENDA, ws.getId(), "ISSUE", t.getId(), null, alice.getId())).isOne();
            assertThat(jdbc.update(INSERT_AGENDA, ws.getId(), "OTHER", null, null, alice.getId())).isOne();
        }

        @Test
        void issueAgendaNeedsATask() {
            assertThatThrownBy(() -> jdbc.update(INSERT_AGENDA, ws.getId(), "ISSUE", null, null, alice.getId()))
                    .isInstanceOf(DataAccessException.class);
        }

        @Test
        void learningAgendaHasNoSource() {
            Task t = task(ws, 1);

            assertThatThrownBy(() -> jdbc.update(INSERT_AGENDA, ws.getId(), "LEARNING", t.getId(), null,
                    alice.getId())).isInstanceOf(DataAccessException.class);
        }

        @Test
        void prAgendaCannotPointAtATask() {
            Task t = task(ws, 1);

            assertThatThrownBy(() -> jdbc.update(INSERT_AGENDA, ws.getId(), "PR", t.getId(), null, alice.getId()))
                    .isInstanceOf(DataAccessException.class);
        }

        @Test
        void discussedAgendaNeedsADecision() {
            AgendaItem item = agendaItems.saveAndFlush(AgendaItem.withoutSource(ws, AgendaKind.OTHER, "t", null, null,
                    null, alice, T0));

            assertThatThrownBy(() -> jdbc.update("UPDATE agenda_item SET status = 'DISCUSSED' WHERE id = ?",
                    item.getId())).isInstanceOf(DataAccessException.class);
        }

        @Test
        void prDecisionOnlyOnPrAgenda() {
            AgendaItem item = agendaItems.saveAndFlush(AgendaItem.withoutSource(ws, AgendaKind.OTHER, "t", null, null,
                    null, alice, T0));

            assertThatThrownBy(() -> jdbc.update("UPDATE agenda_item SET pr_decision = 'MERGE_AS_IS' WHERE id = ?",
                    item.getId())).isInstanceOf(DataAccessException.class);
        }

        @Test
        void openTaskHasNoClosedReason() {
            Task t = task(ws, 1);

            assertThatThrownBy(() -> jdbc.update("UPDATE task SET closed_reason = 'COMPLETED' WHERE id = ?",
                    t.getId())).isInstanceOf(DataAccessException.class);
        }
    }
}

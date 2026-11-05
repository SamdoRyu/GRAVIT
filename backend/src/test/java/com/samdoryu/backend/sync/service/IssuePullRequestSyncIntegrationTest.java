package com.samdoryu.backend.sync.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.github.GithubReaderSelector;
import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubPullRequest;
import com.samdoryu.backend.github.dto.GithubRepoRef;
import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.github.seed.SeedGithubReader;
import com.samdoryu.backend.plan.domain.TaskDueDate;
import com.samdoryu.backend.plan.repository.TaskDueDateRepository;
import com.samdoryu.backend.sync.domain.AssigneeOrder;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskClosedReason;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskAssigneeRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * #69 — 이슈 · PR · 리뷰 · 커밋 · 라벨을 읽어 저장하는 동기화를 실제 MySQL로 확인한다.
 * 시연 사무실은 실제 Seed 어댑터, 실제 사무실은 가짜 어댑터(GitHub를 부르지 않음)로 돈다.
 */
@SpringBootTest
@Transactional
class IssuePullRequestSyncIntegrationTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final Instant T1 = T0.plusSeconds(3600);

    @Autowired IssuePullRequestSyncService syncService;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired TaskRepository tasks;
    @Autowired TaskAssigneeRepository assignees;
    @Autowired SubmissionRepository submissions;
    @Autowired TaskDueDateRepository dueDates;
    @Autowired EvaluationRoundRepository rounds;

    @MockitoBean GithubReaderSelector readerSelector;

    private List<String> assigneeLogins(Workspace ws, int issueNumber) {
        Task task = tasks.findByWorkspaceIdAndGithubIssueNumber(ws.getId(), issueNumber).orElseThrow();
        List<Member> rows = assignees.findByTaskId(task.getId()).stream().map(a -> a.getMember()).toList();
        return AssigneeOrder.sort(rows).stream().map(m -> m.getGithubLogin()).toList();
    }

    /** 시연 사무실 — 실제 Seed 어댑터로 전부 읽는다. */
    @Nested
    class DemoWorkspaceWithSeed {

        private Workspace demo;

        @BeforeEach
        void setUp() {
            given(readerSelector.forKind(WorkspaceKind.DEMO)).willReturn(new SeedGithubReader());
            demo = workspaces.saveAndFlush(Workspace.demo("시연 사무실", T0));
            String[] logins = {"seed-kim", "seed-lee", "seed-park", "seed-choi"};
            for (int i = 0; i < logins.length; i++) {
                members.saveAndFlush(Member.demoSeed(demo, logins[i], "팀원 " + i, null, i));
            }
        }

        @Test
        void storesEveryIssueAndPullRequestFromTheSeed() {
            IssuePullRequestSyncService.Result result = syncService.sync(demo.getId(), null, T0);
            em.flush();
            em.clear();

            assertThat(result).isEqualTo(new IssuePullRequestSyncService.Result(6, 4));
            Task closedCompleted = tasks.findByWorkspaceIdAndGithubIssueNumber(demo.getId(), 4).orElseThrow();
            assertThat(closedCompleted.getState()).isEqualTo(TaskState.CLOSED);
            assertThat(closedCompleted.getClosedReason()).isEqualTo(TaskClosedReason.COMPLETED);
            assertThat(closedCompleted.getLabelsJson()).isEqualTo("[\"area:common\"]");
            assertThat(closedCompleted.getSyncedAt()).isEqualTo(T0);

            assertThat(submissions.findByWorkspaceIdAndGithubPrNumber(demo.getId(), 7).orElseThrow().getState())
                    .isEqualTo(SubmissionState.OPEN);
            assertThat(submissions.findByWorkspaceIdAndGithubPrNumber(demo.getId(), 8).orElseThrow().getState())
                    .isEqualTo(SubmissionState.DRAFT);
            assertThat(submissions.findByWorkspaceIdAndGithubPrNumber(demo.getId(), 10).orElseThrow().getState())
                    .isEqualTo(SubmissionState.CLOSED);

            Submission merged = submissions.findByWorkspaceIdAndGithubPrNumber(demo.getId(), 9).orElseThrow();
            assertThat(merged.getState()).isEqualTo(SubmissionState.MERGED);
            assertThat(merged.getHeadSha()).isEqualTo("3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d");
            assertThat(merged.getAuthorMember().getGithubLogin()).isEqualTo("seed-choi");
            assertThat(merged.getMergedAt()).isEqualTo(Instant.parse("2026-11-04T05:00:00Z"));
            assertThat(merged.getLastCommitAt()).isEqualTo(Instant.parse("2026-11-04T04:00:00Z"));
            assertThat(merged.getReviewsJson()).contains("\"changes_requested\"", "\"approved\"", "seed-kim");
        }

        @Test
        void storesEveryMemberAssigneeAndSkipsNonMembers() {
            syncService.sync(demo.getId(), null, T0);
            em.flush();
            em.clear();

            assertThat(assigneeLogins(demo, 1)).containsExactly("seed-kim");
            // 담당자 여럿 → 전원. Seed 팀원은 GitHub ID가 없어 memberId 순(lee가 park보다 먼저 들어옴)
            assertThat(assigneeLogins(demo, 2)).containsExactly("seed-lee", "seed-park");
            assertThat(assigneeLogins(demo, 3)).isEmpty();
            // seed-mentor는 팀원이 아님
            assertThat(assigneeLogins(demo, 5)).isEmpty();
            assertThat(assigneeLogins(demo, 6)).containsExactly("seed-park");
        }

        @Test
        void syncingTwiceDoesNotDuplicateRowsAndKeepsAppRecords() {
            syncService.sync(demo.getId(), null, T0);
            Task task = tasks.findByWorkspaceIdAndGithubIssueNumber(demo.getId(), 1).orElseThrow();
            AppUser someone = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
            dueDates.saveAndFlush(new TaskDueDate(task, LocalDate.of(2026, 11, 10), someone, T0));
            em.flush();
            long taskCount = tasks.count();
            long assigneeCount = assignees.count();

            syncService.sync(demo.getId(), null, T1);
            em.flush();
            em.clear();

            assertThat(tasks.count()).isEqualTo(taskCount);
            assertThat(assignees.count()).isEqualTo(assigneeCount);
            assertThat(submissions.count()).isEqualTo(4);
            Task again = tasks.findByWorkspaceIdAndGithubIssueNumber(demo.getId(), 1).orElseThrow();
            assertThat(again.getId()).isEqualTo(task.getId());
            assertThat(again.getSyncedAt()).isEqualTo(T1);
            // 바뀐 것이 없으면 stateChangedAt은 그대로
            assertThat(again.getStateChangedAt()).isEqualTo(task.getStateChangedAt());
            // 동기화는 앱 기록을 덮지 않는다
            assertThat(dueDates.findByTaskId(task.getId()).orElseThrow().getDueDate())
                    .isEqualTo(LocalDate.of(2026, 11, 10));
        }

        /** #19 — 새 PR마다 1회차(new_pr, 그때의 headSha). 다시 동기화해도 회차를 더 열지 않는다. */
        @Test
        void everyNewPullRequestGetsItsFirstRoundOnce() {
            syncService.sync(demo.getId(), null, T0);
            syncService.sync(demo.getId(), null, T1);
            em.flush();
            em.clear();

            assertThat(rounds.count()).isEqualTo(4);
            for (int number : new int[] {7, 8, 9, 10}) {
                Submission pr = submissions.findByWorkspaceIdAndGithubPrNumber(demo.getId(), number).orElseThrow();
                assertThat(rounds.findBySubmissionIdOrderByRoundNumberDesc(pr.getId())).singleElement()
                        .satisfies(round -> {
                            assertThat(round.getRoundNumber()).isEqualTo(1);
                            assertThat(round.getOpenedReason()).isEqualTo(RoundOpenedReason.NEW_PR);
                            assertThat(round.getHeadSha()).isEqualTo(pr.getHeadSha());
                            assertThat(round.getOpenedAt()).isEqualTo(T0);
                            assertThat(round.getClosedAt()).isNull();
                        });
            }
        }
    }

    /** 실제 사무실 — 가짜 어댑터. GitHub 사용자 ID로만 짝짓는지, 바뀐 값을 덮는지. */
    @Nested
    class GithubWorkspaceWithFakeReader {

        private final FakeGithubReader fake = new FakeGithubReader();
        private Workspace ws;

        @BeforeEach
        void setUp() {
            fake.expectedRepo = new GithubRepoRef("samdoryu", "repo", 77L);
            given(readerSelector.forKind(WorkspaceKind.GITHUB)).willReturn(fake);
            AppUser alice = users.saveAndFlush(AppUser.github(2002L, "alice", "앨리스", null));
            AppUser bob = users.saveAndFlush(AppUser.github(1001L, "bob", "밥", null));
            ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "repo", 77L, alice, T0));
            members.saveAndFlush(Member.collaborator(ws, alice, 0, true, T0));
            members.saveAndFlush(Member.collaborator(ws, bob, 1, false, T0));
        }

        private static GithubIssue issue(int number, boolean closed, Instant updatedAt, GithubUser... assignees) {
            return new GithubIssue(number, "이슈 " + number, closed, closed ? GithubIssue.ClosedReason.COMPLETED : null,
                    List.of("priority:high"), List.of(assignees), T0.minusSeconds(86400), updatedAt,
                    closed ? updatedAt : null);
        }

        @Test
        void matchesMembersByGithubUserIdNotLogin() {
            fake.issues = List.of(issue(1, false, T0,
                    new GithubUser(2002L, "alice-renamed", null),   // 로그인이 바뀌어도 같은 사람
                    new GithubUser(9999L, "bob", null),             // 로그인이 같아도 다른 사람
                    new GithubUser(1001L, "bob", null)));

            syncService.sync(ws.getId(), null, T0);
            em.flush();
            em.clear();

            // 대표 순서: GitHub ID 1001(bob) → 2002(alice)
            assertThat(assigneeLogins(ws, 1)).containsExactly("bob", "alice");
        }

        @Test
        void assigneeChangesAddAndRemoveRowsAndMoveStateChangedAt() {
            GithubUser alice = new GithubUser(2002L, "alice", null);
            GithubUser bob = new GithubUser(1001L, "bob", null);
            fake.issues = List.of(issue(1, false, T0, alice));
            syncService.sync(ws.getId(), null, T0);

            Instant later = T0.plusSeconds(600);
            fake.issues = List.of(issue(1, false, later, bob));
            syncService.sync(ws.getId(), T0, T1);
            em.flush();
            em.clear();

            assertThat(assigneeLogins(ws, 1)).containsExactly("bob");
            assertThat(tasks.findByWorkspaceIdAndGithubIssueNumber(ws.getId(), 1).orElseThrow().getStateChangedAt())
                    .isEqualTo(later);
        }

        @Test
        void closingAnIssueOverwritesStateAndKeepsTheRow() {
            fake.issues = List.of(issue(1, false, T0));
            syncService.sync(ws.getId(), null, T0);
            Long id = tasks.findByWorkspaceIdAndGithubIssueNumber(ws.getId(), 1).orElseThrow().getId();

            Instant closedAt = T0.plusSeconds(900);
            fake.issues = List.of(issue(1, true, closedAt));
            syncService.sync(ws.getId(), T0, T1);
            em.flush();
            em.clear();

            Task closed = tasks.findById(id).orElseThrow();
            assertThat(closed.getState()).isEqualTo(TaskState.CLOSED);
            assertThat(closed.getClosedReason()).isEqualTo(TaskClosedReason.COMPLETED);
            assertThat(closed.getStateChangedAt()).isEqualTo(closedAt);
        }

        @Test
        void newHeadShaOverwritesAndNonMemberAuthorHasNoMember() {
            String sha1 = "a".repeat(40);
            String sha2 = "b".repeat(40);
            GithubUser outsider = new GithubUser(7777L, "outsider", null);
            fake.pullRequests = List.of(pr(3, outsider, sha1));
            syncService.sync(ws.getId(), null, T0);

            fake.pullRequests = List.of(pr(3, outsider, sha2));
            syncService.sync(ws.getId(), T0, T1);
            em.flush();
            em.clear();

            Submission read = submissions.findByWorkspaceIdAndGithubPrNumber(ws.getId(), 3).orElseThrow();
            assertThat(read.getHeadSha()).isEqualTo(sha2);
            assertThat(read.getAuthorGithubUserId()).isEqualTo(7777L);
            assertThat(read.getAuthorMember()).isNull();
            assertThat(read.getReviewRequestsJson()).contains("1001");
            assertThat(submissions.count()).isEqualTo(1);
        }

        private GithubPullRequest pr(int number, GithubUser author, String sha) {
            return new GithubPullRequest(number, "PR " + number, author, false, false, false, sha, List.of(),
                    List.of(new GithubUser(1001L, "bob", null)), T0, T0, null, null);
        }
    }
}

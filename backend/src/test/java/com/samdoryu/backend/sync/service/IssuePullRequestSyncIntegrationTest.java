package com.samdoryu.backend.sync.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.evaluation.domain.Evaluation;
import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.domain.Verdict;
import com.samdoryu.backend.evaluation.repository.EvaluationRepository;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.github.GithubReaderSelector;
import com.samdoryu.backend.github.dto.GithubCommit;
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
import com.samdoryu.backend.sync.dto.MemberCommit;
import com.samdoryu.backend.sync.repository.SubmissionCommitRepository;
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
    @Autowired EvaluationRepository evaluations;
    @Autowired SubmissionCommitRepository commits;
    @Autowired SyncedItemService syncedItems;

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
            // PR 커밋(#261) — Seed PR마다 하나, 작성자는 Seed 로그인 이름으로 짝지은 팀원
            assertThat(commits.count()).isEqualTo(4);
            assertThat(commits.findByWorkspaceIdAndShaIn(demo.getId(), List.of(merged.getHeadSha())))
                    .singleElement().satisfies(c -> assertThat(c.getAuthorMember().getGithubLogin()).isEqualTo("seed-choi"));
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
        private Member aliceMember;
        private Member bobMember;

        @BeforeEach
        void setUp() {
            fake.expectedRepo = new GithubRepoRef("samdoryu", "repo", 77L);
            given(readerSelector.forKind(WorkspaceKind.GITHUB)).willReturn(fake);
            AppUser alice = users.saveAndFlush(AppUser.github(2002L, "alice", "앨리스", null));
            AppUser bob = users.saveAndFlush(AppUser.github(1001L, "bob", "밥", null));
            ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "repo", 77L, alice, T0));
            aliceMember = members.saveAndFlush(Member.collaborator(ws, alice, 0, true, T0));
            bobMember = members.saveAndFlush(Member.collaborator(ws, bob, 1, false, T0));
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

        /**
         * #261 — PR 커밋을 저장하고 팀원별로 읽는다. 작성자는 GitHub 사용자 ID로 짝짓고(이메일이 계정과 이어지지 않은 커밋 ·
         * 팀원이 아닌 사람은 누구의 커밋도 아님), 기간은 작성 시각 {@code [from, to)}. PR의 마지막 커밋 시각은 마지막 커밋의 커밋
         * 시각이다. 다시 동기화하거나 같은 커밋이 다른 PR에 있어도 행이 늘지 않는다.
         */
        @Test
        void pullRequestCommitsAreStoredAndReadPerAuthorMemberWithinTheAuthoredWindow() {
            GithubUser alice = new GithubUser(2002L, "alice", null);
            GithubUser bob = new GithubUser(1001L, "bob", null);
            Instant from = Instant.parse("2026-11-04T15:00:00Z"); // 11-05 00:00 KST
            Instant to = from.plusSeconds(86400);
            GithubCommit early = new GithubCommit("c".repeat(40), alice, "세션 만료 처리", from.minusSeconds(1),
                    from.minusSeconds(1));
            GithubCommit first = new GithubCommit("d".repeat(40), alice, "로그인 오류 문구", from, from.plusSeconds(60));
            GithubCommit unlinked = new GithubCommit("e".repeat(40), null, "이메일이 이어지지 않은 커밋",
                    from.plusSeconds(100), from.plusSeconds(100));
            GithubCommit bobs = new GithubCommit("f".repeat(40), bob, "리뷰 반영", from.plusSeconds(200),
                    from.plusSeconds(200));
            GithubCommit last = new GithubCommit("1".repeat(40), alice, "테스트 추가", from.plusSeconds(300),
                    to.plusSeconds(10));
            fake.pullRequests = List.of(pr(3, alice, "1".repeat(40)));
            fake.commits.put(3, List.of(early, first, unlinked, bobs, last));
            syncService.sync(ws.getId(), null, T0);

            // 같은 PR을 다시 읽고, 같은 커밋이 든 다른 PR도 들어온다
            fake.pullRequests = List.of(pr(3, alice, "1".repeat(40)), pr(4, bob, "f".repeat(40)));
            fake.commits.put(4, List.of(bobs));
            syncService.sync(ws.getId(), T0, T1);
            em.flush();
            em.clear();

            assertThat(commits.count()).isEqualTo(5);
            assertThat(submissions.findByWorkspaceIdAndGithubPrNumber(ws.getId(), 3).orElseThrow().getLastCommitAt())
                    .isEqualTo(to.plusSeconds(10));
            assertThat(syncedItems.listCommits(ws.getId(), aliceMember.getId(), from, to))
                    .containsExactly(new MemberCommit("d".repeat(40), "로그인 오류 문구", from),
                            new MemberCommit("1".repeat(40), "테스트 추가", from.plusSeconds(300)));
            assertThat(syncedItems.listCommits(ws.getId(), bobMember.getId(), from, to))
                    .extracting(MemberCommit::sha).containsExactly("f".repeat(40));
            // 다른 사무실 조건으로는 보이지 않는다
            assertThat(syncedItems.listCommits(ws.getId() + 1000, aliceMember.getId(), from, to)).isEmpty();
        }

        private GithubPullRequest pr(int number, GithubUser author, String sha) {
            return new GithubPullRequest(number, "PR " + number, author, false, false, false, sha, List.of(),
                    List.of(new GithubUser(1001L, "bob", null)), T0, T0, null, null);
        }

        private GithubPullRequest mergedPr(int number, GithubUser author, String sha, Instant mergedAt) {
            return new GithubPullRequest(number, "PR " + number, author, false, true, true, sha, List.of(),
                    List.of(), T0, mergedAt, mergedAt, mergedAt);
        }

        /**
         * #46 FR-LRN-06 — 열린 PR에 새 커밋이 오면 새 회차(new_commit)를 열고 이전 회차를 닫는다. 이전 회차와 평가는 그대로,
         * 회차 ID는 headSha와 별개. 같은 커밋으로 다시 동기화하거나 머지된 뒤 커밋이 바뀌면 회차를 열지 않는다.
         */
        @Test
        void newCommitOnAnOpenPullRequestOpensANewRoundAndKeepsThePreviousOne() {
            String sha1 = "a".repeat(40);
            String sha2 = "b".repeat(40);
            String sha3 = "c".repeat(40);
            GithubUser alice = new GithubUser(2002L, "alice", null);
            fake.pullRequests = List.of(pr(3, alice, sha1));
            syncService.sync(ws.getId(), null, T0);
            Submission pr = submissions.findByWorkspaceIdAndGithubPrNumber(ws.getId(), 3).orElseThrow();
            EvaluationRound first = rounds.findFirstBySubmissionIdOrderByRoundNumberDesc(pr.getId()).orElseThrow();
            AppUser bob = users.findByGithubUserId(1001L).orElseThrow();
            evaluations.saveAndFlush(new Evaluation(first, bob, Verdict.NOT_RECOMMEND, "응답 모양이 달라요", T0));

            fake.pullRequests = List.of(pr(3, alice, sha2));
            syncService.sync(ws.getId(), T0, T1);
            // 같은 커밋으로 다시 동기화 — 회차가 늘지 않는다
            syncService.sync(ws.getId(), T0, T1.plusSeconds(60));
            em.flush();
            em.clear();

            List<EvaluationRound> afterCommit = rounds.findBySubmissionIdOrderByRoundNumberDesc(pr.getId());
            assertThat(afterCommit).extracting(EvaluationRound::getRoundNumber, EvaluationRound::getOpenedReason,
                            EvaluationRound::getHeadSha)
                    .containsExactly(
                            org.assertj.core.groups.Tuple.tuple(2, RoundOpenedReason.NEW_COMMIT, sha2),
                            org.assertj.core.groups.Tuple.tuple(1, RoundOpenedReason.NEW_PR, sha1));
            assertThat(afterCommit.get(0).getOpenedAt()).isEqualTo(T1);
            assertThat(afterCommit.get(0).getClosedAt()).isNull();
            assertThat(afterCommit.get(1).getClosedAt()).isEqualTo(T1);
            // 회차 ID는 headSha와 별개 — 숫자 ID
            assertThat(afterCommit.get(0).getId().toString()).isNotEqualTo(sha2);
            // 이전 회차의 평가는 그대로 남는다
            assertThat(evaluations.findByRoundIdOrderByIdAsc(first.getId())).singleElement()
                    .satisfies(e -> assertThat(e.getReason()).isEqualTo("응답 모양이 달라요"));

            // 머지된 PR은 커밋이 바뀌어도 새 회차를 열지 않는다(평가를 받지 않음)
            fake.pullRequests = List.of(mergedPr(3, alice, sha3, T1.plusSeconds(120)));
            syncService.sync(ws.getId(), T1, T1.plusSeconds(180));
            em.flush();
            em.clear();
            assertThat(rounds.findBySubmissionIdOrderByRoundNumberDesc(pr.getId())).hasSize(2);
        }

        /** Draft도 열린 PR이다 — 새 커밋이면 새 회차. */
        @Test
        void newCommitOnADraftAlsoOpensANewRound() {
            GithubUser alice = new GithubUser(2002L, "alice", null);
            fake.pullRequests = List.of(new GithubPullRequest(4, "PR 4", alice, true, false, false, "d".repeat(40),
                    List.of(), List.of(), T0, T0, null, null));
            syncService.sync(ws.getId(), null, T0);
            fake.pullRequests = List.of(new GithubPullRequest(4, "PR 4", alice, true, false, false, "e".repeat(40),
                    List.of(), List.of(), T0, T1, null, null));
            syncService.sync(ws.getId(), T0, T1);
            em.flush();
            em.clear();

            Submission draft = submissions.findByWorkspaceIdAndGithubPrNumber(ws.getId(), 4).orElseThrow();
            assertThat(rounds.findBySubmissionIdOrderByRoundNumberDesc(draft.getId()))
                    .extracting(EvaluationRound::getOpenedReason)
                    .containsExactly(RoundOpenedReason.NEW_COMMIT, RoundOpenedReason.NEW_PR);
        }
    }
}

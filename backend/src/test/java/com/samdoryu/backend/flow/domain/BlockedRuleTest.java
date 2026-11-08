package com.samdoryu.backend.flow.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.TaskClosedReason;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.dto.GithubReviewDto;
import com.samdoryu.backend.sync.dto.SubmissionDto;
import com.samdoryu.backend.sync.dto.TaskDto;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 막힘 신호 규칙(FR-FLOW-01 · P9) — 기준 시간을 넘기면(초과) 막힘, 기준값은 팀 설정에서 받는다. */
class BlockedRuleTest {

    private static final Instant NOW = Instant.parse("2026-11-10T00:00:00Z");
    private static final BlockedRule DEFAULT = BlockedRule.ofHours(48, 48);

    private static Instant hoursAgo(long hours) {
        return NOW.minus(Duration.ofHours(hours));
    }

    private static SubmissionDto pr(String id, SubmissionState state, Instant stateChangedAt, Instant lastCommitAt,
            GithubReviewDto... reviews) {
        return new SubmissionDto(id, Integer.parseInt(id), "PR " + id, "1", "alice", state,
                "0123456789abcdef0123456789abcdef01234567", List.of(), List.of(reviews), List.of(), List.of(), null,
                List.of(), false, null, hoursAgo(500), hoursAgo(1), null, null, lastCommitAt, stateChangedAt,
                hoursAgo(0), null);
    }

    private static GithubReviewDto review(String login, String state, Instant submittedAt) {
        return new GithubReviewDto(null, login, state, submittedAt);
    }

    private static TaskDto task(TaskState state, List<String> assignees, Instant stateChangedAt,
            String... linkedSubmissionIds) {
        return new TaskDto("41", 12, "이슈", state, state == TaskState.CLOSED ? TaskClosedReason.COMPLETED : null,
                assignees, List.of(), null, null, List.of(linkedSubmissionIds), false, null, hoursAgo(500),
                hoursAgo(1), null, stateChangedAt, hoursAgo(0));
    }

    // --- 열린 PR: 리뷰 대기 ---

    @Test
    void openPrWithoutReviewIsBlockedOnlyAfterReviewWaitIsExceeded() {
        assertThat(DEFAULT.isBlocked(pr("1", SubmissionState.OPEN, hoursAgo(47), null), NOW)).isFalse();
        assertThat(DEFAULT.isBlocked(pr("1", SubmissionState.OPEN, hoursAgo(48), null), NOW)).isFalse();
        assertThat(DEFAULT.isBlocked(pr("1", SubmissionState.OPEN, hoursAgo(48).minusSeconds(1), null), NOW)).isTrue();
    }

    @Test
    void reviewWaitStartsAtTheLaterOfOpeningAndLastCommit() {
        // 열린 지 100시간이지만 10시간 전에 새 커밋 — 리뷰 대기는 10시간
        assertThat(DEFAULT.isBlocked(pr("1", SubmissionState.OPEN, hoursAgo(100), hoursAgo(10)), NOW)).isFalse();
        // 커밋은 오래전이고 Draft에서 열린 지 60시간
        assertThat(DEFAULT.isBlocked(pr("1", SubmissionState.OPEN, hoursAgo(60), hoursAgo(200)), NOW)).isTrue();
    }

    @Test
    void ownDismissedAndStaleReviewsDoNotEndTheReviewWait() {
        SubmissionDto pr = pr("1", SubmissionState.OPEN, hoursAgo(100), hoursAgo(60),
                review("Alice", "commented", hoursAgo(50)),       // 작성자 본인(대소문자 무시)
                review("bob", "dismissed", hoursAgo(50)),         // 철회된 리뷰
                review("carol", "approved", hoursAgo(70)));       // 마지막 커밋 전 리뷰
        assertThat(DEFAULT.isBlocked(pr, NOW)).isTrue();
    }

    // --- 열린 PR: 리뷰 뒤에는 작성자 차례(커밋 없음) ---

    @Test
    void reviewedPrUsesNoCommitFromTheLastReview() {
        BlockedRule rule = BlockedRule.ofHours(24, 72);
        SubmissionDto reviewed = pr("1", SubmissionState.OPEN, hoursAgo(100), null,
                review("bob", "changes_requested", hoursAgo(90)),
                review("carol", "commented", hoursAgo(50)));
        // 리뷰 대기 기준(24)은 넘었지만 리뷰를 받았으니 커밋 없음 기준(72)으로 — 마지막 리뷰 50시간 전
        assertThat(rule.isBlocked(reviewed, NOW)).isFalse();
        assertThat(BlockedRule.ofHours(24, 49).isBlocked(reviewed, NOW)).isTrue();
    }

    // --- Draft · 머지 · 닫힘 ---

    @Test
    void draftPrOnlyUsesNoCommit() {
        BlockedRule rule = BlockedRule.ofHours(1, 48);
        assertThat(rule.isBlocked(pr("1", SubmissionState.DRAFT, hoursAgo(100), hoursAgo(30)), NOW)).isFalse();
        assertThat(rule.isBlocked(pr("1", SubmissionState.DRAFT, hoursAgo(100), hoursAgo(49)), NOW)).isTrue();
        // 커밋이 없으면 Draft가 된 시각부터
        assertThat(rule.isBlocked(pr("1", SubmissionState.DRAFT, hoursAgo(49), null), NOW)).isTrue();
        assertThat(rule.isBlocked(pr("1", SubmissionState.DRAFT, hoursAgo(5), null), NOW)).isFalse();
    }

    @Test
    void mergedAndClosedPrsAreNeverBlocked() {
        assertThat(DEFAULT.isBlocked(pr("1", SubmissionState.MERGED, hoursAgo(500), hoursAgo(500)), NOW)).isFalse();
        assertThat(DEFAULT.isBlocked(pr("1", SubmissionState.CLOSED, hoursAgo(500), hoursAgo(500)), NOW)).isFalse();
    }

    // --- 이슈 ---

    @Test
    void closedOrUnassignedTasksAreNeverBlocked() {
        assertThat(DEFAULT.isBlocked(task(TaskState.CLOSED, List.of("1"), hoursAgo(500)), Map.of(), NOW)).isFalse();
        assertThat(DEFAULT.isBlocked(task(TaskState.OPEN, List.of(), hoursAgo(500)), Map.of(), NOW)).isFalse();
    }

    @Test
    void assignedTaskWithoutLinkedPrUsesNoCommitFromStateChange() {
        BlockedRule rule = BlockedRule.ofHours(1, 48);
        assertThat(rule.isBlocked(task(TaskState.OPEN, List.of("1"), hoursAgo(47)), Map.of(), NOW)).isFalse();
        assertThat(rule.isBlocked(task(TaskState.OPEN, List.of("1"), hoursAgo(49)), Map.of(), NOW)).isTrue();
    }

    @Test
    void finishedLinkedPrActivityCountsForTheTask() {
        SubmissionDto merged = pr("9", SubmissionState.MERGED, hoursAgo(10), hoursAgo(20));
        TaskDto task = task(TaskState.OPEN, List.of("1"), hoursAgo(100), "9");
        assertThat(DEFAULT.isBlocked(task, Map.of("9", merged), NOW)).isFalse();

        SubmissionDto oldMerged = pr("9", SubmissionState.MERGED, hoursAgo(60), hoursAgo(70));
        assertThat(DEFAULT.isBlocked(task, Map.of("9", oldMerged), NOW)).isTrue();
    }

    @Test
    void taskWithOpenLinkedPrFollowsThePr() {
        TaskDto task = task(TaskState.OPEN, List.of("1"), hoursAgo(200), "9", "10");
        SubmissionDto waitingShort = pr("9", SubmissionState.OPEN, hoursAgo(5), hoursAgo(300));
        SubmissionDto waitingLong = pr("10", SubmissionState.OPEN, hoursAgo(60), null);
        // 이슈는 200시간 전 담당자가 정해졌지만 PR이 리뷰를 기다린 지 5시간 — 막히지 않음
        assertThat(DEFAULT.isBlocked(task, Map.of("9", waitingShort), NOW)).isFalse();
        // 연결 PR 중 하나라도 막히면 막힘
        assertThat(DEFAULT.isBlocked(task, Map.of("9", waitingShort, "10", waitingLong), NOW)).isTrue();
    }

    // --- 응답 조립 ---

    @Test
    void applyMarksItemsAndPicksBlockedMembersInMemberOrder() {
        TaskDto blockedTask = task(TaskState.OPEN, List.of("3", "2"), hoursAgo(60));
        TaskDto freshTask = task(TaskState.OPEN, List.of("4"), hoursAgo(1));
        SubmissionDto blockedPr = pr("9", SubmissionState.OPEN, hoursAgo(60), null);   // 작성자 "1"
        SubmissionDto outsiderPr = new SubmissionDto("10", 10, "PR 10", null, "outsider", SubmissionState.OPEN,
                "0123456789abcdef0123456789abcdef01234567", List.of(), List.of(), List.of(), List.of(), null,
                List.of(), false, null, hoursAgo(500), hoursAgo(1), null, null, null, hoursAgo(60), hoursAgo(0),
                null);

        BlockedRule.Applied applied = DEFAULT.apply(List.of(blockedTask, freshTask), List.of(blockedPr, outsiderPr),
                List.of("2", "4", "1", "3", "5"), NOW);

        assertThat(applied.tasks()).extracting(TaskDto::isBlocked).containsExactly(true, false);
        assertThat(applied.submissions()).extracting(SubmissionDto::isBlocked).containsExactly(true, true);
        // 팀원이 아닌 작성자(null)는 빠지고, 응답 members 순서를 따른다
        assertThat(applied.blockedMemberIds()).containsExactly("2", "1", "3");
    }

    @Test
    void changingTheThresholdChangesTheResultWithoutCodeChanges() {
        SubmissionDto pr = pr("1", SubmissionState.OPEN, hoursAgo(60), null);
        assertThat(BlockedRule.ofHours(48, 48).isBlocked(pr, NOW)).isTrue();
        assertThat(BlockedRule.ofHours(72, 48).isBlocked(pr, NOW)).isFalse();
    }

    // --- 평균 리뷰 대기 (FR-FLOW-05 · #249) — 프론트 tests/contract/flow.test.ts와 같은 예시 ---

    private static SubmissionDto openPrBy(String authorLogin, Instant stateChangedAt, GithubReviewDto... reviews) {
        return new SubmissionDto("9", 9, "PR 9", null, authorLogin, SubmissionState.OPEN,
                "0123456789abcdef0123456789abcdef01234567", List.of(), List.of(reviews), List.of(), List.of(), null,
                List.of(), false, null, hoursAgo(500), hoursAgo(1), null, null, null, stateChangedAt, hoursAgo(0), null);
    }

    @Test
    void averageReviewWaitIsNullWithoutOpenPrsAndSkipsDraftMergedClosed() {
        assertThat(BlockedRule.averageReviewWaitHours(List.of(), NOW)).isNull();
        assertThat(BlockedRule.averageReviewWaitHours(List.of(
                pr("1", SubmissionState.DRAFT, hoursAgo(10), null),
                pr("2", SubmissionState.MERGED, hoursAgo(10), null),
                pr("3", SubmissionState.CLOSED, hoursAgo(10), null)), NOW)).isNull();
    }

    @Test
    void averageReviewWaitRunsToNowWithoutReviewAndStartsAtTheLaterOfOpeningAndLastCommit() {
        assertThat(BlockedRule.averageReviewWaitHours(List.of(pr("1", SubmissionState.OPEN, hoursAgo(19), null)), NOW))
                .isEqualTo(19.0);
        assertThat(BlockedRule.averageReviewWaitHours(
                List.of(pr("1", SubmissionState.OPEN, hoursAgo(10), hoursAgo(4))), NOW)).isEqualTo(4.0);
    }

    @Test
    void averageReviewWaitEndsAtTheFirstCountedReview() {
        SubmissionDto pr = pr("1", SubmissionState.OPEN, hoursAgo(10), hoursAgo(8),
                review("samdo-lee", "approved", hoursAgo(9)),           // 마지막 커밋 전 — 세지 않음
                review("Alice", "commented", hoursAgo(7)),              // 작성자 본인(대소문자 무시)
                review("dev-park", "dismissed", hoursAgo(6)),
                review("hana-choi", "changes_requested", hoursAgo(3)),  // 첫 센 리뷰
                review("samdo-lee", "approved", hoursAgo(1)));
        assertThat(BlockedRule.averageReviewWaitHours(List.of(pr), NOW)).isEqualTo(5.0);
    }

    @Test
    void averageReviewWaitAveragesPerPrAndRoundsToOneDecimal() {
        List<SubmissionDto> submissions = List.of(
                pr("1", SubmissionState.OPEN, hoursAgo(2), null),                                       // 2
                pr("2", SubmissionState.OPEN, hoursAgo(3), null,
                        review("samdo-lee", "commented", NOW.minus(Duration.ofMinutes(165)))),          // 0.25
                pr("3", SubmissionState.DRAFT, hoursAgo(30), null));                                    // 빠짐
        // (2 + 0.25) / 2 = 1.125 → 1.1
        assertThat(BlockedRule.averageReviewWaitHours(submissions, NOW)).isEqualTo(1.1);
    }

    @Test
    void averageReviewWaitCountsReviewsWhenAuthorIsUnknownAndNeverGoesNegative() {
        assertThat(BlockedRule.averageReviewWaitHours(
                List.of(openPrBy(null, hoursAgo(6), review("alice", "commented", hoursAgo(4)))), NOW)).isEqualTo(2.0);
        assertThat(BlockedRule.averageReviewWaitHours(List.of(openPrBy("alice", NOW.plus(Duration.ofHours(1)))), NOW))
                .isEqualTo(0.0);
    }
}

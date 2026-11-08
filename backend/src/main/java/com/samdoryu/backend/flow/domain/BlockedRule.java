package com.samdoryu.backend.flow.domain;

import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.dto.GithubReviewDto;
import com.samdoryu.backend.sync.dto.SubmissionDto;
import com.samdoryu.backend.sync.dto.TaskDto;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 막힘 신호(FR-FLOW-01 · P9) — 규칙은 여기 한 곳에만 둔다. 저장하지 않고 읽을 때 계산한다(CONTRACTS.md 「2」).
 * 기준 시간은 팀 설정({@code TeamSettings.reviewWaitHours} · {@code noCommitHours})에서 받고, 기준 시간을 <b>넘기면</b>(초과) 막힘이다.
 * 이유는 내보내지 않는다 — 막혔는지만(FR-FLOW-02).
 *
 * <p>구현 기본값(계약은 기준값 두 개만 정한다):
 * <ul>
 *   <li><b>열린 PR</b> — 리뷰를 기다리는 중이면 리뷰 대기, 리뷰를 받은 뒤면 작성자 차례라 커밋 없음으로 본다.
 *       리뷰 대기 시작 = 열린 시각({@code stateChangedAt})과 마지막 커밋 중 늦은 것. 그 뒤에 작성자가 아닌 사람의
 *       {@code dismissed} 아닌 리뷰가 하나도 없으면 리뷰 대기, 있으면 마지막 리뷰부터 커밋 없음을 잰다.</li>
 *   <li><b>Draft PR</b> — 아직 리뷰를 청하지 않았으니 커밋 없음만. 마지막 커밋과 Draft가 된 시각 중 늦은 것부터.</li>
 *   <li><b>머지 · 닫힌 PR</b>, <b>닫힌 이슈</b>, <b>담당자 없는 이슈</b>(백로그 — 아직 아무도 작업하지 않음)는 막히지 않는다.</li>
 *   <li><b>담당자 있는 열린 이슈</b> — 연결된 열린(Draft 포함) PR이 있으면 작업이 PR로 넘어간 것이라 그 PR 중 하나라도 막혔는지를
 *       따른다. 없으면 커밋 없음: 이슈의 {@code stateChangedAt}(열림 · 담당자 변경)과 연결된 PR의 마지막 커밋 · 상태 변경 중
 *       가장 늦은 것부터. 이슈 자체의 커밋 시각은 동기화하지 않아 연결 PR로만 본다.</li>
 * </ul>
 *
 * @param reviewWait 리뷰 대기 기준
 * @param noCommit 커밋 없음 기준
 */
public record BlockedRule(Duration reviewWait, Duration noCommit) {

    private static final String DISMISSED = "dismissed";
    private static final double HOUR_MILLIS = Duration.ofHours(1).toMillis();

    public BlockedRule {
        Objects.requireNonNull(reviewWait);
        Objects.requireNonNull(noCommit);
    }

    /** 팀 설정의 시간 기준(정수 1~720 — 범위는 설정 저장 때 막는다). */
    public static BlockedRule ofHours(int reviewWaitHours, int noCommitHours) {
        return new BlockedRule(Duration.ofHours(reviewWaitHours), Duration.ofHours(noCommitHours));
    }

    public boolean isBlocked(SubmissionDto submission, Instant now) {
        return switch (submission.state()) {
            case MERGED, CLOSED -> false;
            case DRAFT -> exceeds(latest(submission.lastCommitAt(), submission.stateChangedAt()), noCommit, now);
            case OPEN -> {
                Instant waitingSince = latest(submission.stateChangedAt(), submission.lastCommitAt());
                Instant lastReview = lastReviewSince(submission, waitingSince);
                yield lastReview == null
                        ? exceeds(waitingSince, reviewWait, now)
                        : exceeds(lastReview, noCommit, now);
            }
        };
    }

    /** @param submissionsById 같은 사무실 PR, {@code SubmissionDto.id} 기준 — 연결 PR을 찾는다 */
    public boolean isBlocked(TaskDto task, Map<String, SubmissionDto> submissionsById, Instant now) {
        if (task.state() != TaskState.OPEN || task.assigneeMemberIds().isEmpty()) {
            return false;
        }
        List<SubmissionDto> linked = task.linkedSubmissionIds().stream()
                .map(submissionsById::get).filter(Objects::nonNull).toList();
        List<SubmissionDto> inReview = linked.stream().filter(BlockedRule::isOpen).toList();
        if (!inReview.isEmpty()) {
            return inReview.stream().anyMatch(submission -> isBlocked(submission, now));
        }
        Instant lastActivity = linked.stream()
                .flatMap(submission -> Stream.of(submission.lastCommitAt(), submission.stateChangedAt()))
                .reduce(task.stateChangedAt(), BlockedRule::latest);
        return exceeds(lastActivity, noCommit, now);
    }

    /**
     * 이슈 · PR에 막힘을 채우고, 막힌 도형이 있는 팀원(FlowSummary.blockedMemberIds)을 고른다 — 막힌 이슈의 담당자 전원과 막힌 PR의
     * 작성자(팀원일 때).
     *
     * @param memberIds 응답 {@code members} 순서 — {@code blockedMemberIds}도 이 순서
     */
    public Applied apply(List<TaskDto> tasks, List<SubmissionDto> submissions, List<String> memberIds, Instant now) {
        List<SubmissionDto> markedSubmissions = submissions.stream()
                .map(submission -> submission.withBlocked(isBlocked(submission, now))).toList();
        Map<String, SubmissionDto> byId = submissions.stream()
                .collect(Collectors.toMap(SubmissionDto::id, Function.identity()));
        List<TaskDto> markedTasks = tasks.stream().map(task -> task.withBlocked(isBlocked(task, byId, now))).toList();

        Set<String> blocked = new HashSet<>();
        markedTasks.stream().filter(TaskDto::isBlocked).map(TaskDto::assigneeMemberIds).forEach(blocked::addAll);
        markedSubmissions.stream().filter(SubmissionDto::isBlocked).map(SubmissionDto::authorMemberId)
                .filter(Objects::nonNull).forEach(blocked::add);
        return new Applied(markedTasks, markedSubmissions, keepOrder(memberIds, blocked));
    }

    /** {@link #apply} 결과 — 막힘이 채워진 이슈 · PR과 막힌 팀원. */
    public record Applied(List<TaskDto> tasks, List<SubmissionDto> submissions, List<String> blockedMemberIds) {
    }

    private static boolean isOpen(SubmissionDto submission) {
        return submission.state() == SubmissionState.OPEN || submission.state() == SubmissionState.DRAFT;
    }

    /**
     * 평균 리뷰 대기(FR-FLOW-05, CONTRACTS.md 「3」) — 열린 PR(Draft 제외)마다 리뷰 대기 시작부터 첫 센 리뷰(없으면 {@code now})까지의
     * 시간, 그 평균을 소수 첫째 자리로. 열린 PR이 없으면 null. "리뷰 대기 시작" · "센 리뷰"는 막힘 판정과 같고, 기준 시간과는 상관없다.
     */
    public static Double averageReviewWaitHours(List<SubmissionDto> submissions, Instant now) {
        List<Duration> waits = submissions.stream()
                .filter(submission -> submission.state() == SubmissionState.OPEN)
                .map(submission -> {
                    Instant waitingSince = latest(submission.stateChangedAt(), submission.lastCommitAt());
                    Instant end = countedReviewTimes(submission, waitingSince).min(Instant::compareTo).orElse(now);
                    Duration wait = Duration.between(waitingSince, end);
                    return wait.isNegative() ? Duration.ZERO : wait; // 시계가 어긋나 시작이 응답 시각보다 늦으면 0
                })
                .toList();
        if (waits.isEmpty()) {
            return null;
        }
        double meanHours = waits.stream().mapToLong(Duration::toMillis).average().orElseThrow() / HOUR_MILLIS;
        return Math.round(meanHours * 10) / 10.0;
    }

    /** 리뷰 대기 시작 뒤에 작성자가 아닌 사람이 남긴 리뷰 중 마지막 제출 시각. 없으면 null. */
    private static Instant lastReviewSince(SubmissionDto submission, Instant waitingSince) {
        return countedReviewTimes(submission, waitingSince).max(Instant::compareTo).orElse(null);
    }

    /** 센 리뷰의 제출 시각 — 리뷰 대기 시작 뒤, 작성자 본인 · {@code dismissed} 제외. */
    private static Stream<Instant> countedReviewTimes(SubmissionDto submission, Instant waitingSince) {
        return submission.reviews().stream()
                .filter(review -> !DISMISSED.equals(review.state()))
                .filter(review -> !isAuthor(submission, review))
                .map(GithubReviewDto::submittedAt)
                .filter(Objects::nonNull)
                .filter(submittedAt -> !submittedAt.isBefore(waitingSince));
    }

    // GitHub 로그인 이름은 대소문자를 가리지 않는다
    private static boolean isAuthor(SubmissionDto submission, GithubReviewDto review) {
        return submission.authorGithubLogin() != null
                && submission.authorGithubLogin().equalsIgnoreCase(review.reviewerGithubLogin());
    }

    private static boolean exceeds(Instant since, Duration limit, Instant now) {
        return Duration.between(since, now).compareTo(limit) > 0;
    }

    private static Instant latest(Instant a, Instant b) {
        if (a == null) {
            return b;
        }
        return b == null || a.isAfter(b) ? a : b;
    }

    private static List<String> keepOrder(Collection<String> order, Set<String> picked) {
        return order.stream().filter(picked::contains).toList();
    }
}

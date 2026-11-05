package com.samdoryu.backend.sync.service;

import com.samdoryu.backend.evaluation.service.EvaluationRoundService;
import com.samdoryu.backend.github.GithubReader;
import com.samdoryu.backend.github.GithubReaderSelector;
import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubIssueLink;
import com.samdoryu.backend.github.dto.GithubPullRequest;
import com.samdoryu.backend.github.dto.GithubRepoRef;
import com.samdoryu.backend.github.dto.GithubReview;
import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.sync.domain.StoredGithubJson;
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
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * 이슈 · PR · 리뷰 · 커밋 시각 · 라벨 · PR–이슈 공식 연결을 읽어 앱 모델로 저장한다(#69 · #71 · FR-GH-02 · 04,
 * CONTRACTS.md 「2」 소유와 변경 주체). 팀원은 먼저 {@link WorkspaceSyncService}가 맞춘다.
 * <ul>
 *   <li>GitHub 식별자 {@code (사무실, 번호)}로 앱 행을 찾아 덮어쓰고, 없으면 만든다. 행을 지우지 않는다.</li>
 *   <li>담당자는 GitHub 담당자 중 <b>그 사무실의 지금 팀원 전원</b>으로 맞춘다 — 대표 담당자는 저장하지 않는다(순서는
 *       {@code AssigneeOrder}).</li>
 *   <li>앱 기록(마감 · 요구사항 연결 · 안건 · 평가 · 카드 …)은 읽지도 덮지도 않는다.</li>
 * </ul>
 * 동기화 API · 폴링 · {@code SyncState} 기록은 #70이 이 Service를 부르며 더한다. 평가 회차는 PR을 저장할 때
 * {@link EvaluationRoundService}가 연다 — 지금은 회차가 없는 PR의 1회차({@code new_pr}, #19)뿐이다(새 커밋 회차는 #46).
 * <p>
 * {@code stateChangedAt} [구현 기본값 — #69]: 상태(이슈 열림 · 닫힘, PR 상태)나 팀원 담당자 집합이 바뀌면 GitHub 시각
 * (닫혔으면 닫힌 · 머지 시각, 아니면 GitHub 고친 시각), 바뀌지 않았으면 이전 값 그대로.
 */
@Service
public class IssuePullRequestSyncService {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final WorkspaceService workspaceService;
    private final GithubReaderSelector readerSelector;
    private final TaskRepository taskRepository;
    private final TaskAssigneeRepository taskAssigneeRepository;
    private final SubmissionRepository submissionRepository;
    private final SubmissionIssueLinkRepository submissionIssueLinkRepository;
    private final EvaluationRoundService evaluationRoundService;

    public IssuePullRequestSyncService(WorkspaceService workspaceService, GithubReaderSelector readerSelector,
            TaskRepository taskRepository, TaskAssigneeRepository taskAssigneeRepository,
            SubmissionRepository submissionRepository, SubmissionIssueLinkRepository submissionIssueLinkRepository,
            EvaluationRoundService evaluationRoundService) {
        this.workspaceService = workspaceService;
        this.readerSelector = readerSelector;
        this.taskRepository = taskRepository;
        this.taskAssigneeRepository = taskAssigneeRepository;
        this.submissionRepository = submissionRepository;
        this.submissionIssueLinkRepository = submissionIssueLinkRepository;
        this.evaluationRoundService = evaluationRoundService;
    }

    /** @param issues 이번에 저장한 이슈 수, {@code pullRequests} PR 수 */
    public record Result(int issues, int pullRequests) {
    }

    /**
     * @param since 이 시각 이후 GitHub에서 바뀐 것만 읽는다. null이면 전부(첫 동기화)
     * @param now 동기화 시각 — {@code syncedAt}
     */
    @Transactional
    public Result sync(Long workspaceId, Instant since, Instant now) {
        Workspace workspace = workspaceService.requireWorkspace(workspaceId);
        GithubReader reader = readerSelector.forKind(workspace.getKind());
        GithubRepoRef repo = repoRef(workspace);
        GithubMemberMatcher matcher = new GithubMemberMatcher(workspace.getKind(),
                workspaceService.currentMembers(workspaceId));

        List<GithubIssue> issues = reader.issuesUpdatedSince(repo, since);
        issues.forEach(issue -> saveIssue(workspace, issue, matcher, now));

        List<GithubPullRequest> pullRequests = reader.pullRequestsUpdatedSince(repo, since);
        pullRequests.forEach(pr -> savePullRequest(workspace, pr, reader, repo, matcher, now));

        return new Result(issues.size(), pullRequests.size());
    }

    static GithubRepoRef repoRef(Workspace workspace) {
        if (workspace.getKind() == WorkspaceKind.DEMO) {
            return GithubRepoRef.DEMO;
        }
        return new GithubRepoRef(workspace.getGithubOwner(), workspace.getGithubRepo(),
                workspace.getGithubInstallationId());
    }

    private void saveIssue(Workspace workspace, GithubIssue issue, GithubMemberMatcher matcher, Instant now) {
        Optional<Task> existing = taskRepository.findByWorkspaceIdAndGithubIssueNumber(workspace.getId(),
                issue.number());
        Map<Long, Member> assignees = issue.assignees().stream()
                .map(matcher::find)
                .flatMap(Optional::stream)
                .collect(Collectors.toMap(Member::getId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        Map<Long, TaskAssignee> currentRows = existing
                .map(task -> taskAssigneeRepository.findByTaskId(task.getId()).stream()
                        .collect(Collectors.toMap(row -> row.getMember().getId(), Function.identity())))
                .orElseGet(Map::of);

        TaskState state = issue.closed() ? TaskState.CLOSED : TaskState.OPEN;
        boolean changed = existing.isEmpty()
                || existing.get().getState() != state
                || !currentRows.keySet().equals(assignees.keySet());
        Instant stateChangedAt = changed
                ? (issue.closed() && issue.closedAt() != null ? issue.closedAt() : issue.updatedAt())
                : existing.get().getStateChangedAt();

        Task fresh = Task.builder()
                .workspace(workspace)
                .githubIssueNumber(issue.number())
                .title(issue.title())
                .state(state)
                .closedReason(issue.closed() ? closedReason(issue.closedReason()) : null)
                .labelsJson(JSON.writeValueAsString(issue.labels()))
                .githubCreatedAt(issue.createdAt())
                .githubUpdatedAt(issue.updatedAt())
                .closedAt(issue.closed() ? issue.closedAt() : null)
                .stateChangedAt(stateChangedAt)
                .syncedAt(now)
                .build();
        Task task = existing.map(t -> t.overwriteFrom(fresh)).orElseGet(() -> taskRepository.save(fresh));

        currentRows.forEach((memberId, row) -> {
            if (assignees.containsKey(memberId)) {
                row.markSynced(now);
            } else {
                taskAssigneeRepository.delete(row);
            }
        });
        assignees.forEach((memberId, member) -> {
            if (!currentRows.containsKey(memberId)) {
                taskAssigneeRepository.save(new TaskAssignee(task, member, now));
            }
        });
    }

    private static TaskClosedReason closedReason(GithubIssue.ClosedReason reason) {
        if (reason == null) {
            return null;
        }
        return switch (reason) {
            case COMPLETED -> TaskClosedReason.COMPLETED;
            case NOT_PLANNED -> TaskClosedReason.NOT_PLANNED;
        };
    }

    private void savePullRequest(Workspace workspace, GithubPullRequest pr, GithubReader reader, GithubRepoRef repo,
            GithubMemberMatcher matcher, Instant now) {
        Optional<Submission> existing = submissionRepository.findByWorkspaceIdAndGithubPrNumber(workspace.getId(),
                pr.number());
        SubmissionState state = submissionState(pr);
        boolean changed = existing.isEmpty() || existing.get().getState() != state;
        Instant stateChangedAt = changed ? stateChangedAt(pr, state) : existing.get().getStateChangedAt();

        List<StoredGithubJson.Reviewer> reviewRequests = pr.requestedReviewers().stream()
                .map(user -> new StoredGithubJson.Reviewer(user.id(), user.login()))
                .toList();
        List<StoredGithubJson.Review> reviews = reader.reviews(repo, pr.number()).stream()
                .map(IssuePullRequestSyncService::storedReview)
                .toList();
        GithubUser author = pr.author();

        Submission fresh = Submission.builder()
                .workspace(workspace)
                .githubPrNumber(pr.number())
                .title(pr.title())
                .authorGithubUserId(author == null ? null : author.id())
                .authorGithubLogin(author == null ? null : author.login())
                .authorMember(matcher.find(author).orElse(null))
                .state(state)
                .headSha(pr.headSha())
                .reviewRequestsJson(JSON.writeValueAsString(reviewRequests))
                .reviewsJson(JSON.writeValueAsString(reviews))
                .labelsJson(JSON.writeValueAsString(pr.labels()))
                .lastCommitAt(reader.lastCommitAt(repo, pr.number()).orElse(null))
                .githubCreatedAt(pr.createdAt())
                .githubUpdatedAt(pr.updatedAt())
                .mergedAt(state == SubmissionState.MERGED ? pr.mergedAt() : null)
                .closedAt(pr.closed() ? pr.closedAt() : null)
                .stateChangedAt(stateChangedAt)
                .syncedAt(now)
                .build();
        Submission submission = existing.map(s -> s.overwriteFrom(fresh))
                .orElseGet(() -> submissionRepository.save(fresh));
        syncIssueLinks(workspace, submission, reader.linkedIssues(repo, pr.number()));
        evaluationRoundService.openFirstRoundIfAbsent(submission, now);
    }

    /**
     * PR–이슈 연결을 GitHub 공식 연결로 맞춘다(#71 · FR-GH-04). 어댑터가 준 연결만 쓰고 본문 · 제목은 읽지 않는다.
     * GitHub에서 풀린 연결은 지운다(담당자처럼 GitHub 값으로 덮어쓴다). 아직 저장되지 않은 이슈를 가리키면 건너뛴다 —
     * 그 이슈가 동기화된 뒤 PR이 다시 바뀌면 이어진다.
     */
    private void syncIssueLinks(Workspace workspace, Submission submission, List<GithubIssueLink> links) {
        Map<Long, SubmissionIssueLink> current = submissionIssueLinkRepository.findBySubmissionId(submission.getId())
                .stream()
                .collect(Collectors.toMap(link -> link.getTask().getId(), Function.identity()));
        Map<Long, Task> wanted = new LinkedHashMap<>();
        Map<Long, String> sources = new LinkedHashMap<>();
        for (GithubIssueLink link : links) {
            taskRepository.findByWorkspaceIdAndGithubIssueNumber(workspace.getId(), link.issueNumber())
                    .ifPresent(task -> {
                        wanted.putIfAbsent(task.getId(), task);
                        sources.putIfAbsent(task.getId(), link.source().name());
                    });
        }
        current.forEach((taskId, row) -> {
            if (!wanted.containsKey(taskId)) {
                submissionIssueLinkRepository.delete(row);
            }
        });
        wanted.forEach((taskId, task) -> {
            if (!current.containsKey(taskId)) {
                submissionIssueLinkRepository.save(new SubmissionIssueLink(submission, task, sources.get(taskId)));
            }
        });
    }

    private static SubmissionState submissionState(GithubPullRequest pr) {
        if (pr.merged()) {
            return SubmissionState.MERGED;
        }
        if (pr.closed()) {
            return SubmissionState.CLOSED;
        }
        return pr.draft() ? SubmissionState.DRAFT : SubmissionState.OPEN;
    }

    private static Instant stateChangedAt(GithubPullRequest pr, SubmissionState state) {
        Instant at = switch (state) {
            case MERGED -> pr.mergedAt();
            case CLOSED -> pr.closedAt();
            case OPEN, DRAFT -> null;
        };
        return Objects.requireNonNullElse(at, pr.updatedAt());
    }

    private static StoredGithubJson.Review storedReview(GithubReview review) {
        return new StoredGithubJson.Review(review.reviewer().id(), review.reviewer().login(),
                review.state().name().toLowerCase(Locale.ROOT), review.submittedAt());
    }
}

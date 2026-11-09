package com.samdoryu.backend.sync.service;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.plan.service.TaskDueDateService;
import com.samdoryu.backend.sync.domain.AssigneeOrder;
import com.samdoryu.backend.sync.domain.StoredGithubJson;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskAssignee;
import com.samdoryu.backend.sync.dto.GithubReviewDto;
import com.samdoryu.backend.sync.dto.MemberCommit;
import com.samdoryu.backend.sync.dto.SubmissionDto;
import com.samdoryu.backend.sync.dto.TaskDto;
import com.samdoryu.backend.sync.repository.SubmissionCommitRepository;
import com.samdoryu.backend.sync.repository.SubmissionIssueLinkRepository;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskAssigneeRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.dto.WorkspaceSummary;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * 동기화된 이슈(Task) · PR(Submission)을 다른 패키지에 읽어 준다 — 항상 사무실 조건으로 찾는다(IDOR 방어).
 * 없거나 다른 사무실 것이면 {@code not_found}.
 */
@Service
public class SyncedItemService {

    // 동기화가 쓴 것과 같은 기본 설정으로 읽는다(IssuePullRequestSyncService)
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<List<String>> LABELS = new TypeReference<>() {
    };
    private static final TypeReference<List<StoredGithubJson.Reviewer>> REVIEWERS = new TypeReference<>() {
    };
    private static final TypeReference<List<StoredGithubJson.Review>> REVIEWS = new TypeReference<>() {
    };

    private final TaskRepository taskRepository;
    private final SubmissionRepository submissionRepository;
    private final TaskAssigneeRepository taskAssigneeRepository;
    private final SubmissionIssueLinkRepository submissionIssueLinkRepository;
    private final SubmissionCommitRepository submissionCommitRepository;
    private final WorkspaceService workspaceService;
    private final TaskDueDateService taskDueDateService;

    public SyncedItemService(TaskRepository taskRepository, SubmissionRepository submissionRepository,
            TaskAssigneeRepository taskAssigneeRepository, SubmissionIssueLinkRepository submissionIssueLinkRepository,
            SubmissionCommitRepository submissionCommitRepository, WorkspaceService workspaceService,
            TaskDueDateService taskDueDateService) {
        this.taskRepository = taskRepository;
        this.submissionRepository = submissionRepository;
        this.taskAssigneeRepository = taskAssigneeRepository;
        this.submissionIssueLinkRepository = submissionIssueLinkRepository;
        this.submissionCommitRepository = submissionCommitRepository;
        this.workspaceService = workspaceService;
        this.taskDueDateService = taskDueDateService;
    }

    @Transactional(readOnly = true)
    public Task requireTask(Long workspaceId, Long taskId) {
        return taskRepository.findByIdAndWorkspaceId(taskId, workspaceId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
    }

    /** 이슈의 담당자 팀원 ID 전부 — 마감을 고칠 수 있는지 볼 때(P14 · #39). 이슈는 {@link #requireTask}로 먼저 찾는다. */
    @Transactional(readOnly = true)
    public List<Long> assigneeMemberIds(Task task) {
        return taskAssigneeRepository.findByTaskId(task.getId()).stream()
                .map(assignee -> assignee.getMember().getId())
                .toList();
    }

    @Transactional(readOnly = true)
    public Submission requireSubmission(Long workspaceId, Long submissionId) {
        return submissionRepository.findByIdAndWorkspaceId(submissionId, workspaceId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
    }

    /**
     * Snapshot {@code tasks} 조각 — 이슈 전부, githubIssueNumber 오름차순. 담당자는 대표 담당자 순({@link AssigneeOrder}),
     * 연결은 GitHub 공식 연결만. 담당자 · 연결 · 마감은 사무실 단위로 한 번에 읽는다.
     */
    @Transactional(readOnly = true)
    public List<TaskDto> listTasks(Long workspaceId) {
        String repoUrl = repoUrl(workspaceId);
        Map<Long, List<Member>> assignees = taskAssigneeRepository.findByTaskWorkspaceId(workspaceId).stream()
                .collect(Collectors.groupingBy(assignee -> assignee.getTask().getId(),
                        Collectors.mapping(TaskAssignee::getMember, Collectors.toList())));
        Map<Long, List<Long>> linkedSubmissions = submissionIssueLinkRepository.findBySubmissionWorkspaceId(workspaceId)
                .stream().collect(Collectors.groupingBy(link -> link.getTask().getId(),
                        Collectors.mapping(link -> link.getSubmission().getId(), Collectors.toList())));
        Map<Long, LocalDate> dueDates = taskDueDateService.dueDatesIn(workspaceId);
        return taskRepository.findByWorkspaceIdOrderByGithubIssueNumberAsc(workspaceId).stream()
                .map(task -> TaskDto.of(task,
                        AssigneeOrder.sort(assignees.getOrDefault(task.getId(), List.of())).stream()
                                .map(Member::getId).toList(),
                        read(task.getLabelsJson(), LABELS),
                        dueDates.get(task.getId()),
                        sorted(linkedSubmissions.get(task.getId())),
                        repoUrl))
                .toList();
    }

    /**
     * Snapshot {@code submissions} 조각 — PR 전부, githubPrNumber 오름차순. 리뷰 요청 · 리뷰의 계정은 읽을 때 지금 팀원과
     * 짝짓는다({@link GithubMemberMatcher} — 팀원이 아니면 리뷰 요청에서는 빠지고 리뷰에서는 {@code reviewerMemberId} null).
     */
    @Transactional(readOnly = true)
    public List<SubmissionDto> listSubmissions(Long workspaceId) {
        Workspace workspace = workspaceService.requireWorkspace(workspaceId);
        String repoUrl = WorkspaceSummary.of(workspace).htmlUrl();
        // ponytail: 지금 팀원만 짝짓는다 — 빠진 팀원의 옛 리뷰는 reviewerMemberId null. 과거 이름 표시가 필요해지면 전체 팀원으로
        GithubMemberMatcher matcher = new GithubMemberMatcher(workspace.getKind(),
                workspaceService.currentMembers(workspaceId));
        Map<Long, List<Long>> linkedTasks = submissionIssueLinkRepository.findBySubmissionWorkspaceId(workspaceId)
                .stream().collect(Collectors.groupingBy(link -> link.getSubmission().getId(),
                        Collectors.mapping(link -> link.getTask().getId(), Collectors.toList())));
        return submissionRepository.findByWorkspaceIdOrderByGithubPrNumberAsc(workspaceId).stream()
                .map(submission -> SubmissionDto.of(submission,
                        read(submission.getReviewRequestsJson(), REVIEWERS).stream()
                                .map(reviewer -> member(matcher, reviewer.githubUserId(), reviewer.login()))
                                .flatMap(Optional::stream).map(Member::getId).distinct().toList(),
                        read(submission.getReviewsJson(), REVIEWS).stream()
                                .map(review -> reviewDto(matcher, review)).toList(),
                        read(submission.getLabelsJson(), LABELS),
                        sorted(linkedTasks.get(submission.getId())),
                        repoUrl))
                .toList();
    }

    /**
     * 사용자별 커밋(CONTRACTS.md 「7」 — 스탠드업 미리 채우기 FR-MTG-01 · #261) — 그 팀원이 {@code [from, to)}에 <b>작성한</b>
     * 커밋(git author date), 작성 시각 순. 동기화로 저장된 PR 커밋만 본다 — PR에 올라가지 않은 커밋은 없다.
     * 사무실 조건으로 찾으므로 다른 사무실 팀원 ID면 빈 목록이다.
     */
    @Transactional(readOnly = true)
    public List<MemberCommit> listCommits(Long workspaceId, Long memberId, Instant from, Instant to) {
        return submissionCommitRepository.findAuthoredBetween(workspaceId, memberId, from, to).stream()
                .map(commit -> new MemberCommit(commit.getSha(), commit.getTitle(), commit.getAuthoredAt()))
                .toList();
    }

    private static GithubReviewDto reviewDto(GithubMemberMatcher matcher, StoredGithubJson.Review review) {
        String reviewerMemberId = member(matcher, review.reviewerGithubUserId(), review.reviewerGithubLogin())
                .map(member -> Ids.toApi(member.getId())).orElse(null);
        return new GithubReviewDto(reviewerMemberId, review.reviewerGithubLogin(), review.state(), review.submittedAt());
    }

    private static Optional<Member> member(GithubMemberMatcher matcher, Long githubUserId, String login) {
        return matcher.find(new GithubUser(githubUserId, login, null));
    }

    private String repoUrl(Long workspaceId) {
        return WorkspaceSummary.of(workspaceService.requireWorkspace(workspaceId)).htmlUrl();
    }

    private static <T> List<T> read(String json, TypeReference<List<T>> type) {
        return json == null ? List.of() : JSON.readValue(json, type);
    }

    private static List<Long> sorted(List<Long> ids) {
        return ids == null ? List.of() : ids.stream().sorted().toList();
    }
}

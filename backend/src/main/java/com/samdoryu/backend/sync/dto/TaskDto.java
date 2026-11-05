package com.samdoryu.backend.sync.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.sync.domain.Priority;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskClosedReason;
import com.samdoryu.backend.sync.domain.TaskState;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * GitHub 이슈의 앱 모델 — CONTRACTS_API 「5」 TaskDto. Snapshot {@code tasks}.
 *
 * @param assigneeMemberIds 팀원인 담당자 전원 — 첫 번째가 대표 담당자
 * @param priority {@code priority:*} 라벨에서 서버가 계산(P6)
 * @param linkedSubmissionIds GitHub 공식 연결만
 * @param isBlocked 서버 계산(FR-FLOW-01) — #22 전에는 false
 */
public record TaskDto(
        String id,
        int githubIssueNumber,
        String title,
        TaskState state,
        TaskClosedReason closedReason,
        List<String> assigneeMemberIds,
        List<String> labels,
        Priority priority,
        LocalDate dueDate,
        List<String> linkedSubmissionIds,
        boolean isBlocked,
        String htmlUrl,
        Instant githubCreatedAt,
        Instant githubUpdatedAt,
        Instant closedAt,
        Instant stateChangedAt,
        Instant syncedAt) {

    /**
     * @param assigneeMemberIds 대표 담당자 순서로 정렬된 것
     * @param repoUrl GitHub 레포 주소, 시연은 null
     */
    public static TaskDto of(Task task, List<Long> assigneeMemberIds, List<String> labels, LocalDate dueDate,
            List<Long> linkedSubmissionIds, String repoUrl) {
        return new TaskDto(
                Ids.toApi(task.getId()),
                task.getGithubIssueNumber(),
                task.getTitle(),
                task.getState(),
                task.getClosedReason(),
                assigneeMemberIds.stream().map(Ids::toApi).toList(),
                labels,
                Priority.fromLabels(labels),
                dueDate,
                linkedSubmissionIds.stream().map(Ids::toApi).toList(),
                false,
                repoUrl == null ? null : repoUrl + "/issues/" + task.getGithubIssueNumber(),
                task.getGithubCreatedAt(),
                task.getGithubUpdatedAt(),
                task.getClosedAt(),
                task.getStateChangedAt(),
                task.getSyncedAt());
    }
}

package com.samdoryu.backend.sync.dto;

import com.samdoryu.backend.sync.domain.TaskClosedReason;
import com.samdoryu.backend.sync.domain.TaskState;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * GitHub 이슈의 앱 모델 — CONTRACTS_API 「5」 TaskDto. Snapshot {@code tasks}를 채우는 매핑은 #103 2단계에서 더한다.
 *
 * @param assigneeMemberIds 팀원인 담당자 전원 — 첫 번째가 대표 담당자
 * @param priority {@code high} · {@code medium} · {@code low} — {@code priority:*} 라벨에서 서버가 계산(P6)
 * @param linkedSubmissionIds GitHub 공식 연결만
 */
public record TaskDto(
        String id,
        int githubIssueNumber,
        String title,
        TaskState state,
        TaskClosedReason closedReason,
        List<String> assigneeMemberIds,
        List<String> labels,
        String priority,
        LocalDate dueDate,
        List<String> linkedSubmissionIds,
        boolean isBlocked,
        String htmlUrl,
        Instant githubCreatedAt,
        Instant githubUpdatedAt,
        Instant closedAt,
        Instant stateChangedAt,
        Instant syncedAt) {
}

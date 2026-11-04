package com.samdoryu.backend.github.dto;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * GitHub 이슈(PR 제외) — 어댑터 결과 DTO(CONTRACTS.md 「7」 이슈 변경분: 담당자 전원 · 닫힘 사유 포함).
 *
 * @param closedReason 닫힌 이슈의 GitHub {@code state_reason} — {@link ClosedReason}. 열린 이슈는 null
 */
public record GithubIssue(int number, String title, boolean closed, ClosedReason closedReason, List<String> labels,
        List<GithubUser> assignees, Instant createdAt, Instant updatedAt, Instant closedAt) {

    /** GitHub {@code state_reason} 중 앱이 구분하는 값. {@code reopened} 등 그 밖의 값은 null로 받는다. */
    public enum ClosedReason {
        COMPLETED,
        NOT_PLANNED
    }

    public GithubIssue {
        Objects.requireNonNull(title);
        labels = List.copyOf(labels);
        assignees = List.copyOf(assignees);
        Objects.requireNonNull(createdAt);
        Objects.requireNonNull(updatedAt);
    }
}

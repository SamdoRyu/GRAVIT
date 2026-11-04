package com.samdoryu.backend.github.dto;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * GitHub PR — 어댑터 결과 DTO(CONTRACTS.md 「7」 PR 변경분: {@code headSha} · Draft · 머지 포함).
 *
 * @param author 작성자. 탈퇴한 계정이면 null일 수 있다
 * @param requestedReviewers 지금 리뷰 요청을 받은 계정(팀 리뷰 요청은 담지 않는다)
 */
public record GithubPullRequest(int number, String title, GithubUser author, boolean draft, boolean closed,
        boolean merged, String headSha, List<String> labels, List<GithubUser> requestedReviewers, Instant createdAt,
        Instant updatedAt, Instant mergedAt, Instant closedAt) {

    public GithubPullRequest {
        Objects.requireNonNull(title);
        Objects.requireNonNull(headSha);
        labels = List.copyOf(labels);
        requestedReviewers = List.copyOf(requestedReviewers);
        Objects.requireNonNull(createdAt);
        Objects.requireNonNull(updatedAt);
    }
}

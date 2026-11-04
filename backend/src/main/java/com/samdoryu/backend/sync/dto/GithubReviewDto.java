package com.samdoryu.backend.sync.dto;

import java.time.Instant;

/**
 * GitHub 리뷰 — CONTRACTS_API 「5」 GithubReviewDto. GitHub에 공개된 값이라 익명 대상이 아니다.
 *
 * @param state {@code approved} · {@code changes_requested} · {@code commented} · {@code dismissed}
 */
public record GithubReviewDto(String reviewerMemberId, String reviewerGithubLogin, String state, Instant submittedAt) {
}

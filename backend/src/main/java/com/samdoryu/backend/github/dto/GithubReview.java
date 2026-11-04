package com.samdoryu.backend.github.dto;

import java.time.Instant;
import java.util.Objects;

/**
 * PR에 제출된 GitHub 리뷰 — 어댑터 결과 DTO. GitHub에 공개된 값이라 익명 대상이 아니다(CONTRACTS_API.md GithubReviewDto).
 * 아직 제출하지 않은 리뷰({@code PENDING})는 담지 않는다.
 */
public record GithubReview(GithubUser reviewer, State state, Instant submittedAt) {

    /** GitHub 리뷰 상태 중 제출된 것. JSON 값은 계약의 소문자 snake(`approved` 등). */
    public enum State {
        APPROVED,
        CHANGES_REQUESTED,
        COMMENTED,
        DISMISSED
    }

    public GithubReview {
        Objects.requireNonNull(reviewer);
        Objects.requireNonNull(state);
        Objects.requireNonNull(submittedAt);
    }
}

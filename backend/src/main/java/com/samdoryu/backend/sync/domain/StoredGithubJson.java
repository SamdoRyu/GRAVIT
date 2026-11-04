package com.samdoryu.backend.sync.domain;

import java.time.Instant;

/**
 * {@code task.labels} · {@code submission.labels · review_requests · reviews} JSON 열의 원소 모양(#69에서 정함).
 * <ul>
 *   <li>labels: 라벨 이름 문자열 배열 — {@code ["priority:high"]}</li>
 *   <li>review_requests: {@link Reviewer} 배열</li>
 *   <li>reviews: {@link Review} 배열 — 제출 시각 순</li>
 * </ul>
 * 팀원 ID({@code reviewerMemberId} 등)는 저장하지 않는다 — 읽을 때 GitHub 사용자 ID(시연은 Seed 로그인 이름)로 그 사무실 팀원과
 * 짝짓는다. 그래서 콜라보레이터가 나중에 팀원이 돼도 다시 동기화하지 않고 이어진다.
 */
public final class StoredGithubJson {

    private StoredGithubJson() {
    }

    /** @param githubUserId 시연 Seed 계정은 null */
    public record Reviewer(Long githubUserId, String login) {
    }

    /** @param state 계약 GithubReviewDto.state 값 — {@code approved} · {@code changes_requested} · {@code commented} · {@code dismissed} */
    public record Review(Long reviewerGithubUserId, String reviewerGithubLogin, String state, Instant submittedAt) {
    }
}

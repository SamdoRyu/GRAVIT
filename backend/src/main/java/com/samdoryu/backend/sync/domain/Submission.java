package com.samdoryu.backend.sync.domain;

import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * GitHub PR의 앱 모델(CONTRACTS.md 「2」). 동기화만 쓴다 — 앱 API의 쓰기는 없고 행을 지우지 않는다.
 * 리뷰 요청 · 리뷰 · 라벨은 GitHub에 공개된 원본 값을 JSON으로 둔다(원소 모양은 #69).
 */
@Entity
@Table(name = "submission")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Submission {

    /** 커밋 SHA 길이 — {@code CHAR(40)}. */
    public static final int HEAD_SHA_LENGTH = 40;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false)
    private int githubPrNumber;

    @Column(nullable = false, length = 512)
    private String title;

    /** 작성자 판정의 기준(GitHub 사용자 ID). 탈퇴한 계정이면 null일 수 있다. */
    private Long authorGithubUserId;

    @Column(length = 39)
    private String authorGithubLogin;

    /** 작성자가 이 사무실 팀원이 아니면 null. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_member_id")
    private Member authorMember;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private SubmissionState state;

    @Column(nullable = false, length = HEAD_SHA_LENGTH, columnDefinition = "char(40)")
    private String headSha;

    @Column(name = "review_requests", nullable = false, columnDefinition = "json")
    private String reviewRequestsJson;

    @Column(name = "reviews", nullable = false, columnDefinition = "json")
    private String reviewsJson;

    @Column(name = "labels", nullable = false, columnDefinition = "json")
    private String labelsJson;

    private Instant lastCommitAt;

    @Column(nullable = false)
    private Instant githubCreatedAt;

    @Column(nullable = false)
    private Instant githubUpdatedAt;

    private Instant mergedAt;

    private Instant closedAt;

    @Column(nullable = false)
    private Instant stateChangedAt;

    @Column(nullable = false)
    private Instant syncedAt;

    @Builder
    private Submission(Workspace workspace, int githubPrNumber, String title, Long authorGithubUserId,
            String authorGithubLogin, Member authorMember, SubmissionState state, String headSha,
            String reviewRequestsJson, String reviewsJson, String labelsJson, Instant lastCommitAt,
            Instant githubCreatedAt, Instant githubUpdatedAt, Instant mergedAt, Instant closedAt,
            Instant stateChangedAt, Instant syncedAt) {
        if (headSha == null || headSha.length() != HEAD_SHA_LENGTH) {
            throw new IllegalArgumentException("headSha는 40자 커밋 SHA");
        }
        if (state != SubmissionState.MERGED && mergedAt != null) {
            throw new IllegalArgumentException("머지 시각은 머지된 PR에만");
        }
        this.workspace = Objects.requireNonNull(workspace);
        this.githubPrNumber = githubPrNumber;
        this.title = Objects.requireNonNull(title);
        this.authorGithubUserId = authorGithubUserId;
        this.authorGithubLogin = authorGithubLogin;
        this.authorMember = authorMember;
        this.state = Objects.requireNonNull(state);
        this.headSha = headSha;
        this.reviewRequestsJson = Objects.requireNonNull(reviewRequestsJson);
        this.reviewsJson = Objects.requireNonNull(reviewsJson);
        this.labelsJson = Objects.requireNonNull(labelsJson);
        this.lastCommitAt = lastCommitAt;
        this.githubCreatedAt = Objects.requireNonNull(githubCreatedAt);
        this.githubUpdatedAt = Objects.requireNonNull(githubUpdatedAt);
        this.mergedAt = mergedAt;
        this.closedAt = closedAt;
        this.stateChangedAt = Objects.requireNonNull(stateChangedAt);
        this.syncedAt = Objects.requireNonNull(syncedAt);
    }

    /**
     * 동기화 — 같은 PR의 새 GitHub 값으로 덮어쓴다(「2」 소유: 동기화만 쓴다). {@code fresh}는 저장하지 않은 임시 값이다.
     *
     * @return this
     */
    public Submission overwriteFrom(Submission fresh) {
        if (!workspace.getId().equals(fresh.workspace.getId()) || githubPrNumber != fresh.githubPrNumber) {
            throw new IllegalArgumentException("같은 사무실 · 같은 PR 번호만 덮어쓴다");
        }
        this.title = fresh.title;
        this.authorGithubUserId = fresh.authorGithubUserId;
        this.authorGithubLogin = fresh.authorGithubLogin;
        this.authorMember = fresh.authorMember;
        this.state = fresh.state;
        this.headSha = fresh.headSha;
        this.reviewRequestsJson = fresh.reviewRequestsJson;
        this.reviewsJson = fresh.reviewsJson;
        this.labelsJson = fresh.labelsJson;
        this.lastCommitAt = fresh.lastCommitAt;
        this.githubCreatedAt = fresh.githubCreatedAt;
        this.githubUpdatedAt = fresh.githubUpdatedAt;
        this.mergedAt = fresh.mergedAt;
        this.closedAt = fresh.closedAt;
        this.stateChangedAt = fresh.stateChangedAt;
        this.syncedAt = fresh.syncedAt;
        return this;
    }
}

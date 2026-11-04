package com.samdoryu.backend.sync.domain;

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
 * GitHub 이슈의 앱 모델(CONTRACTS.md 「2」). 동기화만 쓴다 — 앱 API의 쓰기는 없고 행을 지우지 않는다.
 * 담당자는 {@link TaskAssignee}. GitHub 값으로 갱신하는 메서드는 동기화 Issue(#69)에서 더한다.
 */
@Entity
@Table(name = "task")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false)
    private int githubIssueNumber;

    @Column(nullable = false, length = 512)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private TaskState state;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private TaskClosedReason closedReason;

    /** 라벨 이름 배열 JSON — 예: {@code ["priority:high"]}. */
    @Column(name = "labels", nullable = false, columnDefinition = "json")
    private String labelsJson;

    @Column(nullable = false)
    private Instant githubCreatedAt;

    @Column(nullable = false)
    private Instant githubUpdatedAt;

    private Instant closedAt;

    /** 열림 · 닫힘 · 담당자가 마지막으로 바뀐 시각(FR-FLOW-08). */
    @Column(nullable = false)
    private Instant stateChangedAt;

    @Column(nullable = false)
    private Instant syncedAt;

    @Builder
    private Task(Workspace workspace, int githubIssueNumber, String title, TaskState state,
            TaskClosedReason closedReason, String labelsJson, Instant githubCreatedAt, Instant githubUpdatedAt,
            Instant closedAt, Instant stateChangedAt, Instant syncedAt) {
        if (state != TaskState.CLOSED && closedReason != null) {
            throw new IllegalArgumentException("닫힘 사유는 닫힌 이슈에만");
        }
        this.workspace = Objects.requireNonNull(workspace);
        this.githubIssueNumber = githubIssueNumber;
        this.title = Objects.requireNonNull(title);
        this.state = Objects.requireNonNull(state);
        this.closedReason = closedReason;
        this.labelsJson = Objects.requireNonNull(labelsJson);
        this.githubCreatedAt = Objects.requireNonNull(githubCreatedAt);
        this.githubUpdatedAt = Objects.requireNonNull(githubUpdatedAt);
        this.closedAt = closedAt;
        this.stateChangedAt = Objects.requireNonNull(stateChangedAt);
        this.syncedAt = Objects.requireNonNull(syncedAt);
    }

    /**
     * 동기화 — 같은 이슈의 새 GitHub 값으로 덮어쓴다(「2」 소유: 동기화만 쓴다). {@code fresh}는 저장하지 않은 임시 값이다.
     *
     * @return this
     */
    public Task overwriteFrom(Task fresh) {
        if (!workspace.getId().equals(fresh.workspace.getId()) || githubIssueNumber != fresh.githubIssueNumber) {
            throw new IllegalArgumentException("같은 사무실 · 같은 이슈 번호만 덮어쓴다");
        }
        this.title = fresh.title;
        this.state = fresh.state;
        this.closedReason = fresh.closedReason;
        this.labelsJson = fresh.labelsJson;
        this.githubCreatedAt = fresh.githubCreatedAt;
        this.githubUpdatedAt = fresh.githubUpdatedAt;
        this.closedAt = fresh.closedAt;
        this.stateChangedAt = fresh.stateChangedAt;
        this.syncedAt = fresh.syncedAt;
        return this;
    }
}

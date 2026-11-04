package com.samdoryu.backend.requirement.domain;

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
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 명세 문서의 {@code ##} 제목 하나 = 요구사항 하나(CONTRACTS.md 「2」 · 「3」 요구사항 재동기화).
 * 다시 읽어도 같은 요구사항이면 같은 ID를 유지하고, 행을 지우지 않는다(사라지면 {@link RequirementStatus#MISSING}).
 * 매칭 규칙은 재동기화 Service(#14)에 둔다.
 */
@Entity
@Table(name = "requirement")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Requirement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    /** 원본 ID(예: {@code FR-AUTH-01}) — 제목 맨 앞에 없으면 null. */
    @Column(length = 64)
    private String sourceKey;

    /** 문서의 {@code ##} 제목 원문. */
    @Column(nullable = false, length = 512)
    private String heading;

    /** 원본 ID를 뺀 정규화 제목 — 매칭과 응답의 {@code title}. */
    @Column(nullable = false, length = 512)
    private String title;

    /** 문서 안 순서(0부터). */
    @Column(nullable = false)
    private int position;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private RequirementStatus status;

    private Instant lastSeenAt;

    /** 재동기화의 「③ 새 요구사항」. */
    public Requirement(Workspace workspace, String sourceKey, String heading, String title, int position,
            Instant seenAt) {
        this.workspace = Objects.requireNonNull(workspace);
        this.status = RequirementStatus.ACTIVE;
        matchDocument(sourceKey, heading, title, position, seenAt);
    }

    /** 재동기화에서 짝을 찾음 — 문서 값으로 갱신하고 {@code active}. */
    public void matchDocument(String sourceKey, String heading, String title, int position, Instant seenAt) {
        if (position < 0) {
            throw new IllegalArgumentException("position은 0부터");
        }
        this.sourceKey = sourceKey;
        this.heading = Objects.requireNonNull(heading);
        this.title = Objects.requireNonNull(title);
        this.position = position;
        this.status = RequirementStatus.ACTIVE;
        this.lastSeenAt = Objects.requireNonNull(seenAt);
    }

    /** 재동기화에서 짝을 못 찾음({@code missing}) 또는 모호함({@code needs_review}). 연결은 그대로다. */
    public void markUnmatched(RequirementStatus status) {
        if (status == RequirementStatus.ACTIVE) {
            throw new IllegalArgumentException("active는 matchDocument로");
        }
        this.status = status;
    }
}

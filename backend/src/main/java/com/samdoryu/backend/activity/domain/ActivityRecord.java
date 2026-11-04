package com.samdoryu.backend.activity.domain;

import com.samdoryu.backend.workspace.domain.Member;
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
 * 활동 기록(CONTRACTS.md 「2」 · FR-ACT-01 · 02). 수집 동의한 팀원만 쓴다 — Service가 검사한다.
 * 상태({@code pending} · {@code confirmed})는 {@link ActivityConfirmation} 행이 있는지로 계산하고 저장하지 않는다.
 * 소요 시간은 본인 분포에만 쓰고 팀 화면에 합산하지 않는다(P6).
 */
@Entity
@Table(name = "activity_record")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ActivityRecord {

    public static final int MAX_CONTENT_LENGTH = 500;
    public static final int MIN_DURATION_MINUTES = 1;
    public static final int MAX_DURATION_MINUTES = 1440;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_member_id", nullable = false)
    private Member author;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ActivityKind kind;

    @Column(nullable = false, length = MAX_CONTENT_LENGTH)
    private String content;

    @Column(nullable = false)
    private int durationMinutes;

    @Column(nullable = false)
    private Instant createdAt;

    public ActivityRecord(Member author, ActivityKind kind, String content, int durationMinutes, Instant createdAt) {
        if (durationMinutes < MIN_DURATION_MINUTES || durationMinutes > MAX_DURATION_MINUTES) {
            throw new IllegalArgumentException("소요 시간은 " + MIN_DURATION_MINUTES + "~" + MAX_DURATION_MINUTES + "분");
        }
        this.author = Objects.requireNonNull(author);
        this.kind = Objects.requireNonNull(kind);
        this.content = Objects.requireNonNull(content);
        this.durationMinutes = durationMinutes;
        this.createdAt = Objects.requireNonNull(createdAt);
    }
}

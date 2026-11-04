package com.samdoryu.backend.evaluation.domain;

import com.samdoryu.backend.sync.domain.Submission;
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
 * PR 평가 회차(CONTRACTS.md 「2」 · 「3」 평가 회차 · P7). (PR, 회차 번호) 유일. 지우지 않는다.
 * 회차 ID와 {@code headSha}는 별개 — 같은 {@code headSha}에 회차가 여러 개일 수 있다.
 * 현재 회차 = 그 PR의 회차 번호가 가장 큰 회차. 새 회차를 열면 이전 회차에 {@link #close(Instant)}.
 */
@Entity
@Table(name = "evaluation_round")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EvaluationRound {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "submission_id", nullable = false)
    private Submission submission;

    @Column(nullable = false)
    private int roundNumber;

    @Column(nullable = false, length = Submission.HEAD_SHA_LENGTH, columnDefinition = "char(40)")
    private String headSha;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private RoundOpenedReason openedReason;

    @Column(nullable = false)
    private Instant openedAt;

    private Instant closedAt;

    public EvaluationRound(Submission submission, int roundNumber, String headSha, RoundOpenedReason openedReason,
            Instant openedAt) {
        if (roundNumber < 1) {
            throw new IllegalArgumentException("회차 번호는 1부터");
        }
        if (headSha == null || headSha.length() != Submission.HEAD_SHA_LENGTH) {
            throw new IllegalArgumentException("headSha는 40자 커밋 SHA");
        }
        this.submission = Objects.requireNonNull(submission);
        this.roundNumber = roundNumber;
        this.headSha = headSha;
        this.openedReason = Objects.requireNonNull(openedReason);
        this.openedAt = Objects.requireNonNull(openedAt);
    }

    /** 새 회차가 열림. */
    public void close(Instant closedAt) {
        if (this.closedAt != null) {
            throw new IllegalStateException("이미 닫힌 회차");
        }
        this.closedAt = Objects.requireNonNull(closedAt);
    }
}

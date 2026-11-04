package com.samdoryu.backend.evaluation.domain;

import com.samdoryu.backend.auth.domain.AppUser;
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
 * 익명 PR 평가(CONTRACTS.md 「2」 · FR-LRN-01 · 02). (회차, 평가자) 유일 — 1인 1회, 고치면 같은 행을 갱신한다.
 * <b>평가자는 1인 1회 · 작성자 제외 검사에만 쓰고 어느 응답에도 담지 않는다</b>(「5」 익명성). 지우지 않는다.
 */
@Entity
@Table(name = "evaluation")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Evaluation {

    /** 이유 최대 길이(앞뒤 공백을 뺀 뒤 1~200자 — FR-LRN-02). */
    public static final int MAX_REASON_LENGTH = 200;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "round_id", nullable = false)
    private EvaluationRound round;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "evaluator_user_id", nullable = false)
    private AppUser evaluator;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Verdict verdict;

    @Column(nullable = false, length = MAX_REASON_LENGTH)
    private String reason;

    @Column(nullable = false)
    private Instant updatedAt;

    public Evaluation(EvaluationRound round, AppUser evaluator, Verdict verdict, String reason, Instant at) {
        this.round = Objects.requireNonNull(round);
        this.evaluator = Objects.requireNonNull(evaluator);
        revise(verdict, reason, at);
    }

    /** 같은 회차의 평가를 고친다. 이유는 앞뒤 공백을 뺀 값으로 저장한다. */
    public void revise(Verdict verdict, String reason, Instant at) {
        String trimmed = Objects.requireNonNull(reason).strip();
        if (trimmed.isEmpty() || trimmed.length() > MAX_REASON_LENGTH) {
            throw new IllegalArgumentException("이유는 1~" + MAX_REASON_LENGTH + "자");
        }
        this.verdict = Objects.requireNonNull(verdict);
        this.reason = trimmed;
        this.updatedAt = Objects.requireNonNull(at);
    }

    /** 평가자 값이 로그 · 응답으로 새지 않도록 직접 쓴다. */
    @Override
    public String toString() {
        return "Evaluation(id=" + id + ", verdict=" + verdict + ")";
    }
}

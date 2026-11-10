package com.samdoryu.backend.report.domain;

import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.workspace.domain.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
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
 * 기술 결정 카드(CONTRACTS.md 「2」 · FR-REP-07 · 11 · P11). (팀원, PR) 유일. 개인 기록 — 본인과 지정된 강사만 읽는다.
 * 꼬리질문은 {@link FollowUpQuestion}으로 따로 붙는다.
 */
@Entity
@Table(name = "decision_card")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DecisionCard {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "submission_id", nullable = false)
    private Submission submission;

    /** 9칸이 모두 비면 Hibernate가 null로 읽으므로 {@link #getCells()}가 빈 칸으로 바꿔 준다. */
    @Embedded
    private DecisionCardCells cells;

    private Instant followUpRequestedAt;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    public DecisionCard(Member member, Submission submission, DecisionCardCells cells, Instant createdAt) {
        this.member = Objects.requireNonNull(member);
        this.submission = Objects.requireNonNull(submission);
        this.cells = Objects.requireNonNull(cells);
        this.createdAt = Objects.requireNonNull(createdAt);
        this.updatedAt = createdAt;
    }

    public DecisionCardCells getCells() {
        return cells == null ? DecisionCardCells.EMPTY : cells;
    }

    /**
     * 본인이 9칸을 고친다({@code PUT …/decision-cards/{cardId}}). 「확인함」 단계는 없다(#335) — 배운 점 칸이 있으면 리포트를 만들 때
     * 고를 수 있다({@link #isSelectableForReport()}).
     */
    public void edit(DecisionCardCells cells, Instant at) {
        this.cells = Objects.requireNonNull(cells);
        this.updatedAt = Objects.requireNonNull(at);
    }

    /** 리포트를 만들 때 고를 수 있는가 — 본인이 쓴 「내가 배운 점」이 있다(P11). */
    public boolean isSelectableForReport() {
        return getCells().hasLearning();
    }

    /** 강사에게 꼬리질문 요청 — 이미 켜져 있으면 그대로. */
    public void requestFollowUp(Instant at) {
        if (followUpRequestedAt == null) {
            this.followUpRequestedAt = Objects.requireNonNull(at);
        }
    }
}

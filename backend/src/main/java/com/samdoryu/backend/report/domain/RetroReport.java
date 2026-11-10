package com.samdoryu.backend.report.domain;

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
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Collection;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 회고 리포트(CONTRACTS.md 「2」 · FR-REP-01~03 · 05 · 07). 개인 기록 — 본인과 지정된 강사만 읽는다.
 * 종류 · 제목 · 느낀 점 · 만든 시각 · 고른 기술 결정 카드를 저장하고, 나머지 칸(영역 · 안건 결과 · 피드백 · 분포)은 읽을 때 계산한다.
 * 고른 카드는 만든 뒤 바꾸지 않는다(#335).
 */
@Entity
@Table(name = "retro_report")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RetroReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ReportKind kind;

    @Column(nullable = false, length = 100)
    private String title;

    /** 느낀 점(FR-REP-02) — #335 이전에 만든 리포트는 비어 있을 수 있다. */
    @Column(columnDefinition = "text")
    private String learning;

    @ManyToMany
    @JoinTable(name = "retro_report_decision_card",
            joinColumns = @JoinColumn(name = "report_id"),
            inverseJoinColumns = @JoinColumn(name = "decision_card_id"))
    private Set<DecisionCard> decisionCards = new HashSet<>();

    @Column(nullable = false)
    private Instant createdAt;

    public RetroReport(Member member, ReportKind kind, String title, String learning,
            Collection<DecisionCard> decisionCards, Instant createdAt) {
        this.member = Objects.requireNonNull(member);
        this.kind = Objects.requireNonNull(kind);
        this.title = Objects.requireNonNull(title);
        this.learning = Objects.requireNonNull(learning);
        this.decisionCards = new HashSet<>(decisionCards);
        this.createdAt = Objects.requireNonNull(createdAt);
    }

    public void writeLearning(String learning) {
        this.learning = Objects.requireNonNull(learning);
    }
}

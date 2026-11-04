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
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 회고 리포트(CONTRACTS.md 「2」 · FR-REP-01~03 · 05). 개인 기록 — 본인과 지정된 강사만 읽는다.
 * 배운 점만 저장하고 나머지 칸(요약 · 안건 결과 · 피드백 · 분포 · 카드)은 읽을 때 계산한다.
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

    @Column(columnDefinition = "text")
    private String learning;

    @Column(nullable = false)
    private Instant createdAt;

    public RetroReport(Member member, ReportKind kind, Instant createdAt) {
        this.member = Objects.requireNonNull(member);
        this.kind = Objects.requireNonNull(kind);
        this.createdAt = Objects.requireNonNull(createdAt);
    }

    public void writeLearning(String learning) {
        this.learning = learning;
    }
}

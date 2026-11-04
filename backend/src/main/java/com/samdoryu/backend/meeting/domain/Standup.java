package com.samdoryu.backend.meeting.domain;

import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 스탠드업(CONTRACTS.md 「2」 · FR-MTG-01). (사무실, 팀원, 날짜) 유일 — 날짜는 한국 시간 기준 달력 날짜.
 * {@code PUT W/standups/{date}/mine}은 있으면 고치고 없으면 만든다.
 */
@Entity
@Table(name = "standup")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Standup {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "standup_date", nullable = false)
    private LocalDate date;

    /** 어제 한 일 — 빈 문자열 허용(0~2000자). */
    @Column(nullable = false, columnDefinition = "text")
    private String yesterday;

    /** 막힌 것. */
    @Column(columnDefinition = "text")
    private String blockers;

    @Column(nullable = false)
    private Instant updatedAt;

    public Standup(Workspace workspace, Member member, LocalDate date, String yesterday, String blockers,
            Instant updatedAt) {
        this.workspace = Objects.requireNonNull(workspace);
        this.member = Objects.requireNonNull(member);
        this.date = Objects.requireNonNull(date);
        rewrite(yesterday, blockers, updatedAt);
    }

    public void rewrite(String yesterday, String blockers, Instant updatedAt) {
        this.yesterday = Objects.requireNonNull(yesterday);
        this.blockers = blockers;
        this.updatedAt = Objects.requireNonNull(updatedAt);
    }
}

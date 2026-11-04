package com.samdoryu.backend.workspace.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 팀 설정(CONTRACTS.md 「2」, Workspace 1–1). 막힘 기준 시간은 화면 상수가 아니라 여기서 읽는다.
 * 값 범위(시간 1~720 · 끝 ≥ 시작)는 요청 DTO 검증과 DB CHECK 제약이 함께 막는다.
 */
@Entity
@Table(name = "team_settings")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TeamSettings {

    /** reviewWaitHours · noCommitHours 기본값(P9). */
    public static final int DEFAULT_HOURS = 48;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false, unique = true)
    private Workspace workspace;

    @Column(nullable = false)
    private LocalDate projectStartDate;

    @Column(nullable = false)
    private LocalDate projectEndDate;

    @Column(length = 300)
    private String specDocumentPath;

    @Column(nullable = false)
    private int reviewWaitHours;

    @Column(nullable = false)
    private int noCommitHours;

    /** 사무실을 열 때 — 시간 기준은 기본값으로 시작한다. */
    public TeamSettings(Workspace workspace, LocalDate projectStartDate, LocalDate projectEndDate,
            String specDocumentPath) {
        this.workspace = Objects.requireNonNull(workspace);
        replace(projectStartDate, projectEndDate, specDocumentPath, DEFAULT_HOURS, DEFAULT_HOURS);
    }

    /** {@code PUT W/settings} — 전체 교체. 검증은 요청 DTO · Service에서 먼저 한다. */
    public void replace(LocalDate projectStartDate, LocalDate projectEndDate, String specDocumentPath,
            int reviewWaitHours, int noCommitHours) {
        this.projectStartDate = Objects.requireNonNull(projectStartDate);
        this.projectEndDate = Objects.requireNonNull(projectEndDate);
        this.specDocumentPath = specDocumentPath;
        this.reviewWaitHours = reviewWaitHours;
        this.noCommitHours = noCommitHours;
    }
}

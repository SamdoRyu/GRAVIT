package com.samdoryu.backend.sync.domain;

import com.samdoryu.backend.common.error.ErrorCode;
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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 사무실의 동기화 상태(CONTRACTS.md 「2」, Workspace 1–1 · FR-GH-05).
 * 실패를 삼키지 않는다 — 마지막 실패 시각 · code · 사유를 남기고, 화면은 마지막 성공 데이터로 유지한다.
 * 상태 전이(시작 · 성공 · 실패)는 동기화 Issue에서 이 Entity에 더한다.
 */
@Entity
@Table(name = "sync_state")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SyncState {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false, unique = true)
    private Workspace workspace;

    @Column(nullable = false)
    private boolean running;

    private Instant lastSucceededAt;

    private Instant lastFailedAt;

    /** {@code GITHUB_UNAUTHORIZED} · {@code GITHUB_RATE_LIMITED} · {@code UNAVAILABLE}만 쓴다(SyncStatus.lastFailureCode). */
    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private ErrorCode lastFailureCode;

    @Column(length = 500)
    private String lastFailureMessage;

    /** 마지막 명세 문서 읽기 경고 — SpecWarning 배열 JSON(CONTRACTS_API.md 「4」). 읽은 적 없으면 null. */
    @Column(name = "spec_warnings", columnDefinition = "json")
    private String specWarningsJson;

    /** 사무실을 열 때 — 아직 동기화한 적 없음. */
    public SyncState(Workspace workspace) {
        this.workspace = Objects.requireNonNull(workspace);
        this.running = false;
    }
}

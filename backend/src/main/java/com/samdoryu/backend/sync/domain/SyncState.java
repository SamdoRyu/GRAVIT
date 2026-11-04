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
 * 시작(실행 중 표시)은 동시에 두 번 시작하지 않도록 Repository의 조건부 갱신으로 하고, 끝은 {@link #succeed} ·
 * {@link #fail}로 한다(#70).
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

    /** 동기화 성공 — 마지막 실패 기록은 남겨 둔다({@code isFailing}은 두 시각을 비교해 정한다). */
    public void succeed(Instant at) {
        this.running = false;
        this.lastSucceededAt = Objects.requireNonNull(at);
    }

    /**
     * 동기화 실패 — 시각 · code · 사유를 남긴다. 데이터는 그 동기화 트랜잭션이 되돌려 마지막 성공 상태로 남는다.
     *
     * @param code {@code GITHUB_UNAUTHORIZED} · {@code GITHUB_RATE_LIMITED} · {@code UNAVAILABLE} 중 하나
     */
    public void fail(Instant at, ErrorCode code, String message) {
        if (code != ErrorCode.GITHUB_UNAUTHORIZED && code != ErrorCode.GITHUB_RATE_LIMITED
                && code != ErrorCode.UNAVAILABLE) {
            throw new IllegalArgumentException("동기화 실패 code는 github_unauthorized · github_rate_limited · unavailable");
        }
        this.running = false;
        this.lastFailedAt = Objects.requireNonNull(at);
        this.lastFailureCode = code;
        this.lastFailureMessage = message;
    }

    /** 마지막 실패가 마지막 성공보다 나중인가 — 상단 바 실패 표시(FR-GH-05). */
    public boolean isFailing() {
        return lastFailedAt != null && (lastSucceededAt == null || lastFailedAt.isAfter(lastSucceededAt));
    }
}

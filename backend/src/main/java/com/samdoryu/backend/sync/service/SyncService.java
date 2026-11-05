package com.samdoryu.backend.sync.service;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.sync.dto.SyncStatus;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;

/**
 * 동기화 실행 — 수동({@code POST W/sync}) · 자동 폴링(5분)이 같은 동기화를 하고 같은 {@code SyncState}를 쓴다
 * (CONTRACTS_API.md 「4」 · FR-GH-03 · 05).
 * <ul>
 *   <li>사무실마다 한 번에 하나 — 실행 중이면 수동은 {@code conflict}, 폴링은 건너뛴다.</li>
 *   <li>실패하면 데이터는 그 동기화 트랜잭션이 되돌려 마지막 성공 상태로 남고(NFR-09), 시각 · code · 사유를 기록한다.</li>
 *   <li>끝나면 SSE {@code sync}(상태)를 보내고, 성공이면 {@code change}(팀원 · 이슈 · PR)도 보낸다.</li>
 * </ul>
 * 이 Service 메서드는 트랜잭션을 열지 않는다 — 시작 · 데이터 · 결과 기록이 각자 트랜잭션이라 이벤트는 커밋 뒤에 나간다.
 */
@Slf4j
@Service
public class SyncService {

    /** 폴링은 마지막 성공 시각보다 조금 앞부터 읽는다 — GitHub 고친 시각과 서버 시각의 작은 어긋남을 덮는다. */
    static final Duration POLL_OVERLAP = Duration.ofMinutes(1);

    private final SyncStateRecorder recorder;
    private final WorkspaceSyncService workspaceSyncService;
    private final WorkspaceService workspaceService;
    private final WorkspaceEventHub eventHub;
    private final TaskExecutor syncExecutor;

    public SyncService(SyncStateRecorder recorder, WorkspaceSyncService workspaceSyncService,
            WorkspaceService workspaceService, WorkspaceEventHub eventHub,
            @Qualifier(SyncConfig.SYNC_EXECUTOR) TaskExecutor syncExecutor) {
        this.recorder = recorder;
        this.workspaceSyncService = workspaceSyncService;
        this.workspaceService = workspaceService;
        this.eventHub = eventHub;
        this.syncExecutor = syncExecutor;
    }

    /** {@code GET W/sync-status}. */
    public SyncStatus status(Long workspaceId) {
        return recorder.status(workspaceId);
    }

    /**
     * {@code POST W/sync} — 실행 중 표시를 하고 바로 {@code running}을 돌려준다. 동기화는 백그라운드에서 돈다.
     * 수동 동기화(사무실 열기 직후 첫 동기화 포함)는 전체를 다시 읽고(빠진 변경분을 메운다) 명세 문서도 다시 읽는다.
     */
    public SyncStatus requestSync(Long workspaceId) {
        if (!recorder.tryStart(workspaceId)) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        SyncStatus running = recorder.status(workspaceId);
        syncExecutor.execute(() -> run(workspaceId, null, true));
        return running;
    }

    /**
     * 이 스레드에서 바로 전체 동기화(명세 문서 포함) — 시연 사무실을 막 만들었을 때 Seed로 채운다(#63). 결과는 수동 동기화와
     * 같이 기록 · 알린다. 이미 실행 중이면 건너뛴다.
     */
    public SyncStatus syncNow(Long workspaceId) {
        if (recorder.tryStart(workspaceId)) {
            run(workspaceId, null, true);
        }
        return recorder.status(workspaceId);
    }

    /**
     * 자동 폴링 — 실제 사무실 전부를 마지막 성공 이후 변경분으로. 실행 중인 사무실은 건너뛴다. 명세 문서는 읽지 않는다
     * (CONTRACTS_API 「4」 — 2026-10-28 결정).
     */
    public void pollAll() {
        for (Long workspaceId : workspaceService.githubWorkspaceIds()) {
            if (!recorder.tryStart(workspaceId)) {
                continue;
            }
            Instant lastSucceededAt = recorder.lastSucceededAt(workspaceId);
            run(workspaceId, lastSucceededAt == null ? null : lastSucceededAt.minus(POLL_OVERLAP), false);
        }
    }

    /**
     * 이미 실행 중으로 표시된 사무실을 동기화하고 결과를 기록 · 알린다. 예외를 밖으로 던지지 않는다 — 기록으로 남긴다.
     *
     * @param readSpec 명세 문서를 다시 읽나 — 수동 동기화만
     */
    void run(Long workspaceId, Instant since, boolean readSpec) {
        Instant now = now();
        SyncStatus result;
        WorkspaceSyncService.Outcome outcome = null;
        try {
            outcome = workspaceSyncService.sync(workspaceId, since, readSpec, now);
            result = recorder.succeed(workspaceId, now, outcome.specWarnings());
        } catch (ApiException e) {
            log.warn("동기화 실패: workspace={}, code={}", workspaceId, e.getErrorCode().code());
            result = recorder.fail(workspaceId, now(), failureCode(e.getErrorCode()));
        } catch (RuntimeException e) {
            log.error("동기화 실패: workspace={}", workspaceId, e);
            result = recorder.fail(workspaceId, now(), ErrorCode.UNAVAILABLE);
        }
        eventHub.publishSync(workspaceId, result);
        if (outcome != null) {
            if (outcome.specRead()) {
                eventHub.publishChangeAfterCommit(workspaceId, SnapshotResource.MEMBERS, SnapshotResource.TASKS,
                        SnapshotResource.SUBMISSIONS, SnapshotResource.REQUIREMENTS);
            } else {
                eventHub.publishChangeAfterCommit(workspaceId, SnapshotResource.MEMBERS, SnapshotResource.TASKS,
                        SnapshotResource.SUBMISSIONS);
            }
        }
    }

    /** 지금 시각 — DB({@code DATETIME(6)})와 같은 마이크로초로 맞춰, 저장한 값과 응답 · 비교 값이 어긋나지 않게 한다. */
    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }

    /** 동기화 실패 code는 GitHub 둘과 {@code unavailable}뿐이다(SyncStatus.lastFailureCode). */
    private static ErrorCode failureCode(ErrorCode code) {
        return code == ErrorCode.GITHUB_UNAUTHORIZED || code == ErrorCode.GITHUB_RATE_LIMITED
                ? code : ErrorCode.UNAVAILABLE;
    }
}

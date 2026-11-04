package com.samdoryu.backend.sync.service;

import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.sync.domain.SyncState;
import com.samdoryu.backend.sync.dto.SyncStatus;
import com.samdoryu.backend.sync.repository.SyncStateRepository;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code SyncState} 기록 — 메서드 하나가 트랜잭션 하나다. 동기화 본체(데이터)와 다른 트랜잭션이라, 동기화가 실패해 데이터가
 * 되돌려져도 실패 기록은 남는다(FR-GH-05 — 실패를 삼키지 않는다).
 */
@Component
class SyncStateRecorder {

    private final SyncStateRepository syncStateRepository;
    private final WorkspaceService workspaceService;

    SyncStateRecorder(SyncStateRepository syncStateRepository, WorkspaceService workspaceService) {
        this.syncStateRepository = syncStateRepository;
        this.workspaceService = workspaceService;
    }

    private SyncState stateOf(Long workspaceId) {
        return syncStateRepository.findByWorkspaceId(workspaceId)
                .orElseGet(() -> syncStateRepository.save(new SyncState(workspaceService.requireWorkspace(workspaceId))));
    }

    /** 사무실을 열 때 만들지만, 없으면 여기서 만든다. 없는 사무실이면 {@code not_found}. */
    @Transactional
    public SyncStatus status(Long workspaceId) {
        return SyncStatus.of(stateOf(workspaceId));
    }

    /** @return 실행 중으로 바꿨으면 true, 이미 실행 중이면 false */
    @Transactional
    public boolean tryStart(Long workspaceId) {
        stateOf(workspaceId);
        return syncStateRepository.markRunningIfIdle(workspaceId) == 1;
    }

    @Transactional
    public SyncStatus succeed(Long workspaceId, Instant at) {
        SyncState state = stateOf(workspaceId);
        state.succeed(at);
        return SyncStatus.of(state);
    }

    @Transactional
    public SyncStatus fail(Long workspaceId, Instant at, ErrorCode code) {
        SyncState state = stateOf(workspaceId);
        state.fail(at, code, code.defaultMessage());
        return SyncStatus.of(state);
    }

    /** 마지막 성공 시각 — 폴링이 변경분 기준으로 쓴다. */
    @Transactional(readOnly = true)
    public Instant lastSucceededAt(Long workspaceId) {
        return syncStateRepository.findByWorkspaceId(workspaceId).map(state -> state.getLastSucceededAt()).orElse(null);
    }

    /** 서버가 동기화 도중 멈췄던 사무실 — 실행 중 표시가 남아 계속 {@code conflict}가 되지 않게 실패로 정리한다. */
    @Transactional
    public List<Long> failInterrupted(Instant at) {
        List<SyncState> running = syncStateRepository.findByRunningTrue();
        running.forEach(state -> state.fail(at, ErrorCode.UNAVAILABLE, ErrorCode.UNAVAILABLE.defaultMessage()));
        return running.stream().map(state -> state.getWorkspace().getId()).toList();
    }
}

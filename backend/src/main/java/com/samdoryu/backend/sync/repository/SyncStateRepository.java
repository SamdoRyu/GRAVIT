package com.samdoryu.backend.sync.repository;

import com.samdoryu.backend.sync.domain.SyncState;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SyncStateRepository extends JpaRepository<SyncState, Long> {

    Optional<SyncState> findByWorkspaceId(Long workspaceId);

    /**
     * 실행 중이 아니면 실행 중으로 바꾼다 — 한 문장의 조건부 갱신이라 동시에 두 요청이 와도 하나만 1을 받는다.
     *
     * @return 1이면 시작함, 0이면 이미 실행 중
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update SyncState s set s.running = true where s.workspace.id = :workspaceId and s.running = false")
    int markRunningIfIdle(@Param("workspaceId") Long workspaceId);

    List<SyncState> findByRunningTrue();

    /**
     * 없으면 만든다 — 동시에 두 요청이 와도 UNIQUE(workspace_id) 충돌 예외 없이 한 행만 남는다(중복이면 아무것도 바꾸지 않음).
     * 열 기본값(running false, 나머지 null)이 {@code new SyncState(workspace)}와 같다.
     */
    @Modifying
    @Query(value = "INSERT INTO sync_state (workspace_id) VALUES (:workspaceId) "
            + "ON DUPLICATE KEY UPDATE workspace_id = workspace_id", nativeQuery = true)
    int insertIfAbsent(@Param("workspaceId") Long workspaceId);

    /** 잠금 읽기 — REPEATABLE READ 스냅샷이 아니라 최신 커밋 행을 본다(다른 요청이 방금 만든 행 포함). */
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("select s from SyncState s where s.workspace.id = :workspaceId")
    Optional<SyncState> findLatestByWorkspaceId(@Param("workspaceId") Long workspaceId);
}

package com.samdoryu.backend.sync.repository;

import com.samdoryu.backend.sync.domain.SyncState;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
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
}

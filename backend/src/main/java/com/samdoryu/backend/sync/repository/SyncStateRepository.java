package com.samdoryu.backend.sync.repository;

import com.samdoryu.backend.sync.domain.SyncState;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SyncStateRepository extends JpaRepository<SyncState, Long> {

    Optional<SyncState> findByWorkspaceId(Long workspaceId);
}

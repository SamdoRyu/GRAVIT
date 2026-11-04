package com.samdoryu.backend.workspace.repository;

import com.samdoryu.backend.workspace.domain.TeamSettings;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TeamSettingsRepository extends JpaRepository<TeamSettings, Long> {

    Optional<TeamSettings> findByWorkspaceId(Long workspaceId);
}

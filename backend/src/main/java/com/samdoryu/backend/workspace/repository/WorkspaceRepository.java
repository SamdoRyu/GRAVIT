package com.samdoryu.backend.workspace.repository;

import com.samdoryu.backend.workspace.domain.Workspace;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspaceRepository extends JpaRepository<Workspace, Long> {

    Optional<Workspace> findByGithubRepoId(Long githubRepoId);
}

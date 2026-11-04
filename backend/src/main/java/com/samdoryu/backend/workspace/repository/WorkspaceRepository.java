package com.samdoryu.backend.workspace.repository;

import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkspaceRepository extends JpaRepository<Workspace, Long> {

    Optional<Workspace> findByGithubRepoId(Long githubRepoId);

    List<Workspace> findByKind(WorkspaceKind kind);

    /** 레포 선택 화면 — 그 레포들 중 이미 열린 사무실. */
    List<Workspace> findByGithubRepoIdIn(Collection<Long> githubRepoIds);
}

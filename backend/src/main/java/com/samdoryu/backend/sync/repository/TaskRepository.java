package com.samdoryu.backend.sync.repository;

import com.samdoryu.backend.sync.domain.Task;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사무실 단위 — 항상 사무실 조건으로 찾는다(IDOR 방어). */
public interface TaskRepository extends JpaRepository<Task, Long> {

    Optional<Task> findByIdAndWorkspaceId(Long id, Long workspaceId);

    /** 동기화는 GitHub 식별자로 앱 행을 찾는다. */
    Optional<Task> findByWorkspaceIdAndGithubIssueNumber(Long workspaceId, int githubIssueNumber);

    /** Snapshot {@code tasks} — 이슈 전부, githubIssueNumber 오름차순. */
    List<Task> findByWorkspaceIdOrderByGithubIssueNumberAsc(Long workspaceId);
}

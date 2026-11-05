package com.samdoryu.backend.sync.repository;

import com.samdoryu.backend.sync.domain.Submission;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사무실 단위 — 항상 사무실 조건으로 찾는다(IDOR 방어). */
public interface SubmissionRepository extends JpaRepository<Submission, Long> {

    Optional<Submission> findByIdAndWorkspaceId(Long id, Long workspaceId);

    /** 동기화는 GitHub 식별자로 앱 행을 찾는다. */
    Optional<Submission> findByWorkspaceIdAndGithubPrNumber(Long workspaceId, int githubPrNumber);

    /** Snapshot {@code submissions} — PR 전부, githubPrNumber 오름차순. */
    List<Submission> findByWorkspaceIdOrderByGithubPrNumberAsc(Long workspaceId);
}

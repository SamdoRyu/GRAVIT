package com.samdoryu.backend.sync.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.github.GithubReader;
import com.samdoryu.backend.github.dto.GithubCollaborator;
import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubIssueLink;
import com.samdoryu.backend.github.dto.GithubPullRequest;
import com.samdoryu.backend.github.dto.GithubRepoRef;
import com.samdoryu.backend.github.dto.GithubReview;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 실제 사무실용 가짜 어댑터 — GitHub를 부르지 않는다. 테스트가 필드에 GitHub 값을 넣는다. */
class FakeGithubReader implements GithubReader {

    /** 넣으면 읽기 요청의 레포가 이것인지 확인한다. */
    GithubRepoRef expectedRepo;
    List<GithubCollaborator> collaborators = new ArrayList<>();
    List<GithubIssue> issues = new ArrayList<>();
    List<GithubPullRequest> pullRequests = new ArrayList<>();
    Map<Integer, List<GithubIssueLink>> links = new HashMap<>();
    /** 넣으면 콜라보레이터를 읽을 때(동기화 첫 단계) 이 예외를 던진다 — GitHub 오류 흉내. */
    RuntimeException failWith;
    /** 이슈 변경분을 읽을 때 받은 기준 시각(null = 전부). */
    final List<Instant> sinceSeen = new ArrayList<>();
    /** 레포의 파일(경로 → 내용). 없는 경로는 "파일 없음". */
    Map<String, String> files = new HashMap<>();
    /** 넣으면 파일을 읽을 때 이 예외를 던진다 — GitHub 오류 흉내. */
    RuntimeException fileFailWith;
    /** 읽은 파일 경로. */
    final List<String> filesRead = new ArrayList<>();

    private void check(GithubRepoRef repo) {
        if (expectedRepo != null) {
            assertThat(repo).isEqualTo(expectedRepo);
        }
    }

    @Override
    public WorkspaceKind kind() {
        return WorkspaceKind.GITHUB;
    }

    @Override
    public List<GithubIssue> issuesUpdatedSince(GithubRepoRef repo, Instant since) {
        check(repo);
        sinceSeen.add(since);
        return issues;
    }

    @Override
    public List<GithubPullRequest> pullRequestsUpdatedSince(GithubRepoRef repo, Instant since) {
        check(repo);
        return pullRequests;
    }

    @Override
    public List<GithubReview> reviews(GithubRepoRef repo, int pullRequestNumber) {
        return List.of();
    }

    @Override
    public Optional<Instant> lastCommitAt(GithubRepoRef repo, int pullRequestNumber) {
        return Optional.empty();
    }

    @Override
    public List<GithubCollaborator> collaborators(GithubRepoRef repo) {
        check(repo);
        if (failWith != null) {
            throw failWith;
        }
        return collaborators;
    }

    @Override
    public List<GithubIssueLink> linkedIssues(GithubRepoRef repo, int pullRequestNumber) {
        return links.getOrDefault(pullRequestNumber, List.of());
    }

    @Override
    public Optional<String> readFile(GithubRepoRef repo, String path) {
        check(repo);
        filesRead.add(path);
        if (fileFailWith != null) {
            throw fileFailWith;
        }
        return Optional.ofNullable(files.get(path));
    }
}

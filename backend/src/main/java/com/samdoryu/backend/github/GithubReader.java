package com.samdoryu.backend.github;

import com.samdoryu.backend.github.dto.GithubCollaborator;
import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubIssueLink;
import com.samdoryu.backend.github.dto.GithubPullRequest;
import com.samdoryu.backend.github.dto.GithubRepoRef;
import com.samdoryu.backend.github.dto.GithubReview;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * GitHub 어댑터 인터페이스(CONTRACTS.md 「7」). <b>읽기 메서드만 둔다</b> — 이슈 · PR · 라벨 · 담당자를 바꾸는 메서드를
 * 만들지 않는다(CON-02 · P3). 구현은 둘: GitHub 어댑터(실제 사무실) · Seed 어댑터(시연 사무실, 같은 결과 모양).
 * 서버는 사무실 종류로 고른다({@link GithubReaderSelector}).
 * <p>
 * 동기화가 쓰는 메서드만 있다(#69 · #71 · 명세 문서 #14). 권한 · 설치 목록(#64 · #68)은
 * 각 Issue에서 더한다. 실패는 {@code ApiException}({@code github_unauthorized} · {@code github_rate_limited} ·
 * {@code unavailable})로 던진다.
 */
public interface GithubReader {

    /** 이 구현이 맡는 사무실 종류. */
    WorkspaceKind kind();

    /**
     * 기준 시각 이후 바뀐 이슈 — PR은 빼고, 담당자 전원 · 닫힘 사유 포함.
     *
     * @param since null이면 전부
     */
    List<GithubIssue> issuesUpdatedSince(GithubRepoRef repo, Instant since);

    /**
     * 기준 시각 이후 바뀐 PR — {@code headSha} · Draft · 머지 포함.
     *
     * @param since null이면 전부
     */
    List<GithubPullRequest> pullRequestsUpdatedSince(GithubRepoRef repo, Instant since);

    /** PR에 제출된 리뷰 — 제출 시각 순. */
    List<GithubReview> reviews(GithubRepoRef repo, int pullRequestNumber);

    /** PR의 마지막 커밋 시각. 커밋이 없으면 빈 값. */
    Optional<Instant> lastCommitAt(GithubRepoRef repo, int pullRequestNumber);

    /** 레포 콜라보레이터 전원 — 변경분이 아니라 늘 전체 목록(#71). */
    List<GithubCollaborator> collaborators(GithubRepoRef repo);

    /** PR이 GitHub에서 공식으로 연결한 이슈(#71). 본문 · 제목의 {@code #N}은 읽지 않는다. */
    List<GithubIssueLink> linkedIssues(GithubRepoRef repo, int pullRequestNumber);

    /**
     * 레포 기본 브랜치의 파일 내용(명세 문서 — #14 · FR-REQ-01 · 02).
     *
     * @param path 레포 안 경로(예: {@code docs/requirements.md})
     * @return 파일이 없거나 파일이 아니면(디렉터리 등) 빈 값. 그 밖의 GitHub 오류는 {@code ApiException}
     */
    Optional<String> readFile(GithubRepoRef repo, String path);
}

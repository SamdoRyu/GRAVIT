package com.samdoryu.backend.sync.domain;

import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * PR에 올라간 커밋 — 사용자별 커밋(CONTRACTS.md 「7」, 스탠드업 미리 채우기 FR-MTG-01 · #261). GitHub 원본을 읽어 저장할 뿐
 * 앱이 만들지 않는다. {@code (사무실, SHA)} 유일 — 같은 커밋이 PR 여러 개에 있으면 처음 본 PR에 둔다. 행을 지우지 않는다.
 * 작성자가 지금 팀원이 아니면(또는 커밋 이메일이 GitHub 계정과 이어지지 않았으면) {@code authorMember}는 null.
 */
@Entity
@Table(name = "submission_commit")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SubmissionCommit {

    /** 커밋 제목(메시지 첫 줄) 저장 상한 — 열 크기와 같다. 넘으면 자른다. */
    public static final int TITLE_MAX = 512;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "submission_id", nullable = false)
    private Submission submission;

    @Column(nullable = false, length = 40)
    private String sha;

    @Column(nullable = false, length = TITLE_MAX)
    private String title;

    private Long authorGithubUserId;

    @Column(length = 39)
    private String authorGithubLogin;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_member_id")
    private Member authorMember;

    @Column(nullable = false)
    private Instant authoredAt;

    @Column(nullable = false)
    private Instant committedAt;

    @Column(nullable = false)
    private Instant syncedAt;

    public SubmissionCommit(Submission submission, String sha, String title, Long authorGithubUserId,
            String authorGithubLogin, Member authorMember, Instant authoredAt, Instant committedAt, Instant syncedAt) {
        this.submission = Objects.requireNonNull(submission);
        this.workspace = submission.getWorkspace();
        this.sha = Objects.requireNonNull(sha);
        this.title = cut(Objects.requireNonNullElse(title, ""));
        this.authorGithubUserId = authorGithubUserId;
        this.authorGithubLogin = authorGithubLogin;
        this.authorMember = authorMember;
        this.authoredAt = Objects.requireNonNull(authoredAt);
        this.committedAt = Objects.requireNonNull(committedAt);
        this.syncedAt = Objects.requireNonNull(syncedAt);
    }

    /**
     * 다시 동기화할 때 — 커밋 내용은 바뀌지 않으므로 작성자 팀원 짝만 지금 팀원으로 다시 맞춘다(그 사이 팀원이 된 사람).
     * 지금 짝이 없으면 이전 짝을 지우지 않는다 — 빠진 팀원의 지난 커밋도 그 사람이 한 일이다.
     */
    public void refresh(Member authorMember, Instant syncedAt) {
        if (authorMember != null) {
            this.authorMember = authorMember;
        }
        this.syncedAt = Objects.requireNonNull(syncedAt);
    }

    /** 코드 포인트 단위로 {@link #TITLE_MAX}자까지 — 서로게이트 쌍을 가르지 않는다. */
    static String cut(String title) {
        if (title.codePointCount(0, title.length()) <= TITLE_MAX) {
            return title;
        }
        return title.substring(0, title.offsetByCodePoints(0, TITLE_MAX));
    }
}

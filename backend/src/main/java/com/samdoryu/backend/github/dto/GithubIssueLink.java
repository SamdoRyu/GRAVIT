package com.samdoryu.backend.github.dto;

import java.util.Objects;

/**
 * PR이 GitHub에서 공식으로 연결한 이슈 — 어댑터 결과 DTO(CONTRACTS.md 「2」 SubmissionIssueLink · FR-GH-04).
 * <b>GitHub가 공식으로 인식하는 연결만</b> 담는다. PR 본문 · 제목의 {@code #N} 언급은 읽지 않고, 앱이 추측해 만들지 않는다.
 */
public record GithubIssueLink(int issueNumber, Source source) {

    /**
     * 연결 종류 — DB {@code submission_issue_link.source}에 이름 그대로 저장한다.
     * {@code CLOSING_REFERENCE}: GitHub의 "이 PR이 닫을 이슈"(GraphQL {@code closingIssuesReferences}) — 닫는 키워드와
     * 화면의 Development 연결을 함께 담는다.
     */
    public enum Source {
        CLOSING_REFERENCE
    }

    public GithubIssueLink {
        Objects.requireNonNull(source);
    }
}

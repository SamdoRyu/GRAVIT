package com.samdoryu.backend.sync.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * PR–이슈 연결(CONTRACTS.md 「2」 · FR-GH-04). Submission N–M Task.
 * GitHub가 공식으로 인식하는 연결만 저장한다 — PR 본문 · 제목의 {@code #N} 언급만으로 만들지 않는다.
 */
@Entity
@Table(name = "submission_issue_link")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SubmissionIssueLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "submission_id", nullable = false)
    private Submission submission;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "task_id", nullable = false)
    private Task task;

    /** GitHub 연결 종류 — 값 목록은 연결 동기화 Issue(#71)에서 정한다. */
    @Column(nullable = false, length = 32)
    private String source;

    public SubmissionIssueLink(Submission submission, Task task, String source) {
        this.submission = Objects.requireNonNull(submission);
        this.task = Objects.requireNonNull(task);
        this.source = Objects.requireNonNull(source);
    }
}

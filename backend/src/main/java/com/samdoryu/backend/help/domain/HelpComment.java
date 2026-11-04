package com.samdoryu.backend.help.domain;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.workspace.domain.Member;
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
 * 도움 요청 코멘트(CONTRACTS.md 「2」 · FR-LRN-16 · 21). HelpRequest 1–N. 지우지 않는다. 익명이 아니다.
 * 팀원이 아닌 작성자(강사)의 코멘트는 강사 답변이다 — 생성자와 DB CHECK가 함께 지킨다.
 * 작성 API({@code POST W/help-requests/{id}/comments})는 #48에서 더한다.
 */
@Entity
@Table(name = "help_comment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class HelpComment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "help_request_id", nullable = false)
    private HelpRequest helpRequest;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_user_id", nullable = false)
    private AppUser author;

    /** 강사는 null. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_member_id")
    private Member authorMember;

    @Column(name = "is_instructor_answer", nullable = false)
    private boolean instructorAnswer;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(nullable = false)
    private Instant createdAt;

    /** @param authorMember 그 사무실의 팀원. 강사 답변이면 null */
    public HelpComment(HelpRequest helpRequest, AppUser author, Member authorMember, String content,
            Instant createdAt) {
        this.helpRequest = Objects.requireNonNull(helpRequest);
        this.author = Objects.requireNonNull(author);
        this.authorMember = authorMember;
        this.instructorAnswer = authorMember == null;
        this.content = Objects.requireNonNull(content);
        this.createdAt = Objects.requireNonNull(createdAt);
    }
}

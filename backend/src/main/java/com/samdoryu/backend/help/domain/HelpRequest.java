package com.samdoryu.backend.help.domain;

import com.samdoryu.backend.meeting.domain.Standup;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
import org.hibernate.annotations.Formula;

/**
 * 도움 요청(CONTRACTS.md 「2」 · FR-LRN-15). 행을 지우지 않는다.
 * 전환된 안건 · 코멘트 수는 저장하지 않고 읽을 때 계산한다 — 안건 쪽 {@code source_help_request_id}가 원본이다.
 * 안건 전환은 그 기능 Issue(#51)에서 더한다.
 */
@Entity
@Table(name = "help_request")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class HelpRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_member_id", nullable = false)
    private Member requester;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private HelpRequestStatus status;

    /** 스탠드업 "막힌 것"에서 넘어온 경우(FR-MTG-02). 요청자 본인의 스탠드업이다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "from_standup_id")
    private Standup fromStandup;

    /** "강사에게 요청" 시각(FR-LRN-21). null이면 요청 안 됨. */
    private Instant instructorRequestedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "helpful_comment_id")
    private HelpComment helpfulComment;

    /** 닫을 때 배운 점(1~200자). */
    @Column(length = 200)
    private String learning;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant closedAt;

    @Formula("(select a.id from agenda_item a where a.source_help_request_id = id)")
    private Long agendaItemId;

    @Formula("(select count(*) from help_comment c where c.help_request_id = id)")
    private int commentCount;

    public HelpRequest(Workspace workspace, Member requester, String content, Standup fromStandup,
            Instant createdAt) {
        this.workspace = Objects.requireNonNull(workspace);
        this.requester = Objects.requireNonNull(requester);
        this.content = Objects.requireNonNull(content);
        this.status = HelpRequestStatus.OPEN;
        this.fromStandup = fromStandup;
        this.createdAt = Objects.requireNonNull(createdAt);
    }

    public boolean isInstructorRequested() {
        return instructorRequestedAt != null;
    }

    public boolean isAgendaCandidate(Instant now) {
        return status.isAgendaCandidate(createdAt, now);
    }

    /** 코멘트가 붙은 뒤의 상태(FR-LRN-16). 코멘트를 받을 수 있는지는 부르는 쪽이 먼저 확인한다. */
    public void onComment(boolean byRequester, boolean instructorAnswer) {
        this.status = status.afterComment(byRequester, instructorAnswer);
    }

    /** "강사에게 요청" 켜기(FR-LRN-21). 이미 켜져 있으면 처음 시각을 그대로 둔다. 상태는 바꾸지 않는다. */
    public void requestInstructor(Instant requestedAt) {
        if (instructorRequestedAt == null) {
            this.instructorRequestedAt = Objects.requireNonNull(requestedAt);
        }
    }

    /** 요청자가 닫음(FR-LRN-17) → {@code resolved}. 닫을 수 있는 상태 · 코멘트 조건은 부르는 쪽이 먼저 확인한다. */
    public void close(HelpComment helpfulComment, String learning, Instant closedAt) {
        this.status = HelpRequestStatus.RESOLVED;
        this.helpfulComment = helpfulComment;
        this.learning = Objects.requireNonNull(learning);
        this.closedAt = Objects.requireNonNull(closedAt);
    }

    /** 전환된 안건의 결정이 기록됨(CONTRACTS_API 「10」 decision) — {@code on_agenda} → {@code ended}. */
    public void endByAgendaDecision(Instant decidedAt) {
        if (status != HelpRequestStatus.ON_AGENDA) {
            throw new IllegalStateException("안건으로 옮긴 도움 요청만 회의 결정으로 끝난다");
        }
        this.status = HelpRequestStatus.ENDED;
        this.closedAt = Objects.requireNonNull(decidedAt);
    }
}

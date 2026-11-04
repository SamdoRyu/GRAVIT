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
 * 닫기 · 안건 전환 · 강사 요청은 각 기능 Issue에서 더한다.
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
}

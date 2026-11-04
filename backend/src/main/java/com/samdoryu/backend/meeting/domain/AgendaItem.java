package com.samdoryu.backend.meeting.domain;

import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.Task;
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
import java.time.LocalDate;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 회의 안건과 그 결정 기록(CONTRACTS.md 「2」). 행을 지우지 않는다 — 거두면 {@link AgendaStatus#WITHDRAWN}.
 * 종류와 원본은 짝이 맞아야 한다(이슈 → Task, PR → Submission, 도움 요청 → 도움 요청 ID, 배운 점 · 기타 → 없음) —
 * 생성 메서드와 DB CHECK 제약이 함께 막는다. 같은 사무실 것인지는 Service가 확인한다(다르면 {@code not_found}).
 * <p>
 * 아직 Entity가 없는 대상은 ID로 둔다: 평가 회차(#19), 도움 요청(#47 — 외래키도 그쪽 마이그레이션이 건다).
 */
@Entity
@Table(name = "agenda_item")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AgendaItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AgendaKind kind;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AgendaStatus status;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(columnDefinition = "text")
    private String background;

    @Column(columnDefinition = "text")
    private String tried;

    @Column(columnDefinition = "text")
    private String unresolvedReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_task_id")
    private Task sourceTask;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_submission_id")
    private Submission sourceSubmission;

    private Long sourceHelpRequestId;

    /** PR 안건 — 올린 시점의 현재 평가 회차. */
    private Long evaluationRoundId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "raised_by_member_id", nullable = false)
    private Member raisedBy;

    @Column(nullable = false)
    private Instant raisedAt;

    // --- 결정 기록 (status = DISCUSSED일 때만 있다) ---

    @Column(columnDefinition = "text")
    private String conclusion;

    @Column(columnDefinition = "text")
    private String learning;

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private PrDecision prDecision;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "follow_up_assignee_member_id")
    private Member followUpAssignee;

    private LocalDate followUpDueDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id")
    private Meeting meeting;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "decided_by_member_id")
    private Member decidedBy;

    private Instant decidedAt;

    /** 강사 피드백 요청 시각(FR-LRN-22). null이면 요청 안 됨. */
    private Instant feedbackRequestedAt;

    private AgendaItem(Workspace workspace, AgendaKind kind, String title, String background, String tried,
            String unresolvedReason, Member raisedBy, Instant raisedAt) {
        this.workspace = Objects.requireNonNull(workspace);
        this.kind = kind;
        this.status = AgendaStatus.CONFIRMED;
        this.title = Objects.requireNonNull(title);
        this.background = background;
        this.tried = tried;
        this.unresolvedReason = unresolvedReason;
        this.raisedBy = Objects.requireNonNull(raisedBy);
        this.raisedAt = Objects.requireNonNull(raisedAt);
    }

    public static AgendaItem forTask(Workspace workspace, Task task, String title, String background, String tried,
            String unresolvedReason, Member raisedBy, Instant raisedAt) {
        AgendaItem item = new AgendaItem(workspace, AgendaKind.ISSUE, title, background, tried, unresolvedReason,
                raisedBy, raisedAt);
        item.sourceTask = Objects.requireNonNull(task);
        return item;
    }

    /** @param evaluationRoundId 그때의 현재 평가 회차 */
    public static AgendaItem forSubmission(Workspace workspace, Submission submission, Long evaluationRoundId,
            String title, String background, String tried, String unresolvedReason, Member raisedBy,
            Instant raisedAt) {
        AgendaItem item = new AgendaItem(workspace, AgendaKind.PR, title, background, tried, unresolvedReason,
                raisedBy, raisedAt);
        item.sourceSubmission = Objects.requireNonNull(submission);
        item.evaluationRoundId = evaluationRoundId;
        return item;
    }

    /** 도움 요청 → 안건 전환(CONTRACTS_API.md 「11」 to-agenda). 요청 내용은 도움 요청에 남는다. */
    public static AgendaItem forHelpRequest(Workspace workspace, long helpRequestId, String title, Member raisedBy,
            Instant raisedAt) {
        AgendaItem item = new AgendaItem(workspace, AgendaKind.HELP_REQUEST, title, null, null, null, raisedBy,
                raisedAt);
        item.sourceHelpRequestId = helpRequestId;
        return item;
    }

    /** 배운 점 공유 · 기타 — 원본 없음. */
    public static AgendaItem withoutSource(Workspace workspace, AgendaKind kind, String title, String background,
            String tried, String unresolvedReason, Member raisedBy, Instant raisedAt) {
        if (kind != AgendaKind.LEARNING && kind != AgendaKind.OTHER) {
            throw new IllegalArgumentException("원본 없는 안건은 learning · other뿐");
        }
        return new AgendaItem(workspace, kind, title, background, tried, unresolvedReason, raisedBy, raisedAt);
    }
}

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
 * 도움 요청(CONTRACTS.md 「2」 · FR-LRN-15). 요청자가 "모두에게서 영구 삭제"하면 코멘트 · 숨김 행과 함께 행을 실제로 지운다
 * (#315 — 논리 삭제 칸 없음). 그 밖에는 지우지 않는다. "나에게서만 삭제"는 {@link HelpRequestHidden}이다.
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

    /**
     * 안건으로 전환하기 직전 상태({@code open} · {@code discussing}) — {@code on_agenda}인 동안만 값이 있다(#313). 안건을 거두면
     * 이 상태로 그대로 돌아간다. 응답에는 내보내지 않는다.
     */
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private HelpRequestStatus statusBeforeAgenda;

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

    /** 거두지 않은 전환 안건(도움 요청당 하나 — V6). 거둔 안건은 가리키지 않는다. */
    @Formula("(select a.id from agenda_item a where a.source_help_request_id = id and a.status <> 'WITHDRAWN')")
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

    /** 안건으로 전환(FR-LRN-19) → {@code on_agenda}. 직전 상태를 기록해 둔다. 요청자 · 상태 검사는 부르는 쪽이 먼저 한다. */
    public void moveToAgenda() {
        if (!status.isOpenForDiscussion()) {
            throw new IllegalStateException("open · discussing 도움 요청만 안건으로 옮긴다");
        }
        this.statusBeforeAgenda = status;
        this.status = HelpRequestStatus.ON_AGENDA;
    }

    /**
     * 전환된 안건을 거둠(#313) — {@code on_agenda} → 전환 직전 상태 그대로. {@code on_agenda} 동안 달린 코멘트로 다시 계산하지
     * 않는다. 본문 · 코멘트 · "강사에게 요청"은 그대로 둔다.
     */
    public void returnFromAgenda() {
        if (status != HelpRequestStatus.ON_AGENDA || statusBeforeAgenda == null) {
            throw new IllegalStateException("전환 직전 상태가 기록된 on_agenda 도움 요청만 되돌린다");
        }
        this.status = statusBeforeAgenda;
        this.statusBeforeAgenda = null;
    }

    /** 전환된 안건의 결정이 기록됨(CONTRACTS_API 「10」 decision) — {@code on_agenda} → {@code ended}. */
    public void endByAgendaDecision(Instant decidedAt) {
        if (status != HelpRequestStatus.ON_AGENDA) {
            throw new IllegalStateException("안건으로 옮긴 도움 요청만 회의 결정으로 끝난다");
        }
        this.status = HelpRequestStatus.ENDED;
        this.statusBeforeAgenda = null;
        this.closedAt = Objects.requireNonNull(decidedAt);
    }

    /**
     * 영구 삭제(#315) 직전 — 도움이 된 코멘트 연결을 비운다. 코멘트도 함께 지우는데 이 행과 코멘트가 서로를 가리키므로
     * 코멘트보다 먼저 비워야 한다. 삭제 말고는 부르지 않는다.
     */
    public void clearHelpfulCommentForDeletion() {
        this.helpfulComment = null;
    }
}

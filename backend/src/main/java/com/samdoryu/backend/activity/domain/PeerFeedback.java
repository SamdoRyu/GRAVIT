package com.samdoryu.backend.activity.domain;

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
import java.util.regex.Pattern;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 동료 피드백(CONTRACTS.md 「2」 · FR-ACT-04). (사무실, 작성자, 받는 사람, 주) 유일.
 * <b>작성자는 저장하지만 어느 응답에도 담지 않는다</b>(「5」 익명성) — 받는 사람만 내용을 본다.
 */
@Entity
@Table(name = "peer_feedback")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PeerFeedback {

    /** 한국 시간 ISO 주 — 예: {@code 2026-W45}. */
    private static final Pattern WEEK = Pattern.compile("\\d{4}-W\\d{2}");
    public static final int MAX_TEXT_LENGTH = 200;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_member_id", nullable = false)
    private Member author;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_member_id", nullable = false)
    private Member recipient;

    @Column(nullable = false, length = 8, columnDefinition = "char(8)")
    private String week;

    @Column(nullable = false, length = MAX_TEXT_LENGTH)
    private String thanks;

    @Column(nullable = false, length = MAX_TEXT_LENGTH)
    private String improve;

    @Column(nullable = false)
    private Instant createdAt;

    public PeerFeedback(Workspace workspace, Member author, Member recipient, String week, String thanks,
            String improve, Instant createdAt) {
        if (Objects.equals(author.getId(), recipient.getId())) {
            throw new IllegalArgumentException("자기 자신에게 쓸 수 없다");
        }
        if (week == null || !WEEK.matcher(week).matches()) {
            throw new IllegalArgumentException("주는 YYYY-Www 꼴");
        }
        this.workspace = Objects.requireNonNull(workspace);
        this.author = author;
        this.recipient = recipient;
        this.week = week;
        this.thanks = Objects.requireNonNull(thanks);
        this.improve = Objects.requireNonNull(improve);
        this.createdAt = Objects.requireNonNull(createdAt);
    }

    /** 작성자 값이 로그 · 응답으로 새지 않도록 직접 쓴다. */
    @Override
    public String toString() {
        return "PeerFeedback(id=" + id + ", week=" + week + ")";
    }
}

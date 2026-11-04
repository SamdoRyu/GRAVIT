package com.samdoryu.backend.meeting.domain;

import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Collection;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 회의(CONTRACTS.md 「2」). 상태는 저장하지 않고 {@code endedAt}으로 정한다.
 * 다룬 안건은 {@link AgendaItem}이 회의를 가리킨다. 사무실마다 진행 중 회의는 하나 — Service가 {@code conflict}로 막고
 * DB 생성 열 유일 제약이 한 번 더 막는다.
 */
@Entity
@Table(name = "meeting")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Meeting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false)
    private Instant startedAt;

    private Instant endedAt;

    @Column(columnDefinition = "text")
    private String notes;

    /** 참석자(FR-MTG-05 — 비어도 된다). */
    @ManyToMany
    @JoinTable(name = "meeting_attendee",
            joinColumns = @JoinColumn(name = "meeting_id"),
            inverseJoinColumns = @JoinColumn(name = "member_id"))
    private Set<Member> attendees = new HashSet<>();

    public Meeting(Workspace workspace, Collection<Member> attendees, Instant startedAt) {
        this.workspace = Objects.requireNonNull(workspace);
        this.attendees = new HashSet<>(attendees);
        this.startedAt = Objects.requireNonNull(startedAt);
    }

    public boolean isOngoing() {
        return endedAt == null;
    }

    public void end(String notes, Instant endedAt) {
        if (!isOngoing()) {
            throw new IllegalStateException("이미 끝난 회의");
        }
        this.notes = notes;
        this.endedAt = Objects.requireNonNull(endedAt);
    }
}

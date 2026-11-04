package com.samdoryu.backend.meeting.domain;

import com.samdoryu.backend.auth.domain.AppUser;
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
 * 결정 기록에 붙는 강사 피드백(CONTRACTS.md 「2」 · FR-LRN-22). AgendaItem 1–N. 지우지 않는다.
 * 안건 · 결정 상태를 바꾸지 않는다. 피드백 요청이 켜진 결정에만 쓸 수 있다 — Service가 검사한다.
 */
@Entity
@Table(name = "instructor_feedback")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InstructorFeedback {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "agenda_item_id", nullable = false)
    private AgendaItem agendaItem;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "instructor_user_id", nullable = false)
    private AppUser instructor;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(nullable = false)
    private Instant createdAt;

    public InstructorFeedback(AgendaItem agendaItem, AppUser instructor, String body, Instant createdAt) {
        this.agendaItem = Objects.requireNonNull(agendaItem);
        this.instructor = Objects.requireNonNull(instructor);
        this.body = Objects.requireNonNull(body);
        this.createdAt = Objects.requireNonNull(createdAt);
    }
}

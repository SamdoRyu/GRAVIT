package com.samdoryu.backend.report.domain;

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

/** 강사의 꼬리질문(CONTRACTS.md 「2」 · P11). DecisionCard 1–N, 9칸과 따로 붙는다. 지우지 않는다. */
@Entity
@Table(name = "follow_up_question")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FollowUpQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "decision_card_id", nullable = false)
    private DecisionCard decisionCard;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "instructor_user_id", nullable = false)
    private AppUser instructor;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(nullable = false)
    private Instant createdAt;

    public FollowUpQuestion(DecisionCard decisionCard, AppUser instructor, String body, Instant createdAt) {
        this.decisionCard = Objects.requireNonNull(decisionCard);
        this.instructor = Objects.requireNonNull(instructor);
        this.body = Objects.requireNonNull(body);
        this.createdAt = Objects.requireNonNull(createdAt);
    }
}

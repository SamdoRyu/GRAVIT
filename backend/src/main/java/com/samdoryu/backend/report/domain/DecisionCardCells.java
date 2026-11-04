package com.samdoryu.backend.report.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * 기술 결정 카드의 9칸(CONTRACTS_API.md 「15」 DecisionCardCells). 각 0~2000자, 재료가 없으면 null.
 * 처음에는 재료에서 규칙대로 채우고(AI 없음), 그 뒤 본인이 고친다.
 */
@Embeddable
public record DecisionCardCells(
        @Column(columnDefinition = "text") String goal,
        @Column(columnDefinition = "text") String initialApproach,
        @Column(columnDefinition = "text") String feedbackReceived,
        @Column(columnDefinition = "text") String meetingDecision,
        @Column(columnDefinition = "text") String finalChange,
        @Column(columnDefinition = "text") String rationale,
        @Column(columnDefinition = "text") String blockedMoment,
        @Column(columnDefinition = "text") String learning,
        @Column(columnDefinition = "text") String source) {

    public static final DecisionCardCells EMPTY =
            new DecisionCardCells(null, null, null, null, null, null, null, null, null);

    public boolean hasLearning() {
        return learning != null && !learning.isBlank();
    }
}

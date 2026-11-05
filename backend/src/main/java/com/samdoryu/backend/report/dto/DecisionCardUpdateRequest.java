package com.samdoryu.backend.report.dto;

import com.samdoryu.backend.report.domain.DecisionCardCells;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * {@code PUT W/members/{memberId}/decision-cards/{cardId}} 요청 — CONTRACTS_API 「15」 {@code { cells: DecisionCardCells; confirmed }}.
 * 9칸을 통째로 바꾼다. {@code confirmed: true}인데 {@code learning} 칸이 비었으면 Service가 {@code invalid}로 거부한다.
 */
public record DecisionCardUpdateRequest(@NotNull @Valid Cells cells, @NotNull Boolean confirmed) {

    /** 9칸 — 각 0~2000자 또는 null(CONTRACTS_API 「15」 DecisionCardCells). */
    public record Cells(
            @Size(max = 2000) String goal,
            @Size(max = 2000) String initialApproach,
            @Size(max = 2000) String feedbackReceived,
            @Size(max = 2000) String meetingDecision,
            @Size(max = 2000) String finalChange,
            @Size(max = 2000) String rationale,
            @Size(max = 2000) String blockedMoment,
            @Size(max = 2000) String learning,
            @Size(max = 2000) String source) {

        public DecisionCardCells toCells() {
            return new DecisionCardCells(goal, initialApproach, feedbackReceived, meetingDecision, finalChange, rationale,
                    blockedMoment, learning, source);
        }
    }
}

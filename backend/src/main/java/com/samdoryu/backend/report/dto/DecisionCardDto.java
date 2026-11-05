package com.samdoryu.backend.report.dto;

import com.samdoryu.backend.auth.dto.UserRef;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import java.time.Instant;
import java.util.List;

/**
 * 기술 결정 카드 — CONTRACTS_API 「15」 DecisionCardDto. 지금은 회고 리포트의 {@code decisionCards} 타입으로만 쓴다 —
 * 카드 만들기 · 고치기와 Entity → DTO 변환은 #62(B)에서 더한다.
 */
public record DecisionCardDto(
        String id,
        String memberId,
        String submissionId,
        DecisionCardCells cells,
        boolean confirmed,
        Instant confirmedAt,
        boolean followUpRequested,
        Instant followUpRequestedAt,
        List<FollowUpQuestionDto> followUpQuestions,
        Instant createdAt,
        Instant updatedAt) {

    public record FollowUpQuestionDto(String id, UserRef instructor, String body, Instant createdAt) {
    }
}

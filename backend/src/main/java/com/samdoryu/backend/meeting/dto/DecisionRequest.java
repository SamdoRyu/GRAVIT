package com.samdoryu.backend.meeting.dto;

import com.samdoryu.backend.meeting.domain.PrDecision;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * `POST W/agenda-items/{id}/decision` 요청 — CONTRACTS_API 「10」 DecisionRequest.
 * {@code prDecision}이 안건 종류와 맞는지 · 후속 담당자가 지금 팀원인지는 Service가 본다.
 *
 * @param prDecision PR 안건이면 필수, 아니면 null
 * @param followUpAssigneeMemberId 더 알아볼 사람(FR-LRN-12)
 * @param meetingId 다룬 회의
 */
public record DecisionRequest(
        @NotBlank @Size(max = 2000) String conclusion,
        @Size(max = 2000) String learning,
        PrDecision prDecision,
        String followUpAssigneeMemberId,
        LocalDate followUpDueDate,
        String meetingId) {
}

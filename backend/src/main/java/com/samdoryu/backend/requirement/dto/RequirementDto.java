package com.samdoryu.backend.requirement.dto;

import com.samdoryu.backend.requirement.domain.RequirementStatus;
import java.time.Instant;

/**
 * 요구사항 구역 — CONTRACTS_API 「5」 RequirementDto. 채우는 매핑은 #14에서 더한다.
 *
 * @param sourceKey {@code ##} 제목의 요구사항 ID(예: FR-AUTH-01). 묶음 키는 화면이 계산
 * @param doneTaskCount 연결된 이슈 중 닫힌 이슈 수(FR-REQ-05)
 */
public record RequirementDto(
        String id,
        String sourceKey,
        String title,
        int position,
        RequirementStatus status,
        int linkedTaskCount,
        int doneTaskCount,
        Instant lastSeenAt) {
}

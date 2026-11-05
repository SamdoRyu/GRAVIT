package com.samdoryu.backend.requirement.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.requirement.domain.Requirement;
import com.samdoryu.backend.requirement.domain.RequirementStatus;
import java.time.Instant;

/**
 * 요구사항 구역 — CONTRACTS_API 「5」 RequirementDto. Snapshot {@code requirements}.
 *
 * @param sourceKey {@code ##} 제목의 요구사항 ID(예: FR-AUTH-01). 묶음 키는 화면이 계산
 * @param title 원본 ID를 뺀 정규화 제목
 * @param doneTaskCount 연결된 이슈 중 닫힌 이슈 수(FR-REQ-05 — 닫힘 사유 무관)
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

    public static RequirementDto of(Requirement requirement, int linkedTaskCount, int doneTaskCount) {
        return new RequirementDto(
                Ids.toApi(requirement.getId()),
                requirement.getSourceKey(),
                requirement.getTitle(),
                requirement.getPosition(),
                requirement.getStatus(),
                linkedTaskCount,
                doneTaskCount,
                requirement.getLastSeenAt());
    }
}

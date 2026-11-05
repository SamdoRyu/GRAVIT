package com.samdoryu.backend.requirement.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.requirement.domain.RequirementLink;
import java.time.Instant;

/** 요구사항–이슈 연결 — CONTRACTS_API 「5」 RequirementLinkDto. 연결한 사람은 담지 않는다(계약에 없음). */
public record RequirementLinkDto(String id, String requirementId, String taskId, Instant linkedAt) {

    public static RequirementLinkDto of(RequirementLink link) {
        return new RequirementLinkDto(
                Ids.toApi(link.getId()),
                Ids.toApi(link.getRequirement().getId()),
                Ids.toApi(link.getTask().getId()),
                link.getLinkedAt());
    }
}

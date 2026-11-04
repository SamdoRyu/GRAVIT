package com.samdoryu.backend.requirement.dto;

import java.time.Instant;

/** 요구사항–이슈 연결 — CONTRACTS_API 「5」 RequirementLinkDto. 채우는 매핑은 #18에서 더한다. */
public record RequirementLinkDto(String id, String requirementId, String taskId, Instant linkedAt) {
}

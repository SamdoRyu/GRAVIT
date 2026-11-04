package com.samdoryu.backend.activity.dto;

import com.samdoryu.backend.activity.domain.ActivityKind;
import java.time.Instant;

/** 확인된 활동 기록의 3D 메모지 — CONTRACTS_API 「5」 ActivityNote. 시간 · 내용 없음. 채우는 매핑은 FR-ACT Issue에서 더한다. */
public record ActivityNote(String id, String authorMemberId, ActivityKind kind, Instant confirmedAt) {
}

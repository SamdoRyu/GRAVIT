package com.samdoryu.backend.meeting.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;

/**
 * `POST W/meetings` 요청 — CONTRACTS_API 「10」.
 *
 * @param attendeeMemberIds 참석자 — 비어도 된다(FR-MTG-05). 지금 팀원이 아니면 Service가 {@code invalid}
 */
public record MeetingStartRequest(@NotNull List<@NotNull String> attendeeMemberIds) {
}

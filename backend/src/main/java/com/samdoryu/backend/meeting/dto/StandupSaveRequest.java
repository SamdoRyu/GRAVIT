package com.samdoryu.backend.meeting.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * `PUT W/standups/{date}/mine` 요청 — CONTRACTS_API 「12」. 각 0~2000자.
 *
 * @param yesterday 어제 한 일 — 빈 문자열 허용
 * @param blockers 막힌 것
 */
public record StandupSaveRequest(
        @NotNull @Size(max = 2000) String yesterday,
        @Size(max = 2000) String blockers) {
}

package com.samdoryu.backend.meeting.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.meeting.domain.Standup;
import java.time.Instant;
import java.time.LocalDate;

/** 스탠드업 — CONTRACTS_API 「12」 StandupDto. {@code date}는 한국 시간 기준 날짜다. */
public record StandupDto(
        String id,
        String memberId,
        LocalDate date,
        String yesterday,
        String blockers,
        Instant updatedAt) {

    public static StandupDto of(Standup standup) {
        return new StandupDto(
                Ids.toApi(standup.getId()),
                Ids.toApi(standup.getMember().getId()),
                standup.getDate(),
                standup.getYesterday(),
                standup.getBlockers(),
                standup.getUpdatedAt());
    }
}

package com.samdoryu.backend.meeting.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.meeting.domain.Meeting;
import com.samdoryu.backend.workspace.domain.Member;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/**
 * 회의 — CONTRACTS_API 「10」 MeetingDto. Snapshot {@code meetings} · 회의 시작 · 종료 응답.
 *
 * @param status {@code ongoing} · {@code ended} — {@code endedAt}으로 정한다
 * @param attendeeMemberIds id 오름차순(FR-MTG-05 — 비어도 된다)
 * @param discussedAgendaItemIds 이 회의에서 결정을 기록한 안건
 */
public record MeetingDto(
        String id,
        String status,
        Instant startedAt,
        Instant endedAt,
        List<String> attendeeMemberIds,
        String notes,
        List<String> discussedAgendaItemIds) {

    public static final String ONGOING = "ongoing";
    public static final String ENDED = "ended";

    public static MeetingDto of(Meeting meeting, List<Long> discussedAgendaItemIds) {
        return new MeetingDto(
                Ids.toApi(meeting.getId()),
                meeting.isOngoing() ? ONGOING : ENDED,
                meeting.getStartedAt(),
                meeting.getEndedAt(),
                meeting.getAttendees().stream().map(Member::getId).sorted(Comparator.naturalOrder()).map(Ids::toApi)
                        .toList(),
                meeting.getNotes(),
                discussedAgendaItemIds.stream().map(Ids::toApi).toList());
    }
}

package com.samdoryu.backend.meeting.service;

import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.Meeting;
import com.samdoryu.backend.meeting.dto.MeetingDto;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.MeetingRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 회의(FR-MTG-03 · 05). 회의 시작 · 종료는 #36 다음 PR에서 더한다. */
@Service
public class MeetingService {

    /** Snapshot에 싣는 최근 끝난 회의 수(CONTRACTS_API 「5」). */
    static final int RECENT_ENDED_MEETINGS = 20;

    private final MeetingRepository meetingRepository;
    private final AgendaItemRepository agendaItemRepository;

    public MeetingService(MeetingRepository meetingRepository, AgendaItemRepository agendaItemRepository) {
        this.meetingRepository = meetingRepository;
        this.agendaItemRepository = agendaItemRepository;
    }

    /** Snapshot {@code meetings} 조각 — 진행 중 + 최근 끝난 것 {@value #RECENT_ENDED_MEETINGS}개, startedAt 오름차순. */
    @Transactional(readOnly = true)
    public List<MeetingDto> listRecent(Long workspaceId) {
        List<Meeting> meetings = new ArrayList<>(meetingRepository.findByWorkspaceIdAndEndedAtIsNull(workspaceId));
        meetings.addAll(meetingRepository.findTop20ByWorkspaceIdAndEndedAtIsNotNullOrderByEndedAtDescIdDesc(workspaceId));
        meetings.sort(Comparator.comparing(Meeting::getStartedAt).thenComparing(Meeting::getId));
        if (meetings.isEmpty()) {
            return List.of();
        }
        Map<Long, List<Long>> discussed = agendaItemRepository
                .findByMeetingIdInOrderByIdAsc(meetings.stream().map(Meeting::getId).toList()).stream()
                .collect(Collectors.groupingBy(item -> item.getMeeting().getId(),
                        Collectors.mapping(AgendaItem::getId, Collectors.toList())));
        return meetings.stream()
                .map(meeting -> MeetingDto.of(meeting, discussed.getOrDefault(meeting.getId(), List.of())))
                .toList();
    }
}

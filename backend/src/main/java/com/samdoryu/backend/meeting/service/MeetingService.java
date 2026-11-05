package com.samdoryu.backend.meeting.service;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.meeting.domain.AgendaItem;
import com.samdoryu.backend.meeting.domain.Meeting;
import com.samdoryu.backend.meeting.dto.MeetingDto;
import com.samdoryu.backend.meeting.dto.MeetingEndRequest;
import com.samdoryu.backend.meeting.dto.MeetingStartRequest;
import com.samdoryu.backend.meeting.repository.AgendaItemRepository;
import com.samdoryu.backend.meeting.repository.MeetingRepository;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 회의(FR-MTG-03 · 05). 사무실마다 진행 중 회의는 하나 — 여기서 {@code conflict}로 막고 DB 유일 제약이 한 번 더 막는다.
 * 인가 검사(팀원 · 강사 403)는 Controller가 끝낸 뒤 부른다.
 */
@Service
public class MeetingService {

    /** Snapshot에 싣는 최근 끝난 회의 수(CONTRACTS_API 「5」). */
    static final int RECENT_ENDED_MEETINGS = 20;

    private final MeetingRepository meetingRepository;
    private final AgendaItemRepository agendaItemRepository;
    private final WorkspaceService workspaceService;
    private final WorkspaceEventHub eventHub;

    public MeetingService(MeetingRepository meetingRepository, AgendaItemRepository agendaItemRepository,
            WorkspaceService workspaceService, WorkspaceEventHub eventHub) {
        this.meetingRepository = meetingRepository;
        this.agendaItemRepository = agendaItemRepository;
        this.workspaceService = workspaceService;
        this.eventHub = eventHub;
    }

    /**
     * 회의 시작 → {@code ongoing}. 검사 순서는 참석자 ID 형식(400) → 진행 중 회의(409) → 참석자가 지금 팀원인가(400).
     * 같은 참석자를 두 번 보내면 한 번으로 본다.
     */
    @Transactional
    public MeetingDto start(Long workspaceId, MeetingStartRequest request) {
        Set<Long> attendeeIds = request.attendeeMemberIds().stream().map(Ids::fromBody)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (meetingRepository.existsByWorkspaceIdAndEndedAtIsNull(workspaceId)) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        Map<Long, Member> currentMembers = workspaceService.currentMembers(workspaceId).stream()
                .collect(Collectors.toMap(Member::getId, Function.identity()));
        if (!currentMembers.keySet().containsAll(attendeeIds)) {
            throw new ApiException(ErrorCode.INVALID, "참석자는 이 사무실의 지금 팀원이어야 해요");
        }
        Meeting meeting;
        try {
            meeting = meetingRepository.saveAndFlush(new Meeting(workspaceService.requireWorkspace(workspaceId),
                    attendeeIds.stream().map(currentMembers::get).toList(), Instant.now()));
        } catch (DataIntegrityViolationException e) {
            // 동시에 시작한 경우 — 진행 중 회의 유일 제약(사무실마다 하나)이 막는다
            throw new ApiException(ErrorCode.CONFLICT);
        }
        eventHub.publishChangeAfterCommit(workspaceId, SnapshotResource.MEETINGS);
        return MeetingDto.of(meeting, List.of());
    }

    /** 회의 종료 → {@code ended}. 검사 순서는 대상(404 — 같은 사무실 것만) → 이미 끝남(409). */
    @Transactional
    public MeetingDto end(Long workspaceId, Long meetingId, MeetingEndRequest request) {
        Meeting meeting = meetingRepository.findByIdAndWorkspaceId(meetingId, workspaceId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        if (!meeting.isOngoing()) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        meeting.end(request.notes(), Instant.now());
        eventHub.publishChangeAfterCommit(workspaceId, SnapshotResource.MEETINGS);
        return MeetingDto.of(meeting, agendaItemRepository.findByMeetingIdInOrderByIdAsc(List.of(meetingId)).stream()
                .map(AgendaItem::getId).toList());
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

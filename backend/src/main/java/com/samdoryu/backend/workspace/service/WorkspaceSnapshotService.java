package com.samdoryu.backend.workspace.service;

import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.flow.dto.FlowSummary;
import com.samdoryu.backend.help.service.HelpRequestService;
import com.samdoryu.backend.meeting.service.AgendaItemService;
import com.samdoryu.backend.meeting.service.MeetingService;
import com.samdoryu.backend.sync.service.SyncService;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.dto.MemberDto;
import com.samdoryu.backend.workspace.dto.TeamSettingsDto;
import com.samdoryu.backend.workspace.dto.Viewer;
import com.samdoryu.backend.workspace.dto.WorkspaceSnapshot;
import com.samdoryu.backend.workspace.dto.WorkspaceSummary;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code GET W/snapshot} 조립(CONTRACTS_API 「5」). 다른 패키지 조각은 그 패키지 Service로만 읽는다.
 * 1단계(#103): 아직 기능이 없는 조각 — {@code tasks} · {@code submissions}(#103 2단계), {@code requirements} ·
 * {@code requirementLinks}(#14 · #18), {@code activityNotes}(FR-ACT) — 은 빈 목록, {@code flow}는 기본값이다.
 */
@Service
public class WorkspaceSnapshotService {

    /** 지금 팀원 → 빠진 팀원, 그 안에서 deskIndex(자리 없음은 뒤) → id. */
    static final Comparator<Member> MEMBER_ORDER = Comparator.comparing(Member::isRemoved)
            .thenComparing(Member::getDeskIndex, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Member::getId);

    private final WorkspaceService workspaceService;
    private final MemberRepository memberRepository;
    private final TeamSettingsRepository teamSettingsRepository;
    private final SyncService syncService;
    private final AgendaItemService agendaItemService;
    private final MeetingService meetingService;
    private final HelpRequestService helpRequestService;

    public WorkspaceSnapshotService(WorkspaceService workspaceService, MemberRepository memberRepository,
            TeamSettingsRepository teamSettingsRepository, SyncService syncService,
            AgendaItemService agendaItemService, MeetingService meetingService,
            HelpRequestService helpRequestService) {
        this.workspaceService = workspaceService;
        this.memberRepository = memberRepository;
        this.teamSettingsRepository = teamSettingsRepository;
        this.syncService = syncService;
        this.agendaItemService = agendaItemService;
        this.meetingService = meetingService;
        this.helpRequestService = helpRequestService;
    }

    /**
     * 한 트랜잭션에서 읽어 조각끼리 같은 시점을 본다. 읽기 전용이 아닌 이유: 동기화 상태 행이 없으면
     * {@link SyncService#status}가 만든다.
     */
    @Transactional
    public WorkspaceSnapshot load(WorkspaceAccess access) {
        Long workspaceId = access.workspaceId();
        Instant now = Instant.now();
        List<Member> members = memberRepository.findByWorkspaceId(workspaceId).stream().sorted(MEMBER_ORDER).toList();
        TeamSettingsDto settings = teamSettingsRepository.findByWorkspaceId(workspaceId).map(TeamSettingsDto::of)
                .orElseThrow(() -> new IllegalStateException("팀 설정이 없는 사무실: " + workspaceId));
        return new WorkspaceSnapshot(
                WorkspaceSummary.of(workspaceService.requireWorkspace(workspaceId)),
                viewerOf(access, members),
                settings,
                syncService.status(workspaceId),
                members.stream().map(MemberDto::of).toList(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                agendaItemService.listAll(workspaceId),
                meetingService.listRecent(workspaceId),
                helpRequestService.listSummaries(workspaceId, now),
                List.of(),
                FlowSummary.empty(),
                now);
    }

    /** 강사는 팀원이 아니라 {@code memberId} null · 수집 동의 false. */
    private static Viewer viewerOf(WorkspaceAccess access, List<Member> members) {
        boolean consented = access.memberId() != null && members.stream()
                .anyMatch(member -> member.getId().equals(access.memberId()) && member.getActivityConsentedAt() != null);
        return new Viewer(Ids.toApi(access.userId()), access.role(), Ids.toApi(access.memberId()), consented);
    }
}

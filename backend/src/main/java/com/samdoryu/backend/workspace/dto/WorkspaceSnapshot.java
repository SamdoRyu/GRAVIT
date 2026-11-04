package com.samdoryu.backend.workspace.dto;

import com.samdoryu.backend.activity.dto.ActivityNote;
import com.samdoryu.backend.flow.dto.FlowSummary;
import com.samdoryu.backend.help.dto.HelpRequestSummary;
import com.samdoryu.backend.meeting.dto.AgendaItemDto;
import com.samdoryu.backend.meeting.dto.MeetingDto;
import com.samdoryu.backend.requirement.dto.RequirementDto;
import com.samdoryu.backend.requirement.dto.RequirementLinkDto;
import com.samdoryu.backend.sync.dto.SubmissionDto;
import com.samdoryu.backend.sync.dto.SyncStatus;
import com.samdoryu.backend.sync.dto.TaskDto;
import java.time.Instant;
import java.util.List;

/**
 * {@code GET W/snapshot} 응답 — CONTRACTS_API 「5」 WorkspaceSnapshot. 3D 사무실과 공통 HUD가 쓰는 사무실 공통 데이터다.
 * 개인 학습 데이터는 넣지 않는다(CONTRACTS.md 「5」 경계). 목록마다 정렬이 정해져 있다.
 *
 * @param members 빠진 팀원 포함 전부. 지금 팀원 먼저 deskIndex 순(자리가 없는 지금 팀원은 그 뒤 id 순), 그 뒤 빠진 팀원
 * @param tasks githubIssueNumber 오름차순
 * @param submissions githubPrNumber 오름차순
 * @param requirements position 오름차순
 * @param agendaItems 거둔 것 포함 전부, raisedAt 오름차순
 * @param meetings 진행 중 + 최근 끝난 것 20개, startedAt 오름차순
 * @param helpRequests 전부, createdAt 오름차순
 */
public record WorkspaceSnapshot(
        WorkspaceSummary workspace,
        Viewer viewer,
        TeamSettingsDto settings,
        SyncStatus sync,
        List<MemberDto> members,
        List<TaskDto> tasks,
        List<SubmissionDto> submissions,
        List<RequirementDto> requirements,
        List<RequirementLinkDto> requirementLinks,
        List<AgendaItemDto> agendaItems,
        List<MeetingDto> meetings,
        List<HelpRequestSummary> helpRequests,
        List<ActivityNote> activityNotes,
        FlowSummary flow,
        Instant generatedAt) {
}

package com.samdoryu.backend.workspace.service;

import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.dto.TeamSettingsDto;
import com.samdoryu.backend.workspace.dto.TeamSettingsUpdateRequest;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 팀 설정 읽기 · 바꾸기 — CONTRACTS_API.md 「7」(FR-PLAN-01 · FR-REQ-01 · FR-FLOW-01). 읽기는 사무실 접근, 바꾸기는 레포
 * 관리자(R2)만. 명세 문서 경로를 바꿔도 바로 읽지 않는다 — 다음 수동 동기화 때 읽는다. 바뀌면 SSE {@code settings}.
 * 사무실마다 설정이 하나 있다(사무실을 열 때 만든다).
 */
@Service
public class TeamSettingsService {

    private final TeamSettingsRepository teamSettingsRepository;
    private final WorkspaceEventHub eventHub;

    public TeamSettingsService(TeamSettingsRepository teamSettingsRepository, WorkspaceEventHub eventHub) {
        this.teamSettingsRepository = teamSettingsRepository;
        this.eventHub = eventHub;
    }

    /** {@code GET W/settings}. */
    @Transactional(readOnly = true)
    public TeamSettingsDto get(WorkspaceAccess access) {
        return TeamSettingsDto.of(require(access.workspaceId()));
    }

    /** {@code PUT W/settings} — 전체 교체. R2 아님 {@code forbidden_role}, 끝 날짜가 시작보다 빠르면 {@code invalid}. */
    @Transactional
    public TeamSettingsDto replace(WorkspaceAccess access, TeamSettingsUpdateRequest request) {
        access.requireRepoAdmin();
        if (request.projectEndDate().isBefore(request.projectStartDate())) {
            throw new ApiException(ErrorCode.INVALID, "끝 날짜가 시작 날짜보다 빨라요");
        }
        TeamSettings settings = require(access.workspaceId());
        settings.replace(request.projectStartDate(), request.projectEndDate(), request.specDocumentPath(),
                request.reviewWaitHours(), request.noCommitHours());
        eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.SETTINGS);
        return TeamSettingsDto.of(settings);
    }

    private TeamSettings require(Long workspaceId) {
        return teamSettingsRepository.findByWorkspaceId(workspaceId)
                .orElseThrow(() -> new IllegalStateException("팀 설정이 없는 사무실: " + workspaceId));
    }
}

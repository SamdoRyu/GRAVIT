package com.samdoryu.backend.workspace.service;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.github.dto.GithubInstalledRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.dto.OpenWorkspaceRequest;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.time.Instant;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사무실 열기의 저장 부분 — 한 트랜잭션: 사무실 · 팀 설정 · 연 사람의 팀원 행(#68). GitHub 호출은 하지 않는다
 * ({@link WorkspaceOpeningService}가 트랜잭션 밖에서 확인한 뒤 부른다). 동기화 상태는 첫 동기화 요청이 만든다.
 */
@Component
class WorkspaceCreator {

    /** 연 사람의 책상 — 사무실의 첫 팀원이라 0번(CONTRACTS.md 「2」 처음 들어올 때 빈 자리). */
    static final int OPENER_DESK = 0;

    private final WorkspaceRepository workspaceRepository;
    private final TeamSettingsRepository teamSettingsRepository;
    private final MemberRepository memberRepository;
    private final AppUserService appUserService;

    WorkspaceCreator(WorkspaceRepository workspaceRepository, TeamSettingsRepository teamSettingsRepository,
            MemberRepository memberRepository, AppUserService appUserService) {
        this.workspaceRepository = workspaceRepository;
        this.teamSettingsRepository = teamSettingsRepository;
        this.memberRepository = memberRepository;
        this.appUserService = appUserService;
    }

    record Created(Workspace workspace, Long openerMemberId) {
    }

    /**
     * @param repo GitHub에서 방금 확인한 레포(연 사람이 admin)
     * @throws ApiException {@code conflict} — 그 레포의 사무실이 이미 열림
     */
    @Transactional
    public Created create(Long openerUserId, GithubInstalledRepository repo, OpenWorkspaceRequest request,
            Instant now) {
        if (workspaceRepository.findByGithubRepoId(repo.repoId()).isPresent()) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        AppUser opener = appUserService.require(openerUserId);
        Workspace workspace = workspaceRepository.save(Workspace.github(repo.repoId(), repo.ownerLogin(), repo.name(),
                repo.installationId(), opener, now));
        teamSettingsRepository.save(new TeamSettings(workspace, request.projectStartDate(),
                request.projectEndDate(), request.specDocumentPath()));
        // 연 사람은 GitHub에서 admin을 확인한 콜라보레이터 — 팀원 행을 먼저 둔다. GitHub 칸은 이후 동기화가 맞추고,
        // 책상 · 수집 동의(앱 칸)는 동기화가 덮지 않는다
        Member opening = Member.collaborator(workspace, opener, OPENER_DESK, true, now);
        if (Boolean.TRUE.equals(request.activityConsent())) {
            opening.giveActivityConsent(now);
        }
        Member saved = memberRepository.save(opening);
        return new Created(workspace, saved.getId());
    }
}

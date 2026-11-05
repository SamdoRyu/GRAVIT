package com.samdoryu.backend.workspace.service;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 사무실 · 팀원 읽기. 다른 패키지는 이 Service로 사무실과 팀원을 읽는다(Repository 직접 사용 금지). */
@Service
public class WorkspaceService {

    private final WorkspaceRepository workspaceRepository;
    private final MemberRepository memberRepository;
    private final TeamSettingsRepository teamSettingsRepository;

    public WorkspaceService(WorkspaceRepository workspaceRepository, MemberRepository memberRepository,
            TeamSettingsRepository teamSettingsRepository) {
        this.workspaceRepository = workspaceRepository;
        this.memberRepository = memberRepository;
        this.teamSettingsRepository = teamSettingsRepository;
    }

    /** 팀 설정의 명세 문서 경로(FR-REQ-01). 팀 설정이 없거나 경로가 비어 있으면 빈 값. */
    @Transactional(readOnly = true)
    public Optional<String> specDocumentPath(Long workspaceId) {
        return teamSettingsRepository.findByWorkspaceId(workspaceId)
                .map(TeamSettings::getSpecDocumentPath)
                .map(String::strip)
                .filter(path -> !path.isEmpty());
    }

    /** 사무실이 없으면 {@code not_found}. 접근 권한 검사는 하지 않는다 — Controller가 인가 서비스로 먼저 한다. */
    @Transactional(readOnly = true)
    public Workspace requireWorkspace(Long workspaceId) {
        return workspaceRepository.findById(workspaceId).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
    }

    /** 경로의 팀원 — 그 사무실의 팀원(빠진 팀원 포함)이 아니면 {@code not_found}(개인 API 「15」 2). */
    @Transactional(readOnly = true)
    public Member requireMember(Long workspaceId, Long memberId) {
        return memberRepository.findByIdAndWorkspaceId(memberId, workspaceId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
    }

    /** 실제(GitHub) 사무실 전부의 ID — 자동 폴링 대상(시연 사무실은 GitHub를 부르지 않으므로 뺀다). */
    @Transactional(readOnly = true)
    public List<Long> githubWorkspaceIds() {
        return workspaceRepository.findByKind(WorkspaceKind.GITHUB).stream().map(ws -> ws.getId()).toList();
    }

    /** 지금 팀원(빠진 팀원 제외). */
    @Transactional(readOnly = true)
    public List<Member> currentMembers(Long workspaceId) {
        return memberRepository.findByWorkspaceIdAndRemovedAtIsNull(workspaceId);
    }

    /**
     * 이 사용자가 지금 팀원인 실제 사무실의 팀원 행 — 그 레포들({@code githubRepoIds}) 중 사무실이 열린 것만.
     * 팀원 행은 동기화가 만든다. 아직 없으면 그 사무실은 결과에 없다.
     */
    @Transactional(readOnly = true)
    public List<Member> currentMembershipsInRepos(Long userId, Collection<Long> githubRepoIds) {
        if (githubRepoIds.isEmpty()) {
            return List.of();
        }
        return memberRepository.findByUserIdAndRemovedAtIsNullAndWorkspaceGithubRepoIdIn(userId, githubRepoIds);
    }
}

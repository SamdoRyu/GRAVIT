package com.samdoryu.backend.auth.service;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.github.dto.GithubLoginProfile;
import com.samdoryu.backend.github.dto.GithubRepoPermission;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * GitHub 로그인 성공 뒤 앱 사용자와 사무실별 역할을 정한다(FR-AUTH-01 · 02, CONTRACTS.md 「6」 역할 판정).
 * <ul>
 *   <li>사용자는 GitHub 사용자 ID로 찾는다 — 로그인 이름이 바뀌어도 같은 사람. 없으면 만들고(동기화가 먼저 만든 행이면 그 행),
 *       있으면 표시 값을 GitHub 값으로 맞춘다.</li>
 *   <li>역할: 레포 admin → 레포 관리자(ROLE-02), 그 밖의 콜라보레이터 → 참여자(ROLE-01). <b>사무실이 열려 있고 이미 그 사무실의
 *       지금 팀원 행이 있는 레포만</b> — 팀원 행은 동기화가 만든다(「2」 소유). 역할은 로그인 때 정해 세션에 둔다.</li>
 *   <li><b>허용 목록 강사 계정은 레포 권한과 상관없이 어느 사무실에서도 팀원 역할을 받지 않는다</b>(P1 — 권한 상승 방지).
 *       강사 지정은 요청마다 DB에서 확인한다({@link AuthorizationService}).</li>
 * </ul>
 */
@Service
public class GithubLoginService {

    private final AppUserRepository appUserRepository;
    private final WorkspaceService workspaceService;
    private final AppProperties appProperties;

    public GithubLoginService(AppUserRepository appUserRepository, WorkspaceService workspaceService,
            AppProperties appProperties) {
        this.appUserRepository = appUserRepository;
        this.workspaceService = workspaceService;
        this.appProperties = appProperties;
    }

    /** 레포 권한을 GitHub에서 읽어야 하는 계정인가 — 허용 목록 강사 계정은 읽지 않는다. */
    public boolean needsRepoPermissions(GithubLoginProfile profile) {
        return !appProperties.isAllowlistedInstructor(profile.githubUserId());
    }

    /**
     * @param repoPermissions 로그인한 사용자의 레포 권한(GitHub에서 읽은 값). 허용 목록 강사 계정이면 무시한다
     * @return 세션에 둘 로그인 사용자
     */
    @Transactional
    public AppPrincipal login(GithubLoginProfile profile, List<GithubRepoPermission> repoPermissions) {
        AppUser user = appUserRepository.findByGithubUserId(profile.githubUserId())
                .map(existing -> {
                    existing.updateGithubProfile(profile.login(), profile.displayName(), profile.avatarUrl());
                    return existing;
                })
                .orElseGet(() -> appUserRepository.save(AppUser.github(profile.githubUserId(), profile.login(),
                        profile.displayName(), profile.avatarUrl())));

        Map<Long, AppPrincipal.Membership> memberships = needsRepoPermissions(profile)
                ? memberships(user, repoPermissions)
                : Map.of();
        return new AppPrincipal(user.getId(), AccountType.GITHUB, user.getGithubUserId(), memberships);
    }

    private Map<Long, AppPrincipal.Membership> memberships(AppUser user, List<GithubRepoPermission> permissions) {
        Map<Long, Boolean> adminByRepo = permissions.stream()
                .collect(Collectors.toMap(GithubRepoPermission::githubRepoId, GithubRepoPermission::admin,
                        Boolean::logicalOr));
        Map<Long, AppPrincipal.Membership> memberships = new HashMap<>();
        for (Member member : workspaceService.currentMembershipsInRepos(user.getId(), adminByRepo.keySet())) {
            boolean admin = adminByRepo.getOrDefault(member.getWorkspace().getGithubRepoId(), false);
            WorkspaceRole role = admin ? WorkspaceRole.REPO_ADMIN : WorkspaceRole.PARTICIPANT;
            memberships.put(member.getWorkspace().getId(), new AppPrincipal.Membership(role, member.getId()));
        }
        return memberships;
    }
}

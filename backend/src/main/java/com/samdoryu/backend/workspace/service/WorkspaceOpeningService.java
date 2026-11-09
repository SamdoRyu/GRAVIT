package com.samdoryu.backend.workspace.service;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.AppPrincipal;
import com.samdoryu.backend.auth.service.ReviewAccountService;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.github.GithubUserClient;
import com.samdoryu.backend.github.dto.GithubAccount;
import com.samdoryu.backend.github.dto.GithubInstalledRepository;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.dto.OpenWorkspaceRequest;
import com.samdoryu.backend.workspace.dto.RepositoryChoiceResponse;
import com.samdoryu.backend.workspace.dto.RepositoryChoiceResponse.OwnerChoice;
import com.samdoryu.backend.workspace.dto.RepositoryChoiceResponse.RepositoryChoice;
import com.samdoryu.backend.workspace.dto.WorkspaceListItem;
import com.samdoryu.backend.workspace.dto.WorkspaceSummary;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 팀 레포 연결(#68 · FR-GH-01 · CONTRACTS_API.md 「3」) — 레포 선택 · 내 사무실 목록 · 사무실 열기.
 * GitHub는 로그인한 사용자 토큰(서버 세션)으로 읽고, GitHub 호출은 DB 트랜잭션 밖에서 한다.
 * <ul>
 *   <li>허용 목록 강사 계정은 레포 관리자 · 참여자가 아니다(P1) — 레포 선택은 빈 목록, 사무실 열기는 {@code forbidden_role}.</li>
 *   <li>심사용 계정은 GitHub 권한이 없다(P15) — 레포 선택은 빈 목록, 사무실 열기는 레포가 안 보여 {@code not_found}.
 *       세션의 GitHub 토큰이 아니라 계정 종류로 판정한다(#250).</li>
 * </ul>
 */
@Service
public class WorkspaceOpeningService {

    private final GithubUserClient githubUserClient;
    private final WorkspaceRepository workspaceRepository;
    private final WorkspaceCreator workspaceCreator;
    private final InstructorAssignmentService instructorAssignmentService;
    private final ReviewAccountService reviewAccountService;
    private final DemoWorkspaceService demoWorkspaceService;
    private final AppProperties appProperties;

    public WorkspaceOpeningService(GithubUserClient githubUserClient, WorkspaceRepository workspaceRepository,
            WorkspaceCreator workspaceCreator, InstructorAssignmentService instructorAssignmentService,
            ReviewAccountService reviewAccountService, DemoWorkspaceService demoWorkspaceService,
            AppProperties appProperties) {
        this.githubUserClient = githubUserClient;
        this.workspaceRepository = workspaceRepository;
        this.workspaceCreator = workspaceCreator;
        this.instructorAssignmentService = instructorAssignmentService;
        this.reviewAccountService = reviewAccountService;
        this.demoWorkspaceService = demoWorkspaceService;
        this.appProperties = appProperties;
    }

    /** 사무실을 연 결과 — 응답과, 세션에 넣을 연 사람의 팀원 ID. */
    public record Opened(WorkspaceSummary summary, Long workspaceId, Long openerMemberId) {
    }

    private boolean usesGithubRepos(AppPrincipal principal) {
        return principal.accountType() == AccountType.GITHUB
                && !appProperties.isAllowlistedInstructor(principal.githubUserId());
    }

    /**
     * {@code GET /api/repositories} — 앱이 설치된 계정의 레포(내 역할 · 열린 사무실)와 앱이 아직 설치되지 않은 조직.
     * 소유자 · 레포는 이름 순. 학생인데 세션에 GitHub 토큰이 없으면 다시 로그인해야 한다({@code unauthorized}).
     */
    public RepositoryChoiceResponse repositories(AppPrincipal principal, Optional<String> userToken) {
        if (!usesGithubRepos(principal)) {
            return RepositoryChoiceResponse.empty();
        }
        String token = userToken.orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED));
        List<GithubInstalledRepository> installed = githubUserClient.installedRepositories(token);
        List<GithubAccount> organizations = githubUserClient.organizations(token);
        Map<Long, Long> workspaceIdByRepo = openedWorkspaces(installed);

        Map<Long, List<GithubInstalledRepository>> byOwner = installed.stream()
                .collect(Collectors.groupingBy(GithubInstalledRepository::ownerId, LinkedHashMap::new,
                        Collectors.toList()));
        List<OwnerChoice> owners = new ArrayList<>();
        byOwner.forEach((ownerId, repos) -> owners.add(new OwnerChoice(Ids.toApi(ownerId), repos.get(0).ownerLogin(),
                true, null, repos.stream()
                        .sorted(Comparator.comparing(GithubInstalledRepository::name, String.CASE_INSENSITIVE_ORDER))
                        .map(repo -> choice(token, repo, workspaceIdByRepo.get(repo.repoId())))
                        .toList())));
        for (GithubAccount org : organizations) {
            if (!byOwner.containsKey(org.id())) {
                owners.add(new OwnerChoice(Ids.toApi(org.id()), org.login(), false, appProperties.githubAppInstallUrl(),
                        List.of()));
            }
        }
        owners.sort(Comparator.comparing(OwnerChoice::login, String.CASE_INSENSITIVE_ORDER));
        return new RepositoryChoiceResponse(owners);
    }

    private Map<Long, Long> openedWorkspaces(List<GithubInstalledRepository> installed) {
        Set<Long> repoIds = installed.stream().map(GithubInstalledRepository::repoId).collect(Collectors.toSet());
        if (repoIds.isEmpty()) {
            return Map.of();
        }
        return workspaceRepository.findByGithubRepoIdIn(repoIds).stream()
                .collect(Collectors.toMap(Workspace::getGithubRepoId, Workspace::getId));
    }

    /** 팀장 이름은 열리지 않은 레포의 참여자에게만 — "아직 사무실이 열리지 않았어요, 팀장(…)에게 요청하세요"(P2). */
    private RepositoryChoice choice(String token, GithubInstalledRepository repo, Long workspaceId) {
        List<String> adminLogins = workspaceId == null && !repo.admin()
                ? githubUserClient.repositoryAdminLogins(token, repo.ownerLogin(), repo.name())
                : List.of();
        return new RepositoryChoice(Ids.toApi(repo.repoId()), repo.ownerLogin(), repo.name(),
                repo.admin() ? WorkspaceRole.REPO_ADMIN : WorkspaceRole.PARTICIPANT, Ids.toApi(workspaceId),
                adminLogins);
    }

    /**
     * {@code GET /api/workspaces} — 내가 들어갈 수 있는 열린 사무실, {@code displayName} 오름차순. 학생은 세션의 역할(로그인 때
     * 정함), 강사는 지금 지정된 사무실 전부(DB), 심사용 계정은 시연 사무실만(심사용 강사는 요청마다 확인).
     */
    @Transactional(readOnly = true)
    public List<WorkspaceListItem> myWorkspaces(AppPrincipal principal) {
        Map<Long, WorkspaceRole> roles = new LinkedHashMap<>();
        if (appProperties.isAllowlistedInstructor(principal.githubUserId())) {
            instructorAssignmentService.currentWorkspaceIds(principal.githubUserId())
                    .forEach(id -> roles.put(id, WorkspaceRole.INSTRUCTOR));
        } else if (principal.accountType() == AccountType.REVIEW
                && reviewAccountService.isReviewInstructor(principal.userId())) {
            demoWorkspaceService.findDemoWorkspaceId().ifPresent(id -> roles.put(id, WorkspaceRole.INSTRUCTOR));
        } else {
            principal.memberships().forEach((id, membership) -> roles.put(id, membership.role()));
        }
        return workspaceRepository.findAllById(roles.keySet()).stream()
                .filter(ws -> principal.accountType() != AccountType.REVIEW || ws.getKind() == WorkspaceKind.DEMO)
                .sorted(Comparator.comparing(Workspace::getDisplayName).thenComparing(Workspace::getId))
                .map(ws -> WorkspaceListItem.of(WorkspaceSummary.of(ws), roles.get(ws.getId())))
                .toList();
    }

    /**
     * {@code POST /api/workspaces} — 검사 순서: 본문 형식 · 날짜({@code invalid}) → 강사({@code forbidden_role}) → GitHub
     * 계정이 아님 · 레포가 안 보임({@code not_found}) → 레포 관리자 아님({@code forbidden_role}) → 이미 열림({@code conflict}).
     */
    public Opened open(AppPrincipal principal, Optional<String> userToken, OpenWorkspaceRequest request, Instant now) {
        long repoId = Ids.fromBody(request.githubRepoId());
        if (request.projectEndDate().isBefore(request.projectStartDate())) {
            throw new ApiException(ErrorCode.INVALID, "끝 날짜가 시작 날짜보다 빨라요");
        }
        if (appProperties.isAllowlistedInstructor(principal.githubUserId())) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        if (principal.accountType() != AccountType.GITHUB) {
            // 심사용 계정은 시연 사무실에만(P15) — 세션에 다른 로그인의 GitHub 토큰이 있어도 쓰지 않는다(#250)
            throw new ApiException(ErrorCode.NOT_FOUND);
        }
        String token = userToken.orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        GithubInstalledRepository repo = githubUserClient.installedRepositories(token).stream()
                .filter(candidate -> candidate.repoId() == repoId)
                .findFirst()
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        if (!repo.admin()) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        try {
            WorkspaceCreator.Created created = workspaceCreator.create(principal.userId(), repo, request, now);
            return new Opened(WorkspaceSummary.of(created.workspace()), created.workspace().getId(),
                    created.openerMemberId());
        } catch (DataIntegrityViolationException e) {
            // 같은 레포를 동시에 연 경우 — 유일 제약(githubRepoId 하나에 사무실 하나)이 막는다
            throw new ApiException(ErrorCode.CONFLICT);
        }
    }
}

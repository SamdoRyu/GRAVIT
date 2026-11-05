package com.samdoryu.backend.sync.service;

import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.github.GithubReader;
import com.samdoryu.backend.github.GithubReaderSelector;
import com.samdoryu.backend.github.dto.GithubCollaborator;
import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.requirement.service.RequirementService;
import com.samdoryu.backend.sync.dto.SpecWarning;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.service.MemberSyncService;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사무실 하나를 GitHub(시연 사무실은 Seed)와 맞춘다 — 순서: 팀원 → 이슈 · PR(담당자 · 리뷰 · 커밋 시각 · 라벨) → PR–이슈 연결
 * → (명세 문서를 읽는 동기화면) 요구사항.
 * 담당자 · 작성자를 팀원과 짝지으려면 팀원이 먼저 있어야 한다. 사무실 열기(#68) · 수동 동기화 · 폴링(#70)은 이 Service를 부른다.
 * 한 번의 동기화는 한 트랜잭션이다 — 중간에 실패하면 아무것도 바뀌지 않는다(NFR-09 — 화면은 마지막 데이터 유지).
 */
@Service
public class WorkspaceSyncService {

    private final WorkspaceService workspaceService;
    private final GithubReaderSelector readerSelector;
    private final AppUserService appUserService;
    private final MemberSyncService memberSyncService;
    private final IssuePullRequestSyncService issuePullRequestSyncService;
    private final RequirementService requirementService;

    public WorkspaceSyncService(WorkspaceService workspaceService, GithubReaderSelector readerSelector,
            AppUserService appUserService, MemberSyncService memberSyncService,
            IssuePullRequestSyncService issuePullRequestSyncService, RequirementService requirementService) {
        this.workspaceService = workspaceService;
        this.readerSelector = readerSelector;
        this.appUserService = appUserService;
        this.memberSyncService = memberSyncService;
        this.issuePullRequestSyncService = issuePullRequestSyncService;
        this.requirementService = requirementService;
    }

    /**
     * @param specWarnings 명세 문서를 읽었으면 그 경고(없으면 빈 목록), 읽지 않았으면 null — 마지막 경고를 그대로 둔다
     */
    public record Outcome(IssuePullRequestSyncService.Result items, List<SpecWarning> specWarnings) {

        public boolean specRead() {
            return specWarnings != null;
        }
    }

    /**
     * @param since 이슈 · PR은 이 시각 이후 바뀐 것만 읽는다(null이면 전부). 콜라보레이터는 늘 전체 목록
     * @param readSpec 명세 문서를 다시 읽나 — 수동 동기화 · 사무실 열기만(자동 폴링은 읽지 않는다 — CONTRACTS_API 「4」)
     * @param now 동기화 시각
     */
    @Transactional
    public Outcome sync(Long workspaceId, Instant since, boolean readSpec, Instant now) {
        Workspace workspace = workspaceService.requireWorkspace(workspaceId);
        GithubReader reader = readerSelector.forKind(workspace.getKind());

        List<MemberSyncService.Collaborator> collaborators = new ArrayList<>();
        for (GithubCollaborator collaborator : reader.collaborators(IssuePullRequestSyncService.repoRef(workspace))) {
            collaborators.add(toCollaborator(workspace.getKind(), collaborator));
        }
        memberSyncService.syncCollaborators(workspaceId, collaborators, now);

        IssuePullRequestSyncService.Result items = issuePullRequestSyncService.sync(workspaceId, since, now);
        return new Outcome(items, readSpec ? syncRequirements(workspace, reader, now) : null);
    }

    /**
     * 명세 문서로 요구사항을 맞춘다(CONTRACTS.md 「3」 요구사항 재동기화). 경로가 비어 있으면 읽지 않고 바꾸지 않는다.
     * 파일이 없으면 하나도 바꾸지 않고 {@code spec_not_found}. 그 밖의 GitHub 오류는 던져 동기화 실패로 남긴다(FR-GH-05).
     * <p>
     * [구현 기본값 — #14] 경로가 비어 있으면 경고는 빈 목록으로 바꾼다 — 예전 경로의 경고를 계속 보이지 않게.
     */
    private List<SpecWarning> syncRequirements(Workspace workspace, GithubReader reader, Instant now) {
        Optional<String> path = workspaceService.specDocumentPath(workspace.getId());
        if (path.isEmpty()) {
            return List.of();
        }
        Optional<String> markdown = reader.readFile(IssuePullRequestSyncService.repoRef(workspace), path.get());
        if (markdown.isEmpty()) {
            return List.of(SpecWarning.specNotFound());
        }
        return requirementService.resync(workspace, markdown.get(), now);
    }

    /**
     * 실제 사무실: GitHub 사용자 ID로 사용자를 찾거나 만든다(아직 로그인하지 않은 사람도). 실제 GitHub 계정은 늘 ID가
     * 있다 — 없으면 어댑터 오류로 보고 동기화를 멈춘다. 시연 사무실: 사용자 없이 Seed 로그인으로 짝짓는다.
     */
    private MemberSyncService.Collaborator toCollaborator(WorkspaceKind kind, GithubCollaborator collaborator) {
        GithubUser user = collaborator.user();
        if (kind == WorkspaceKind.DEMO) {
            return new MemberSyncService.Collaborator(null, user.login(), user.avatarUrl(), collaborator.admin());
        }
        if (user.id() == null) {
            throw new IllegalStateException("실제 사무실의 콜라보레이터에 GitHub 사용자 ID가 없다");
        }
        return new MemberSyncService.Collaborator(
                appUserService.findOrCreateGithubUser(user.id(), user.login(), user.avatarUrl()),
                user.login(), user.avatarUrl(), collaborator.admin());
    }
}

package com.samdoryu.backend.sync.service;

import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.github.GithubReader;
import com.samdoryu.backend.github.GithubReaderSelector;
import com.samdoryu.backend.github.dto.GithubCollaborator;
import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.service.MemberSyncService;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사무실 하나를 GitHub(시연 사무실은 Seed)와 맞춘다 — 순서: 팀원 → 이슈 · PR(담당자 · 리뷰 · 커밋 시각 · 라벨) → PR–이슈 연결.
 * 담당자 · 작성자를 팀원과 짝지으려면 팀원이 먼저 있어야 한다. 사무실 열기(#68) · 수동 동기화 · 폴링(#70)은 이 Service를 부른다.
 * 한 번의 동기화는 한 트랜잭션이다 — 중간에 실패하면 아무것도 바뀌지 않는다(NFR-09 — 화면은 마지막 데이터 유지).
 * {@code SyncState}(마지막 성공 · 실패) 기록은 FR-GH-05 Issue에서 이 호출을 감싸 더한다.
 */
@Service
public class WorkspaceSyncService {

    private final WorkspaceService workspaceService;
    private final GithubReaderSelector readerSelector;
    private final AppUserService appUserService;
    private final MemberSyncService memberSyncService;
    private final IssuePullRequestSyncService issuePullRequestSyncService;

    public WorkspaceSyncService(WorkspaceService workspaceService, GithubReaderSelector readerSelector,
            AppUserService appUserService, MemberSyncService memberSyncService,
            IssuePullRequestSyncService issuePullRequestSyncService) {
        this.workspaceService = workspaceService;
        this.readerSelector = readerSelector;
        this.appUserService = appUserService;
        this.memberSyncService = memberSyncService;
        this.issuePullRequestSyncService = issuePullRequestSyncService;
    }

    /**
     * @param since 이슈 · PR은 이 시각 이후 바뀐 것만 읽는다(null이면 전부). 콜라보레이터는 늘 전체 목록
     * @param now 동기화 시각
     */
    @Transactional
    public IssuePullRequestSyncService.Result sync(Long workspaceId, Instant since, Instant now) {
        Workspace workspace = workspaceService.requireWorkspace(workspaceId);
        GithubReader reader = readerSelector.forKind(workspace.getKind());

        List<MemberSyncService.Collaborator> collaborators = new ArrayList<>();
        for (GithubCollaborator collaborator : reader.collaborators(IssuePullRequestSyncService.repoRef(workspace))) {
            collaborators.add(toCollaborator(workspace.getKind(), collaborator));
        }
        memberSyncService.syncCollaborators(workspaceId, collaborators, now);

        return issuePullRequestSyncService.sync(workspaceId, since, now);
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

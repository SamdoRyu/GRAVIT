package com.samdoryu.backend.workspace.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import java.time.Instant;

/**
 * 사무실 요약 — CONTRACTS_API.md 「3」 WorkspaceSummary. 설치 ID는 내지 않는다.
 *
 * @param githubRepoId GitHub 레포 ID(문자열). 시연 사무실은 null
 * @param htmlUrl 레포 주소 — "이슈로 만들기" 링크의 바탕. 시연 사무실은 null
 */
public record WorkspaceSummary(String id, WorkspaceKind kind, String displayName, String githubOwner,
        String githubRepo, String githubRepoId, String htmlUrl, Instant openedAt) {

    static final String GITHUB_WEB = "https://github.com/";

    public static WorkspaceSummary of(Workspace workspace) {
        boolean github = workspace.getKind() == WorkspaceKind.GITHUB;
        return new WorkspaceSummary(Ids.toApi(workspace.getId()), workspace.getKind(), workspace.getDisplayName(),
                workspace.getGithubOwner(), workspace.getGithubRepo(), Ids.toApi(workspace.getGithubRepoId()),
                github ? GITHUB_WEB + workspace.getGithubOwner() + "/" + workspace.getGithubRepo() : null,
                workspace.getOpenedAt());
    }
}

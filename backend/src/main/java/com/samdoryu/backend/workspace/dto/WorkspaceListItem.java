package com.samdoryu.backend.workspace.dto;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import java.time.Instant;

/** {@code GET /api/workspaces}의 한 줄 — CONTRACTS_API.md 「3」 WorkspaceListItem(= WorkspaceSummary + myRole). */
public record WorkspaceListItem(String id, WorkspaceKind kind, String displayName, String githubOwner,
        String githubRepo, String githubRepoId, String htmlUrl, Instant openedAt, WorkspaceRole myRole) {

    public static WorkspaceListItem of(WorkspaceSummary summary, WorkspaceRole myRole) {
        return new WorkspaceListItem(summary.id(), summary.kind(), summary.displayName(), summary.githubOwner(),
                summary.githubRepo(), summary.githubRepoId(), summary.htmlUrl(), summary.openedAt(), myRole);
    }
}

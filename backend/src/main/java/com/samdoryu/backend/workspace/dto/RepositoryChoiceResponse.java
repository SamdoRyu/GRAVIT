package com.samdoryu.backend.workspace.dto;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import java.util.List;

/**
 * {@code GET /api/repositories} 응답 — CONTRACTS_API.md 「3」 RepositoryChoiceResponse · OwnerChoice · RepositoryChoice.
 * 강사 · 심사용 계정은 {@code organizations: []}.
 */
public record RepositoryChoiceResponse(List<OwnerChoice> organizations) {

    public RepositoryChoiceResponse {
        organizations = List.copyOf(organizations);
    }

    public static RepositoryChoiceResponse empty() {
        return new RepositoryChoiceResponse(List.of());
    }

    /**
     * @param login 조직(또는 개인 계정) 이름
     * @param appInstalled false면 자물쇠 + "승인 요청하기"
     * @param installUrl GitHub 앱 설치 · 승인 요청 페이지(P2). 앱 이름(slug)을 설정하지 않았거나 이미 설치됐으면 null
     */
    public record OwnerChoice(String githubOwnerId, String login, boolean appInstalled, String installUrl,
            List<RepositoryChoice> repositories) {

        public OwnerChoice {
            repositories = List.copyOf(repositories);
        }
    }

    /**
     * @param myRole {@code repo_admin} · {@code participant}
     * @param workspaceId null = 아직 열리지 않음
     * @param adminLogins "아직 사무실이 열리지 않았어요" 안내의 팀장 이름(P2) — 열리지 않은 레포의 참여자에게만 채운다
     */
    public record RepositoryChoice(String githubRepoId, String owner, String name, WorkspaceRole myRole,
            String workspaceId, List<String> adminLogins) {

        public RepositoryChoice {
            adminLogins = List.copyOf(adminLogins);
        }
    }
}

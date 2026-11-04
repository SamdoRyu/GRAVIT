package com.samdoryu.backend.github.dto;

/**
 * 로그인한 사용자의 레포 하나에 대한 권한(CONTRACTS.md 「6」 역할 판정 · 「7」 사용자 · 레포 권한 조회).
 *
 * @param githubRepoId 레포 ID — 사무실({@code workspace.github_repo_id})과 짝짓는 키
 * @param admin 그 레포의 admin이면 레포 관리자(ROLE-02), 아니면 참여자(ROLE-01)
 */
public record GithubRepoPermission(long githubRepoId, boolean admin) {
}

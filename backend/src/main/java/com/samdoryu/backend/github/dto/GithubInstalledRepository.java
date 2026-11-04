package com.samdoryu.backend.github.dto;

/**
 * 앱이 설치된 레포 하나와 로그인한 사용자의 권한(#68 · FR-GH-01).
 *
 * @param installationId GitHub App 설치 ID — 사무실에 저장한다(응답에 내지 않음)
 * @param admin 그 레포의 admin이면 레포 관리자(ROLE-02)
 */
public record GithubInstalledRepository(long installationId, long ownerId, String ownerLogin, long repoId,
        String name, boolean admin) {
}

package com.samdoryu.backend.github.dto;

import java.util.Objects;

/**
 * 레포 콜라보레이터 — 어댑터 결과 DTO(CONTRACTS.md 「7」 콜라보레이터: GitHub 사용자 ID · 로그인 이름 · 사진 · admin 여부).
 *
 * @param admin 그 레포의 admin(레포 관리자 여부 표시용 — 세션 역할은 로그인 때 정한다)
 */
public record GithubCollaborator(GithubUser user, boolean admin) {

    public GithubCollaborator {
        Objects.requireNonNull(user);
    }
}

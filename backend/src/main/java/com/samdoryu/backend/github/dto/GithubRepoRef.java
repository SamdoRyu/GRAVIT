package com.samdoryu.backend.github.dto;

/**
 * 읽을 레포. 실제 사무실은 owner · repo · 설치 ID로 GitHub를 부르고, 시연 사무실은 {@link #DEMO}로 Seed를 읽는다.
 *
 * @param installationId GitHub App 설치 ID — 설치 토큰 발급에 쓴다. 응답에 내지 않는다
 */
public record GithubRepoRef(String owner, String repo, Long installationId) {

    /** 시연 사무실 — Seed 어댑터는 레포 값을 쓰지 않는다. */
    public static final GithubRepoRef DEMO = new GithubRepoRef(null, null, null);
}

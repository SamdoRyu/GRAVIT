package com.samdoryu.backend.github.dto;

/**
 * GitHub 계정(담당자 · 작성자 · 리뷰어). 어댑터 결과 DTO — GitHub 응답 JSON을 그대로 내보내지 않는다(CONTRACTS.md 「7」).
 *
 * @param id GitHub 사용자 ID. 실제 GitHub에서는 늘 있다. 시연 Seed 계정은 null(시연 Seed 팀원은 GitHub 사용자 ID가 없다)
 * @param login 로그인 이름 — 표시용. 실제 사무실에서는 권한 · 연결 판정에 쓰지 않는다
 */
public record GithubUser(Long id, String login, String avatarUrl) {
}

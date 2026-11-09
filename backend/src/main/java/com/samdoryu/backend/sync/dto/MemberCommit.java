package com.samdoryu.backend.sync.dto;

import java.time.Instant;

/**
 * 팀원 한 명의 커밋 하나 — 서버 안에서 다른 패키지에 넘기는 값(API 응답 DTO가 아니다). 스탠드업 미리 채우기가
 * {@code StandupPrefill.items[]}의 {@code kind: 'commit'}으로 바꾼다(CONTRACTS_API 「12」 · #261 — 커밋은 {@code githubNumber} null).
 *
 * @param title 커밋 메시지 첫 줄
 * @param authoredAt 작성 시각(git author date)
 */
public record MemberCommit(String sha, String title, Instant authoredAt) {
}

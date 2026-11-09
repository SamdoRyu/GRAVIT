package com.samdoryu.backend.github.dto;

import java.time.Instant;

/**
 * PR에 올라간 커밋 하나(CONTRACTS.md 「7」 커밋 시각 — 사용자별 커밋 · #261).
 *
 * @param author 커밋 작성자의 GitHub 계정. 커밋 이메일이 GitHub 계정과 이어지지 않았으면 null
 * @param title 커밋 메시지 첫 줄
 * @param authoredAt 작성 시각(git author date) — 스탠드업 "어제 한 일"의 기준
 * @param committedAt 커밋 시각(git committer date) — PR의 마지막 커밋 시각(막힘 "커밋 없음")의 기준
 */
public record GithubCommit(String sha, GithubUser author, String title, Instant authoredAt, Instant committedAt) {
}

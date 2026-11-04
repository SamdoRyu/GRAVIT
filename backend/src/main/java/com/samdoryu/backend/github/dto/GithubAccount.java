package com.samdoryu.backend.github.dto;

/** GitHub 계정(조직 또는 개인) — 레포 선택 화면의 소유자. */
public record GithubAccount(long id, String login) {
}

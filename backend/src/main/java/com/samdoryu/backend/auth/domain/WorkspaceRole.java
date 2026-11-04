package com.samdoryu.backend.auth.domain;

import com.fasterxml.jackson.annotation.JsonValue;

/** 한 사무실에서 한 사람의 역할(CONTRACTS.md 「6」 역할 판정). 한 사무실에서 역할은 하나다. */
public enum WorkspaceRole {

    REPO_ADMIN("repo_admin"),
    PARTICIPANT("participant"),
    INSTRUCTOR("instructor");

    private final String value;

    WorkspaceRole(String value) {
        this.value = value;
    }

    /** JSON 값(CONTRACTS_API.md 「1」 WorkspaceRole). */
    @JsonValue
    public String value() {
        return value;
    }

    /** 팀원(참여자 · 레포 관리자) — 그 사무실의 {@code memberId}가 있다. 강사는 아니다. */
    public boolean isTeamMember() {
        return this != INSTRUCTOR;
    }
}

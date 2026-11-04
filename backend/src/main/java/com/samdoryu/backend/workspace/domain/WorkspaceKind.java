package com.samdoryu.backend.workspace.domain;

import com.fasterxml.jackson.annotation.JsonValue;

/** 사무실 종류(P2). DB에는 이름(`GITHUB`), JSON에는 {@link #value()}(`github`). */
public enum WorkspaceKind {

    /** 팀 GitHub 레포를 읽는 실제 사무실. */
    GITHUB("github"),
    /** Seed 데이터로 채우고 GitHub를 부르지 않는 시연 사무실. */
    DEMO("demo");

    private final String value;

    WorkspaceKind(String value) {
        this.value = value;
    }

    /** JSON 값(CONTRACTS_API.md 「1」 WorkspaceKind). */
    @JsonValue
    public String value() {
        return value;
    }
}

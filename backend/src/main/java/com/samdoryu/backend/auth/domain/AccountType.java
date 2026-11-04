package com.samdoryu.backend.auth.domain;

import com.fasterxml.jackson.annotation.JsonValue;

/** 계정 종류(CONTRACTS.md 「2」 AppUser). DB에는 이름(`GITHUB`), JSON에는 {@link #value()}(`github`). */
public enum AccountType {

    GITHUB("github"),
    REVIEW("review");

    private final String value;

    AccountType(String value) {
        this.value = value;
    }

    /** JSON 값(CONTRACTS.md 「3」 상태값 — 계정 종류). */
    @JsonValue
    public String value() {
        return value;
    }
}

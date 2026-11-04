package com.samdoryu.backend.requirement.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** 요구사항 상태(CONTRACTS.md 「3」 요구사항 재동기화). {@code ACTIVE}만 새 연결 대상이다. JSON 값은 소문자 snake. */
public enum RequirementStatus {
    ACTIVE,
    /** 문서에서 사라짐 — 연결은 남는다. */
    MISSING,
    /** 원본 ID · 제목이 겹쳐 모호함 — 문서를 고치면 다음 재동기화에서 풀린다. */
    NEEDS_REVIEW;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

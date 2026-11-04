package com.samdoryu.backend.meeting.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** 안건 종류(CONTRACTS.md 「3」 상태값). JSON 값은 소문자 snake(`help_request` 등). */
public enum AgendaKind {
    ISSUE,
    PR,
    HELP_REQUEST,
    /** 배운 점 공유 — 원본 없음. */
    LEARNING,
    /** 기타 — 원본 없음. */
    OTHER;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

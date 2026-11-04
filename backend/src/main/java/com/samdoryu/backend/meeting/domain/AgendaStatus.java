package com.samdoryu.backend.meeting.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** 안건 상태(CONTRACTS.md 「3」 상태값) — 확정 · 회의 완료 · 거둠. JSON 값은 소문자. */
public enum AgendaStatus {
    CONFIRMED,
    DISCUSSED,
    WITHDRAWN;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

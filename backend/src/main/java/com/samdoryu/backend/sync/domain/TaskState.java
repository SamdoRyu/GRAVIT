package com.samdoryu.backend.sync.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** 이슈 상태(CONTRACTS.md 「3」 상태값). JSON 값은 소문자(`open` · `closed`). */
public enum TaskState {
    OPEN,
    CLOSED;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

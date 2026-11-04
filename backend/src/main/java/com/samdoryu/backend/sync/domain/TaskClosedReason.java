package com.samdoryu.backend.sync.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** 이슈 닫힘 사유 — GitHub {@code state_reason}(CONTRACTS.md 「3」 상태값). JSON 값은 `completed` · `not_planned`. */
public enum TaskClosedReason {
    COMPLETED,
    NOT_PLANNED;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

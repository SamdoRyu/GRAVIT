package com.samdoryu.backend.sync.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** PR 상태(CONTRACTS.md 「3」 상태값). {@code CLOSED}는 머지되지 않고 닫힘. JSON 값은 소문자. */
public enum SubmissionState {
    OPEN,
    DRAFT,
    MERGED,
    CLOSED;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

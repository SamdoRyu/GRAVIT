package com.samdoryu.backend.activity.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** 활동 기록 유형(FR-ACT-01). JSON 값은 소문자 snake. */
public enum ActivityKind {
    PLANNING,
    RESEARCH,
    DESIGN,
    PRESENTATION,
    MENTOR_QUESTION;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

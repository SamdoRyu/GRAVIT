package com.samdoryu.backend.report.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** 회고 리포트 종류(FR-REP-01 · 05). JSON 값은 `final` · `midterm`. */
public enum ReportKind {
    FINAL,
    MIDTERM;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

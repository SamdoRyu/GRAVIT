package com.samdoryu.backend.evaluation.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** PR 평가(P7). JSON 값은 `recommend` · `not_recommend`. */
public enum Verdict {
    RECOMMEND,
    NOT_RECOMMEND;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

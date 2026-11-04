package com.samdoryu.backend.meeting.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** PR 안건 결정(CONTRACTS.md 「3」 · FR-LRN-05). 머지 · 닫기는 기록일 뿐 GitHub에서 한다(P3). JSON 값은 소문자 snake. */
public enum PrDecision {
    REVISE_AND_REEVALUATE,
    MERGE_AS_IS,
    CLOSE_PR;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

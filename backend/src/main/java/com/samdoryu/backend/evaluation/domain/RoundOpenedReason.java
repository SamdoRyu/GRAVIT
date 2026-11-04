package com.samdoryu.backend.evaluation.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** 평가 회차를 연 사유(FR-LRN-06). 회차는 이 세 경우에만 열린다. JSON 값은 소문자 snake. */
public enum RoundOpenedReason {
    /** 동기화로 새 PR이 들어옴 — 1회차. */
    NEW_PR,
    /** 동기화에서 열린 PR의 headSha가 바뀜. */
    NEW_COMMIT,
    /** 회의 결정 revise_and_reevaluate — 그때의 headSha. */
    MEETING_REEVALUATE;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

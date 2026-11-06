package com.samdoryu.backend.activity.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import java.util.Locale;

/**
 * 활동 기록 상태(FR-ACT-02) — 저장하지 않고 확인 행으로 계산한다. 작성자가 아닌 팀원이 1명 이상 확인하면 {@code confirmed}.
 * JSON · 쿼리 값은 소문자 snake.
 */
public enum ActivityStatus {
    PENDING,
    CONFIRMED;

    public static ActivityStatus of(boolean hasConfirmation) {
        return hasConfirmation ? CONFIRMED : PENDING;
    }

    /** {@code ?status=} 값 — 계약 값이 아니면 {@code invalid}. */
    public static ActivityStatus fromQuery(String value) {
        for (ActivityStatus status : values()) {
            if (status.value().equals(value)) {
                return status;
            }
        }
        throw new ApiException(ErrorCode.INVALID, "status는 pending 또는 confirmed예요");
    }

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

package com.samdoryu.backend.sync.domain;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Collection;
import java.util.Locale;

/**
 * 우선순위(CONTRACTS.md 「3」 · P6) — {@code priority:*} 라벨 이름 → 값 대응은 여기 한 곳이다. 라벨이 없으면 중립(null),
 * 여러 개면 가장 높은 값. JSON 값은 소문자.
 */
public enum Priority {
    // 높은 값부터 — fromLabels가 이 순서로 고른다
    HIGH,
    MEDIUM,
    LOW;

    private static final String LABEL_PREFIX = "priority:";

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** @return 라벨 중 가장 높은 우선순위, {@code priority:*} 라벨이 없으면 null */
    public static Priority fromLabels(Collection<String> labels) {
        for (Priority priority : values()) {
            if (labels.contains(LABEL_PREFIX + priority.value())) {
                return priority;
            }
        }
        return null;
    }
}

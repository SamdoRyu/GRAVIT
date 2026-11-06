package com.samdoryu.backend.report.dto;

import com.fasterxml.jackson.annotation.JsonValue;
import com.samdoryu.backend.evaluation.domain.Verdict;
import java.time.Instant;
import java.util.Locale;

/**
 * 학습 타임라인 한 줄 — CONTRACTS_API 「15」 TimelineEntry. 저장하지 않고 읽을 때 계산한다(CONTRACTS.md 「2」).
 *
 * @param verdict {@code evaluation_*}만, 그 밖은 null
 */
public record TimelineEntry(Kind kind, Instant occurredAt, String title, String detail, Verdict verdict, Ref ref) {

    /** CONTRACTS_API 「15」 TimelineKind. JSON 값은 소문자. */
    public enum Kind {
        EVALUATION_RECEIVED,
        EVALUATION_GIVEN,
        AGENDA_RAISED,
        AGENDA_DECIDED,
        INSTRUCTOR_FEEDBACK,
        COMMIT_AFTER_MEETING;

        @JsonValue
        public String value() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    /** @param type {@code submission} · {@code agenda_item} · {@code task} */
    public record Ref(String type, String id) {
    }
}

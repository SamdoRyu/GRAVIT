package com.samdoryu.backend.meeting.dto;

import com.fasterxml.jackson.annotation.JsonValue;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * 스탠드업 "어제 한 일" 미리 채우기 — CONTRACTS_API 「12」 StandupPrefill. {@code date}의 전날(한국 시간) 내 GitHub 활동,
 * occurredAt 오름차순.
 */
public record StandupPrefill(LocalDate date, List<Item> items) {

    /** @param githubNumber 이슈 · PR 번호(커밋은 null) */
    public record Item(Kind kind, String title, Integer githubNumber, Instant occurredAt) {
    }

    public enum Kind {
        COMMIT,
        PR_OPENED,
        PR_MERGED,
        ISSUE_CLOSED,
        REVIEW_SUBMITTED;

        @JsonValue
        public String value() {
            return name().toLowerCase(Locale.ROOT);
        }
    }
}

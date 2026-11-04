package com.samdoryu.backend.realtime;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** SSE {@code change} 이벤트의 자원 종류 — CONTRACTS_API.md 「6」 SnapshotResource. 화면은 받으면 Snapshot을 다시 읽는다. */
public enum SnapshotResource {
    WORKSPACE,
    SETTINGS,
    MEMBERS,
    TASKS,
    SUBMISSIONS,
    REQUIREMENTS,
    AGENDA_ITEMS,
    MEETINGS,
    HELP_REQUESTS,
    ACTIVITIES,
    STANDUPS,
    INSTRUCTORS;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}

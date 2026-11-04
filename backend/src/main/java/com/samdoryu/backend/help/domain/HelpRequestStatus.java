package com.samdoryu.backend.help.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Duration;
import java.time.Instant;

/** 도움 요청 상태 — CONTRACTS 「3」 상태값, CONTRACTS_API 「11」. */
public enum HelpRequestStatus {
    @JsonProperty("open") OPEN,
    @JsonProperty("discussing") DISCUSSING,
    @JsonProperty("resolved") RESOLVED,
    @JsonProperty("on_agenda") ON_AGENDA,
    @JsonProperty("ended") ENDED;

    /** 만든 지 이만큼 지난 미해결 도움 요청은 안건 후보다 (FR-LRN-18). */
    public static final Duration AGENDA_CANDIDATE_AFTER = Duration.ofHours(48);

    /** 아직 해결 · 전환되지 않은 상태 — 닫기 · 안건 전환 · 안건 후보가 이 상태에서만 된다. */
    public boolean isOpenForDiscussion() {
        return this == OPEN || this == DISCUSSING;
    }

    /** 코멘트를 받는 상태 — `resolved` · `ended`면 `409 conflict` (FR-LRN-16). */
    public boolean acceptsComments() {
        return this != RESOLVED && this != ENDED;
    }

    /** 코멘트 뒤 상태 — 요청자가 아닌 팀원의 첫 코멘트면 `open` → `discussing`. 요청자 코멘트 · 강사 답변은 그대로. */
    public HelpRequestStatus afterComment(boolean byRequester, boolean instructorAnswer) {
        return this == OPEN && !byRequester && !instructorAnswer ? DISCUSSING : this;
    }

    /** 저장하지 않는 계산 값 `isAgendaCandidate` — 미해결이고 만든 지 48시간이 지남. */
    public boolean isAgendaCandidate(Instant createdAt, Instant now) {
        return isOpenForDiscussion() && !now.isBefore(createdAt.plus(AGENDA_CANDIDATE_AFTER));
    }
}

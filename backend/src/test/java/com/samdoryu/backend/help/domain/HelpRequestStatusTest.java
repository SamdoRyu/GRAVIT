package com.samdoryu.backend.help.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class HelpRequestStatusTest {

    private static final Instant CREATED_AT = Instant.parse("2026-11-05T01:20:00Z");

    @Test
    void openAndDiscussingAreOpenForDiscussion() {
        assertThat(HelpRequestStatus.OPEN.isOpenForDiscussion()).isTrue();
        assertThat(HelpRequestStatus.DISCUSSING.isOpenForDiscussion()).isTrue();
        assertThat(HelpRequestStatus.RESOLVED.isOpenForDiscussion()).isFalse();
        assertThat(HelpRequestStatus.ON_AGENDA.isOpenForDiscussion()).isFalse();
        assertThat(HelpRequestStatus.ENDED.isOpenForDiscussion()).isFalse();
    }

    @ParameterizedTest
    @EnumSource(names = {"OPEN", "DISCUSSING"})
    void unresolvedBecomesCandidateExactlyAt48Hours(HelpRequestStatus status) {
        Instant at48h = CREATED_AT.plus(Duration.ofHours(48));

        assertThat(status.isAgendaCandidate(CREATED_AT, at48h.minusSeconds(1))).isFalse();
        assertThat(status.isAgendaCandidate(CREATED_AT, at48h)).isTrue();
        assertThat(status.isAgendaCandidate(CREATED_AT, at48h.plusSeconds(1))).isTrue();
    }

    @ParameterizedTest
    @EnumSource(names = {"RESOLVED", "ON_AGENDA", "ENDED"})
    void closedOrConvertedIsNeverCandidate(HelpRequestStatus status) {
        assertThat(status.isAgendaCandidate(CREATED_AT, CREATED_AT.plus(Duration.ofDays(30)))).isFalse();
    }
}

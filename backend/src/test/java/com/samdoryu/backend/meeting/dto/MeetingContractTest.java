package com.samdoryu.backend.meeting.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.meeting.domain.AgendaKind;
import com.samdoryu.backend.meeting.domain.AgendaStatus;
import com.samdoryu.backend.meeting.domain.PrDecision;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — contract/examples/meeting 예시 ↔ Java DTO (CONTRACTS 「9」).
 * 실제 HTTP 응답 ↔ 예시(②)는 {@code AgendaItemIntegrationTest}.
 */
class MeetingContractTest {

    private static final Path EXAMPLES = Path.of("..", "contract", "examples", "meeting");

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void agendaItemCreateRequestExampleRoundTrips() throws IOException {
        assertRoundTrip("agenda-item-create-request.json", AgendaItemCreateRequest.class);
    }

    @Test
    void agendaItemExampleRoundTrips() throws IOException {
        assertRoundTrip("agenda-item.json", AgendaItemDto.class);
    }

    @Test
    void meetingExampleRoundTrips() throws IOException {
        assertRoundTrip("meeting.json", MeetingDto.class);
    }

    @Test
    void enumsUseContractJsonValues() {
        assertThat(MAPPER.writeValueAsString(AgendaKind.values()))
                .isEqualTo("[\"issue\",\"pr\",\"help_request\",\"learning\",\"other\"]");
        assertThat(MAPPER.writeValueAsString(AgendaStatus.values()))
                .isEqualTo("[\"confirmed\",\"discussed\",\"withdrawn\"]");
        assertThat(MAPPER.writeValueAsString(PrDecision.values()))
                .isEqualTo("[\"revise_and_reevaluate\",\"merge_as_is\",\"close_pr\"]");
    }

    @Test
    void titleMustBe1To100CharsAndBackgroundAtMost2000() {
        assertThat(VALIDATOR.validate(create(null, null))).hasSize(1);
        assertThat(VALIDATOR.validate(create("", null))).hasSize(1);
        assertThat(VALIDATOR.validate(create("a".repeat(101), null))).hasSize(1);
        assertThat(VALIDATOR.validate(create("a", "a".repeat(2001)))).hasSize(1);
        assertThat(VALIDATOR.validate(create("a", null))).isEmpty();
        assertThat(VALIDATOR.validate(create("a".repeat(100), "a".repeat(2000)))).isEmpty();
    }

    @Test
    void kindIsRequired() {
        assertThat(VALIDATOR.validate(new AgendaItemCreateRequest(null, null, "a", null, null, null))).hasSize(1);
    }

    @Test
    void meetingStartNeedsAttendeeListThatMayBeEmpty() {
        assertThat(VALIDATOR.validate(new MeetingStartRequest(null))).hasSize(1);
        assertThat(VALIDATOR.validate(new MeetingStartRequest(Arrays.asList("2", null)))).hasSize(1);
        assertThat(VALIDATOR.validate(new MeetingStartRequest(List.of()))).isEmpty();
        assertThat(VALIDATOR.validate(new MeetingStartRequest(List.of("2", "3")))).isEmpty();
    }

    @Test
    void meetingNotesAreOptionalUpTo5000Chars() {
        assertThat(VALIDATOR.validate(new MeetingEndRequest(null))).isEmpty();
        assertThat(VALIDATOR.validate(new MeetingEndRequest(""))).isEmpty();
        assertThat(VALIDATOR.validate(new MeetingEndRequest("a".repeat(5000)))).isEmpty();
        assertThat(VALIDATOR.validate(new MeetingEndRequest("a".repeat(5001)))).hasSize(1);
    }

    @Test
    void decisionNeedsConclusion1To2000AndLearningAtMost2000() {
        assertThat(VALIDATOR.validate(decision(null, null))).hasSize(1);
        assertThat(VALIDATOR.validate(decision("", null))).hasSize(1);
        assertThat(VALIDATOR.validate(decision("a".repeat(2001), null))).hasSize(1);
        assertThat(VALIDATOR.validate(decision("a", "a".repeat(2001)))).hasSize(1);
        assertThat(VALIDATOR.validate(decision("a", null))).isEmpty();
        assertThat(VALIDATOR.validate(decision("a".repeat(2000), "a".repeat(2000)))).isEmpty();
    }

    private static DecisionRequest decision(String conclusion, String learning) {
        return new DecisionRequest(conclusion, learning, null, null, null, null);
    }

    private static AgendaItemCreateRequest create(String title, String background) {
        return new AgendaItemCreateRequest(AgendaKind.OTHER, null, title, background, null, null);
    }

    private static void assertRoundTrip(String file, Class<?> dto) throws IOException {
        JsonNode example = MAPPER.readTree(Files.readString(EXAMPLES.resolve(file)));
        Object value = MAPPER.treeToValue(example, dto);
        assertThat((JsonNode) MAPPER.valueToTree(value)).isEqualTo(example);
    }
}

package com.samdoryu.backend.help.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.help.domain.HelpRequestStatus;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — contract/examples/help 예시 ↔ Java DTO (CONTRACTS 「9」).
 * 실제 HTTP 응답 ↔ 예시(②)는 {@code HelpRequestIntegrationTest}.
 */
class HelpRequestContractTest {

    private static final Path EXAMPLES = Path.of("..", "contract", "examples", "help");

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void createRequestExampleRoundTrips() throws IOException {
        assertRoundTrip("help-request-create-request.json", HelpRequestCreateRequest.class);
    }

    @Test
    void summaryExampleRoundTrips() throws IOException {
        assertRoundTrip("help-request-summary.json", HelpRequestSummary.class);
    }

    @Test
    void detailExampleRoundTrips() throws IOException {
        assertRoundTrip("help-request-detail.json", HelpRequestDetail.class);
    }

    @Test
    void statusUsesContractJsonValues() {
        assertThat(MAPPER.writeValueAsString(HelpRequestStatus.values()))
                .isEqualTo("[\"open\",\"discussing\",\"resolved\",\"on_agenda\",\"ended\"]");
    }

    @Test
    void contentMustBe1To2000Chars() {
        assertThat(VALIDATOR.validate(new HelpRequestCreateRequest(null, null))).hasSize(1);
        assertThat(VALIDATOR.validate(new HelpRequestCreateRequest("", null))).hasSize(1);
        assertThat(VALIDATOR.validate(new HelpRequestCreateRequest("a".repeat(2001), null))).hasSize(1);
        assertThat(VALIDATOR.validate(new HelpRequestCreateRequest("a", null))).isEmpty();
        assertThat(VALIDATOR.validate(new HelpRequestCreateRequest("a".repeat(2000), "3"))).isEmpty();
    }

    private static void assertRoundTrip(String file, Class<?> dto) throws IOException {
        JsonNode example = MAPPER.readTree(Files.readString(EXAMPLES.resolve(file)));
        Object value = MAPPER.treeToValue(example, dto);
        assertThat((JsonNode) MAPPER.valueToTree(value)).isEqualTo(example);
    }
}

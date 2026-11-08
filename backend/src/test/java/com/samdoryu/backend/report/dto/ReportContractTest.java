package com.samdoryu.backend.report.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.report.domain.ReportKind;
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
 * 계약 테스트 ① — contract/examples/report 예시 ↔ Java DTO (CONTRACTS 「9」).
 * 실제 HTTP 응답 ↔ 예시(②)는 {@code RetroReportIntegrationTest}.
 */
class ReportContractTest {

    private static final Path EXAMPLES = Path.of("..", "contract", "examples", "report");

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void retroReportExampleRoundTrips() throws IOException {
        JsonNode example = MAPPER.readTree(Files.readString(EXAMPLES.resolve("retro-report.json")));
        Object value = MAPPER.treeToValue(example, RetroReportDto.class);
        assertThat((JsonNode) MAPPER.valueToTree(value)).isEqualTo(example);
    }

    @Test
    void retroReportSummaryExampleRoundTrips() throws IOException {
        JsonNode example = MAPPER.readTree(Files.readString(EXAMPLES.resolve("retro-report-summary.json")));
        Object value = MAPPER.treeToValue(example, RetroReportSummary.class);
        assertThat((JsonNode) MAPPER.valueToTree(value)).isEqualTo(example);
    }

    @Test
    void reportKindUsesContractJsonValues() {
        assertThat(MAPPER.writeValueAsString(ReportKind.values())).isEqualTo("[\"final\",\"midterm\"]");
        assertThat(MAPPER.readValue("{\"kind\":\"midterm\"}", ReportCreateRequest.class).kind())
                .isEqualTo(ReportKind.MIDTERM);
    }

    @Test
    void learningIsRequiredUpTo5000CharsAndMayBeEmpty() {
        assertThat(VALIDATOR.validate(new ReportLearningRequest(null))).hasSize(1);
        assertThat(VALIDATOR.validate(new ReportLearningRequest("a".repeat(5001)))).hasSize(1);
        assertThat(VALIDATOR.validate(new ReportLearningRequest(""))).isEmpty();
        assertThat(VALIDATOR.validate(new ReportLearningRequest("a".repeat(5000)))).isEmpty();
    }

    @Test
    void kindIsRequired() {
        assertThat(VALIDATOR.validate(new ReportCreateRequest(null))).hasSize(1);
        assertThat(VALIDATOR.validate(new ReportCreateRequest(ReportKind.FINAL))).isEmpty();
    }
}

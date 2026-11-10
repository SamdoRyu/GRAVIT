package com.samdoryu.backend.report.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.report.domain.ReportKind;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
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
        assertThat(MAPPER.readValue(CREATE_BODY.replace("\"final\"", "\"midterm\""), ReportCreateRequest.class)
                .kind()).isEqualTo(ReportKind.MIDTERM);
    }

    /** 계약 「15」 RetroReportCreateRequest(#335) — 예시 JSON이 없어 TS 인터페이스를 옮겼다. */
    static final String CREATE_BODY = "{\"kind\":\"final\",\"title\":\"1차 스프린트 회고\","
            + "\"learning\":\"계약을 먼저 맞추면 덜 고친다\",\"decisionCardIds\":[\"8\"]}";

    @Test
    void createRequestRoundTripsThroughDto() {
        ReportCreateRequest request = MAPPER.readValue(CREATE_BODY, ReportCreateRequest.class);

        assertThat(MAPPER.<JsonNode>valueToTree(request)).isEqualTo(MAPPER.readTree(CREATE_BODY));
        assertThat(VALIDATOR.validate(request)).isEmpty();
    }

    @Test
    void createRequestNeedsKindTitleLearningAndCardList() {
        String max100 = "a".repeat(100);
        String max5000 = "a".repeat(5000);
        assertThat(VALIDATOR.validate(new ReportCreateRequest(ReportKind.FINAL, max100, max5000, List.of()))).isEmpty();
        assertThat(VALIDATOR.validate(new ReportCreateRequest(null, "t", "l", List.of()))).hasSize(1);
        for (String title : new String[] {null, "", "   ", "a".repeat(101)}) {
            assertThat(VALIDATOR.validate(new ReportCreateRequest(ReportKind.FINAL, title, "l", List.of())))
                    .as("제목 %s", title).hasSize(1);
        }
        for (String learning : new String[] {null, "", "   ", "a".repeat(5001)}) {
            assertThat(VALIDATOR.validate(new ReportCreateRequest(ReportKind.FINAL, "t", learning, List.of())))
                    .as("느낀 점").hasSize(1);
        }
        assertThat(VALIDATOR.validate(new ReportCreateRequest(ReportKind.FINAL, "t", "l", null))).hasSize(1);
        assertThat(VALIDATOR.validate(new ReportCreateRequest(ReportKind.FINAL, "t", "l",
                java.util.Arrays.asList("8", null)))).hasSize(1);
    }

    @Test
    void learningIsRequired1To5000Chars() {
        assertThat(VALIDATOR.validate(new ReportLearningRequest(null))).hasSize(1);
        assertThat(VALIDATOR.validate(new ReportLearningRequest(""))).hasSize(1);
        assertThat(VALIDATOR.validate(new ReportLearningRequest("  "))).hasSize(1);
        assertThat(VALIDATOR.validate(new ReportLearningRequest("a".repeat(5001)))).hasSize(1);
        assertThat(VALIDATOR.validate(new ReportLearningRequest("a".repeat(5000)))).isEmpty();
    }
}

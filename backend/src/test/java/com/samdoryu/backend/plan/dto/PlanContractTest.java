package com.samdoryu.backend.plan.dto;

import static org.assertj.core.api.Assertions.assertThat;

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
 * 계약 테스트 ① — contract/examples/plan 예시 ↔ Java DTO (CONTRACTS 「9」).
 * 실제 HTTP 응답 ↔ 예시(②)는 {@code TaskDueDateIntegrationTest}.
 */
class PlanContractTest {

    private static final Path EXAMPLES = Path.of("..", "contract", "examples", "plan");

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void taskDueDateExampleRoundTrips() throws IOException {
        JsonNode example = MAPPER.readTree(Files.readString(EXAMPLES.resolve("task-due-date.json")));
        Object value = MAPPER.treeToValue(example, TaskDueDateDto.class);
        assertThat((JsonNode) MAPPER.valueToTree(value)).isEqualTo(example);
    }

    @Test
    void dueDateIsRequired() {
        assertThat(VALIDATOR.validate(new TaskDueDateRequest(null))).hasSize(1);
    }
}

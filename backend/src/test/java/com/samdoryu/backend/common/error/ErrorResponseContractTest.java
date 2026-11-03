package com.samdoryu.backend.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 계약 테스트 ① — contract/examples/common/error-response.json ↔ {@link ErrorResponse} (CONTRACTS.md 「9」). */
class ErrorResponseContractTest {

    private static final Path EXAMPLE = Path.of("..", "contract", "examples", "common", "error-response.json");

    private final JsonMapper jsonMapper = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    @Test
    void exampleRoundTripsThroughDto() throws Exception {
        String json = Files.readString(EXAMPLE);

        ErrorResponse dto = jsonMapper.readValue(json, ErrorResponse.class);
        JsonNode reserialized = jsonMapper.valueToTree(dto);

        assertThat(reserialized).isEqualTo(jsonMapper.readTree(json));
        assertThat(dto.error().code()).isEqualTo(ErrorCode.FORBIDDEN_ROLE.code());
    }
}

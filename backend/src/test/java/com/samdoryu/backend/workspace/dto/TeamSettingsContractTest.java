package com.samdoryu.backend.workspace.dto;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — {@code PUT W/settings}의 요청 · 응답은 같은 TeamSettings 모양이다(CONTRACTS_API 「7」). 예시는
 * contract/examples/workspace/workspace-snapshot.json의 {@code settings}. 실제 응답 ↔ 예시(②)는 {@code TeamSettingsIntegrationTest}.
 */
class TeamSettingsContractTest {

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    private static final LocalDate START = LocalDate.parse("2026-11-04");
    private static final LocalDate END = LocalDate.parse("2026-11-17");

    private static JsonNode settingsExample() throws IOException {
        return MAPPER.readTree(Files.readString(Path.of("..", "contract", "examples", "workspace",
                "workspace-snapshot.json"))).get("settings");
    }

    @Test
    void theSettingsExampleRoundTripsAsBothRequestAndResponse() throws IOException {
        JsonNode example = settingsExample();
        assertThat((JsonNode) MAPPER.valueToTree(MAPPER.treeToValue(example, TeamSettingsUpdateRequest.class)))
                .isEqualTo(example);
        assertThat((JsonNode) MAPPER.valueToTree(MAPPER.treeToValue(example, TeamSettingsDto.class)))
                .isEqualTo(example);
    }

    @Test
    void hoursAre1To720AndTheSpecPathIs1To300OrNull() {
        assertThat(VALIDATOR.validate(request("docs/a.md", 1, 720))).isEmpty();
        assertThat(VALIDATOR.validate(request(null, 48, 48))).isEmpty();
        assertThat(VALIDATOR.validate(request("a".repeat(300), 48, 48))).isEmpty();
        assertThat(VALIDATOR.validate(request("", 48, 48))).hasSize(1);
        assertThat(VALIDATOR.validate(request("a".repeat(301), 48, 48))).hasSize(1);
        assertThat(VALIDATOR.validate(request(null, 0, 48))).hasSize(1);
        assertThat(VALIDATOR.validate(request(null, 48, 721))).hasSize(1);
        assertThat(VALIDATOR.validate(new TeamSettingsUpdateRequest(null, null, null, null, null))).hasSize(4);
    }

    private static TeamSettingsUpdateRequest request(String specPath, int reviewWaitHours, int noCommitHours) {
        return new TeamSettingsUpdateRequest(START, END, specPath, reviewWaitHours, noCommitHours);
    }
}

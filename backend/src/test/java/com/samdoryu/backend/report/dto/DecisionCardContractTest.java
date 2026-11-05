package com.samdoryu.backend.report.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.common.contract.ContractShape;
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
 * 계약 테스트 ① — CONTRACTS_API 「15」 기술 결정 카드 ↔ Java DTO. 응답은 {@code contract/examples/report/retro-report.json}의
 * {@code decisionCards[0]}, 요청은 계약 문서의 모양. 실제 HTTP 응답(②)은 {@code DecisionCardIntegrationTest}.
 */
class DecisionCardContractTest {

    private static final Path RETRO_REPORT = Path.of("..", "contract", "examples", "report", "retro-report.json");

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    static final String CONTRACT_UPDATE = "{\"cells\":{\"goal\":\"로그인 실패를 계약 모양으로\",\"initialApproach\":null,"
            + "\"feedbackReceived\":\"비추천: 실패 응답 모양이 달라요\",\"meetingDecision\":null,\"finalChange\":null,"
            + "\"rationale\":null,\"blockedMoment\":null,\"learning\":\"에러 응답은 한 곳에서\",\"source\":null},"
            + "\"confirmed\":true}";

    static JsonNode exampleCard() throws IOException {
        return MAPPER.readTree(Files.readString(RETRO_REPORT)).get("decisionCards").get(0);
    }

    @Test
    void cardExampleRoundTripsThroughDto() throws IOException {
        JsonNode example = exampleCard();

        DecisionCardDto card = MAPPER.treeToValue(example, DecisionCardDto.class);

        assertThat(MAPPER.<JsonNode>valueToTree(card)).isEqualTo(example);
        ContractShape.assertCommonRules(MAPPER.valueToTree(card));
    }

    @Test
    void createRequestIsASubmissionId() {
        DecisionCardCreateRequest request = MAPPER.readValue("{\"submissionId\":\"9\"}", DecisionCardCreateRequest.class);

        assertThat(request.submissionId()).isEqualTo("9");
        assertThat(VALIDATOR.validate(request)).isEmpty();
        assertThat(VALIDATOR.validate(new DecisionCardCreateRequest(null))).hasSize(1);
    }

    @Test
    void updateRequestRoundTripsThroughDto() {
        JsonNode contract = ContractShape.readTree(CONTRACT_UPDATE);

        DecisionCardUpdateRequest request = MAPPER.treeToValue(contract, DecisionCardUpdateRequest.class);

        assertThat(MAPPER.<JsonNode>valueToTree(request)).isEqualTo(contract);
        assertThat(VALIDATOR.validate(request)).isEmpty();
        assertThat(request.cells().toCells().learning()).isEqualTo("에러 응답은 한 곳에서");
    }

    @Test
    void eachCellIsUpTo2000CharsAndCellsAndConfirmedAreRequired() {
        String max = "a".repeat(2000);
        String over = "a".repeat(2001);
        DecisionCardUpdateRequest.Cells longest = new DecisionCardUpdateRequest.Cells(max, max, max, max, max, max, max,
                max, max);
        assertThat(VALIDATOR.validate(new DecisionCardUpdateRequest(longest, true))).isEmpty();
        assertThat(VALIDATOR.validate(new DecisionCardUpdateRequest(new DecisionCardUpdateRequest.Cells(
                null, null, null, null, null, null, null, null, null), false))).isEmpty();

        // 9칸 어느 것이든 2001자면 실패
        for (int i = 0; i < 9; i++) {
            String[] values = new String[9];
            values[i] = over;
            DecisionCardUpdateRequest.Cells cells = new DecisionCardUpdateRequest.Cells(values[0], values[1], values[2],
                    values[3], values[4], values[5], values[6], values[7], values[8]);
            assertThat(VALIDATOR.validate(new DecisionCardUpdateRequest(cells, false))).as("칸 %d", i).hasSize(1);
        }

        assertThat(VALIDATOR.validate(new DecisionCardUpdateRequest(null, false))).hasSize(1);
        assertThat(VALIDATOR.validate(new DecisionCardUpdateRequest(longest, null))).hasSize(1);
    }
}

package com.samdoryu.backend.evaluation.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.domain.Verdict;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — 평가 예시 ↔ Java DTO(CONTRACTS.md 「9」). {@code EvaluationRoundDto} 예시는 Snapshot 예시의
 * {@code submissions[0].currentRound}다. 실제 HTTP 응답 ↔ 예시(②)는 {@code EvaluationIntegrationTest}.
 */
class EvaluationContractTest {

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void evaluateRequestExampleRoundTrips() {
        JsonNode example = ContractShape.readExample("evaluation", "evaluate-request.json");

        EvaluateRequest request = MAPPER.treeToValue(example, EvaluateRequest.class);

        assertThat(MAPPER.<JsonNode>valueToTree(request)).isEqualTo(example);
        assertThat(VALIDATOR.validate(request)).isEmpty();
        assertThat(request.verdict()).isEqualTo(Verdict.NOT_RECOMMEND);
    }

    @Test
    void evaluationRoundExampleRoundTrips() {
        JsonNode example = ContractShape.readExample("workspace", "workspace-snapshot.json")
                .get("submissions").get(0).get("currentRound");

        EvaluationRoundDto round = MAPPER.treeToValue(example, EvaluationRoundDto.class);

        assertThat(MAPPER.<JsonNode>valueToTree(round)).isEqualTo(example);
        ContractShape.assertCommonRules(MAPPER.valueToTree(round));
    }

    @Test
    void enumsUseContractJsonValues() {
        assertThat(MAPPER.writeValueAsString(Verdict.values())).isEqualTo("[\"recommend\",\"not_recommend\"]");
        assertThat(MAPPER.writeValueAsString(RoundOpenedReason.values()))
                .isEqualTo("[\"new_pr\",\"new_commit\",\"meeting_reevaluate\"]");
    }
}

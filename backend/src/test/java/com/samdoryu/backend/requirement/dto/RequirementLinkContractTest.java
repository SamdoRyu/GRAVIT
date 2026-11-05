package com.samdoryu.backend.requirement.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.common.contract.ContractShape;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — CONTRACTS_API 「8」 연결 요청 모양 · Snapshot 예시의 {@code requirementLinks[0]} ↔ Java DTO.
 * 요청은 계약 문서에 예시 JSON이 없어(TS 모양 {@code { requirementId: Id; taskId: Id }}만 있음) 그 모양을 그대로 쓴다.
 * 실제 HTTP 응답 ↔ 예시(②)는 {@code RequirementLinkIntegrationTest}.
 */
class RequirementLinkContractTest {

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .build();

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void createRequestHasExactlyTheContractFields() {
        JsonNode body = ContractShape.readTree("{\"requirementId\":\"5\",\"taskId\":\"41\"}");

        RequirementLinkCreateRequest request = MAPPER.treeToValue(body, RequirementLinkCreateRequest.class);

        assertThat(MAPPER.<JsonNode>valueToTree(request)).isEqualTo(body);
        assertThat(VALIDATOR.validate(request)).isEmpty();
        assertThat(VALIDATOR.validate(new RequirementLinkCreateRequest(null, "41"))).isNotEmpty();
    }

    @Test
    void linkExampleRoundTripsThroughDto() {
        JsonNode example = ContractShape.readExample("workspace", "workspace-snapshot.json")
                .get("requirementLinks").get(0);

        RequirementLinkDto link = MAPPER.treeToValue(example, RequirementLinkDto.class);

        assertThat(MAPPER.<JsonNode>valueToTree(link)).isEqualTo(example);
        ContractShape.assertCommonRules(MAPPER.valueToTree(link));
    }
}

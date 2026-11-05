package com.samdoryu.backend.instructor.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.common.contract.ContractShape;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — contract/examples/instructor/*.json ↔ Java DTO(CONTRACTS_API 「7」 · CONTRACTS.md 「9」).
 * 실제 HTTP 응답 ↔ 예시(②)는 {@code InstructorApiIntegrationTest}.
 */
class InstructorContractTest {

    // 모르는 필드 · 빠진 필드 · 원시 타입 null 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    @Test
    void assignmentExampleRoundTripsThroughDto() {
        JsonNode example = ContractShape.readExample("instructor", "instructor-assignment.json");

        InstructorAssignmentDto dto = MAPPER.treeToValue(example, InstructorAssignmentDto.class);
        JsonNode reserialized = MAPPER.valueToTree(dto);

        assertThat(reserialized).isEqualTo(example);
        ContractShape.assertCommonRules(reserialized);
    }

    @Test
    void candidateExampleRoundTripsThroughDto() {
        JsonNode example = ContractShape.readExample("instructor", "instructor-candidate.json");

        InstructorCandidateDto dto = MAPPER.treeToValue(example, InstructorCandidateDto.class);
        JsonNode reserialized = MAPPER.valueToTree(dto);

        assertThat(reserialized).isEqualTo(example);
        ContractShape.assertCommonRules(reserialized);
    }
}

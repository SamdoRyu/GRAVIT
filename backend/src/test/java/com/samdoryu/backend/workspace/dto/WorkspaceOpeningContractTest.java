package com.samdoryu.backend.workspace.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.common.contract.ContractShape;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — CONTRACTS_API 「3」 레포 고르기 · 사무실 열기 예시 ↔ Java DTO
 * ({@code contract/examples/workspace/repository-choice-response.json} · {@code open-workspace-request.json}).
 */
class WorkspaceOpeningContractTest {

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void repositoryChoiceExampleRoundTrips() {
        JsonNode example = ContractShape.readExample("workspace", "repository-choice-response.json");

        RepositoryChoiceResponse response = MAPPER.treeToValue(example, RepositoryChoiceResponse.class);
        JsonNode reserialized = MAPPER.valueToTree(response);

        assertThat(reserialized).isEqualTo(example);
        ContractShape.assertCommonRules(reserialized);
    }

    @Test
    void openWorkspaceRequestExampleRoundTrips() {
        JsonNode example = ContractShape.readExample("workspace", "open-workspace-request.json");

        OpenWorkspaceRequest request = MAPPER.treeToValue(example, OpenWorkspaceRequest.class);

        assertThat(MAPPER.<JsonNode>valueToTree(request)).isEqualTo(example);
        assertThat(VALIDATOR.validate(request)).isEmpty();
    }
}

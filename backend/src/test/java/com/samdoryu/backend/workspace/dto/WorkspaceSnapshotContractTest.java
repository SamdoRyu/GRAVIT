package com.samdoryu.backend.workspace.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.common.contract.ContractShape;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — contract/examples/workspace/workspace-snapshot.json 전체 ↔ {@link WorkspaceSnapshot}(CONTRACTS.md 「9」).
 * 아직 채우지 않는 조각(tasks · submissions · requirements …)의 DTO 모양도 여기서 계약과 맞춘다.
 */
class WorkspaceSnapshotContractTest {

    // 모르는 필드 · 빠진 필드 모두 실패
    private final JsonMapper jsonMapper = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    @Test
    void snapshotExampleRoundTripsThroughDto() {
        JsonNode example = ContractShape.readExample("workspace", "workspace-snapshot.json");

        WorkspaceSnapshot dto = jsonMapper.treeToValue(example, WorkspaceSnapshot.class);
        JsonNode reserialized = jsonMapper.valueToTree(dto);

        assertThat(reserialized).isEqualTo(example);
        ContractShape.assertCommonRules(reserialized);
    }
}

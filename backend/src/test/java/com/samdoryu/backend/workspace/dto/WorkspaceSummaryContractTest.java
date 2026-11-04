package com.samdoryu.backend.workspace.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — contract/examples/workspace/workspace-snapshot.json의 {@code workspace} ↔ {@link WorkspaceSummary}
 * (CONTRACTS.md 「9」). {@code POST /api/workspaces} 응답과 {@code GET /api/workspaces} 한 줄의 바탕이다.
 */
class WorkspaceSummaryContractTest {

    private final JsonMapper jsonMapper = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    @Test
    void snapshotExampleWorkspaceRoundTripsThroughDto() {
        JsonNode example = ContractShape.readExample("workspace", "workspace-snapshot.json").get("workspace");

        WorkspaceSummary dto = jsonMapper.treeToValue(example, WorkspaceSummary.class);
        JsonNode reserialized = jsonMapper.valueToTree(dto);

        assertThat(reserialized).isEqualTo(example);
        assertThat(dto.kind()).isEqualTo(WorkspaceKind.GITHUB);
        ContractShape.assertCommonRules(reserialized);
    }
}

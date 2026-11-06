package com.samdoryu.backend.workspace.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.common.contract.ContractShape;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * 계약 테스트 ① — CONTRACTS_API 「3」 {@code WorkspaceListItem}(= {@code WorkspaceSummary} + {@code myRole}) ↔ Java DTO.
 * 예시는 {@code contract/examples/workspace/workspace-list-item.json}이고, 역할마다 {@code myRole}만 바꿔 본다.
 * 실제 {@code GET /api/workspaces} 응답(②)은 {@code InstructorWorkspacesIntegrationTest}.
 */
class WorkspaceListItemContractTest {

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .build();

    static JsonNode example(String myRole) {
        ObjectNode item = (ObjectNode) ContractShape.readExample("workspace", "workspace-list-item.json");
        item.put("myRole", myRole);
        return item;
    }

    /** 계약 「1」 WorkspaceRole 세 값 모두 — 강사는 {@code instructor}로 나간다(FR-AUTH-07). */
    @ParameterizedTest
    @EnumSource(WorkspaceRole.class)
    void listItemRoundTripsThroughDtoForEveryRole(WorkspaceRole role) {
        JsonNode example = example(role.value());

        WorkspaceListItem item = MAPPER.treeToValue(example, WorkspaceListItem.class);
        JsonNode reserialized = MAPPER.valueToTree(item);

        assertThat(item.myRole()).isEqualTo(role);
        assertThat(reserialized).isEqualTo(example);
        ContractShape.assertCommonRules(reserialized);
    }

    /** {@code of}가 WorkspaceSummary의 필드를 하나도 빠뜨리지 않는다. */
    @ParameterizedTest
    @EnumSource(WorkspaceRole.class)
    void ofKeepsEverySummaryField(WorkspaceRole role) {
        JsonNode summaryJson = ContractShape.readExample("workspace", "workspace-snapshot.json").get("workspace");
        WorkspaceSummary summary = MAPPER.treeToValue(summaryJson, WorkspaceSummary.class);

        assertThat(MAPPER.<JsonNode>valueToTree(WorkspaceListItem.of(summary, role))).isEqualTo(example(role.value()));
    }
}

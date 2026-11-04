package com.samdoryu.backend.sync.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.common.contract.ContractShape;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — contract/examples/workspace/workspace-snapshot.json의 {@code sync} ↔ {@link SyncStatus}
 * (CONTRACTS.md 「9」). 같은 모양이 {@code GET W/sync-status} · {@code POST W/sync} 응답과 SSE {@code sync} 이벤트에 쓰인다.
 */
class SyncStatusContractTest {

    private final JsonMapper jsonMapper = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    @Test
    void snapshotExampleSyncRoundTripsThroughDto() {
        JsonNode example = ContractShape.readExample("workspace", "workspace-snapshot.json").get("sync");

        SyncStatus dto = jsonMapper.treeToValue(example, SyncStatus.class);
        JsonNode reserialized = jsonMapper.valueToTree(dto);

        assertThat(reserialized).isEqualTo(example);
        assertThat(dto.state()).isEqualTo(SyncStatus.IDLE);
        ContractShape.assertCommonRules(reserialized);
    }
}

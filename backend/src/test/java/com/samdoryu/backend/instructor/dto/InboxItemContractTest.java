package com.samdoryu.backend.instructor.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samdoryu.backend.common.contract.ContractShape;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * 계약 테스트 ① — contract/examples/instructor/inbox-item.json ↔ Java DTO(CONTRACTS_API 「16」 · CONTRACTS.md 「9」).
 * 실제 {@code GET /api/instructor/inbox} 응답(②)은 {@code InstructorInboxIntegrationTest}.
 */
class InboxItemContractTest {

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .build();

    private static ObjectNode example() {
        return (ObjectNode) ContractShape.readExample("instructor", "inbox-item.json").deepCopy();
    }

    @Test
    void exampleRoundTripsThroughDto() {
        JsonNode example = ContractShape.readExample("instructor", "inbox-item.json");

        InboxItem item = MAPPER.treeToValue(example, InboxItem.class);

        assertThat(item.kind()).isEqualTo(InboxItem.Kind.HELP_REQUEST);
        assertThat(item.answeredAt()).isNotNull();
        assertThat(MAPPER.<JsonNode>valueToTree(item)).isEqualTo(example);
        ContractShape.assertCommonRules(example);
    }

    @Test
    void unansweredItemKeepsAnsweredAtAsNull() {
        ObjectNode contract = example();
        contract.putNull("answeredAt");

        InboxItem item = MAPPER.treeToValue(contract, InboxItem.class);

        assertThat(item.answeredAt()).isNull();
        assertThat(MAPPER.<JsonNode>valueToTree(item)).isEqualTo(contract);
        ContractShape.assertCommonRules(contract);
    }

    /** 계약의 kind 세 값 — Java 이름(대문자)이 새어 나가지 않는다. */
    @ParameterizedTest
    @EnumSource(InboxItem.Kind.class)
    void everyKindIsTheContractValue(InboxItem.Kind kind) {
        ObjectNode contract = example();
        contract.put("kind", kind.value());

        InboxItem item = MAPPER.treeToValue(contract, InboxItem.class);

        assertThat(item.kind()).isEqualTo(kind);
        assertThat(MAPPER.<JsonNode>valueToTree(item)).isEqualTo(contract);
        assertThat(kind.value()).isIn("help_request", "decision_feedback", "follow_up_question");
    }

    @Test
    void unknownKindIsRejected() {
        ObjectNode contract = example();
        contract.put("kind", "HELP_REQUEST");

        assertThatThrownBy(() -> MAPPER.treeToValue(contract, InboxItem.class)).isInstanceOf(Exception.class);
    }
}

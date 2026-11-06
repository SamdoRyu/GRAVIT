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

/**
 * 계약 테스트 ① — CONTRACTS_API 「16」 InboxItem ↔ Java DTO. 계약 문서에 JSON 예시가 없어 TS 인터페이스를 옮겼다.
 * 실제 {@code GET /api/instructor/inbox} 응답(②)은 {@code InstructorInboxIntegrationTest}.
 */
class InboxItemContractTest {

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .build();

    static final String CONTRACT_ITEM = "{\"kind\":\"help_request\",\"workspaceId\":\"3\","
            + "\"workspaceDisplayName\":\"team-samdo/gitvillage\",\"targetId\":\"14\",\"ownerMemberId\":\"12\","
            + "\"title\":\"세션이 자꾸 끊겨요\",\"requestedAt\":\"2026-11-06T01:00:00Z\",\"answeredAt\":null}";

    @Test
    void itemRoundTripsThroughDto() {
        JsonNode contract = ContractShape.readTree(CONTRACT_ITEM);

        InboxItem item = MAPPER.treeToValue(contract, InboxItem.class);

        assertThat(item.kind()).isEqualTo(InboxItem.Kind.HELP_REQUEST);
        assertThat(MAPPER.<JsonNode>valueToTree(item)).isEqualTo(contract);
        ContractShape.assertCommonRules(contract);
    }

    @Test
    void answeredItemKeepsTheFirstAnswerTime() {
        JsonNode contract = ContractShape.readTree(CONTRACT_ITEM.replace("\"answeredAt\":null",
                "\"answeredAt\":\"2026-11-06T02:00:00Z\""));

        InboxItem item = MAPPER.treeToValue(contract, InboxItem.class);

        assertThat(MAPPER.<JsonNode>valueToTree(item)).isEqualTo(contract);
        ContractShape.assertCommonRules(contract);
    }

    /** 계약의 kind 세 값 — Java 이름(대문자)이 새어 나가지 않는다. */
    @ParameterizedTest
    @EnumSource(InboxItem.Kind.class)
    void everyKindIsTheContractValue(InboxItem.Kind kind) {
        String json = CONTRACT_ITEM.replace("help_request", kind.value());

        InboxItem item = MAPPER.readValue(json, InboxItem.class);

        assertThat(item.kind()).isEqualTo(kind);
        assertThat(MAPPER.<JsonNode>valueToTree(item)).isEqualTo(ContractShape.readTree(json));
        assertThat(kind.value()).isIn("help_request", "decision_feedback", "follow_up_question");
    }

    @Test
    void unknownKindIsRejected() {
        assertThatThrownBy(() -> MAPPER.readValue(CONTRACT_ITEM.replace("help_request", "HELP_REQUEST"),
                InboxItem.class)).isInstanceOf(Exception.class);
    }
}

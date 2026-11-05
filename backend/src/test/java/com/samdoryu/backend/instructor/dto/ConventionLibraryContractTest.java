package com.samdoryu.backend.instructor.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.instructor.domain.ConventionTarget;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — CONTRACTS_API 「17」 ConventionLibraryItemDto 모양 ↔ Java DTO. 계약 문서에 예시 JSON이 없어 TS 인터페이스의
 * 필드를 그대로 옮긴 값으로 본다. 실제 HTTP 응답(②)은 {@code ConventionLibraryIntegrationTest}.
 */
class ConventionLibraryContractTest {

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .build();

    /** 계약 「17」 ConventionLibraryItemDto — author는 「1」 UserRef. */
    static final String CONTRACT_ITEM = "{\"id\":\"3\",\"target\":\"pr_title\",\"name\":\"PR 제목 규칙\","
            + "\"content\":\"<type>(<scope>)?: <설명>\",\"description\":null,"
            + "\"author\":{\"userId\":\"7\",\"githubLogin\":\"teacher\",\"displayName\":\"강사\",\"avatarUrl\":null},"
            + "\"updatedAt\":\"2026-11-05T03:00:00Z\"}";

    @Test
    void itemRoundTripsThroughDto() {
        JsonNode contract = ContractShape.readTree(CONTRACT_ITEM);

        ConventionLibraryItemDto item = MAPPER.treeToValue(contract, ConventionLibraryItemDto.class);

        assertThat(MAPPER.<JsonNode>valueToTree(item)).isEqualTo(contract);
        ContractShape.assertCommonRules(MAPPER.valueToTree(item));
    }

    @Test
    void targetsUseContractJsonValuesInContractOrder() {
        assertThat(MAPPER.writeValueAsString(ConventionTarget.values())).isEqualTo("[\"branch_name\","
                + "\"commit_message\",\"pr_title\",\"pr_body\",\"issue_body\",\"issue_template\",\"pr_template\"]");
    }
}

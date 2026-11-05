package com.samdoryu.backend.instructor.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.instructor.domain.ConventionTarget;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — CONTRACTS_API 「17」 ConventionLibraryItemDto · ConventionLibraryItemRequest 모양 ↔ Java DTO. 계약 문서에
 * 예시 JSON이 없어 TS 인터페이스의 필드를 그대로 옮긴 값으로 본다. 실제 HTTP 응답(②)은 {@code ConventionLibraryIntegrationTest}.
 */
class ConventionLibraryContractTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    /** 계약 「17」 ConventionLibraryItemRequest. */
    static final String CONTRACT_REQUEST = "{\"target\":\"branch_name\",\"name\":\"브랜치 이름\","
            + "\"content\":\"<type>/<이슈번호>-<설명>\",\"description\":\"Git 전략\"}";

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
    void requestRoundTripsThroughDto() {
        JsonNode contract = ContractShape.readTree(CONTRACT_REQUEST);

        ConventionLibraryItemRequest request = MAPPER.treeToValue(contract, ConventionLibraryItemRequest.class);

        assertThat(request.target()).isEqualTo(ConventionTarget.BRANCH_NAME);
        assertThat(MAPPER.<JsonNode>valueToTree(request)).isEqualTo(contract);
        assertThat(VALIDATOR.validate(request)).isEmpty();
    }

    @Test
    void aTargetOutsideTheContractIsNotReadable() {
        // 본문을 읽을 때 실패 → GlobalExceptionHandler가 400 invalid로 낸다
        assertThatThrownBy(() -> MAPPER.readValue(CONTRACT_REQUEST.replace("branch_name", "BRANCH_NAME"),
                ConventionLibraryItemRequest.class)).isInstanceOf(JacksonException.class);
        assertThatThrownBy(() -> MAPPER.readValue(CONTRACT_REQUEST.replace("branch_name", "label_name"),
                ConventionLibraryItemRequest.class)).isInstanceOf(JacksonException.class);
    }

    @Test
    void requestLengthsFollowTheContract() {
        ConventionTarget t = ConventionTarget.PR_TITLE;
        // target 필수
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(null, "a", "a", null))).hasSize(1);
        // name 1~100자
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(t, null, "a", null))).hasSize(1);
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(t, "", "a", null))).hasSize(1);
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(t, "a".repeat(101), "a", null))).hasSize(1);
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(t, "a".repeat(100), "a", null))).isEmpty();
        // content 1~20000자
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(t, "a", null, null))).hasSize(1);
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(t, "a", "", null))).hasSize(1);
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(t, "a", "a".repeat(20001), null))).hasSize(1);
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(t, "a", "a".repeat(20000), null))).isEmpty();
        // description null 또는 0~2000자
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(t, "a", "a", ""))).isEmpty();
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(t, "a", "a", "a".repeat(2000)))).isEmpty();
        assertThat(VALIDATOR.validate(new ConventionLibraryItemRequest(t, "a", "a", "a".repeat(2001)))).hasSize(1);
    }

    @Test
    void targetsUseContractJsonValuesInContractOrder() {
        assertThat(MAPPER.writeValueAsString(ConventionTarget.values())).isEqualTo("[\"branch_name\","
                + "\"commit_message\",\"pr_title\",\"pr_body\",\"issue_body\",\"issue_template\",\"pr_template\"]");
    }
}

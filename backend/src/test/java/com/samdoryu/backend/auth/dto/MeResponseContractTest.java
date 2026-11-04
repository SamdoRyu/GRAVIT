package com.samdoryu.backend.auth.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.common.contract.ContractShape;
import org.junit.jupiter.api.Test;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 계약 테스트 ① — contract/examples/auth/me-response.json ↔ {@link MeResponse} (CONTRACTS.md 「9」). */
class MeResponseContractTest {

    private final JsonMapper jsonMapper = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    @Test
    void exampleRoundTripsThroughDto() {
        String json = ContractShape.readExampleString("auth", "me-response.json");

        MeResponse dto = jsonMapper.readValue(json, MeResponse.class);
        JsonNode reserialized = jsonMapper.valueToTree(dto);

        assertThat(reserialized).isEqualTo(jsonMapper.readTree(json));
        assertThat(dto.accountType()).isEqualTo(AccountType.GITHUB);
        ContractShape.assertCommonRules(reserialized);
    }

    @Test
    void unknownAccountTypeIsRejected() {
        String json = ContractShape.readExampleString("auth", "me-response.json")
                .replace("\"accountType\": \"github\"", "\"accountType\": \"GITHUB\"");

        assertThatThrownBy(() -> jsonMapper.readValue(json, MeResponse.class)).isInstanceOf(JacksonException.class);
    }
}

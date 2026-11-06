package com.samdoryu.backend.activity.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samdoryu.backend.activity.domain.ActivityKind;
import com.samdoryu.backend.activity.domain.ActivityStatus;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트 ① — CONTRACTS_API 「14」 활동 기록 · 수집 동의, 「5」 ActivityNote ↔ Java DTO. 활동 기록은
 * {@code contract/examples/activity/activity-record.json}(#173), 메모지는 TS 인터페이스를 옮겼다. 실제 HTTP 응답(②)은 {@code ActivityIntegrationTest}.
 */
class ActivityContractTest {

    // 모르는 필드 · 빠진 필드 모두 실패
    private static final JsonMapper MAPPER = JsonMapper.builder()
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .build();

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    static final String CONTRACT_RECORD = ContractShape.readExampleString("activity", "activity-record.json");

    static final String CONTRACT_NOTE = "{\"id\":\"40\",\"authorMemberId\":\"12\",\"kind\":\"planning\","
            + "\"confirmedAt\":\"2026-11-06T03:00:00Z\"}";

    @Test
    void recordRoundTripsThroughDto() {
        JsonNode contract = ContractShape.readTree(CONTRACT_RECORD);

        ActivityRecordDto record = MAPPER.treeToValue(contract, ActivityRecordDto.class);

        assertThat(record.status()).isEqualTo(ActivityStatus.CONFIRMED);
        assertThat(MAPPER.<JsonNode>valueToTree(record)).isEqualTo(contract);
        ContractShape.assertCommonRules(contract);
    }

    /** 3D 메모지 — 시간 · 내용이 없다(「5」 · P6). */
    @Test
    void noteRoundTripsThroughDtoWithoutTimeOrContent() {
        JsonNode contract = ContractShape.readTree(CONTRACT_NOTE);

        ActivityNote note = MAPPER.treeToValue(contract, ActivityNote.class);

        assertThat(MAPPER.<JsonNode>valueToTree(note)).isEqualTo(contract);
        assertThat(contract.propertyNames()).doesNotContain("content", "durationMinutes");
        ContractShape.assertCommonRules(contract);
    }

    /** 계약 「14」 kind 다섯 값 — Java 이름(대문자)이 새어 나가지 않는다. */
    @ParameterizedTest
    @EnumSource(ActivityKind.class)
    void everyKindIsTheContractValue(ActivityKind kind) {
        String json = CONTRACT_RECORD.replace("planning", kind.value());

        assertThat(MAPPER.readValue(json, ActivityRecordDto.class).kind()).isEqualTo(kind);
        assertThat(kind.value()).isIn("planning", "research", "design", "presentation", "mentor_question");
    }

    @Test
    void statusQueryAcceptsOnlyContractValues() {
        assertThat(ActivityStatus.fromQuery("pending")).isEqualTo(ActivityStatus.PENDING);
        assertThat(ActivityStatus.fromQuery("confirmed")).isEqualTo(ActivityStatus.CONFIRMED);
        for (String bad : new String[] {"PENDING", "done", ""}) {
            assertThatThrownBy(() -> ActivityStatus.fromQuery(bad)).isInstanceOfSatisfying(ApiException.class,
                    e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID));
        }
    }

    @Test
    void createRequestIsContent1To500AndDuration1To1440() {
        ActivityCreateRequest ok = MAPPER.readValue(
                "{\"kind\":\"research\",\"content\":\"자료조사\",\"durationMinutes\":30}", ActivityCreateRequest.class);
        assertThat(ok.kind()).isEqualTo(ActivityKind.RESEARCH);
        assertThat(VALIDATOR.validate(ok)).isEmpty();

        assertThat(VALIDATOR.validate(new ActivityCreateRequest(ActivityKind.DESIGN, "a".repeat(500), 1))).isEmpty();
        assertThat(VALIDATOR.validate(new ActivityCreateRequest(ActivityKind.DESIGN, "a", 1440))).isEmpty();

        assertThat(VALIDATOR.validate(new ActivityCreateRequest(ActivityKind.DESIGN, "a".repeat(501), 30))).hasSize(1);
        assertThat(VALIDATOR.validate(new ActivityCreateRequest(ActivityKind.DESIGN, "", 30))).hasSize(1);
        // 공백만 있는 글 — CONTRACTS.md 「5」(#175)
        assertThat(VALIDATOR.validate(new ActivityCreateRequest(ActivityKind.DESIGN, " \n ", 30))).hasSize(1);
        assertThat(VALIDATOR.validate(new ActivityCreateRequest(ActivityKind.DESIGN, null, 30))).hasSize(1);
        assertThat(VALIDATOR.validate(new ActivityCreateRequest(ActivityKind.DESIGN, "a", 0))).hasSize(1);
        assertThat(VALIDATOR.validate(new ActivityCreateRequest(ActivityKind.DESIGN, "a", 1441))).hasSize(1);
        assertThat(VALIDATOR.validate(new ActivityCreateRequest(ActivityKind.DESIGN, "a", null))).hasSize(1);
        assertThat(VALIDATOR.validate(new ActivityCreateRequest(null, "a", 30))).hasSize(1);
    }

    @Test
    void unknownKindIsRejectedWhileReading() {
        assertThatThrownBy(() -> MAPPER.readValue("{\"kind\":\"coding\",\"content\":\"a\",\"durationMinutes\":30}",
                ActivityCreateRequest.class)).isInstanceOf(Exception.class);
    }

    @Test
    void consentRequestAndResponseMatchTheContract() {
        assertThat(MAPPER.readValue("{\"consented\":false}", ActivityConsentRequest.class).consented()).isFalse();
        assertThat(VALIDATOR.validate(new ActivityConsentRequest(null))).hasSize(1);
        assertThat(MAPPER.<JsonNode>valueToTree(new ActivityConsentResponse(true)))
                .isEqualTo(ContractShape.readTree("{\"activityConsented\":true}"));
    }
}

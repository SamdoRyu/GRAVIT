package com.samdoryu.backend.common.contract;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;

/** 계약 테스트 도구 자체의 단위 테스트 — 틀린 응답을 실제로 잡는지. */
class ContractShapeTest {

    private static final JsonNode EXAMPLE = ContractShape.readTree("""
            { "id": "1", "name": "a", "count": 3, "ok": true, "note": null,
              "ref": { "memberId": "2" }, "tags": ["x"], "items": [{ "taskId": "5" }] }
            """);

    @Test
    void sameShapeWithDifferentValuesPasses() {
        JsonNode actual = ContractShape.readTree("""
                { "id": "9", "name": "b", "count": 0, "ok": false, "note": "now set",
                  "ref": { "memberId": "7" }, "tags": [], "items": [{ "taskId": "1" }, { "taskId": "2" }] }
                """);

        assertThat(ContractShape.shapeProblems(EXAMPLE, actual)).isEmpty();
    }

    @Test
    void nullOnEitherSideIsAllowed() {
        JsonNode actual = ContractShape.readTree("""
                { "id": "9", "name": null, "count": 0, "ok": false, "note": null,
                  "ref": null, "tags": ["y"], "items": [] }
                """);

        assertThat(ContractShape.shapeProblems(EXAMPLE, actual)).isEmpty();
    }

    @Test
    void missingOrExtraKeyFails() {
        JsonNode missing = ContractShape.readTree("""
                { "id": "9", "name": "b", "count": 0, "ok": false, "note": null, "ref": { "memberId": "7" }, "tags": [] }
                """);
        JsonNode extra = ContractShape.readTree("""
                { "id": "9", "name": "b", "count": 0, "ok": false, "note": null,
                  "ref": { "memberId": "7", "evaluatorId": "3" }, "tags": [], "items": [] }
                """);

        assertThat(ContractShape.shapeProblems(EXAMPLE, missing)).singleElement().asString().contains("items");
        assertThat(ContractShape.shapeProblems(EXAMPLE, extra)).singleElement().asString().contains("$.ref");
    }

    @Test
    void differentValueKindFails() {
        JsonNode actual = ContractShape.readTree("""
                { "id": 9, "name": "b", "count": "0", "ok": false, "note": null,
                  "ref": { "memberId": "7" }, "tags": [1], "items": [] }
                """);

        assertThat(ContractShape.shapeProblems(EXAMPLE, actual))
                .hasSize(3)
                .anyMatch(p -> p.startsWith("$.id:"))
                .anyMatch(p -> p.startsWith("$.count:"))
                .anyMatch(p -> p.startsWith("$.tags[0]:"));
    }

    @Test
    void commonRulesPassOnValidJson() {
        JsonNode valid = ContractShape.readTree("""
                { "id": "1", "githubUserId": null, "assigneeMemberIds": ["1", "2"], "githubIssueNumber": 42,
                  "createdAt": "2026-11-03T05:12:00Z", "syncedAt": "2026-11-03T05:12:00.123456Z", "removedAt": null,
                  "dueDate": "2026-11-17", "nested": [{ "memberId": "3" }] }
                """);

        assertThat(ContractShape.ruleProblems(valid)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{ \"id\": 1 }",
            "{ \"nested\": [{ \"memberId\": 3 }] }",
            "{ \"taskIds\": [1] }",
            "{ \"createdAt\": \"2026-11-03T05:12:00\" }",
            "{ \"createdAt\": \"2026-11-03T05:12:00+09:00\" }",
            "{ \"createdAt\": 1762146720 }",
            "{ \"dueDate\": \"2026-11-17T00:00:00Z\" }",
            "{ \"dueDate\": \"2026-02-30\" }"
    })
    void commonRulesCatchViolations(String json) {
        assertThat(ContractShape.ruleProblems(ContractShape.readTree(json))).hasSize(1);
    }
}

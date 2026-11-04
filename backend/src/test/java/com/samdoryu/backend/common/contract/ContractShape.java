package com.samdoryu.backend.common.contract;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.JsonNodeType;

/**
 * 계약 테스트 도구(CONTRACTS.md 「9」 계약 테스트). 테스트 코드에만 있다.
 *
 * <ul>
 *   <li>② 실제 응답 ↔ 예시: {@link #assertSameShape} — 같은 키 집합 · 같은 값 종류(문자열 · 숫자 · 불리언 · 배열 · 객체).
 *       값 자체는 비교하지 않는다. {@code null}은 어느 쪽이든 허용한다(예시 하나로 null 여부를 다 보일 수 없다).</li>
 *   <li>공통 규칙: {@link #assertCommonRules} — ⓐ {@code id} · {@code …Id}는 문자열, {@code …Ids}는 문자열 배열
 *       ⓑ {@code …At}은 {@code Z}로 끝나는 UTC 시각 ⓒ {@code …Date}는 {@code YYYY-MM-DD}.
 *       ⓓ(알려진 enum 값)는 enum이 생기는 기능 Issue에서 더한다.</li>
 * </ul>
 *
 * <pre>{@code
 * JsonNode example = ContractShape.readExample("auth", "me-response.json");
 * JsonNode actual = ContractShape.readTree(result.getResponse().getContentAsString());
 * ContractShape.assertSameShape(example, actual);
 * ContractShape.assertCommonRules(actual);
 * }</pre>
 */
public final class ContractShape {

    private static final Path EXAMPLES = Path.of("..", "contract", "examples");
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Pattern INSTANT_Z = Pattern.compile("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?Z");
    private static final Pattern LOCAL_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    private ContractShape() {
    }

    /** {@code contract/examples/<group>/<name>} — Gradle 테스트는 {@code backend/}에서 돈다. */
    public static String readExampleString(String group, String name) {
        try {
            return Files.readString(EXAMPLES.resolve(group).resolve(name));
        } catch (java.io.IOException e) {
            throw new IllegalStateException("계약 예시를 읽지 못함: " + group + "/" + name, e);
        }
    }

    public static JsonNode readExample(String group, String name) {
        return readTree(readExampleString(group, name));
    }

    public static JsonNode readTree(String json) {
        return JSON.readTree(json);
    }

    /** ② 실제 응답이 예시와 같은 키 집합 · 같은 값 종류인가. */
    public static void assertSameShape(JsonNode example, JsonNode actual) {
        List<String> problems = new ArrayList<>();
        compareShape("$", example, actual, problems);
        assertThat(problems).as("계약 예시와 모양이 다름").isEmpty();
    }

    /** 공통 규칙 ⓐ ⓑ ⓒ — JSON 전체를 돈다. */
    public static void assertCommonRules(JsonNode node) {
        List<String> problems = new ArrayList<>();
        checkRules("$", null, node, problems);
        assertThat(problems).as("계약 공통 규칙 위반(CONTRACTS.md 「9」)").isEmpty();
    }

    static List<String> shapeProblems(JsonNode example, JsonNode actual) {
        List<String> problems = new ArrayList<>();
        compareShape("$", example, actual, problems);
        return problems;
    }

    static List<String> ruleProblems(JsonNode node) {
        List<String> problems = new ArrayList<>();
        checkRules("$", null, node, problems);
        return problems;
    }

    private static void compareShape(String path, JsonNode example, JsonNode actual, List<String> problems) {
        if (example.isNull() || actual.isNull()) {
            return;
        }
        if (example.getNodeType() != actual.getNodeType()) {
            problems.add(path + ": 값 종류가 다름 — 예시 " + example.getNodeType() + ", 실제 " + actual.getNodeType());
            return;
        }
        if (example.isObject()) {
            Set<String> expectedKeys = keys(example);
            Set<String> actualKeys = keys(actual);
            if (!expectedKeys.equals(actualKeys)) {
                problems.add(path + ": 키 집합이 다름 — 예시 " + expectedKeys + ", 실제 " + actualKeys);
            }
            for (String key : expectedKeys) {
                if (actualKeys.contains(key)) {
                    compareShape(path + "." + key, example.get(key), actual.get(key), problems);
                }
            }
        } else if (example.isArray() && !example.isEmpty()) {
            for (int i = 0; i < actual.size(); i++) {
                compareShape(path + "[" + i + "]", example.get(0), actual.get(i), problems);
            }
        }
    }

    private static void checkRules(String path, String fieldName, JsonNode node, List<String> problems) {
        if (fieldName != null && !node.isNull()) {
            if (fieldName.equals("id") || fieldName.endsWith("Id")) {
                if (node.getNodeType() != JsonNodeType.STRING) {
                    problems.add(path + ": ID는 문자열이어야 함 — " + node.getNodeType());
                }
            } else if (fieldName.endsWith("Ids")) {
                if (!node.isArray() || node.valueStream().anyMatch(e -> e.getNodeType() != JsonNodeType.STRING)) {
                    problems.add(path + ": ID 목록은 문자열 배열이어야 함");
                }
            } else if (fieldName.endsWith("At")) {
                if (!isInstantZ(node)) {
                    problems.add(path + ": 시각은 Z로 끝나는 UTC ISO 8601이어야 함 — " + node);
                }
            } else if (fieldName.endsWith("Date")) {
                if (!isLocalDate(node)) {
                    problems.add(path + ": 날짜는 YYYY-MM-DD여야 함 — " + node);
                }
            }
        }
        if (node.isObject()) {
            for (Map.Entry<String, JsonNode> entry : node.properties()) {
                checkRules(path + "." + entry.getKey(), entry.getKey(), entry.getValue(), problems);
            }
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                checkRules(path + "[" + i + "]", null, node.get(i), problems);
            }
        }
    }

    private static Set<String> keys(JsonNode object) {
        Set<String> keys = new TreeSet<>();
        object.propertyNames().forEach(keys::add);
        return keys;
    }

    private static boolean isInstantZ(JsonNode node) {
        if (node.getNodeType() != JsonNodeType.STRING || !INSTANT_Z.matcher(node.asString()).matches()) {
            return false;
        }
        try {
            Instant.parse(node.asString());
            return true;
        } catch (DateTimeParseException e) {
            return false;
        }
    }

    private static boolean isLocalDate(JsonNode node) {
        if (node.getNodeType() != JsonNodeType.STRING || !LOCAL_DATE.matcher(node.asString()).matches()) {
            return false;
        }
        try {
            LocalDate.parse(node.asString());
            return true;
        } catch (DateTimeParseException e) {
            return false;
        }
    }
}

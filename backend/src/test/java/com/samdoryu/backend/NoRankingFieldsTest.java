package com.samdoryu.backend;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.Entity;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.lang.reflect.RecordComponent;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * FR-FLOW-06 · P6 감시 — 사람별 합계 · 순위 · 비교 필드를 Entity에도 DTO에도 두지 않는다 (CONTRACTS.md 「1」 · 「5」).
 * 새 record · Entity · contract/examples JSON이 생기면 따로 등록하지 않아도 검사 대상이 된다.
 */
class NoRankingFieldsTest {

    private static final Path EXAMPLES = Path.of("..", "contract", "examples");
    private static final Path CONTRACTS_API = Path.of("..", "docs", "CONTRACTS_API.md");
    /** `  name: Type;` · `name?: Type` · 한 줄 인터페이스 `{ id: Id; requirementId: Id }`의 필드 이름. */
    private static final Pattern TS_FIELD = Pattern.compile("(?:^\\s+|[{;]\\s*)([a-z][A-Za-z0-9]*)\\??:");

    /** 이름에 들어가기만 해도 순위 · 비교 · 사람별 업무량을 뜻하는 단어. */
    private static final Set<String> BANNED_WORDS = Set.of(
            "rank", "ranks", "ranked", "ranking", "rankings", "leaderboard",
            "workload", "workloads", "score", "scores", "comparison", "percentile");
    private static final Set<String> PERSON_WORDS = Set.of(
            "member", "members", "person", "people", "user", "users",
            "assignee", "assignees", "author", "authors", "reviewer", "reviewers", "requester");
    /** 사람 단어 뒤에 오면 사람별 합계 (`memberTotals`). `memberCount`(팀 인원)는 합계가 아니라 통과. */
    private static final Set<String> AGGREGATE_WORDS = Set.of("total", "totals", "sum", "sums", "stats", "statistics", "counts");
    /** 사람 단어 앞에 오면 사람별로 나눈 값 (`reviewsPerMember`). 뒤에 `Id`가 붙으면 누가 했는지 가리키는 참조라 통과 (`raisedByMemberId`). */
    private static final Set<String> SPLIT_WORDS = Set.of("per", "by", "each");
    private static final Set<String> ID_WORDS = Set.of("id", "ids");

    static boolean isPerPersonRanking(String name) {
        List<String> words = List.of(name.split("(?<=[a-z0-9])(?=[A-Z])|[_\\-]"))
                .stream().map((w) -> w.toLowerCase(Locale.ROOT)).toList();
        for (int i = 0; i < words.size(); i++) {
            String word = words.get(i);
            if (BANNED_WORDS.contains(word)) {
                return true;
            }
            boolean hasNext = i + 1 < words.size();
            if (hasNext && SPLIT_WORDS.contains(word) && PERSON_WORDS.contains(words.get(i + 1))
                    && !(i + 2 < words.size() && ID_WORDS.contains(words.get(i + 2)))) {
                return true;
            }
            if (hasNext && PERSON_WORDS.contains(word) && AGGREGATE_WORDS.contains(words.get(i + 1))) {
                return true;
            }
        }
        return false;
    }

    @ParameterizedTest
    @ValueSource(strings = {"rank", "memberRanking", "reviewScore", "workloadPercent", "leaderboard",
            "reviewsPerMember", "commitCountByAuthor", "memberTotals", "reviewer_stats", "assigneeCounts"})
    void flagsPerPersonRankingNames(String name) {
        assertThat(isPerPersonRanking(name)).as(name).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"memberCount", "raisedByMemberId", "decidedByMemberId", "assignedBy", "totalItems"})
    void allowsTeamCountsAndActorReferences(String name) {
        assertThat(isPerPersonRanking(name)).as(name).isFalse();
    }

    /** 오탐 방지 — CONTRACTS_API.md의 TypeScript 블록에 있는 필드 이름은 전부 통과해야 한다. */
    @Test
    void allowsEveryContractFieldName() throws IOException {
        List<String> fields = new ArrayList<>();
        boolean inTs = false;
        for (String line : Files.readAllLines(CONTRACTS_API)) {
            if (line.startsWith("```")) {
                inTs = line.equals("```ts");
                continue;
            }
            Matcher field = TS_FIELD.matcher(line);
            while (inTs && field.find()) {
                fields.add(field.group(1));
            }
        }

        assertThat(fields).as("CONTRACTS_API.md 필드 이름 (비어 있으면 경로 · 형식이 틀림)").contains("raisedByMemberId", "linkedTaskCount");
        assertThat(fields).filteredOn(NoRankingFieldsTest::isPerPersonRanking).isEmpty();
    }

    @Test
    void noRecordOrEntityHasRankingField() throws ClassNotFoundException {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(AnnotatedBeanDefinition beanDefinition) {
                return true;
            }
        };
        scanner.addIncludeFilter((reader, factory) -> true);

        int checked = 0;
        List<String> violations = new ArrayList<>();
        for (BeanDefinition candidate : scanner.findCandidateComponents("com.samdoryu.backend")) {
            Class<?> type = Class.forName(candidate.getBeanClassName(), false, getClass().getClassLoader());
            List<String> names = fieldNames(type);
            if (!names.isEmpty()) {
                checked++;
            }
            names.stream().filter(NoRankingFieldsTest::isPerPersonRanking)
                    .forEach((name) -> violations.add(type.getName() + "." + name));
        }

        assertThat(checked).as("검사한 record · Entity 수 (0이면 스캔 경로가 틀림)").isPositive();
        assertThat(violations).as("사람별 합계 · 순위 · 비교 필드 (CONTRACTS.md 「1」)").isEmpty();
    }

    @Test
    void noContractExampleHasRankingKey() throws IOException {
        JsonMapper jsonMapper = JsonMapper.builder().build();
        List<Path> files;
        try (Stream<Path> walk = Files.walk(EXAMPLES)) {
            files = walk.filter((p) -> p.toString().endsWith(".json")).sorted().toList();
        }

        List<String> violations = new ArrayList<>();
        for (Path file : files) {
            List<String> keys = new ArrayList<>();
            collectKeys(jsonMapper.readTree(file.toFile()), keys);
            keys.stream().filter(NoRankingFieldsTest::isPerPersonRanking)
                    .forEach((key) -> violations.add(EXAMPLES.relativize(file) + ": " + key));
        }

        assertThat(files).as("contract/examples JSON (비어 있으면 경로가 틀림)").isNotEmpty();
        assertThat(violations).as("사람별 합계 · 순위 · 비교 키 (CONTRACTS.md 「5」)").isEmpty();
    }

    /** record는 구성 요소 이름, Entity는 저장 필드 이름. JSON 이름을 바꾼 `@JsonProperty` 값도 함께 본다. */
    private static List<String> fieldNames(Class<?> type) {
        List<String> names = new ArrayList<>();
        if (type.isRecord()) {
            for (RecordComponent component : type.getRecordComponents()) {
                names.add(component.getName());
            }
        }
        if (type.isRecord() || type.isAnnotationPresent(Entity.class)) {
            for (Field field : type.getDeclaredFields()) {
                if (Modifier.isStatic(field.getModifiers()) || field.isSynthetic()) {
                    continue;
                }
                names.add(field.getName());
                JsonProperty renamed = field.getAnnotation(JsonProperty.class);
                if (renamed != null && !renamed.value().isEmpty()) {
                    names.add(renamed.value());
                }
            }
        }
        return names;
    }

    private static void collectKeys(JsonNode node, List<String> keys) {
        if (node.isObject()) {
            for (Map.Entry<String, JsonNode> property : node.properties()) {
                keys.add(property.getKey());
            }
        }
        for (JsonNode child : node) {
            collectKeys(child, keys);
        }
    }
}

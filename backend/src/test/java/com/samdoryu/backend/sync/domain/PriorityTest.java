package com.samdoryu.backend.sync.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** CONTRACTS.md 「3」 우선순위 — {@code priority:*} 라벨, 없으면 null, 여러 개면 가장 높은 값. */
class PriorityTest {

    @Test
    void fromLabels() {
        assertThat(Priority.fromLabels(List.of())).isNull();
        assertThat(Priority.fromLabels(List.of("area:auth", "priority"))).isNull();
        assertThat(Priority.fromLabels(List.of("priority:low"))).isEqualTo(Priority.LOW);
        assertThat(Priority.fromLabels(List.of("priority:medium", "area:sync"))).isEqualTo(Priority.MEDIUM);
        assertThat(Priority.fromLabels(List.of("priority:low", "priority:high", "priority:medium")))
                .isEqualTo(Priority.HIGH);
        // 대소문자가 다른 라벨은 다른 라벨이다
        assertThat(Priority.fromLabels(List.of("Priority:High"))).isNull();
    }

    @Test
    void usesContractJsonValues() {
        assertThat(JsonMapper.builder().build().writeValueAsString(Priority.values()))
                .isEqualTo("[\"high\",\"medium\",\"low\"]");
    }
}

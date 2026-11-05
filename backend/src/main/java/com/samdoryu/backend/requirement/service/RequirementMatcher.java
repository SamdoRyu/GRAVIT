package com.samdoryu.backend.requirement.service;

import com.samdoryu.backend.requirement.domain.Requirement;
import com.samdoryu.backend.requirement.service.SpecHeadings.Heading;
import com.samdoryu.backend.sync.dto.SpecWarning;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 명세 문서 제목 ↔ 기존 요구사항 매칭 — CONTRACTS.md 「3」 요구사항 재동기화 「매칭」 · 「충돌」. 저장하지 않고 계획만 낸다.
 * <ol>
 *   <li>① 원본 ID: 문서에 한 번만 나온 원본 ID는 같은 원본 ID의 기존 요구사항과 맞춘다.</li>
 *   <li>② 같은 제목: ①에서 짝이 없는 제목은, ①에서 짝이 안 된 기존 요구사항 중 정규화 제목이 같은 것과 맞춘다 —
 *       문서 안에서 그 제목이 한 번만 나오고 기존 후보도 정확히 하나일 때만.</li>
 *   <li>③ 그래도 짝이 없으면 새 요구사항.</li>
 *   <li>④ 짝이 안 된 기존 요구사항은 {@code missing}.</li>
 * </ol>
 * 모호하면 연결하지 않는다: 같은 원본 ID가 두 번 이상이면 그 제목들은 가져오지 않고 기존 것은 {@code needs_review}.
 * 원본 ID 없는 같은 제목이 두 번 이상이거나 같은 제목의 기존 후보가 둘 이상이면 그 제목들은 매칭 · 생성하지 않고 후보는
 * {@code needs_review}. 기존 요구사항은 상태와 상관없이 매칭 대상이다.
 */
final class RequirementMatcher {

    /**
     * @param matched 짝을 찾은 기존 요구사항 → 문서 제목(문서 값으로 갱신하고 {@code active})
     * @param created 새 요구사항으로 만들 제목
     * @param needsReview 모호해서 {@code needs_review}가 될 기존 요구사항
     * @param missing 짝이 없어 {@code missing}이 될 기존 요구사항
     * @param warnings 문서 순서, 같은 경고는 한 번
     */
    record Plan(Map<Requirement, Heading> matched, List<Heading> created, Set<Requirement> needsReview,
            Set<Requirement> missing, List<SpecWarning> warnings) {
    }

    private record PositionedWarning(int position, SpecWarning warning) {
    }

    private RequirementMatcher() {
    }

    static Plan plan(List<Heading> headings, List<Requirement> existing) {
        Map<Requirement, Heading> matched = new LinkedHashMap<>();
        List<Heading> created = new ArrayList<>();
        Set<Requirement> needsReview = new LinkedHashSet<>();
        List<PositionedWarning> warnings = new ArrayList<>();

        Map<String, Long> keyCounts = headings.stream().filter(h -> h.sourceKey() != null)
                .collect(Collectors.groupingBy(Heading::sourceKey, Collectors.counting()));
        Map<String, Requirement> existingByKey = existing.stream().filter(r -> r.getSourceKey() != null)
                .collect(Collectors.toMap(Requirement::getSourceKey, r -> r, (a, b) -> a));

        // ① 원본 ID — 문서에 두 번 이상 나온 원본 ID는 가져오지 않는다
        List<Heading> unmatched = new ArrayList<>();
        for (Heading heading : headings) {
            String key = heading.sourceKey();
            if (key != null && keyCounts.get(key) > 1) {
                warnings.add(new PositionedWarning(heading.position(), SpecWarning.duplicateSourceKey(heading.heading())));
                if (existingByKey.containsKey(key)) {
                    needsReview.add(existingByKey.get(key));
                }
            } else if (key != null && existingByKey.containsKey(key)) {
                matched.put(existingByKey.get(key), heading);
            } else {
                unmatched.add(heading);
            }
        }

        // ② 같은 제목 — ①에서 짝이 안 된 기존 요구사항 중에서
        List<Requirement> candidates = existing.stream()
                .filter(r -> !matched.containsKey(r) && !needsReview.contains(r))
                .toList();
        Map<String, List<Heading>> byTitle = unmatched.stream()
                .collect(Collectors.groupingBy(Heading::title, LinkedHashMap::new, Collectors.toList()));
        for (Map.Entry<String, List<Heading>> group : byTitle.entrySet()) {
            List<Heading> sameTitle = group.getValue();
            List<Requirement> sameTitleCandidates = candidates.stream()
                    .filter(r -> Objects.equals(r.getTitle(), group.getKey()))
                    .toList();
            long keyless = sameTitle.stream().filter(h -> h.sourceKey() == null).count();
            if (keyless > 1 || sameTitleCandidates.size() > 1) {
                sameTitle.forEach(h -> warnings.add(
                        new PositionedWarning(h.position(), SpecWarning.duplicateTitle(h.heading()))));
                needsReview.addAll(sameTitleCandidates);
            } else if (sameTitle.size() == 1 && sameTitleCandidates.size() == 1) {
                matched.put(sameTitleCandidates.getFirst(), sameTitle.getFirst());
            } else {
                // ③ 새 요구사항 — 같은 제목의 후보(있으면 하나)는 ④로 간다
                created.addAll(sameTitle);
            }
        }
        created.sort(Comparator.comparingInt(Heading::position));

        // ④ 사라진 요구사항
        Set<Requirement> missing = new LinkedHashSet<>();
        for (Requirement requirement : existing) {
            if (!matched.containsKey(requirement) && !needsReview.contains(requirement)) {
                missing.add(requirement);
            }
        }

        List<SpecWarning> orderedWarnings = warnings.stream()
                .sorted(Comparator.comparingInt(PositionedWarning::position))
                .map(PositionedWarning::warning)
                .distinct()
                .toList();
        return new Plan(matched, created, needsReview, missing, orderedWarnings);
    }
}

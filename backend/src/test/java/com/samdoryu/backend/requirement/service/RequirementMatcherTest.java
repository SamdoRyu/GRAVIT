package com.samdoryu.backend.requirement.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.samdoryu.backend.requirement.domain.Requirement;
import com.samdoryu.backend.requirement.service.RequirementMatcher.Plan;
import com.samdoryu.backend.requirement.service.SpecHeadings.Heading;
import com.samdoryu.backend.sync.dto.SpecWarning;
import com.samdoryu.backend.workspace.domain.Workspace;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * 요구사항 재동기화 매칭 — CONTRACTS.md 「3」 「매칭」 · 「충돌」과 「9」 계약 테스트 "요구사항 재동기화" 시나리오.
 * DB 없이 계획만 본다(저장은 {@code RequirementResyncIntegrationTest}).
 */
class RequirementMatcherTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final Workspace WS = Workspace.demo("시연", T0);

    private static Requirement existing(String sourceKey, String title, int position) {
        String heading = sourceKey == null ? title : sourceKey + " " + title;
        return new Requirement(WS, sourceKey, heading, title, position, T0);
    }

    private static Plan plan(String markdown, Requirement... existing) {
        return RequirementMatcher.plan(SpecHeadings.parse(markdown), List.of(existing));
    }

    @Test
    void firstReadCreatesEveryHeading() {
        Plan plan = plan("## FR-AUTH-01 로그인\n## 문서 정리\n");

        assertThat(plan.created()).extracting(Heading::sourceKey, Heading::title)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("FR-AUTH-01", "로그인"),
                        org.assertj.core.groups.Tuple.tuple(null, "문서 정리"));
        assertThat(plan.matched()).isEmpty();
        assertThat(plan.warnings()).isEmpty();
    }

    @Test
    void sourceKeyKeepsTheSameRequirementWhenTheTitleOrOrderChanges() {
        Requirement login = existing("FR-AUTH-01", "로그인", 0);
        Requirement docs = existing(null, "문서 정리", 1);

        Plan plan = plan("## 문서 정리\n## 새 요구사항\n## FR-AUTH-01 GitHub 로그인\n", login, docs);

        assertThat(plan.matched().get(login).title()).isEqualTo("GitHub 로그인");
        assertThat(plan.matched().get(login).position()).isEqualTo(2);
        assertThat(plan.matched().get(docs).position()).isZero();
        assertThat(plan.created()).extracting(Heading::title).containsExactly("새 요구사항");
        assertThat(plan.missing()).isEmpty();
    }

    @Test
    void addingOrRenumberingASourceKeyKeepsTheRequirementWhenTheTitleIsTheSame() {
        Requirement docs = existing(null, "문서 정리", 0);
        Requirement login = existing("FR-AUTH-01", "로그인", 1);

        Plan plan = plan("## DOC-01 문서 정리\n## FR-AUTH-02 로그인\n", docs, login);

        assertThat(plan.matched().get(docs).sourceKey()).isEqualTo("DOC-01");
        assertThat(plan.matched().get(login).sourceKey()).isEqualTo("FR-AUTH-02");
        assertThat(plan.created()).isEmpty();
    }

    @Test
    void renamingAHeadingWithoutSourceKeyLeavesTheOldOneMissingAndMakesANewOne() {
        Requirement docs = existing(null, "문서 정리", 0);

        Plan plan = plan("## 개발 문서 정리\n", docs);

        assertThat(plan.missing()).containsExactly(docs);
        assertThat(plan.created()).extracting(Heading::title).containsExactly("개발 문서 정리");
    }

    @Test
    void duplicateSourceKeyIsNotImportedAndTheExistingOneNeedsReview() {
        Requirement login = existing("FR-AUTH-01", "로그인", 0);

        Plan plan = plan("## FR-AUTH-01 로그인\n## FR-AUTH-01 로그아웃\n## 문서 정리\n", login);

        assertThat(plan.needsReview()).containsExactly(login);
        assertThat(plan.matched()).isEmpty();
        assertThat(plan.created()).extracting(Heading::title).containsExactly("문서 정리");
        assertThat(plan.warnings()).containsExactly(
                SpecWarning.duplicateSourceKey("FR-AUTH-01 로그인"),
                SpecWarning.duplicateSourceKey("FR-AUTH-01 로그아웃"));
    }

    @Test
    void duplicateTitleWithoutSourceKeyIsNotMatchedOrCreated() {
        Requirement docs = existing(null, "문서 정리", 0);

        Plan plan = plan("## 문서 정리\n## 문서   정리\n", docs);

        assertThat(plan.needsReview()).containsExactly(docs);
        assertThat(plan.created()).isEmpty();
        assertThat(plan.matched()).isEmpty();
        // 같은 경고는 한 번만 — 제목 원문이 다르면 따로
        assertThat(plan.warnings()).containsExactly(
                SpecWarning.duplicateTitle("문서 정리"), SpecWarning.duplicateTitle("문서   정리"));
    }

    @Test
    void twoExistingCandidatesWithTheSameTitleNeedReview() {
        Requirement first = existing(null, "문서 정리", 0);
        Requirement second = existing(null, "문서 정리", 1);

        Plan plan = plan("## 문서 정리\n", first, second);

        assertThat(plan.needsReview()).containsExactly(first, second);
        assertThat(plan.created()).isEmpty();
        assertThat(plan.warnings()).containsExactly(SpecWarning.duplicateTitle("문서 정리"));
    }

    @Test
    void needsReviewResolvesOnceTheDocumentIsFixed() {
        Requirement login = existing("FR-AUTH-01", "로그인", 0);
        login.markUnmatched(com.samdoryu.backend.requirement.domain.RequirementStatus.NEEDS_REVIEW);
        Requirement gone = existing("FR-AUTH-09", "옛 요구사항", 1);
        gone.markUnmatched(com.samdoryu.backend.requirement.domain.RequirementStatus.MISSING);

        Plan plan = plan("## FR-AUTH-01 로그인\n## FR-AUTH-09 옛 요구사항\n", login, gone);

        // 상태와 상관없이 매칭 대상 — 다시 active가 되고 연결은 그대로 이어진다
        assertThat(plan.matched()).containsOnlyKeys(login, gone);
        assertThat(plan.needsReview()).isEmpty();
        assertThat(plan.missing()).isEmpty();
    }

    @Test
    void anEmptyDocumentLeavesEveryRequirementMissing() {
        Requirement login = existing("FR-AUTH-01", "로그인", 0);

        Plan plan = plan("# 제목만 있음\n", login);

        assertThat(plan.missing()).containsExactly(login);
        assertThat(plan.created()).isEmpty();
    }
}

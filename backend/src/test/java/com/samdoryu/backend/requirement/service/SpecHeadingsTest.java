package com.samdoryu.backend.requirement.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import com.samdoryu.backend.requirement.service.SpecHeadings.Heading;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 명세 문서 {@code ##} 제목 읽기 — CONTRACTS.md 「3」 요구사항 재동기화 「읽기」 1~3. */
class SpecHeadingsTest {

    @Test
    void readsOnlyLevelTwoHeadingsInDocumentOrder() {
        List<Heading> headings = SpecHeadings.parse("""
                # 문서 제목
                ## FR-AUTH-01 로그인
                ### FR-AUTH-01-a 세부
                본문 ## 아님
                ##붙여 쓴 것은 제목이 아님
                  ## NFR-04: 응답 시간 ##
                ####
                ##
                ## 문서   정리
                """);

        assertThat(headings).extracting(Heading::position, Heading::heading, Heading::sourceKey, Heading::title)
                .containsExactly(
                        tuple(0, "FR-AUTH-01 로그인", "FR-AUTH-01", "로그인"),
                        tuple(1, "NFR-04: 응답 시간", "NFR-04", "응답 시간"),
                        tuple(2, "문서   정리", null, "문서 정리"));
    }

    @Test
    void skipsHeadingsInsideCodeFences() {
        List<Heading> headings = SpecHeadings.parse("""
                ## 앞
                ```markdown
                ## 코드 안
                ~~~
                ## 아직 코드 안
                ```
                ~~~~
                ## 물결 코드 안
                ~~~~
                ## 뒤
                """);

        assertThat(headings).extracting(Heading::heading).containsExactly("앞", "뒤");
    }

    @Test
    void sourceKeyNeedsTheIdShapeAndASeparatorAfterIt() {
        List<Heading> headings = SpecHeadings.parse("""
                ## FR-AUTH-01. 로그인
                ## FR-AUTH-01-로그인 화면
                ## FR-1abc 붙어 있음
                ## fr-auth-01 소문자
                ## FR-AUTH 번호 없음
                ## FR-OFF-12
                ## C#   언어
                """);

        assertThat(headings).extracting(Heading::sourceKey, Heading::title).containsExactly(
                tuple("FR-AUTH-01", "로그인"),
                tuple("FR-AUTH-01", "로그인 화면"),
                tuple(null, "FR-1abc 붙어 있음"),
                tuple(null, "fr-auth-01 소문자"),
                tuple(null, "FR-AUTH 번호 없음"),
                tuple("FR-OFF-12", ""),
                tuple(null, "C# 언어"));
    }

    @Test
    void longValuesAreCutToTheColumnSize() {
        String longKey = "FR-" + "A".repeat(70) + "-1";
        List<Heading> headings = SpecHeadings.parse("## " + "가".repeat(600) + "\n## " + longKey + " 제목\n");

        assertThat(headings.get(0).heading()).hasSize(SpecHeadings.MAX_TEXT_LENGTH);
        assertThat(headings.get(0).title()).hasSize(SpecHeadings.MAX_TEXT_LENGTH);
        // 64자를 넘는 원본 ID는 원본 ID가 없는 제목으로 본다
        assertThat(headings.get(1).sourceKey()).isNull();
        assertThat(headings.get(1).title()).isEqualTo(longKey + " 제목");
    }

    @Test
    void handlesWindowsLineEndingsAndEmptyDocuments() {
        assertThat(SpecHeadings.parse("## 하나\r\n## 둘\r\n")).extracting(Heading::title).containsExactly("하나", "둘");
        assertThat(SpecHeadings.parse("")).isEmpty();
    }
}

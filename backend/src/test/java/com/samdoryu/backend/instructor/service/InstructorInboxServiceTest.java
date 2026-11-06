package com.samdoryu.backend.instructor.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * #58 — 도움 요청에는 제목이 없어 요청함 {@code title}을 내용에서 만든다 [구현 기본값 — 계약 「16」 반영 요청 중].
 * 범위 · 정렬 · {@code answered} 필터는 실제 DB로 {@code InstructorInboxIntegrationTest}가 본다.
 */
class InstructorInboxServiceTest {

    @Test
    void helpRequestTitleIsTheFirstNonBlankLineStripped() {
        assertThat(InstructorInboxService.helpRequestTitle("세션이 자꾸 끊겨요")).isEqualTo("세션이 자꾸 끊겨요");
        assertThat(InstructorInboxService.helpRequestTitle("\n   \n  세션이 자꾸 끊겨요  \n로그 첨부합니다"))
                .isEqualTo("세션이 자꾸 끊겨요");
        assertThat(InstructorInboxService.helpRequestTitle("첫 줄\r\n둘째 줄")).isEqualTo("첫 줄");
    }

    @Test
    void helpRequestTitleIsAtMost100Characters() {
        String exactly100 = "가".repeat(100);
        assertThat(InstructorInboxService.helpRequestTitle(exactly100)).isEqualTo(exactly100);
        assertThat(InstructorInboxService.helpRequestTitle("가".repeat(101))).isEqualTo(exactly100);
    }

    /** 이모지(UTF-16 두 칸)를 반으로 자르지 않는다 — 글자 단위로 센다. */
    @Test
    void helpRequestTitleNeverSplitsASurrogatePair() {
        String emojis = "😀".repeat(101);

        String title = InstructorInboxService.helpRequestTitle(emojis);

        assertThat(title).isEqualTo("😀".repeat(100));
        assertThat(title.codePointCount(0, title.length())).isEqualTo(100);
    }

    /** 공백만 있는 내용은 #175 이후 저장되지 않지만, 예전 행이 있어도 null이 아닌 빈 제목이다(계약 「1」 — title은 string). */
    @Test
    void blankContentGivesAnEmptyTitle() {
        assertThat(InstructorInboxService.helpRequestTitle(" \n\t ")).isEmpty();
    }
}

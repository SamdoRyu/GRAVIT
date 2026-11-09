package com.samdoryu.backend.sync.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** #261 — 커밋 제목 저장 상한(열 크기 512자). DB 없이 자르기 규칙만 본다. */
class SubmissionCommitTest {

    @Test
    void titleIsCutAtTheColumnSizeInCodePoints() {
        assertThat(SubmissionCommit.cut("짧은 제목")).isEqualTo("짧은 제목");
        assertThat(SubmissionCommit.cut("가".repeat(SubmissionCommit.TITLE_MAX))).hasSize(SubmissionCommit.TITLE_MAX);
        assertThat(SubmissionCommit.cut("가".repeat(SubmissionCommit.TITLE_MAX + 5)))
                .isEqualTo("가".repeat(SubmissionCommit.TITLE_MAX));
        // 서로게이트 쌍(이모지)을 가르지 않는다 — 512 코드 포인트 = UTF-16 1024자
        String emoji = "😀".repeat(SubmissionCommit.TITLE_MAX + 1);
        String cut = SubmissionCommit.cut(emoji);
        assertThat(cut.codePointCount(0, cut.length())).isEqualTo(SubmissionCommit.TITLE_MAX);
        assertThat(Character.isHighSurrogate(cut.charAt(cut.length() - 1))).isFalse();
    }
}

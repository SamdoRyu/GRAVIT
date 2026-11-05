package com.samdoryu.backend.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** 서버 설정 {@code REVIEW_ACCOUNTS} 해석(P15) — 틀린 설정은 서버가 켜지지 않게 한다. 오류에 해시를 싣지 않는다. */
class ReviewAccountSpecTest {

    // 테스트가 그때 만든 해시 — 저장소에 해시를 두지 않는다
    private static final String HASH = new BCryptPasswordEncoder(4).encode("unused-" + System.nanoTime());

    @Test
    void parsesAccountsJoinedBySemicolonsOrNewlines() {
        List<ReviewAccountSpec> specs = ReviewAccountSpec.parse(
                " rev-student:participant:seed-lee:" + HASH + ";\nrev-admin:repo_admin:seed-kim:" + HASH
                        + "\r\nrev-mentor:instructor::" + HASH + ";");

        assertThat(specs).extracting(ReviewAccountSpec::username)
                .containsExactly("rev-student", "rev-admin", "rev-mentor");
        assertThat(specs).extracting(ReviewAccountSpec::role)
                .containsExactly(WorkspaceRole.PARTICIPANT, WorkspaceRole.REPO_ADMIN, WorkspaceRole.INSTRUCTOR);
        assertThat(specs.get(0).seedLogin()).isEqualTo("seed-lee");
        assertThat(specs.get(2).seedLogin()).isNull();
        assertThat(specs.get(0).passwordHash()).isEqualTo(HASH);
    }

    @Test
    void emptyConfigMeansNoAccounts() {
        assertThat(ReviewAccountSpec.parse(null)).isEmpty();
        assertThat(ReviewAccountSpec.parse("  ")).isEmpty();
    }

    @Test
    void invalidEntriesStopTheServerWithoutShowingTheHash() {
        String[] invalid = {
                "rev-student:participant:seed-lee",                       // 칸 수
                "r!:participant:seed-lee:" + HASH,                        // 아이디 형식
                "rev-student:owner:seed-lee:" + HASH,                     // 모르는 역할
                "rev-student:participant::" + HASH,                       // 팀원인데 Seed 팀원 없음
                "rev-mentor:instructor:seed-lee:" + HASH,                 // 강사인데 Seed 팀원 있음
                "rev-student:participant:seed-lee:plain-password",        // 평문
                "rev-a:participant:seed-lee:" + HASH + ";rev-a:repo_admin:seed-kim:" + HASH, // 아이디 겹침
        };
        for (String config : invalid) {
            assertThatThrownBy(() -> ReviewAccountSpec.parse(config))
                    .as(config.replace(HASH, "<hash>"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageStartingWith("REVIEW_ACCOUNTS ")
                    .hasMessageNotContaining(HASH)
                    .hasMessageNotContaining("plain-password");
        }
    }

    @Test
    void toStringHasNoHash() {
        ReviewAccountSpec spec = ReviewAccountSpec.parse("rev-student:participant:seed-lee:" + HASH).get(0);

        assertThat(spec.toString()).contains("rev-student").doesNotContain(HASH);
    }
}

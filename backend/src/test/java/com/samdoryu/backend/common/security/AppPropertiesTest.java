package com.samdoryu.backend.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import org.junit.jupiter.api.Test;

/** #66 FR-AUTH-03 — 전체 관리자(ROLE-03)는 서버 설정의 GitHub 로그인 이름 하나로만 정해진다. */
class AppPropertiesTest {

    private static AppProperties withMasterAdmin(String login) {
        return new AppProperties("http://localhost:5173", Set.of(), false, null, login);
    }

    @Test
    void masterAdminIsTheConfiguredLoginIgnoringCase() {
        AppProperties properties = withMasterAdmin("  Boss  ");

        assertThat(properties.masterAdminGithubLogin()).isEqualTo("Boss");
        assertThat(properties.isMasterAdmin("boss")).isTrue();
        assertThat(properties.isMasterAdmin("BOSS")).isTrue();
        assertThat(properties.isMasterAdmin("bossy")).isFalse();
        assertThat(properties.isMasterAdmin(null)).isFalse();
    }

    @Test
    void blankSettingMeansNoMasterAdmin() {
        for (String blank : new String[] {null, "", "   "}) {
            AppProperties properties = withMasterAdmin(blank);

            assertThat(properties.masterAdminGithubLogin()).isNull();
            assertThat(properties.isMasterAdmin("")).isFalse();
            assertThat(properties.isMasterAdmin("boss")).isFalse();
        }
    }
}

package com.samdoryu.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * #66 FR-AUTH-03 — 전체 관리자(ROLE-03)는 서버 설정으로만 정해지고, v1에는 전용 경로도 추가 데이터 접근도 없다
 * (CONTRACTS.md 「4」 — 최소 권한부터). 실제 Security · MVC · MySQL로 일반 사용자와 같다는 것을 본다.
 */
@SpringBootTest(properties = "app.master-admin-github-login=" + MasterAdminIntegrationTest.MASTER_ADMIN_LOGIN)
@AutoConfigureMockMvc
@Transactional
class MasterAdminIntegrationTest {

    static final String MASTER_ADMIN_LOGIN = "Boss";
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired AppProperties appProperties;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;

    private AppUser boss;
    private Workspace othersWorkspace;
    private MockHttpSession bossSession;

    @BeforeEach
    void setUp() {
        boss = users.saveAndFlush(AppUser.github(3001L, "boss", "관리자", null));
        AppUser alice = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        othersWorkspace = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, alice, T0));
        bossSession = TestLogin.githubUser(boss.getId(), 3001L).session();
    }

    @Test
    void theServerSettingIsBound() {
        assertThat(appProperties.isMasterAdmin(boss.getGithubLogin())).isTrue();
    }

    @Test
    void masterAdminGetsNoAccessToOtherWorkspaces() throws Exception {
        String workspace = "/api/workspaces/" + Ids.toApi(othersWorkspace.getId());

        mvc.perform(get(workspace + "/snapshot").session(bossSession))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        mvc.perform(get(workspace + "/sync-status").session(bossSession))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/workspaces").session(bossSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void thereIsNoAdminRoute() throws Exception {
        for (String path : new String[] {"/api/admin", "/api/admin/workspaces", "/api/admin/users"}) {
            mvc.perform(get(path).session(bossSession))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("not_found"));
        }
    }

    @Test
    void meLooksTheSameAsForAnyoneElse() throws Exception {
        String body = mvc.perform(get("/api/me").session(bossSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isInstructor").value(false))
                .andReturn().getResponse().getContentAsString();

        JsonNode me = ContractShape.readTree(body);
        ContractShape.assertSameShape(ContractShape.readExample("auth", "me-response.json"), me);
        assertThat(me.propertyNames()).containsExactlyInAnyOrder("user", "accountType", "githubUserId", "isInstructor");
    }
}

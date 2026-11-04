package com.samdoryu.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;
import static org.mockito.Mockito.never;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.github.GithubUserClient;
import com.samdoryu.backend.github.GithubUserToken;
import com.samdoryu.backend.github.dto.GithubRepoPermission;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.oauth2.client.endpoint.OAuth2AccessTokenResponseClient;
import org.springframework.security.oauth2.client.endpoint.OAuth2AuthorizationCodeGrantRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.endpoint.OAuth2AccessTokenResponse;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * #65 — 로그인 때 레포 권한으로 역할을 정해 세션에 둔다(CONTRACTS.md 「6」 역할 판정). 실제 로그인 흐름을 돌고, GitHub를
 * 부르는 곳(코드 교환 · 사용자 정보 · 레포 권한)만 가짜다. 역할은 테스트 전용 사무실 경로(AuthorizationTestController)로 확인한다.
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + LoginRepoRolesIntegrationTest.INSTRUCTOR_ID)
@AutoConfigureMockMvc
@Transactional
class LoginRepoRolesIntegrationTest {

    static final long INSTRUCTOR_ID = 9001L;
    private static final long MY_ID = 1001L;
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;

    @MockitoBean OAuth2AccessTokenResponseClient<OAuth2AuthorizationCodeGrantRequest> tokenClient;
    @MockitoBean OAuth2UserService<OAuth2UserRequest, OAuth2User> userService;
    @MockitoBean GithubUserClient githubUserClient;

    private Workspace adminRepo;        // 5001 — admin, 팀원 행 있음
    private Workspace collaboratorRepo; // 5002 — 콜라보레이터, 팀원 행 있음
    private Workspace noMemberRow;      // 5003 — 권한은 있지만 팀원 행 없음(동기화 전)
    private Workspace removedMember;    // 5004 — 빠진 팀원
    private Workspace noPermission;     // 5005 — 팀원 행은 있지만 GitHub 권한 없음
    private Member collaboratorMember;

    @BeforeEach
    void setUp() {
        AppUser me = users.saveAndFlush(AppUser.github(MY_ID, "octo-kim", "김옥토", null));
        AppUser teacher = users.saveAndFlush(AppUser.github(INSTRUCTOR_ID, "teacher", "강사", null));
        adminRepo = workspace(5001, me);
        collaboratorRepo = workspace(5002, me);
        noMemberRow = workspace(5003, me);
        removedMember = workspace(5004, me);
        noPermission = workspace(5005, me);
        members.saveAndFlush(Member.collaborator(adminRepo, me, 0, true, T0));
        members.saveAndFlush(Member.collaborator(adminRepo, teacher, 1, true, T0));
        collaboratorMember = members.saveAndFlush(Member.collaborator(collaboratorRepo, me, 0, false, T0));
        Member removed = members.saveAndFlush(Member.collaborator(removedMember, me, 0, false, T0));
        removed.remove(T0);
        members.saveAndFlush(removed);
        members.saveAndFlush(Member.collaborator(noPermission, me, 0, false, T0));

        given(tokenClient.getTokenResponse(any())).willReturn(OAuth2AccessTokenResponse.withToken("gho_user")
                .tokenType(OAuth2AccessToken.TokenType.BEARER).expiresIn(3600).build());
        given(githubUserClient.repositoryPermissions("gho_user")).willReturn(List.of(
                new GithubRepoPermission(5001, true),
                new GithubRepoPermission(5002, false),
                new GithubRepoPermission(5003, false),
                new GithubRepoPermission(5004, false),
                new GithubRepoPermission(9999, true)));    // 사무실이 열리지 않은 레포
    }

    private Workspace workspace(long repoId, AppUser openedBy) {
        return workspaces.saveAndFlush(Workspace.github(repoId, "samdoryu", "r" + repoId, null, openedBy, T0));
    }

    private MockHttpSession login(long githubUserId, String login) throws Exception {
        given(userService.loadUser(any())).willReturn(new DefaultOAuth2User(List.of(),
                Map.of("id", githubUserId, "login", login), "id"));
        MockHttpSession session = new MockHttpSession();
        String location = mvc.perform(get("/oauth2/authorization/github").session(session))
                .andReturn().getResponse().getRedirectedUrl();
        String state = URLDecoder.decode(
                UriComponentsBuilder.fromUriString(location).build().getQueryParams().getFirst("state"),
                StandardCharsets.UTF_8);
        MvcResult callback = mvc.perform(get("/login/oauth2/code/github").param("code", "c").param("state", state)
                        .session(session)
                        .with(request -> {
                            request.setRequestedSessionId(session.getId());
                            request.setRequestedSessionIdValid(true);
                            return request;
                        }))
                .andReturn();
        assertThat(callback.getResponse().getStatus()).isEqualTo(302);
        return session;
    }

    private static String path(Workspace ws, String suffix) {
        return "/api/workspaces/" + Ids.toApi(ws.getId()) + suffix;
    }

    @Test
    void repoAdminGetsRepoAdminRole() throws Exception {
        MockHttpSession session = login(MY_ID, "octo-kim");

        mvc.perform(get(path(adminRepo, "/test-admin-only")).session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("repo_admin"));
    }

    @Test
    void collaboratorGetsParticipantRoleWithItsMemberId() throws Exception {
        MockHttpSession session = login(MY_ID, "octo-kim");

        mvc.perform(get(path(collaboratorRepo, "/test-team-only")).session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("participant"))
                .andExpect(jsonPath("$.memberId").value(Ids.toApi(collaboratorMember.getId())));
        mvc.perform(get(path(collaboratorRepo, "/test-admin-only")).session(session))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
    }

    @Test
    void noAccessWithoutMemberRowRemovedMemberOrGithubPermission() throws Exception {
        MockHttpSession session = login(MY_ID, "octo-kim");

        for (Workspace ws : List.of(noMemberRow, removedMember, noPermission)) {
            mvc.perform(get(path(ws, "/test-team-only")).session(session))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("not_found"));
        }
    }

    /** 완료 조건 1 — 허용 목록 계정은 콜라보레이터 · admin이어도 팀원 · 레포 관리자로 판정되지 않는다. */
    @Test
    void allowlistedInstructorGetsNoTeamRoleAndRepoPermissionsAreNotRead() throws Exception {
        MockHttpSession session = login(INSTRUCTOR_ID, "teacher");

        then(githubUserClient).should(never()).repositoryPermissions(any());
        mvc.perform(get(path(adminRepo, "/test-team-only")).session(session))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/me").session(session)).andExpect(status().isOk());
        // 강사는 레포 선택을 쓰지 않으므로 GitHub 토큰도 세션에 두지 않는다
        assertThat(GithubUserToken.from(session)).isEmpty();
    }

    @Test
    void githubFailureWhileReadingPermissionsMeansNoLogin() throws Exception {
        given(githubUserClient.repositoryPermissions(any()))
                .willThrow(new ApiException(ErrorCode.GITHUB_RATE_LIMITED));

        MockHttpSession session = login(MY_ID, "octo-kim");

        mvc.perform(get("/api/me").session(session)).andExpect(status().isUnauthorized());
    }

    /** 학생의 토큰은 서버 세션에만, {@link GithubUserToken}으로 감싸 값이 드러나지 않게 둔다(#68 — 레포 선택 · 사무실 열기). */
    @Test
    void theUserTokenIsKeptOnlyInTheServerSessionWithItsValueHidden() throws Exception {
        MockHttpSession session = login(MY_ID, "octo-kim");

        then(githubUserClient).should().repositoryPermissions("gho_user");
        assertThat(GithubUserToken.from(session)).contains("gho_user");
        for (String name : Collections.list(session.getAttributeNames())) {
            assertThat(String.valueOf(session.getAttribute(name))).doesNotContain("gho_user");
        }
    }
}

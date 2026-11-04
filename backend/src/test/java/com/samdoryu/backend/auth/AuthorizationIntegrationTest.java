package com.samdoryu.backend.auth;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;

/**
 * T3-b 인가 서비스 — 로그인 → 사무실 접근 → 역할(CONTRACTS.md 「6」 검사 순서)을 실제 Security · 세션으로 확인한다.
 * 세션은 {@link TestLogin}(OAuth 없이)이고, 사무실 항목 저장소와 강사 지정은 가짜다.
 * 실제 {@code instructor_assignment} 행으로 하는 확인은 {@code InstructorAssignmentAuthorizationTest}.
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + AuthorizationIntegrationTest.INSTRUCTOR_GITHUB_ID)
@AutoConfigureMockMvc
class AuthorizationIntegrationTest {

    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final long WS1 = 1L;

    @Autowired
    MockMvc mvc;

    @MockitoBean
    InstructorAssignmentService instructorAssignmentService;

    /** 사무실 1의 참여자(팀원 10). 사무실 2에는 접근 없음. */
    private static MockHttpSession participantOfWs1() {
        return TestLogin.githubUser(7L, 1001L).member(WS1, 10L, WorkspaceRole.PARTICIPANT).session();
    }

    private static MockHttpSession repoAdminOfWs1() {
        return TestLogin.githubUser(8L, 1002L).member(WS1, 11L, WorkspaceRole.REPO_ADMIN).session();
    }

    private static MockHttpSession instructor() {
        return TestLogin.githubUser(9L, INSTRUCTOR_GITHUB_ID).session();
    }

    @Nested
    class Login {

        @Test
        void noSessionIs401() throws Exception {
            mvc.perform(get("/api/workspaces/1/test-items/1"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error.code").value("unauthorized"));
        }

        @Test
        @WithMockUser
        void authenticationWithoutAppPrincipalIs401() throws Exception {
            mvc.perform(get("/api/workspaces/1/test-items/1"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error.code").value("unauthorized"));
        }
    }

    @Nested
    class WorkspaceAccessCheck {

        @Test
        void memberReadsOwnWorkspaceItem() throws Exception {
            mvc.perform(get("/api/workspaces/1/test-items/1").session(participantOfWs1()))
                    .andExpect(status().isOk())
                    .andExpect(content().json(
                            "{\"workspaceId\":\"1\",\"role\":\"participant\",\"memberId\":\"10\"}",
                            JsonCompareMode.STRICT));
        }

        /** IDOR — 다른 사무실의 항목 ID를 내 사무실 경로에 넣으면 404. */
        @Test
        void otherWorkspaceItemInOwnWorkspacePathIs404() throws Exception {
            mvc.perform(get("/api/workspaces/1/test-items/2").session(participantOfWs1()))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("not_found"));
        }

        /** 접근 없는 사무실은 존재를 숨기고 404 — 항목이 그 사무실 것이어도 마찬가지. */
        @ParameterizedTest
        @ValueSource(strings = {"2", "999", "abc", "0"})
        void workspaceWithoutAccessIs404(String workspaceId) throws Exception {
            mvc.perform(get("/api/workspaces/{ws}/test-items/2", workspaceId).session(participantOfWs1()))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("not_found"));
        }
    }

    @Nested
    class Roles {

        @Test
        void participantCannotDoRepoAdminAction() throws Exception {
            mvc.perform(get("/api/workspaces/1/test-admin-only").session(participantOfWs1()))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        }

        @Test
        void repoAdminCanDoRepoAdminAction() throws Exception {
            mvc.perform(get("/api/workspaces/1/test-admin-only").session(repoAdminOfWs1()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.role").value("repo_admin"));
        }

        @Test
        void selfCanReadOwnPersonalData() throws Exception {
            mvc.perform(get("/api/workspaces/1/members/10/test-personal").session(participantOfWs1()))
                    .andExpect(status().isOk());
        }

        /** 같은 사무실 다른 학생의 개인 API는 403. */
        @Test
        void otherStudentsPersonalDataIs403() throws Exception {
            mvc.perform(get("/api/workspaces/1/members/11/test-personal").session(participantOfWs1()))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        }
    }

    @Nested
    class Instructor {

        @Test
        void assignedInstructorGetsInstructorRoleWithoutMemberId() throws Exception {
            given(instructorAssignmentService.isCurrentlyAssigned(WS1, INSTRUCTOR_GITHUB_ID)).willReturn(true);

            mvc.perform(get("/api/workspaces/1/test-items/1").session(instructor()))
                    .andExpect(status().isOk())
                    .andExpect(content().json(
                            "{\"workspaceId\":\"1\",\"role\":\"instructor\",\"memberId\":null}",
                            JsonCompareMode.STRICT));
        }

        @Test
        void unassignedInstructorIs404() throws Exception {
            mvc.perform(get("/api/workspaces/1/test-items/1").session(instructor()))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("not_found"));
        }

        /** 허용 목록 계정은 콜라보레이터 역할이 세션에 있어도 팀원으로 판정하지 않는다(P1). */
        @Test
        void allowlistedAccountIsNeverTeamMember() throws Exception {
            MockHttpSession collaboratorInstructor = TestLogin.githubUser(9L, INSTRUCTOR_GITHUB_ID)
                    .member(WS1, 12L, WorkspaceRole.REPO_ADMIN).session();

            mvc.perform(get("/api/workspaces/1/test-items/1").session(collaboratorInstructor))
                    .andExpect(status().isNotFound());

            given(instructorAssignmentService.isCurrentlyAssigned(WS1, INSTRUCTOR_GITHUB_ID)).willReturn(true);
            mvc.perform(get("/api/workspaces/1/test-admin-only").session(collaboratorInstructor))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        }

        @Test
        void instructorCannotDoTeamMemberAction() throws Exception {
            given(instructorAssignmentService.isCurrentlyAssigned(WS1, INSTRUCTOR_GITHUB_ID)).willReturn(true);

            mvc.perform(get("/api/workspaces/1/test-team-only").session(instructor()))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        }

        @Test
        void assignedInstructorReadsStudentPersonalData() throws Exception {
            given(instructorAssignmentService.isCurrentlyAssigned(WS1, INSTRUCTOR_GITHUB_ID)).willReturn(true);

            mvc.perform(get("/api/workspaces/1/members/10/test-personal").session(instructor()))
                    .andExpect(status().isOk());
        }
    }
}

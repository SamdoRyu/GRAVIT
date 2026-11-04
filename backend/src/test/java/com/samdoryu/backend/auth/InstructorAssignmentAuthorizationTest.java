package com.samdoryu.backend.auth;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
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

/**
 * 강사 지정(R4)을 실제 {@code instructor_assignment} 행으로 확인한다 — 지정은 세션이 아니라 요청마다 DB에서 읽는다
 * (CONTRACTS.md 「6」 · 「9」 사무실 접근 · 개인 데이터: 지정 안 된 강사 · 해제된 강사 → 404).
 * MockMvc는 테스트 스레드에서 돌므로 테스트 트랜잭션 안의 행이 보이고, 끝나면 되돌린다.
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + InstructorAssignmentAuthorizationTest.INSTRUCTOR_GITHUB_ID)
@AutoConfigureMockMvc
@Transactional
class InstructorAssignmentAuthorizationTest {

    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired InstructorAssignmentRepository instructorAssignments;

    private AppUser admin;
    private Workspace assignedWorkspace;
    private Workspace otherWorkspace;
    private InstructorAssignment assignment;
    private MockHttpSession instructorSession;

    @BeforeEach
    void setUp() {
        admin = users.saveAndFlush(AppUser.github(1002L, "team-admin", "팀장", null));
        AppUser instructor = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        assignedWorkspace = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, admin, T0));
        otherWorkspace = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "b", null, admin, T0));
        assignment = instructorAssignments.saveAndFlush(
                new InstructorAssignment(assignedWorkspace, INSTRUCTOR_GITHUB_ID, admin, T0));
        instructorSession = TestLogin.githubUser(instructor.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private String personalPath(Workspace workspace) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId()) + "/members/1/test-personal";
    }

    @Test
    void assignedInstructorReadsStudentPersonalData() throws Exception {
        mvc.perform(get(personalPath(assignedWorkspace)).session(instructorSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("instructor"))
                .andExpect(jsonPath("$.memberId").value(nullValue()));
    }

    @Test
    void instructorWithoutAssignmentInThatWorkspaceIs404() throws Exception {
        mvc.perform(get(personalPath(otherWorkspace)).session(instructorSession))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }

    /** 해제 직후 같은 세션의 다음 요청부터 404 — 지정을 세션에 두지 않는다. */
    @Test
    void unassignedInstructorIs404FromTheNextRequest() throws Exception {
        mvc.perform(get(personalPath(assignedWorkspace)).session(instructorSession))
                .andExpect(status().isOk());

        assignment.unassign(T0.plusSeconds(60));
        instructorAssignments.saveAndFlush(assignment);

        mvc.perform(get(personalPath(assignedWorkspace)).session(instructorSession))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }
}

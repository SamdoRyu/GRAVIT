package com.samdoryu.backend.instructor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * #53 강사 지정 · 해제 — 실제 Security · MVC · MySQL(CONTRACTS_API 「7」, CONTRACTS.md 「6」 역할 판정 · 「9」 역할 · 사무실 접근).
 * 쓰기는 화면과 같은 CSRF 쿠키 → 헤더 + Origin. 계약 테스트 ② — 실제 응답 ↔ contract/examples/instructor/*.json.
 * 허용 목록: 9001(로그인한 적 있음) · 9002(로그인한 적 없음).
 */
@SpringBootTest(properties = {
        "app.origin=" + InstructorApiIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + InstructorApiIntegrationTest.MENTOR + ","
                + InstructorApiIntegrationTest.NEW_MENTOR})
@AutoConfigureMockMvc
@Transactional
class InstructorApiIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long MENTOR = 9001L;
    static final long NEW_MENTOR = 9002L;
    private static final long KIM_GITHUB_ID = 1001L;
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;

    private AppUser kim;
    private Workspace ws;
    private Workspace otherWs;
    private MockHttpSession adminSession;
    private MockHttpSession participantSession;
    private MockHttpSession mentorSession;

    @BeforeEach
    void setUp() {
        kim = users.saveAndFlush(AppUser.github(KIM_GITHUB_ID, "kim", "김", null));
        AppUser lee = users.saveAndFlush(AppUser.github(1002L, "lee", "이", null));
        AppUser mentor = users.saveAndFlush(
                AppUser.github(MENTOR, "mentor-park", "박멘토", "https://avatars.githubusercontent.com/u/9001?v=4"));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "repo", 77L, kim, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "other", 78L, kim, T0));
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), null));
        Member kimMember = members.saveAndFlush(Member.collaborator(ws, kim, 0, true, T0));
        Member leeMember = members.saveAndFlush(Member.collaborator(ws, lee, 1, false, T0));

        adminSession = TestLogin.githubUser(kim.getId(), KIM_GITHUB_ID)
                .member(ws.getId(), kimMember.getId(), WorkspaceRole.REPO_ADMIN).session();
        participantSession = TestLogin.githubUser(lee.getId(), 1002L)
                .member(ws.getId(), leeMember.getId(), WorkspaceRole.PARTICIPANT).session();
        mentorSession = TestLogin.githubUser(mentor.getId(), MENTOR).session();
    }

    private String base(Workspace workspace) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId());
    }

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private ResultActions assign(Workspace workspace, MockHttpSession session, Object githubUserId) throws Exception {
        String token = csrfToken();
        return mvc.perform(put(base(workspace) + "/instructors/" + githubUserId).session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN));
    }

    private ResultActions revoke(Workspace workspace, MockHttpSession session, Object githubUserId) throws Exception {
        String token = csrfToken();
        return mvc.perform(delete(base(workspace) + "/instructors/" + githubUserId).session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN));
    }

    private List<InstructorAssignment> rows() {
        em.flush();
        em.clear();
        return instructorAssignments.findAll();
    }

    /** 지정하면 그 강사가 다음 요청부터 사무실에 들어가고, 해제하면 다음 요청부터 404 — 행은 해제 시각과 함께 남는다. */
    @Test
    void adminAssignsAndRevokesAndAccessFollows() throws Exception {
        mvc.perform(get(base(ws) + "/snapshot").session(mentorSession)).andExpect(status().isNotFound());

        String response = assign(ws, adminSession, MENTOR)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.githubUserId").value("9001"))
                .andExpect(jsonPath("$.githubLogin").value("mentor-park"))
                .andExpect(jsonPath("$.displayName").value("박멘토"))
                .andExpect(jsonPath("$.assignedBy.userId").value(Ids.toApi(kim.getId())))
                .andExpect(jsonPath("$.assignedBy.githubLogin").value("kim"))
                .andReturn().getResponse().getContentAsString();
        JsonNode actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("instructor", "instructor-assignment.json"), actual);
        ContractShape.assertCommonRules(actual);

        mvc.perform(get(base(ws) + "/snapshot").session(mentorSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.viewer.role").value("instructor"));

        // 다시 지정해도 같은 지정 — 행이 늘지 않는다
        String assignedAt = actual.get("assignedAt").asString();
        assign(ws, adminSession, MENTOR).andExpect(status().isOk())
                .andExpect(jsonPath("$.assignedAt").value(assignedAt));
        assertThat(rows()).hasSize(1);

        revoke(ws, adminSession, MENTOR).andExpect(status().isNoContent());

        List<InstructorAssignment> rows = rows();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getUnassignedAt()).isNotNull();
        mvc.perform(get(base(ws) + "/snapshot").session(mentorSession))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        mvc.perform(get(base(ws) + "/instructors").session(adminSession))
                .andExpect(status().isOk()).andExpect(jsonPath("$").value(empty()));

        // 현재 지정이 없으면 해제는 404, 다시 지정하면 새 행
        revoke(ws, adminSession, MENTOR).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        assign(ws, adminSession, MENTOR).andExpect(status().isOk());
        assertThat(rows()).hasSize(2);
    }

    /** 「7」 — 현재 지정만, assignedAt 오름차순. 접근이 있으면 누구나(참여자 · 지정된 강사). 로그인한 적 없는 강사는 표시 정보 null. */
    @Test
    void listShowsCurrentAssignmentsInOrder() throws Exception {
        InstructorAssignment revoked = new InstructorAssignment(ws, NEW_MENTOR, kim, T0.minusSeconds(7200));
        revoked.unassign(T0.minusSeconds(3600));
        instructorAssignments.saveAndFlush(revoked);
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, MENTOR, kim, T0.plusSeconds(60)));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, NEW_MENTOR, kim, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(otherWs, MENTOR, kim, T0));

        for (MockHttpSession session : List.of(participantSession, mentorSession)) {
            String response = mvc.perform(get(base(ws) + "/instructors").session(session))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[*].githubUserId").value(contains("9002", "9001")))
                    .andExpect(jsonPath("$[0].githubLogin").value(nullValue()))
                    .andExpect(jsonPath("$[0].displayName").value(nullValue()))
                    .andExpect(jsonPath("$[1].githubLogin").value("mentor-park"))
                    .andReturn().getResponse().getContentAsString();
            JsonNode actual = ContractShape.readTree(response);
            ContractShape.assertSameShape(ContractShape.readExample("instructor", "instructor-assignment.json"),
                    actual.get(1));
            ContractShape.assertCommonRules(actual);
        }
    }

    /** 「7」 — 허용 목록 전원, R2만. */
    @Test
    void candidatesAreTheAllowListForRepoAdminsOnly() throws Exception {
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, MENTOR, kim, T0));

        String response = mvc.perform(get(base(ws) + "/instructor-candidates").session(adminSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].githubUserId").value(contains("9001", "9002")))
                .andExpect(jsonPath("$[*].isAssigned").value(contains(true, false)))
                .andExpect(jsonPath("$[0].githubLogin").value("mentor-park"))
                .andExpect(jsonPath("$[1].githubLogin").value(nullValue()))
                .andReturn().getResponse().getContentAsString();
        JsonNode actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(ContractShape.readExample("instructor", "instructor-candidate.json"),
                actual.get(1));
        ContractShape.assertCommonRules(actual);

        for (MockHttpSession session : List.of(participantSession, mentorSession)) {
            mvc.perform(get(base(ws) + "/instructor-candidates").session(session))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        }
    }

    /** 「7」 실패 — 아무 행도 만들지 않는다. */
    @Test
    void assignFailures() throws Exception {
        assign(ws, adminSession, 4242).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        assign(ws, adminSession, KIM_GITHUB_ID).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
        assign(ws, adminSession, "mentor-park").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        assign(ws, participantSession, MENTOR).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        // 김은 다른 사무실에 역할이 없다 — 존재를 숨긴다
        assign(otherWs, adminSession, MENTOR).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));

        assertThat(rows()).isEmpty();
    }

    /** 지정된 강사도 지정 · 해제는 못 한다(R2 아님). 해제 실패 뒤 지정은 그대로. */
    @Test
    void instructorAndParticipantCannotRevoke() throws Exception {
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, MENTOR, kim, T0));

        assign(ws, mentorSession, NEW_MENTOR).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        revoke(ws, mentorSession, MENTOR).andExpect(status().isForbidden());
        revoke(ws, participantSession, MENTOR).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));

        assertThat(rows()).singleElement().satisfies(row -> assertThat(row.isCurrent()).isTrue());
    }

    @Test
    void writesNeedCsrf() throws Exception {
        mvc.perform(put(base(ws) + "/instructors/" + MENTOR).session(adminSession).header(HttpHeaders.ORIGIN, ORIGIN))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        assertThat(rows()).isEmpty();
    }
}

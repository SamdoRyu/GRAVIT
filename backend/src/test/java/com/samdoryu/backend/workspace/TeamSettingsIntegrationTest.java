package com.samdoryu.backend.workspace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
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
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * #38 팀 설정 읽기 · 바꾸기 — 실제 Security · MVC · MySQL(CONTRACTS_API 「7」). 테스트마다 트랜잭션을 되돌린다.
 * 읽기는 사무실 접근(팀원 · 지정된 강사), 바꾸기는 레포 관리자(R2)만.
 * 계약 테스트 ② — 실제 응답 ↔ {@code contract/examples/workspace/workspace-snapshot.json}의 {@code settings}.
 */
@SpringBootTest(properties = {
        "app.origin=" + TeamSettingsIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + TeamSettingsIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class TeamSettingsIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant PAST = Instant.now().minus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
    private static final String VALID = "{\"projectStartDate\":\"2026-11-04\",\"projectEndDate\":\"2026-11-20\","
            + "\"specDocumentPath\":\"docs/spec.md\",\"reviewWaitHours\":24,\"noCommitHours\":72}";

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired TeamSettingsRepository teamSettings;

    private Workspace ws;
    private MockHttpSession admin;
    private MockHttpSession participant;
    private MockHttpSession instructor;

    @BeforeEach
    void setUp() {
        AppUser aliceUser = users.saveAndFlush(AppUser.github(1001L, "alice", "앨리스", null));
        AppUser bobUser = users.saveAndFlush(AppUser.github(1002L, "bob", "밥", null));
        AppUser instructorUser = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, aliceUser, PAST));
        Member alice = members.saveAndFlush(Member.collaborator(ws, aliceUser, 0, true, PAST));
        Member bob = members.saveAndFlush(Member.collaborator(ws, bobUser, 1, true, PAST));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, aliceUser, PAST));
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), null));

        admin = TestLogin.githubUser(aliceUser.getId(), 1001L)
                .member(ws.getId(), alice.getId(), WorkspaceRole.REPO_ADMIN).session();
        participant = TestLogin.githubUser(bobUser.getId(), 1002L)
                .member(ws.getId(), bob.getId(), WorkspaceRole.PARTICIPANT).session();
        instructor = TestLogin.githubUser(instructorUser.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private String path() {
        return "/api/workspaces/" + Ids.toApi(ws.getId()) + "/settings";
    }

    private ResultActions replace(MockHttpSession session, String body) throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        String token = setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
        return mvc.perform(put(path()).session(session).cookie(new Cookie("XSRF-TOKEN", token))
                .header("X-XSRF-TOKEN", token).header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private TeamSettings stored() {
        em.flush();
        em.clear();
        return teamSettings.findByWorkspaceId(ws.getId()).orElseThrow();
    }

    @Test
    void membersAndTheAssignedInstructorReadTheSettingsInTheContractShape() throws Exception {
        String response = mvc.perform(get(path()).session(participant))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projectStartDate").value("2026-11-04"))
                .andExpect(jsonPath("$.projectEndDate").value("2026-11-17"))
                .andExpect(jsonPath("$.specDocumentPath").value(nullValue()))
                .andExpect(jsonPath("$.reviewWaitHours").value(TeamSettings.DEFAULT_HOURS))
                .andExpect(jsonPath("$.noCommitHours").value(TeamSettings.DEFAULT_HOURS))
                .andReturn().getResponse().getContentAsString();

        JsonNode example = ContractShape.readExample("workspace", "workspace-snapshot.json").get("settings");
        JsonNode actual = ContractShape.readTree(response);
        ContractShape.assertSameShape(example, actual);
        ContractShape.assertCommonRules(actual);
        mvc.perform(get(path()).session(instructor)).andExpect(status().isOk());
    }

    @Test
    void theRepoAdminReplacesEverySettingAndTheSnapshotShowsIt() throws Exception {
        replace(admin, VALID)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projectEndDate").value("2026-11-20"))
                .andExpect(jsonPath("$.specDocumentPath").value("docs/spec.md"))
                .andExpect(jsonPath("$.reviewWaitHours").value(24))
                .andExpect(jsonPath("$.noCommitHours").value(72));

        assertThat(stored()).satisfies(s -> {
            assertThat(s.getProjectEndDate()).isEqualTo(LocalDate.of(2026, 11, 20));
            assertThat(s.getSpecDocumentPath()).isEqualTo("docs/spec.md");
            assertThat(s.getReviewWaitHours()).isEqualTo(24);
            assertThat(s.getNoCommitHours()).isEqualTo(72);
        });
        mvc.perform(get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/snapshot").session(admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.settings.reviewWaitHours").value(24))
                .andExpect(jsonPath("$.settings.specDocumentPath").value("docs/spec.md"));

        // 전체 교체 — 명세 문서 경로를 null로 되돌릴 수 있다
        replace(admin, VALID.replace("\"docs/spec.md\"", "null"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.specDocumentPath").value(nullValue()));
    }

    @Test
    void participantsAndInstructorsCannotChangeTheSettings() throws Exception {
        replace(participant, VALID)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        replace(instructor, VALID)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        assertThat(stored().getReviewWaitHours()).isEqualTo(TeamSettings.DEFAULT_HOURS);
    }

    @Test
    void outOfRangeValuesAndAnEndBeforeTheStartAreInvalid() throws Exception {
        for (String body : new String[] {
                VALID.replace("\"2026-11-20\"", "\"2026-11-03\""),   // 끝 < 시작
                VALID.replace(":24,", ":0,"),
                VALID.replace(":72}", ":721}"),
                VALID.replace("\"docs/spec.md\"", "\"\""),
                VALID.replace("\"docs/spec.md\"", "\"" + "a".repeat(301) + "\""),
                VALID.replace(",\"noCommitHours\":72", ""),
                VALID.replace("\"2026-11-04\"", "\"11/04\"")}) {
            replace(admin, body)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("invalid"));
        }
        assertThat(stored().getProjectEndDate()).isEqualTo(LocalDate.of(2026, 11, 17));
    }

    @Test
    void theSameDayForStartAndEndIsAllowed() throws Exception {
        replace(admin, VALID.replace("\"2026-11-20\"", "\"2026-11-04\"")).andExpect(status().isOk());
    }
}

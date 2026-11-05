package com.samdoryu.backend.requirement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.github.GithubReader;
import com.samdoryu.backend.github.GithubReaderSelector;
import com.samdoryu.backend.github.dto.GithubCollaborator;
import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.requirement.domain.Requirement;
import com.samdoryu.backend.requirement.domain.RequirementStatus;
import com.samdoryu.backend.requirement.repository.RequirementLinkRepository;
import com.samdoryu.backend.requirement.repository.RequirementRepository;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.sync.service.WorkspaceSyncService;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * #18 요구사항–이슈 연결 — 실제 Security · MVC · MySQL(CONTRACTS_API 「8」, CONTRACTS.md 「3」 · 「6」).
 * 쓰기는 화면과 같은 CSRF 쿠키 → 헤더 + Origin. 계약 테스트 ② — 실제 응답 ↔ Snapshot 예시의 {@code requirementLinks[0]}.
 */
@SpringBootTest(properties = {
        "app.origin=" + RequirementLinkIntegrationTest.ORIGIN,
        "app.instructor-github-user-ids=" + RequirementLinkIntegrationTest.INSTRUCTOR_GITHUB_ID})
@AutoConfigureMockMvc
@Transactional
class RequirementLinkIntegrationTest {

    static final String ORIGIN = "http://localhost:5173";
    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;
    @Autowired TaskRepository tasks;
    @Autowired RequirementRepository requirements;
    @Autowired RequirementLinkRepository links;
    @Autowired WorkspaceSyncService workspaceSyncService;

    @MockitoBean GithubReaderSelector readerSelector;

    private Workspace ws;
    private Workspace otherWs;
    private Requirement login;
    private Requirement docs;
    private Requirement otherWsRequirement;
    private Task task;
    private Task otherWsTask;
    private MockHttpSession adminSession;
    private MockHttpSession participantSession;
    private MockHttpSession instructorSession;

    @BeforeEach
    void setUp() {
        AppUser kim = users.saveAndFlush(AppUser.github(1001L, "kim", "김", null));
        AppUser lee = users.saveAndFlush(AppUser.github(1002L, "lee", "이", null));
        AppUser instructor = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "teacher", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "repo", 77L, kim, T0));
        otherWs = workspaces.saveAndFlush(Workspace.github(5002L, "samdoryu", "other", 78L, kim, T0));
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17),
                "docs/requirements.md"));
        Member kimMember = members.saveAndFlush(Member.collaborator(ws, kim, 0, true, T0));
        Member leeMember = members.saveAndFlush(Member.collaborator(ws, lee, 1, false, T0));
        Member kimElsewhere = members.saveAndFlush(Member.collaborator(otherWs, kim, 0, true, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, kim, T0));

        login = requirements.saveAndFlush(new Requirement(ws, "FR-AUTH-01", "FR-AUTH-01 로그인", "로그인", 0, T0));
        docs = requirements.saveAndFlush(new Requirement(ws, null, "문서 정리", "문서 정리", 1, T0));
        otherWsRequirement = requirements.saveAndFlush(new Requirement(otherWs, null, "남의 것", "남의 것", 0, T0));
        task = tasks.saveAndFlush(task(ws, 1));
        otherWsTask = tasks.saveAndFlush(task(otherWs, 1));

        // 김은 두 사무실 모두 레포 관리자 — 다른 사무실 ID를 내 사무실 경로에 넣는 IDOR를 본다
        adminSession = TestLogin.githubUser(kim.getId(), 1001L)
                .member(ws.getId(), kimMember.getId(), WorkspaceRole.REPO_ADMIN)
                .member(otherWs.getId(), kimElsewhere.getId(), WorkspaceRole.REPO_ADMIN).session();
        participantSession = TestLogin.githubUser(lee.getId(), 1002L)
                .member(ws.getId(), leeMember.getId(), WorkspaceRole.PARTICIPANT).session();
        instructorSession = TestLogin.githubUser(instructor.getId(), INSTRUCTOR_GITHUB_ID).session();
    }

    private static Task task(Workspace workspace, int number) {
        return Task.builder().workspace(workspace).githubIssueNumber(number).title("로그인 화면").state(TaskState.OPEN)
                .labelsJson("[]").githubCreatedAt(T0).githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build();
    }

    private String base(Workspace workspace) {
        return "/api/workspaces/" + Ids.toApi(workspace.getId()) + "/requirement-links";
    }

    private String csrfToken() throws Exception {
        String setCookie = mvc.perform(get("/api/health")).andReturn().getResponse().getHeader(HttpHeaders.SET_COOKIE);
        return setCookie.substring("XSRF-TOKEN=".length(), setCookie.indexOf(';'));
    }

    private ResultActions link(Workspace workspace, MockHttpSession session, Object requirementId, Object taskId)
            throws Exception {
        String token = csrfToken();
        return mvc.perform(post(base(workspace)).session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirementId\":\"" + requirementId + "\",\"taskId\":\"" + taskId + "\"}"));
    }

    private ResultActions unlink(Workspace workspace, MockHttpSession session, Object linkId) throws Exception {
        String token = csrfToken();
        return mvc.perform(delete(base(workspace) + "/" + linkId).session(session)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .header(HttpHeaders.ORIGIN, ORIGIN));
    }

    @Test
    void repoAdminLinksAndTheSameRequestReturnsTheExistingLink() throws Exception {
        String body = link(ws, adminSession, login.getId(), task.getId())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.requirementId").value(Ids.toApi(login.getId())))
                .andExpect(jsonPath("$.taskId").value(Ids.toApi(task.getId())))
                .andReturn().getResponse().getContentAsString();
        JsonNode created = ContractShape.readTree(body);
        ContractShape.assertSameShape(
                ContractShape.readExample("workspace", "workspace-snapshot.json").get("requirementLinks").get(0),
                created);
        ContractShape.assertCommonRules(created);

        link(ws, adminSession, login.getId(), task.getId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(created.get("id").asString()))
                .andExpect(jsonPath("$.linkedAt").value(created.get("linkedAt").asString()));
        assertThat(links.count()).isEqualTo(1);

        // 연결은 GitHub를 부르지 않는다 — 앱 서버에만 저장
        verifyNoInteractions(readerSelector);
    }

    @Test
    void snapshotListsTheLinksAndCountsProgress() throws Exception {
        link(ws, adminSession, login.getId(), task.getId()).andExpect(status().isCreated());

        mvc.perform(get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/snapshot").session(participantSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requirementLinks.length()").value(1))
                .andExpect(jsonPath("$.requirementLinks[0].requirementId").value(Ids.toApi(login.getId())))
                .andExpect(jsonPath("$.requirementLinks[0].taskId").value(Ids.toApi(task.getId())))
                .andExpect(jsonPath("$.requirements[0].linkedTaskCount").value(1))
                .andExpect(jsonPath("$.requirements[0].doneTaskCount").value(0));
    }

    @Test
    void onlyTheRepoAdminCanLinkOrUnlink() throws Exception {
        link(ws, participantSession, login.getId(), task.getId())
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden_role"));
        link(ws, instructorSession, login.getId(), task.getId())
                .andExpect(status().isForbidden());

        String linkId = ContractShape.readTree(link(ws, adminSession, login.getId(), task.getId())
                .andReturn().getResponse().getContentAsString()).get("id").asString();
        unlink(ws, participantSession, linkId).andExpect(status().isForbidden());
        unlink(ws, instructorSession, linkId).andExpect(status().isForbidden());
        assertThat(links.count()).isEqualTo(1);
    }

    @Test
    void otherWorkspacesRequirementIssueOrLinkIsNotFound() throws Exception {
        link(ws, adminSession, otherWsRequirement.getId(), task.getId())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
        link(ws, adminSession, login.getId(), otherWsTask.getId()).andExpect(status().isNotFound());
        link(ws, adminSession, 999_999_999L, task.getId()).andExpect(status().isNotFound());

        String linkId = ContractShape.readTree(link(ws, adminSession, login.getId(), task.getId())
                .andReturn().getResponse().getContentAsString()).get("id").asString();
        // 내 사무실 연결을 다른 사무실 경로로 지우기
        unlink(otherWs, adminSession, linkId).andExpect(status().isNotFound());
        unlink(ws, adminSession, "abc").andExpect(status().isNotFound());
        assertThat(links.count()).isEqualTo(1);
    }

    @Test
    void requirementThatIsNotActiveTakesNoNewLinks() throws Exception {
        docs.markUnmatched(RequirementStatus.MISSING);
        login.markUnmatched(RequirementStatus.NEEDS_REVIEW);
        requirements.saveAllAndFlush(List.of(docs, login));

        link(ws, adminSession, docs.getId(), task.getId())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("conflict"));
        link(ws, adminSession, login.getId(), task.getId()).andExpect(status().isConflict());
        assertThat(links.count()).isZero();
    }

    @Test
    void malformedBodyIsInvalid() throws Exception {
        link(ws, adminSession, "abc", task.getId())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("invalid"));
        String token = csrfToken();
        mvc.perform(post(base(ws)).session(adminSession)
                        .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                        .header(HttpHeaders.ORIGIN, ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"requirementId\":\"1\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void writesNeedCsrf() throws Exception {
        mvc.perform(post(base(ws)).session(adminSession).header(HttpHeaders.ORIGIN, ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requirementId\":\"" + login.getId() + "\",\"taskId\":\"" + task.getId() + "\"}"))
                .andExpect(status().isForbidden());
        assertThat(links.count()).isZero();
    }

    @Test
    void unlinkRemovesOnlyTheLink() throws Exception {
        String linkId = ContractShape.readTree(link(ws, adminSession, login.getId(), task.getId())
                .andReturn().getResponse().getContentAsString()).get("id").asString();

        unlink(ws, adminSession, linkId).andExpect(status().isNoContent());

        assertThat(links.count()).isZero();
        assertThat(requirements.findById(login.getId())).isPresent();
        assertThat(tasks.findById(task.getId())).isPresent();
        unlink(ws, adminSession, linkId).andExpect(status().isNotFound());
    }

    /** 동기화 · 명세 문서 재동기화 뒤에도 연결은 그대로다(FR-REQ-07 · CONTRACTS.md 「3」). */
    @Test
    void linksSurviveSyncAndResync() throws Exception {
        link(ws, adminSession, login.getId(), task.getId()).andExpect(status().isCreated());
        link(ws, adminSession, docs.getId(), task.getId()).andExpect(status().isCreated());

        GithubReader reader = mock(GithubReader.class);
        given(readerSelector.forKind(WorkspaceKind.GITHUB)).willReturn(reader);
        given(reader.collaborators(any())).willReturn(List.of(
                new GithubCollaborator(new GithubUser(1001L, "kim", null), true),
                new GithubCollaborator(new GithubUser(1002L, "lee", null), false)));
        given(reader.issuesUpdatedSince(any(), any())).willReturn(List.of(
                new GithubIssue(1, "로그인 화면 (제목 바뀜)", true, GithubIssue.ClosedReason.COMPLETED, List.of(),
                        List.of(), T0, T0.plusSeconds(60), T0.plusSeconds(60))));
        // 문서에서 "문서 정리"가 사라져 missing이 되어도 연결은 남는다
        given(reader.readFile(any(), any())).willReturn(Optional.of("## FR-AUTH-01 GitHub 로그인\n"));

        workspaceSyncService.sync(ws.getId(), null, true, T0.plusSeconds(120));
        em.flush();
        em.clear();

        assertThat(links.count()).isEqualTo(2);
        assertThat(requirements.findById(docs.getId()).orElseThrow().getStatus()).isEqualTo(RequirementStatus.MISSING);
        assertThat(requirements.findById(login.getId()).orElseThrow().getTitle()).isEqualTo("GitHub 로그인");
    }
}

package com.samdoryu.backend.sync.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.contract.ContractShape;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.github.GithubReaderSelector;
import com.samdoryu.backend.github.dto.GithubCollaborator;
import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.requirement.domain.Requirement;
import com.samdoryu.backend.requirement.domain.RequirementLink;
import com.samdoryu.backend.requirement.domain.RequirementStatus;
import com.samdoryu.backend.requirement.repository.RequirementLinkRepository;
import com.samdoryu.backend.requirement.repository.RequirementRepository;
import com.samdoryu.backend.sync.dto.SpecWarning;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * #14 요구사항 재동기화 — 실제 MySQL로 저장 결과를 본다(CONTRACTS.md 「3」 요구사항 재동기화 · 「9」 계약 테스트 시나리오).
 * 실제 사무실은 가짜 어댑터(GitHub를 부르지 않음). 계약 테스트 ② — Snapshot {@code requirements} ↔ 예시.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RequirementResyncIntegrationTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final Instant T1 = T0.plusSeconds(3600);
    private static final String PATH = "docs/requirements.md";

    @Autowired WorkspaceSyncService syncService;
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired MemberRepository members;
    @Autowired TaskRepository tasks;
    @Autowired RequirementRepository requirements;
    @Autowired RequirementLinkRepository links;

    @MockitoBean GithubReaderSelector readerSelector;

    private final FakeGithubReader fake = new FakeGithubReader();
    private AppUser kim;
    private Workspace ws;

    @BeforeEach
    void setUp() {
        given(readerSelector.forKind(WorkspaceKind.GITHUB)).willReturn(fake);
        kim = users.saveAndFlush(AppUser.github(1001L, "kim", "김", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "repo", 77L, kim, T0));
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), PATH));
        fake.collaborators = List.of(new GithubCollaborator(new GithubUser(1001L, "kim", null), true));
        fake.issues = List.of(
                new GithubIssue(1, "로그인 화면", false, null, List.of(), List.of(), T0, T0, null),
                new GithubIssue(2, "문서", true, GithubIssue.ClosedReason.COMPLETED, List.of(), List.of(), T0, T0, T0));
        fake.files.put(PATH, """
                # 요구사항
                ## FR-AUTH-01 로그인
                ## 문서 정리
                ## FR-OFF-01 책상 배치
                """);
    }

    private WorkspaceSyncService.Outcome manualSync(Instant now) {
        WorkspaceSyncService.Outcome outcome = syncService.sync(ws.getId(), null, true, now);
        em.flush();
        em.clear();
        return outcome;
    }

    private Map<String, Requirement> byTitle() {
        return requirements.findByWorkspaceIdOrderByPositionAsc(ws.getId()).stream()
                .collect(Collectors.toMap(Requirement::getTitle, Function.identity()));
    }

    private void link(Requirement requirement, int issueNumber) {
        links.saveAndFlush(new RequirementLink(requirement,
                tasks.findByWorkspaceIdAndGithubIssueNumber(ws.getId(), issueNumber).orElseThrow(), kim, T0));
    }

    @Test
    void firstReadCreatesOneRequirementPerLevelTwoHeading() {
        WorkspaceSyncService.Outcome outcome = manualSync(T0);

        assertThat(outcome.specWarnings()).isEmpty();
        assertThat(requirements.findByWorkspaceIdOrderByPositionAsc(ws.getId()))
                .extracting(Requirement::getPosition, Requirement::getSourceKey, Requirement::getTitle,
                        Requirement::getStatus, Requirement::getLastSeenAt)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(0, "FR-AUTH-01", "로그인", RequirementStatus.ACTIVE, T0),
                        org.assertj.core.groups.Tuple.tuple(1, null, "문서 정리", RequirementStatus.ACTIVE, T0),
                        org.assertj.core.groups.Tuple.tuple(2, "FR-OFF-01", "책상 배치", RequirementStatus.ACTIVE, T0));
    }

    /** 「9」 계약 테스트 — 원본 ID 있는 제목 변경 → 같은 ID, 원본 ID 없는 제목 변경 → 옛것 missing + 새것, 연결 보존, 원본 ID 중복 → needs_review + 경고. */
    @Test
    void resyncKeepsIdsAndLinksAndMarksMissingAndAmbiguousOnes() {
        manualSync(T0);
        Map<String, Requirement> first = byTitle();
        link(first.get("로그인"), 1);
        link(first.get("문서 정리"), 2);
        link(first.get("책상 배치"), 1);

        fake.files.put(PATH, """
                ## 개발 문서 정리
                ## FR-AUTH-01 GitHub 로그인
                ## FR-OFF-01 책상 배치
                ## FR-OFF-01 자리 고르기
                """);
        WorkspaceSyncService.Outcome outcome = manualSync(T1);

        Map<String, Requirement> after = byTitle();
        Requirement login = after.get("GitHub 로그인");
        assertThat(login.getId()).isEqualTo(first.get("로그인").getId());
        assertThat(login.getPosition()).isEqualTo(1);
        assertThat(login.getStatus()).isEqualTo(RequirementStatus.ACTIVE);
        assertThat(login.getLastSeenAt()).isEqualTo(T1);

        Requirement oldDocs = after.get("문서 정리");
        assertThat(oldDocs.getId()).isEqualTo(first.get("문서 정리").getId());
        assertThat(oldDocs.getStatus()).isEqualTo(RequirementStatus.MISSING);
        assertThat(oldDocs.getLastSeenAt()).isEqualTo(T0);
        assertThat(after.get("개발 문서 정리").getStatus()).isEqualTo(RequirementStatus.ACTIVE);

        Requirement desks = after.get("책상 배치");
        assertThat(desks.getId()).isEqualTo(first.get("책상 배치").getId());
        assertThat(desks.getStatus()).isEqualTo(RequirementStatus.NEEDS_REVIEW);
        assertThat(after).doesNotContainKey("자리 고르기");
        assertThat(outcome.specWarnings()).containsExactly(
                SpecWarning.duplicateSourceKey("FR-OFF-01 책상 배치"),
                SpecWarning.duplicateSourceKey("FR-OFF-01 자리 고르기"));

        // 재동기화는 연결을 지우지 않는다 — missing · needs_review 요구사항의 연결도 남는다
        assertThat(links.count()).isEqualTo(3);

        // 문서를 고치면 needs_review가 풀린다
        fake.files.put(PATH, "## 개발 문서 정리\n## FR-AUTH-01 GitHub 로그인\n## FR-OFF-01 책상 배치\n");
        assertThat(manualSync(T1.plusSeconds(60)).specWarnings()).isEmpty();
        assertThat(requirements.findById(desks.getId()).orElseThrow().getStatus()).isEqualTo(RequirementStatus.ACTIVE);
    }

    /** 문서 읽기 실패(파일 없음) → 요구사항을 하나도 바꾸지 않는다. */
    @Test
    void unreadableSpecChangesNothing() {
        manualSync(T0);
        fake.files.clear();

        WorkspaceSyncService.Outcome outcome = manualSync(T1);

        assertThat(outcome.specWarnings()).containsExactly(SpecWarning.specNotFound());
        assertThat(requirements.findByWorkspaceIdOrderByPositionAsc(ws.getId()))
                .hasSize(3)
                .allSatisfy(requirement -> {
                    assertThat(requirement.getStatus()).isEqualTo(RequirementStatus.ACTIVE);
                    assertThat(requirement.getLastSeenAt()).isEqualTo(T0);
                });
    }

    /** GitHub 오류는 동기화 실패로 던진다 — 기록은 SyncService가 남기고 데이터는 되돌린다(FR-GH-05). */
    @Test
    void githubErrorWhileReadingTheSpecFailsTheSync() {
        fake.fileFailWith = new ApiException(ErrorCode.GITHUB_RATE_LIMITED);

        assertThatThrownBy(() -> syncService.sync(ws.getId(), null, true, T0))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.GITHUB_RATE_LIMITED));
    }

    @Test
    void pollingAndAnEmptyPathDoNotReadTheSpec() {
        WorkspaceSyncService.Outcome polling = syncService.sync(ws.getId(), null, false, T0);
        assertThat(polling.specRead()).isFalse();
        assertThat(fake.filesRead).isEmpty();

        TeamSettings settings = teamSettings.findByWorkspaceId(ws.getId()).orElseThrow();
        settings.replace(settings.getProjectStartDate(), settings.getProjectEndDate(), "  ",
                settings.getReviewWaitHours(), settings.getNoCommitHours());
        WorkspaceSyncService.Outcome emptyPath = manualSync(T0);

        assertThat(emptyPath.specWarnings()).isEmpty();
        assertThat(fake.filesRead).isEmpty();
        assertThat(requirements.findByWorkspaceIdOrderByPositionAsc(ws.getId())).isEmpty();
    }

    /** Snapshot {@code requirements} — 상태 무관 전부, position 순, 진행률은 연결 이슈 수 · 그중 닫힌 이슈 수. 계약 ②. */
    @Test
    void snapshotListsRequirementsWithProgress() throws Exception {
        Member kimMember = members.saveAndFlush(Member.collaborator(ws, kim, 0, true, T0));
        manualSync(T0);
        Map<String, Requirement> saved = byTitle();
        link(saved.get("로그인"), 1);
        link(saved.get("로그인"), 2);
        MockHttpSession session = TestLogin.githubUser(kim.getId(), 1001L)
                .member(ws.getId(), kimMember.getId(), WorkspaceRole.REPO_ADMIN).session();

        String body = mvc.perform(get("/api/workspaces/" + Ids.toApi(ws.getId()) + "/snapshot").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requirements[0].id").value(Ids.toApi(saved.get("로그인").getId())))
                .andExpect(jsonPath("$.requirements[0].sourceKey").value("FR-AUTH-01"))
                .andExpect(jsonPath("$.requirements[0].title").value("로그인"))
                .andExpect(jsonPath("$.requirements[0].status").value("active"))
                .andExpect(jsonPath("$.requirements[0].linkedTaskCount").value(2))
                .andExpect(jsonPath("$.requirements[0].doneTaskCount").value(1))
                .andExpect(jsonPath("$.requirements[1].linkedTaskCount").value(0))
                .andExpect(jsonPath("$.requirements.length()").value(3))
                .andReturn().getResponse().getContentAsString();

        JsonNode requirement = ContractShape.readTree(body).get("requirements").get(0);
        ContractShape.assertSameShape(
                ContractShape.readExample("workspace", "workspace-snapshot.json").get("requirements").get(0),
                requirement);
        ContractShape.assertCommonRules(requirement);
    }
}

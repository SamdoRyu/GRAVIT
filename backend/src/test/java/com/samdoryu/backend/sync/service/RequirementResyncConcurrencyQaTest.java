package com.samdoryu.backend.sync.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
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
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * QA-04(QA-LITE) — 요구사항 재동기화를 반복해도 행이 늘지 않고, 재동기화 도중 Snapshot을 동시에 읽어도 모두 200 · 일관된 목록인지.
 * 기존 {@code RequirementResyncIntegrationTest}(ID · 연결 보존 · missing · needs_review)를 보완한다. 가짜 어댑터 — GitHub를 부르지 않는다.
 * 운영처럼 커밋되게 테스트 트랜잭션 없이 돌고, 만든 행은 사무실 ID로 지운다.
 */
@SpringBootTest
@AutoConfigureMockMvc
class RequirementResyncConcurrencyQaTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final String PATH = "docs/requirements.md";
    private static final String DOC_V1 = "## FR-AUTH-01 로그인\n## 문서 정리\n## FR-OFF-01 책상 배치\n";
    /** 원본 ID 있는 제목 변경 · 원본 ID 없는 제목 변경(옛것 missing + 새것) · 새 요구사항 · 하나 삭제(FR-OFF-01 → missing) → 5행. */
    private static final String DOC_V2 = "## FR-AUTH-01 GitHub 로그인\n## 개발 문서 정리\n## FR-REQ-09 회고 리포트\n";

    @Autowired WorkspaceSyncService syncService;
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
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
    private MockHttpSession session;

    @BeforeEach
    void setUp() {
        given(readerSelector.forKind(WorkspaceKind.GITHUB)).willReturn(fake);
        kim = users.saveAndFlush(AppUser.github(893_001L, "qa-req-kim", "김", null));
        ws = workspaces.saveAndFlush(Workspace.github(893_002L, "samdoryu", "qa-req", 893_003L, kim, T0));
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), PATH));
        Member member = members.saveAndFlush(Member.collaborator(ws, kim, 0, true, T0));
        fake.collaborators = List.of(new GithubCollaborator(new GithubUser(893_001L, "qa-req-kim", null), true));
        fake.issues = List.of(
                new GithubIssue(1, "로그인 화면", false, null, List.of(), List.of(), T0, T0, null),
                new GithubIssue(2, "문서", false, null, List.of(), List.of(), T0, T0, null));
        fake.files.put(PATH, DOC_V1);
        session = TestLogin.githubUser(kim.getId(), 893_001L).member(ws.getId(), member.getId(), WorkspaceRole.REPO_ADMIN)
                .session();
    }

    @AfterEach
    void cleanUp() {
        Long id = ws.getId();
        jdbc.update("DELETE l FROM requirement_link l JOIN requirement r ON r.id = l.requirement_id WHERE r.workspace_id = ?", id);
        jdbc.update("DELETE a FROM task_assignee a JOIN task t ON t.id = a.task_id WHERE t.workspace_id = ?", id);
        for (String table : List.of("requirement", "task", "sync_state", "team_settings", "team_member")) {
            jdbc.update("DELETE FROM " + table + " WHERE workspace_id = ?", id);
        }
        jdbc.update("DELETE FROM workspace WHERE id = ?", id);
        jdbc.update("DELETE FROM app_user WHERE id = ?", kim.getId());
    }

    private Map<String, Requirement> byTitle() {
        return requirements.findByWorkspaceIdOrderByPositionAsc(ws.getId()).stream()
                .collect(Collectors.toMap(Requirement::getTitle, Function.identity()));
    }

    private int count(String sql) {
        return jdbc.queryForObject(sql, Integer.class, ws.getId());
    }

    @Test
    void repeatedResyncIsStableAndConcurrentSnapshotsStayConsistent() throws Exception {
        syncService.sync(ws.getId(), null, true, T0);
        Map<String, Requirement> v1 = byTitle();
        assertThat(v1).hasSize(3);
        Long loginTaskId = tasks.findByWorkspaceIdAndGithubIssueNumber(ws.getId(), 1).orElseThrow().getId();
        links.saveAndFlush(new RequirementLink(v1.get("로그인"), tasks.findById(loginTaskId).orElseThrow(), kim, T0));
        links.saveAndFlush(new RequirementLink(v1.get("책상 배치"), tasks.findById(loginTaskId).orElseThrow(), kim, T0));

        // 재동기화 도중 Snapshot을 계속 읽는다 — 상태 코드 · 요구사항 목록 모양을 모은다
        String path = "/api/workspaces/" + Ids.toApi(ws.getId()) + "/snapshot";
        AtomicBoolean stop = new AtomicBoolean();
        Map<Integer, AtomicInteger> statuses = new ConcurrentHashMap<>();
        List<String> shapes = java.util.Collections.synchronizedList(new ArrayList<>());
        JsonMapper json = JsonMapper.builder().build();
        Thread reader = new Thread(() -> {
            while (!stop.get()) {
                try {
                    var res = mvc.perform(get(path).session(session)).andReturn().getResponse();
                    statuses.computeIfAbsent(res.getStatus(), k -> new AtomicInteger()).incrementAndGet();
                    if (res.getStatus() == 200) {
                        JsonNode reqs = json.readTree(res.getContentAsString()).get("requirements");
                        shapes.add(reqs.size() + ":" + reqs.findValuesAsString("status"));
                    }
                } catch (Exception e) {
                    statuses.computeIfAbsent(-1, k -> new AtomicInteger()).incrementAndGet();
                }
            }
        });
        reader.start();
        Thread.sleep(200); // V1 상태의 Snapshot도 몇 번 읽게
        fake.files.put(PATH, DOC_V2);
        for (int i = 1; i <= 20; i++) { // 같은 V2 문서로 스무 번(첫 번째만 바뀌고 나머지는 그대로여야 한다)
            syncService.sync(ws.getId(), null, true, T0.plusSeconds(3600L * i));
            Thread.sleep(50);
        }
        stop.set(true);
        reader.join(30_000);
        var finalRes = mvc.perform(get(path).session(session)).andReturn().getResponse();
        JsonNode finalReqs = json.readTree(finalRes.getContentAsString()).get("requirements");
        String finalShape = finalReqs.size() + ":" + finalReqs.findValuesAsString("status");
        System.out.println("QA_REQ snapshot statuses during resync " + statuses + " reads=" + shapes.size()
                + " shapes " + shapes.stream().distinct().toList() + " final " + finalShape);

        // 동시 Snapshot: 모두 200, 목록은 V1(3개 active) 또는 최종(V2 반영) 두 모양 중 하나 — 반쯤 바뀐 목록 없음
        assertThat(statuses.keySet()).containsOnly(200);
        assertThat(shapes.size()).isGreaterThan(5);
        assertThat(shapes.stream().distinct().toList()).allSatisfy(s ->
                assertThat(s).isIn("3:[active, active, active]", finalShape));

        // 반복 동기화: 행 수가 첫 재동기화 뒤로 늘지 않는다(V1 3 + 새 2 = 5), 원본 ID · 연결 보존
        Map<String, Requirement> v2 = byTitle();
        assertThat(count("SELECT COUNT(*) FROM requirement WHERE workspace_id = ?")).isEqualTo(5);
        assertThat(v2.get("개발 문서 정리").getStatus()).isEqualTo(RequirementStatus.ACTIVE);
        assertThat(v2.get("GitHub 로그인").getId()).isEqualTo(v1.get("로그인").getId());
        assertThat(v2.get("GitHub 로그인").getStatus()).isEqualTo(RequirementStatus.ACTIVE);
        assertThat(v2.get("문서 정리").getStatus()).isEqualTo(RequirementStatus.MISSING);
        assertThat(v2.get("책상 배치").getId()).isEqualTo(v1.get("책상 배치").getId());
        assertThat(v2.get("책상 배치").getStatus()).isEqualTo(RequirementStatus.MISSING);
        assertThat(v2.get("회고 리포트").getStatus()).isEqualTo(RequirementStatus.ACTIVE);
        assertThat(count("SELECT COUNT(*) FROM requirement_link l JOIN requirement r ON r.id = l.requirement_id "
                + "WHERE r.workspace_id = ?")).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM task WHERE workspace_id = ?")).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM (SELECT source_key FROM requirement WHERE workspace_id = ? AND source_key IS NOT NULL "
                + "AND status = 'ACTIVE' GROUP BY source_key HAVING COUNT(*) > 1) d")).isZero();
    }
}

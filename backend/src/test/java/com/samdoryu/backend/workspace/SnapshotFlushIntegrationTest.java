package com.samdoryu.backend.workspace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samdoryu.backend.auth.TestLogin;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

/**
 * EXP-FLUSH(QA 실험) — Snapshot 읽기의 auto-flush · dirty check와 SyncState 최초 생성.
 * 운영처럼 {@code load()}가 가장 바깥 트랜잭션이 되게 테스트 트랜잭션 없이 돈다(그래서 만든 행은 직접 지운다).
 */
@SpringBootTest(properties = "spring.jpa.properties.hibernate.session.events.auto="
        + "com.samdoryu.backend.workspace.FlushCountingListener")
@AutoConfigureMockMvc
class SnapshotFlushIntegrationTest {

    private static final Instant T0 = Instant.parse("2026-11-05T01:20:00Z");
    private static final long GH_BASE = 880_000L;

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired MemberRepository members;
    @Autowired TaskRepository tasks;
    @Autowired SubmissionRepository submissions;

    private final List<Long> workspaceIds = new ArrayList<>();
    private final List<Long> userIds = new ArrayList<>();
    private int seq;

    private record Fixture(Workspace ws, MockHttpSession session) {
        String path() {
            return "/api/workspaces/" + Ids.toApi(ws.getId()) + "/snapshot";
        }
    }

    /** sync_state 없는 사무실 — 팀원 1 · 이슈 40 · PR 20(영속성 컨텍스트에 엔티티가 쌓이게). */
    private Fixture workspaceWithoutSyncState(int issues, int prs) {
        long gh = GH_BASE + (++seq) * 10;
        AppUser user = users.saveAndFlush(AppUser.github(gh, "flush-" + gh, "flush", null));
        userIds.add(user.getId());
        Workspace ws = workspaces.saveAndFlush(Workspace.github(gh + 1, "samdoryu", "flush-" + gh, null, user, T0));
        workspaceIds.add(ws.getId());
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), null));
        Member member = members.saveAndFlush(Member.collaborator(ws, user, 0, true, T0));
        for (int n = 1; n <= issues; n++) {
            tasks.save(Task.builder().workspace(ws).githubIssueNumber(n).title("이슈 " + n).state(TaskState.OPEN)
                    .labelsJson("[]").githubCreatedAt(T0).githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build());
        }
        for (int n = 1; n <= prs; n++) {
            submissions.save(Submission.builder().workspace(ws).githubPrNumber(100 + n).title("PR " + n)
                    .authorGithubUserId(gh).authorGithubLogin("flush-" + gh).authorMember(member)
                    .state(SubmissionState.OPEN).headSha("0123456789abcdef0123456789abcdef01234567")
                    .reviewRequestsJson("[]").reviewsJson("[]").labelsJson("[]").githubCreatedAt(T0)
                    .githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build());
        }
        tasks.flush();
        MockHttpSession session = TestLogin.githubUser(user.getId(), gh)
                .member(ws.getId(), member.getId(), WorkspaceRole.REPO_ADMIN).session();
        return new Fixture(ws, session);
    }

    private int syncStateRows(Workspace ws) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM sync_state WHERE workspace_id = ?", Integer.class, ws.getId());
    }

    @AfterEach
    void cleanUp() {
        for (Long id : workspaceIds) {
            for (String table : List.of("sync_state", "submission", "task", "team_settings", "team_member")) {
                jdbc.update("DELETE FROM " + table + " WHERE workspace_id = ?", id);
            }
            jdbc.update("DELETE FROM workspace WHERE id = ?", id);
        }
        userIds.forEach(id -> jdbc.update("DELETE FROM app_user WHERE id = ?", id));
    }

    @Test
    void snapshotCreatesAndCommitsSyncStateWithoutDirtyCheckingBeforeEachQuery() throws Exception {
        Fixture f = workspaceWithoutSyncState(40, 20);
        assertThat(syncStateRows(f.ws())).isZero();

        FlushCountingListener.reset();
        mvc.perform(get(f.path()).session(f.session())).andExpect(status().isOk())
                .andExpect(jsonPath("$.sync").exists())
                .andExpect(jsonPath("$.tasks.length()").value(40))
                .andExpect(jsonPath("$.submissions.length()").value(20));
        System.out.println("QA_FLUSH first-snapshot " + FlushCountingListener.report());

        // T2: 행이 생기고 커밋됐다(다른 커넥션에서 보인다)
        assertThat(syncStateRows(f.ws())).isEqualTo(1);
        // 원인 검증: 쿼리 직전 dirty check 패스가 없다(커밋 flush는 남는다)
        assertThat(FlushCountingListener.DIRTY_CHECK_PASSES.get()).isZero();
        assertThat(FlushCountingListener.FULL_FLUSHES.get()).isPositive();
    }

    @Test
    void repeatedSnapshotsLeaveSyncStateAndDataUnchanged() throws Exception {
        Fixture f = workspaceWithoutSyncState(10, 5);
        mvc.perform(get(f.path()).session(f.session())).andExpect(status().isOk());
        Map<String, Object> state = jdbc.queryForMap("SELECT * FROM sync_state WHERE workspace_id = ?", f.ws().getId());
        String counts = "SELECT (SELECT COUNT(*) FROM sync_state), (SELECT COUNT(*) FROM task), (SELECT COUNT(*) FROM submission)";
        Map<String, Object> before = jdbc.queryForMap(counts);

        FlushCountingListener.reset();
        for (int i = 0; i < 3; i++) {
            mvc.perform(get(f.path()).session(f.session())).andExpect(status().isOk());
        }
        System.out.println("QA_FLUSH repeated-snapshots(3) " + FlushCountingListener.report());

        // T3: 새 행 · 상태 변경 없음
        assertThat(jdbc.queryForMap("SELECT * FROM sync_state WHERE workspace_id = ?", f.ws().getId())).isEqualTo(state);
        assertThat(jdbc.queryForMap(counts)).isEqualTo(before);
    }

    /**
     * T9 · QA-01: sync_state 없는 사무실에 첫 조회가 동시에(2개 × 5라운드, 4개 × 5라운드) — 모두 200, 행은 1개.
     * 고치기 전에는 매 라운드 한쪽이 503(UNIQUE 충돌)이었다.
     */
    @Test
    void concurrentFirstSnapshots() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            List<String> outcomes = new ArrayList<>();
            for (int round = 0; round < 10; round++) {
                int parallel = round < 5 ? 2 : 4;
                Fixture f = workspaceWithoutSyncState(5, 2);
                CountDownLatch start = new CountDownLatch(1);
                List<Future<Integer>> results = new ArrayList<>();
                for (int t = 0; t < parallel; t++) {
                    results.add(pool.submit(() -> {
                        start.await();
                        return mvc.perform(get(f.path()).session(f.session())).andReturn().getResponse().getStatus();
                    }));
                }
                start.countDown();
                List<Integer> statuses = new ArrayList<>();
                for (Future<Integer> r : results) {
                    statuses.add(r.get(30, TimeUnit.SECONDS));
                }
                outcomes.add(statuses.toString());
                assertThat(syncStateRows(f.ws())).isEqualTo(1);
                // 재조회: 만든 행을 그대로 읽는다(새 행 없음)
                mvc.perform(get(f.path()).session(f.session())).andExpect(status().isOk());
                assertThat(syncStateRows(f.ws())).isEqualTo(1);
            }
            System.out.println("QA_FLUSH concurrent-first " + outcomes);
            assertThat(String.join("", outcomes).replaceAll("[\\[\\], ]", "")).matches("(200)+");
        } finally {
            pool.shutdownNow();
        }
    }
}

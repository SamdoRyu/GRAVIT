package com.samdoryu.backend.sync.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.github.GithubReaderSelector;
import com.samdoryu.backend.github.dto.GithubCollaborator;
import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubIssueLink;
import com.samdoryu.backend.github.dto.GithubPullRequest;
import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.github.seed.SeedGithubReader;
import com.samdoryu.backend.sync.domain.AssigneeOrder;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.repository.SubmissionIssueLinkRepository;
import com.samdoryu.backend.sync.repository.SubmissionRepository;
import com.samdoryu.backend.sync.repository.TaskAssigneeRepository;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

/**
 * #71 — 콜라보레이터 → 팀원, PR–이슈 공식 연결을 실제 MySQL로 확인한다(CONTRACTS.md 「2」 소유 · 「9」 동기화와 앱 기록).
 * 실제 사무실은 가짜 어댑터, 시연 사무실은 실제 Seed 어댑터.
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + WorkspaceSyncIntegrationTest.INSTRUCTOR_ID)
@Transactional
class WorkspaceSyncIntegrationTest {

    static final long INSTRUCTOR_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final Instant T1 = T0.plusSeconds(3600);
    private static final Instant T2 = T1.plusSeconds(3600);

    @Autowired WorkspaceSyncService syncService;
    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired MemberRepository members;
    @Autowired TaskRepository tasks;
    @Autowired TaskAssigneeRepository assignees;
    @Autowired SubmissionRepository submissions;
    @Autowired SubmissionIssueLinkRepository links;

    @MockitoBean GithubReaderSelector readerSelector;

    private static GithubCollaborator collaborator(long id, String login, boolean admin) {
        return new GithubCollaborator(new GithubUser(id, login, "https://avatars/" + id), admin);
    }

    private Member member(Workspace ws, long githubUserId) {
        AppUser user = users.findByGithubUserId(githubUserId).orElseThrow();
        return members.findByWorkspaceIdAndUserId(ws.getId(), user.getId()).orElseThrow();
    }

    private void syncAndClear(Workspace ws, Instant now) {
        syncService.sync(ws.getId(), null, false, now);
        em.flush();
        em.clear();
    }

    @Nested
    class Collaborators {

        private final FakeGithubReader fake = new FakeGithubReader();
        private Workspace ws;

        @BeforeEach
        void setUp() {
            given(readerSelector.forKind(WorkspaceKind.GITHUB)).willReturn(fake);
            AppUser opener = users.saveAndFlush(AppUser.github(1001L, "kim", "김팀장", null));
            ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "repo", 77L, opener, T0));
        }

        @Test
        void newCollaboratorsBecomeMembersWithTheLowestFreeDesks() {
            fake.collaborators = List.of(collaborator(1001L, "kim", true), collaborator(1002L, "lee", false));

            syncAndClear(ws, T0);

            Member kim = member(ws, 1001L);
            Member lee = member(ws, 1002L);
            assertThat(kim.isRepoAdmin()).isTrue();
            assertThat(lee.isRepoAdmin()).isFalse();
            assertThat(List.of(kim.getDeskIndex(), lee.getDeskIndex())).containsExactlyInAnyOrder(0, 1);
            assertThat(kim.getSyncedAt()).isEqualTo(T0);
            // 아직 로그인하지 않은 콜라보레이터도 사용자 행을 만든다(「10」) — 표시 이름은 로그인 이름으로 시작
            AppUser leeUser = users.findByGithubUserId(1002L).orElseThrow();
            assertThat(leeUser.getDisplayName()).isEqualTo("lee");
            // 이미 로그인한 사람의 프로필 이름은 그대로
            assertThat(kim.getDisplayName()).isEqualTo("김팀장");
        }

        /**
         * 완료 조건 1 — 동기화 뒤에도 책상 자리 · 활동 기록 수집 동의가 그대로(「2」 앱 칸).
         * 동기화가 들고 있는 팀원(메모리)은 옛 책상 · 동의인 채로, DB만 앱이 바꾼 상황이다 — 동기화가 옛 값으로 덮으면 안 된다.
         */
        @Test
        void deskAndConsentSurviveSyncAndGithubFieldsAreUpdated() {
            fake.collaborators = List.of(collaborator(1001L, "kim", false), collaborator(1002L, "lee", false));
            syncAndClear(ws, T0);
            Member lee = member(ws, 1002L);
            jdbc.update("UPDATE team_member SET desk_index = 5, activity_consented_at = '2026-11-05 04:00:00' "
                    + "WHERE id = ?", lee.getId());

            fake.collaborators = List.of(collaborator(1001L, "kim", false),
                    new GithubCollaborator(new GithubUser(1002L, "lee-renamed", "https://new"), true));
            syncAndClear(ws, T1);

            Member after = member(ws, 1002L);
            assertThat(after.getId()).isEqualTo(lee.getId());
            assertThat(after.getDeskIndex()).isEqualTo(5);
            assertThat(after.getActivityConsentedAt()).isEqualTo(Instant.parse("2026-11-05T04:00:00Z"));
            assertThat(after.getGithubLogin()).isEqualTo("lee-renamed");
            assertThat(after.getAvatarUrl()).isEqualTo("https://new");
            assertThat(after.isRepoAdmin()).isTrue();
            assertThat(after.getSyncedAt()).isEqualTo(T1);
        }

        @Test
        void removedCollaboratorKeepsTheRowAndFreesTheDeskThenRejoinsWithANewDesk() {
            fake.collaborators = List.of(collaborator(1001L, "kim", true), collaborator(1002L, "lee", false));
            syncAndClear(ws, T0);
            Long leeId = member(ws, 1002L).getId();

            fake.collaborators = List.of(collaborator(1001L, "kim", true), collaborator(1003L, "park", false));
            syncAndClear(ws, T1);

            Member gone = members.findById(leeId).orElseThrow();
            assertThat(gone.isRemoved()).isTrue();
            assertThat(gone.getRemovedAt()).isEqualTo(T1);
            assertThat(gone.getDeskIndex()).isNull();
            // 비운 자리를 새 팀원이 받는다
            assertThat(member(ws, 1003L).getDeskIndex()).isEqualTo(1);

            fake.collaborators = List.of(collaborator(1001L, "kim", true), collaborator(1002L, "lee", false),
                    collaborator(1003L, "park", false));
            syncAndClear(ws, T2);

            Member back = members.findById(leeId).orElseThrow();
            assertThat(back.isRemoved()).isFalse();
            assertThat(back.getDeskIndex()).isEqualTo(2);
            assertThat(members.findByWorkspaceId(ws.getId())).hasSize(3);
        }

        @Test
        void theNinthMemberHasNoDesk() {
            List<GithubCollaborator> nine = IntStream.rangeClosed(1, 9)
                    .mapToObj(i -> collaborator(2000L + i, "u" + i, false)).toList();
            fake.collaborators = nine;

            syncAndClear(ws, T0);

            List<Member> current = members.findByWorkspaceIdAndRemovedAtIsNull(ws.getId());
            assertThat(current).hasSize(9);
            List<Integer> desks = current.stream().map(m -> m.getDeskIndex()).toList();
            assertThat(desks).filteredOn(d -> d == null).hasSize(1);
            assertThat(desks).filteredOn(d -> d != null).containsExactlyInAnyOrder(0, 1, 2, 3, 4, 5, 6, 7);
        }

        /** 허용 목록 강사 계정은 콜라보레이터여도 팀원이 아니다(P1). 이미 행이 있으면 빠진 것으로 둔다. */
        @Test
        void allowlistedInstructorIsNeverAMember() {
            AppUser teacher = users.saveAndFlush(AppUser.github(INSTRUCTOR_ID, "teacher", "강사", null));
            Member stale = members.saveAndFlush(Member.collaborator(ws, teacher, 0, true, T0));
            fake.collaborators = List.of(collaborator(1001L, "kim", true),
                    collaborator(INSTRUCTOR_ID, "teacher", true));

            syncAndClear(ws, T1);

            assertThat(members.findById(stale.getId()).orElseThrow().isRemoved()).isTrue();
            assertThat(members.findByWorkspaceIdAndRemovedAtIsNull(ws.getId())).hasSize(1)
                    .allSatisfy(m -> assertThat(m.getGithubLogin()).isEqualTo("kim"));
        }

        @Test
        void issueAssigneesMatchMembersCreatedInTheSameSync() {
            fake.collaborators = List.of(collaborator(1001L, "kim", true), collaborator(1002L, "lee", false));
            fake.issues = List.of(new GithubIssue(1, "이슈", false, null, List.of(),
                    List.of(new GithubUser(1002L, "lee", null), new GithubUser(1001L, "kim", null)),
                    T0, T0, null));

            syncAndClear(ws, T0);

            Task task = tasks.findByWorkspaceIdAndGithubIssueNumber(ws.getId(), 1).orElseThrow();
            List<Member> rows = new ArrayList<>(assignees.findByTaskId(task.getId()).stream()
                    .map(a -> a.getMember()).toList());
            assertThat(AssigneeOrder.sort(rows)).extracting(m -> m.getGithubLogin()).containsExactly("kim", "lee");
        }
    }

    @Nested
    class IssueLinks {

        private final FakeGithubReader fake = new FakeGithubReader();
        private Workspace ws;

        @BeforeEach
        void setUp() {
            given(readerSelector.forKind(WorkspaceKind.GITHUB)).willReturn(fake);
            AppUser opener = users.saveAndFlush(AppUser.github(1001L, "kim", "김팀장", null));
            ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "repo", 77L, opener, T0));
            fake.collaborators = List.of(collaborator(1001L, "kim", true));
            fake.issues = List.of(issue(1), issue(2), issue(3));
            fake.pullRequests = List.of(new GithubPullRequest(10, "PR", new GithubUser(1001L, "kim", null), false,
                    false, false, "a".repeat(40), List.of(), List.of(), T0, T0, null, null));
        }

        private GithubIssue issue(int number) {
            return new GithubIssue(number, "이슈 " + number, false, null, List.of(), List.of(), T0, T0, null);
        }

        private List<Integer> linkedIssueNumbers() {
            Submission pr = submissions.findByWorkspaceIdAndGithubPrNumber(ws.getId(), 10).orElseThrow();
            return links.findBySubmissionId(pr.getId()).stream()
                    .map(l -> l.getTask().getGithubIssueNumber()).sorted().toList();
        }

        private static GithubIssueLink link(int issueNumber) {
            return new GithubIssueLink(issueNumber, GithubIssueLink.Source.CLOSING_REFERENCE);
        }

        @Test
        void storesOnlyTheOfficialLinksAndSkipsUnknownIssues() {
            fake.links = Map.of(10, List.of(link(1), link(3), link(99)));

            syncAndClear(ws, T0);

            assertThat(linkedIssueNumbers()).containsExactly(1, 3);
            Submission pr = submissions.findByWorkspaceIdAndGithubPrNumber(ws.getId(), 10).orElseThrow();
            assertThat(links.findBySubmissionId(pr.getId()))
                    .allSatisfy(l -> assertThat(l.getSource()).isEqualTo("CLOSING_REFERENCE"));
        }

        @Test
        void followsGithubWhenLinksChange() {
            fake.links = Map.of(10, List.of(link(1), link(2)));
            syncAndClear(ws, T0);

            fake.links = Map.of(10, List.of(link(2), link(3)));
            syncAndClear(ws, T1);

            assertThat(linkedIssueNumbers()).containsExactly(2, 3);
            assertThat(links.count()).isEqualTo(2);
        }
    }

    /** 시연 사무실 — 실제 Seed 어댑터로 팀원부터 연결까지 한 번에. */
    @Nested
    class DemoWorkspace {

        private Workspace demo;

        @BeforeEach
        void setUp() {
            given(readerSelector.forKind(WorkspaceKind.DEMO)).willReturn(new SeedGithubReader());
            demo = workspaces.saveAndFlush(Workspace.demo("시연 사무실", T0));
        }

        @Test
        void seedSyncCreatesSeedMembersAssigneesAndLinks() {
            syncAndClear(demo, T0);

            List<Member> current = members.findByWorkspaceIdAndRemovedAtIsNull(demo.getId());
            assertThat(current).extracting(m -> m.getGithubLogin())
                    .containsExactlyInAnyOrder("seed-kim", "seed-lee", "seed-park", "seed-choi");
            assertThat(current).allSatisfy(m -> {
                assertThat(m.getUser()).isNull();
                assertThat(m.getDeskIndex()).isBetween(0, 3);
            });
            assertThat(current).filteredOn(m -> m.isRepoAdmin()).extracting(m -> m.getGithubLogin())
                    .containsExactly("seed-kim");

            Task multi = tasks.findByWorkspaceIdAndGithubIssueNumber(demo.getId(), 2).orElseThrow();
            assertThat(assignees.findByTaskId(multi.getId())).extracting(a -> a.getMember().getGithubLogin())
                    .containsExactlyInAnyOrder("seed-lee", "seed-park");

            Submission pr9 = submissions.findByWorkspaceIdAndGithubPrNumber(demo.getId(), 9).orElseThrow();
            assertThat(links.findBySubmissionId(pr9.getId())).extracting(l -> l.getTask().getGithubIssueNumber())
                    .containsExactly(4);
        }

        @Test
        void syncingTheDemoTwiceChangesNothing() {
            syncAndClear(demo, T0);
            long memberCount = members.count();
            long linkCount = links.count();
            long assigneeCount = assignees.count();

            syncAndClear(demo, T1);

            assertThat(members.count()).isEqualTo(memberCount);
            assertThat(links.count()).isEqualTo(linkCount);
            assertThat(assignees.count()).isEqualTo(assigneeCount);
        }
    }
}

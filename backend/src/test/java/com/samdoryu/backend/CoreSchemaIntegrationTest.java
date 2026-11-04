package com.samdoryu.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.ReviewAccount;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.auth.repository.ReviewAccountRepository;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.sync.domain.SyncState;
import com.samdoryu.backend.sync.repository.SyncStateRepository;
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
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * #7 T4-a — V1 마이그레이션(Flyway)과 공통 Entity를 실제 MySQL로 확인한다(CONTRACTS.md 「2」 · 「3」 무결성 제약).
 * 테스트마다 트랜잭션을 되돌린다.
 */
@SpringBootTest
@Transactional
class CoreSchemaIntegrationTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00.123456Z");

    @Autowired EntityManager em;
    @Autowired JdbcTemplate jdbc;
    @Autowired AppUserRepository users;
    @Autowired ReviewAccountRepository reviewAccounts;
    @Autowired WorkspaceRepository workspaces;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired SyncStateRepository syncStates;
    @Autowired MemberRepository members;
    @Autowired InstructorAssignmentRepository instructorAssignments;

    private AppUser githubUser(long githubUserId) {
        return users.saveAndFlush(AppUser.github(githubUserId, "user" + githubUserId, "사용자" + githubUserId,
                "https://avatars.githubusercontent.com/u/" + githubUserId));
    }

    private Workspace githubWorkspace(long githubRepoId, AppUser openedBy) {
        return workspaces.saveAndFlush(Workspace.github(githubRepoId, "samdoryu", "repo" + githubRepoId, 77L,
                openedBy, T0));
    }

    @Test
    void savesAndReadsBackEveryCoreEntity() {
        AppUser admin = githubUser(1001L);
        AppUser reviewer = users.saveAndFlush(AppUser.review("심사위원"));
        reviewAccounts.saveAndFlush(new ReviewAccount(reviewer, "reviewer", "{bcrypt}$2a$10$notARealHash"));
        Workspace ws = githubWorkspace(5001L, admin);
        Workspace demo = workspaces.saveAndFlush(Workspace.demo("시연 사무실", T0));
        teamSettings.saveAndFlush(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17),
                "docs/requirements.md"));
        syncStates.saveAndFlush(new SyncState(ws));
        members.saveAndFlush(Member.collaborator(ws, admin, 0, true, T0));
        members.saveAndFlush(Member.demoSeed(demo, "시연 팀원", null, 0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, 9001L, admin, T0));
        em.clear();

        AppUser readUser = users.findByGithubUserId(1001L).orElseThrow();
        assertThat(readUser.getAccountType()).isEqualTo(AccountType.GITHUB);
        assertThat(readUser.getGithubLogin()).isEqualTo("user1001");

        ReviewAccount readReview = reviewAccounts.findByUsername("reviewer").orElseThrow();
        assertThat(readReview.isEnabled()).isTrue();
        assertThat(readReview.getUser().getGithubUserId()).isNull();

        Workspace readWs = workspaces.findByGithubRepoId(5001L).orElseThrow();
        assertThat(readWs.getKind()).isEqualTo(WorkspaceKind.GITHUB);
        assertThat(readWs.getDisplayName()).isEqualTo("samdoryu/repo5001");
        assertThat(readWs.getOpenedAt()).isEqualTo(T0);

        TeamSettings readSettings = teamSettings.findByWorkspaceId(ws.getId()).orElseThrow();
        assertThat(readSettings.getProjectEndDate()).isEqualTo(LocalDate.of(2026, 11, 17));
        assertThat(readSettings.getReviewWaitHours()).isEqualTo(TeamSettings.DEFAULT_HOURS);

        SyncState readSync = syncStates.findByWorkspaceId(ws.getId()).orElseThrow();
        assertThat(readSync.isRunning()).isFalse();
        assertThat(readSync.getLastSucceededAt()).isNull();

        Member readMember = members.findByWorkspaceIdAndUserId(ws.getId(), admin.getId()).orElseThrow();
        assertThat(readMember.isRepoAdmin()).isTrue();
        assertThat(readMember.getDeskIndex()).isZero();
        assertThat(readMember.getSyncedAt()).isEqualTo(T0);
        assertThat(members.findByIdAndWorkspaceId(readMember.getId(), demo.getId())).isEmpty();

        assertThat(instructorAssignments.existsByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(
                ws.getId(), 9001L)).isTrue();
        assertThat(instructorAssignments.existsByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(
                demo.getId(), 9001L)).isFalse();
    }

    @Nested
    class UniqueConstraints {

        @Test
        void githubUserIdIsUnique() {
            githubUser(1001L);

            assertThatThrownBy(() -> users.saveAndFlush(AppUser.github(1001L, "renamed", "다른 이름", null)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void reviewUsernameIsUnique() {
            reviewAccounts.saveAndFlush(new ReviewAccount(users.saveAndFlush(AppUser.review("가")), "reviewer", "h1"));
            AppUser other = users.saveAndFlush(AppUser.review("나"));

            assertThatThrownBy(() -> reviewAccounts.saveAndFlush(new ReviewAccount(other, "reviewer", "h2")))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void oneWorkspacePerGithubRepoButManyDemoWorkspaces() {
            AppUser admin = githubUser(1001L);
            githubWorkspace(5001L, admin);
            workspaces.saveAndFlush(Workspace.demo("시연 1", T0));
            workspaces.saveAndFlush(Workspace.demo("시연 2", T0));

            assertThatThrownBy(() -> githubWorkspace(5001L, admin))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void oneTeamSettingsPerWorkspace() {
            Workspace ws = githubWorkspace(5001L, githubUser(1001L));
            LocalDate start = LocalDate.of(2026, 11, 4);
            teamSettings.saveAndFlush(new TeamSettings(ws, start, start, null));

            assertThatThrownBy(() -> teamSettings.saveAndFlush(new TeamSettings(ws, start, start, null)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void oneSyncStatePerWorkspace() {
            Workspace ws = githubWorkspace(5001L, githubUser(1001L));
            syncStates.saveAndFlush(new SyncState(ws));

            assertThatThrownBy(() -> syncStates.saveAndFlush(new SyncState(ws)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void memberIsUniquePerWorkspaceAndUser() {
            AppUser user = githubUser(1001L);
            Workspace ws = githubWorkspace(5001L, user);
            members.saveAndFlush(Member.collaborator(ws, user, 0, true, T0));

            assertThatThrownBy(() -> members.saveAndFlush(Member.collaborator(ws, user, 1, false, T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void deskIsUniquePerWorkspace() {
            AppUser a = githubUser(1001L);
            AppUser b = githubUser(1002L);
            Workspace ws = githubWorkspace(5001L, a);
            members.saveAndFlush(Member.collaborator(ws, a, 0, true, T0));

            assertThatThrownBy(() -> members.saveAndFlush(Member.collaborator(ws, b, 0, false, T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void removedMembersKeepTheirRowAndFreeTheDesk() {
            AppUser a = githubUser(1001L);
            AppUser b = githubUser(1002L);
            AppUser c = githubUser(1003L);
            Workspace ws = githubWorkspace(5001L, a);
            Member first = members.saveAndFlush(Member.collaborator(ws, a, 0, true, T0));
            Member second = members.saveAndFlush(Member.collaborator(ws, b, 1, false, T0));

            first.remove(T0);
            second.remove(T0);
            members.saveAndFlush(first);
            members.saveAndFlush(second);
            members.saveAndFlush(Member.collaborator(ws, c, 0, false, T0));
            em.clear();

            assertThat(members.findByWorkspaceId(ws.getId())).hasSize(3);
            Member removed = members.findByIdAndWorkspaceId(first.getId(), ws.getId()).orElseThrow();
            assertThat(removed.isRemoved()).isTrue();
            assertThat(removed.getDeskIndex()).isNull();
        }

        @Test
        void oneCurrentInstructorAssignmentPerWorkspaceAndInstructor() {
            AppUser admin = githubUser(1001L);
            Workspace ws = githubWorkspace(5001L, admin);
            instructorAssignments.saveAndFlush(new InstructorAssignment(ws, 9001L, admin, T0));

            assertThatThrownBy(() -> instructorAssignments.saveAndFlush(
                    new InstructorAssignment(ws, 9001L, admin, T0)))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        void unassignedRowsStayAndTheInstructorCanBeAssignedAgain() {
            AppUser admin = githubUser(1001L);
            Workspace ws = githubWorkspace(5001L, admin);
            InstructorAssignment first = instructorAssignments.saveAndFlush(
                    new InstructorAssignment(ws, 9001L, admin, T0));
            first.unassign(T0.plusSeconds(60));
            instructorAssignments.saveAndFlush(first);

            assertThat(instructorAssignments.existsByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(
                    ws.getId(), 9001L)).isFalse();

            instructorAssignments.saveAndFlush(new InstructorAssignment(ws, 9001L, admin, T0.plusSeconds(120)));
            InstructorAssignment second = new InstructorAssignment(ws, 9001L, admin, T0.plusSeconds(180));

            assertThat(instructorAssignments.count()).isEqualTo(2);
            assertThat(instructorAssignments.existsByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(
                    ws.getId(), 9001L)).isTrue();
            assertThatThrownBy(() -> instructorAssignments.saveAndFlush(second))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }
    }

    /** DB CHECK 제약 — Entity를 거치지 않은 쓰기도 막는다. */
    @Nested
    class CheckConstraints {

        @Test
        void reviewUserCannotHaveGithubId() {
            assertThatThrownBy(() -> jdbc.update(
                    "INSERT INTO app_user (account_type, github_user_id, display_name) VALUES ('REVIEW', 1, 'x')"))
                    .isInstanceOf(DataAccessException.class);
        }

        @Test
        void githubUserNeedsGithubId() {
            assertThatThrownBy(() -> jdbc.update(
                    "INSERT INTO app_user (account_type, display_name) VALUES ('GITHUB', 'x')"))
                    .isInstanceOf(DataAccessException.class);
        }

        @Test
        void demoWorkspaceHasNoRepo() {
            assertThatThrownBy(() -> jdbc.update("INSERT INTO workspace (kind, github_repo_id, display_name, opened_at)"
                    + " VALUES ('DEMO', 1, 'x', '2026-11-05 03:00:00')"))
                    .isInstanceOf(DataAccessException.class);
        }

        @Test
        void teamSettingsHoursAndDatesAreInRange() {
            Workspace ws = githubWorkspace(5001L, githubUser(1001L));
            LocalDate start = LocalDate.of(2026, 11, 4);
            TeamSettings settings = teamSettings.saveAndFlush(new TeamSettings(ws, start, start, null));

            settings.replace(start, start, null, 0, 48);
            assertThatThrownBy(() -> teamSettings.saveAndFlush(settings)).isInstanceOf(DataAccessException.class);
        }

        @Test
        void projectEndCannotBeBeforeStart() {
            Workspace ws = githubWorkspace(5001L, githubUser(1001L));
            LocalDate start = LocalDate.of(2026, 11, 4);

            assertThatThrownBy(() -> teamSettings.saveAndFlush(
                    new TeamSettings(ws, start, start.minusDays(1), null)))
                    .isInstanceOf(DataAccessException.class);
        }

        @Test
        void removedMemberCannotKeepADesk() {
            AppUser user = githubUser(1001L);
            Workspace ws = githubWorkspace(5001L, user);
            Member member = members.saveAndFlush(Member.collaborator(ws, user, 0, false, T0));

            assertThatThrownBy(() -> jdbc.update(
                    "UPDATE team_member SET removed_at = '2026-11-05 03:00:00' WHERE id = ?", member.getId()))
                    .isInstanceOf(DataAccessException.class);
        }
    }
}

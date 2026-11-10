package com.samdoryu.backend.workspace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.sync.domain.Task;
import com.samdoryu.backend.sync.domain.TaskState;
import com.samdoryu.backend.sync.repository.TaskRepository;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.TeamSettings;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.dto.WorkspaceSnapshot;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.TeamSettingsRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import com.samdoryu.backend.workspace.service.WorkspaceSnapshotService;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import org.hibernate.FlushMode;
import org.hibernate.Session;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

/** EXP-FLUSH(QA 실험) — 바깥 트랜잭션에 합류했을 때: 미반영 변경이 보이고, flush 모드가 (예외여도) 원래대로 돌아온다. */
@SpringBootTest
@Transactional
class SnapshotFlushModeTest {

    private static final Instant T0 = Instant.parse("2026-11-05T01:20:00Z");

    @Autowired WorkspaceSnapshotService snapshotService;
    @Autowired EntityManager em;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired TeamSettingsRepository teamSettings;
    @Autowired MemberRepository members;
    @Autowired TaskRepository tasks;

    private Session session() {
        return em.unwrap(Session.class);
    }

    private WorkspaceAccess accessTo(Workspace ws, AppUser user, Member member) {
        return new WorkspaceAccess(ws.getId(), user.getId(), WorkspaceRole.REPO_ADMIN, member.getId());
    }

    @Test
    void pendingChangesMadeBeforeLoadAreVisibleAndFlushModeIsRestored() {
        AppUser user = users.save(AppUser.github(890_001L, "flush-mode", "flush", null));
        Workspace ws = workspaces.save(Workspace.github(890_002L, "samdoryu", "flush-mode", null, user, T0));
        teamSettings.save(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), null));
        Member member = members.save(Member.collaborator(ws, user, 0, true, T0));
        // flush하지 않은 이슈 — 조회 전에 저장한 값이 Snapshot에 보여야 한다(조건 8)
        tasks.save(Task.builder().workspace(ws).githubIssueNumber(1).title("미반영 이슈").state(TaskState.OPEN)
                .labelsJson("[]").githubCreatedAt(T0).githubUpdatedAt(T0).stateChangedAt(T0).syncedAt(T0).build());
        assertThat(session().getHibernateFlushMode()).isEqualTo(FlushMode.AUTO);

        WorkspaceSnapshot snapshot = snapshotService.load(accessTo(ws, user, member));

        assertThat(snapshot.tasks()).extracting(t -> t.title()).containsExactly("미반영 이슈");
        assertThat(session().getHibernateFlushMode()).isEqualTo(FlushMode.AUTO);
    }

    @Test
    void flushModeIsRestoredWhenAssemblyFails() {
        AppUser user = users.save(AppUser.github(890_011L, "flush-fail", "flush", null));
        Workspace ws = workspaces.save(Workspace.github(890_012L, "samdoryu", "flush-fail", null, user, T0));
        Member member = members.save(Member.collaborator(ws, user, 0, true, T0));
        // 팀 설정이 없는 사무실 — 조립 중 IllegalStateException

        assertThatThrownBy(() -> snapshotService.load(accessTo(ws, user, member)))
                .isInstanceOf(IllegalStateException.class);
        assertThat(session().getHibernateFlushMode()).isEqualTo(FlushMode.AUTO);
    }

    @Test
    void leavesManualFlushModeAlone() {
        AppUser user = users.save(AppUser.github(890_021L, "flush-manual", "flush", null));
        Workspace ws = workspaces.save(Workspace.github(890_022L, "samdoryu", "flush-manual", null, user, T0));
        teamSettings.save(new TeamSettings(ws, LocalDate.of(2026, 11, 4), LocalDate.of(2026, 11, 17), null));
        Member member = members.save(Member.collaborator(ws, user, 0, true, T0));
        em.flush();
        session().setHibernateFlushMode(FlushMode.MANUAL);

        snapshotService.load(accessTo(ws, user, member));

        assertThat(session().getHibernateFlushMode()).isEqualTo(FlushMode.MANUAL);
        session().setHibernateFlushMode(FlushMode.AUTO);
    }
}

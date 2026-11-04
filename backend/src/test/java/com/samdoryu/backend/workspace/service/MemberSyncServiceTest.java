package com.samdoryu.backend.workspace.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

/** 팀원 동기화 규칙 — 책상 배정 · 앱 칸 보존 · 빠짐 · 복귀 · 강사 제외(DB 없음, 저장소는 가짜). 실제 DB는 WorkspaceSyncIntegrationTest. */
class MemberSyncServiceTest {

    private static final Long WS_ID = 1L;
    private static final long INSTRUCTOR_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final Instant T1 = T0.plusSeconds(3600);

    private final WorkspaceService workspaceService = mock(WorkspaceService.class);
    private final MemberRepository memberRepository = mock(MemberRepository.class);
    private final MemberSyncService service = new MemberSyncService(workspaceService, memberRepository,
            new AppProperties("http://localhost:5173", Set.of(INSTRUCTOR_ID), false));
    private final Workspace workspace = Workspace.demo("ws", T0);
    private final List<Member> stored = new ArrayList<>();
    private long nextId = 100;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(workspace, "id", WS_ID);
        given(workspaceService.requireWorkspace(WS_ID)).willReturn(workspace);
        given(memberRepository.findByWorkspaceId(WS_ID)).willAnswer(i -> new ArrayList<>(stored));
        given(memberRepository.save(any(Member.class))).willAnswer(i -> {
            Member m = i.getArgument(0);
            ReflectionTestUtils.setField(m, "id", nextId++);
            stored.add(m);
            return m;
        });
    }

    private static AppUser user(long githubUserId) {
        AppUser user = AppUser.github(githubUserId, "u" + githubUserId, "사람" + githubUserId, null);
        ReflectionTestUtils.setField(user, "id", githubUserId);
        return user;
    }

    private static MemberSyncService.Collaborator real(AppUser user, boolean admin) {
        return new MemberSyncService.Collaborator(user, user.getGithubLogin(), null, admin);
    }

    private Member storedOf(AppUser user) {
        return stored.stream().filter(m -> m.getUser() == user).findFirst().orElseThrow();
    }

    @Test
    void newMembersGetTheLowestFreeDesksAndTheNinthGetsNone() {
        List<AppUser> people = IntStream.rangeClosed(1, 9).mapToObj(i -> user(1000L + i)).toList();

        service.syncCollaborators(WS_ID, people.stream().map(u -> real(u, false)).toList(), T0);

        assertThat(stored).hasSize(9);
        assertThat(stored).extracting(m -> m.getDeskIndex()).filteredOn(d -> d != null)
                .containsExactlyInAnyOrder(0, 1, 2, 3, 4, 5, 6, 7);
        assertThat(stored).filteredOn(m -> m.getDeskIndex() == null).hasSize(1);
        assertThat(stored).allSatisfy(m -> assertThat(m.getSyncedAt()).isEqualTo(T0));
    }

    @Test
    void currentMembersKeepDeskAndConsentButGetGithubFields() {
        AppUser lee = user(1002L);
        Member existing = Member.collaborator(workspace, lee, 5, false, T0);
        ReflectionTestUtils.setField(existing, "activityConsentedAt", T0);
        stored.add(existing);

        service.syncCollaborators(WS_ID,
                List.of(new MemberSyncService.Collaborator(lee, "lee-renamed", "https://new", true)), T1);

        assertThat(existing.getDeskIndex()).isEqualTo(5);
        assertThat(existing.getActivityConsentedAt()).isEqualTo(T0);
        assertThat(existing.getGithubLogin()).isEqualTo("lee-renamed");
        assertThat(existing.getAvatarUrl()).isEqualTo("https://new");
        assertThat(existing.isRepoAdmin()).isTrue();
        assertThat(existing.getSyncedAt()).isEqualTo(T1);
        verify(memberRepository, never()).save(any());
    }

    @Test
    void leaversAreRemovedBeforeNewcomersTakeTheirDesk() {
        AppUser kim = user(1001L);
        AppUser lee = user(1002L);
        stored.add(Member.collaborator(workspace, kim, 0, true, T0));
        stored.add(Member.collaborator(workspace, lee, 1, false, T0));
        AppUser park = user(1003L);

        service.syncCollaborators(WS_ID, List.of(real(kim, true), real(park, false)), T1);

        Member gone = storedOf(lee);
        assertThat(gone.isRemoved()).isTrue();
        assertThat(gone.getDeskIndex()).isNull();
        assertThat(storedOf(park).getDeskIndex()).isEqualTo(1);
        // 빠짐을 DB에 먼저 반영해야 (사무실, 책상) 유일 제약에 걸리지 않는다
        verify(memberRepository).flush();
    }

    @Test
    void returningMemberGetsANewDesk() {
        AppUser kim = user(1001L);
        AppUser lee = user(1002L);
        stored.add(Member.collaborator(workspace, kim, 0, true, T0));
        Member removed = Member.collaborator(workspace, lee, 1, false, T0);
        removed.remove(T0);
        stored.add(removed);

        service.syncCollaborators(WS_ID, List.of(real(kim, true), real(lee, false)), T1);

        assertThat(removed.isRemoved()).isFalse();
        assertThat(removed.getDeskIndex()).isEqualTo(1);
        verify(memberRepository, never()).save(any());
    }

    @Test
    void allowlistedInstructorIsSkippedAndAnExistingRowIsRemoved() {
        AppUser teacher = user(INSTRUCTOR_ID);
        Member stale = Member.collaborator(workspace, teacher, 0, true, T0);
        stored.add(stale);
        AppUser kim = user(1001L);

        service.syncCollaborators(WS_ID, List.of(real(teacher, true), real(kim, true)), T1);

        assertThat(stale.isRemoved()).isTrue();
        ArgumentCaptor<Member> saved = ArgumentCaptor.forClass(Member.class);
        verify(memberRepository).save(saved.capture());
        assertThat(saved.getValue().getUser()).isSameAs(kim);
        assertThat(saved.getValue().getDeskIndex()).isZero();
    }

    @Test
    void seedCollaboratorsMatchBySeedLogin() {
        stored.add(Member.demoSeed(workspace, "seed-kim", "김", null, 3));

        service.syncCollaborators(WS_ID, List.of(
                new MemberSyncService.Collaborator(null, "seed-kim", null, true),
                new MemberSyncService.Collaborator(null, "seed-lee", null, false)), T1);

        assertThat(stored).hasSize(2);
        assertThat(stored.get(0).getDeskIndex()).isEqualTo(3);
        assertThat(stored.get(0).isRepoAdmin()).isTrue();
        assertThat(stored.get(1).getGithubLogin()).isEqualTo("seed-lee");
        assertThat(stored.get(1).getUser()).isNull();
        assertThat(stored.get(1).getDeskIndex()).isZero();
    }
}

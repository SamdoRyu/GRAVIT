package com.samdoryu.backend.instructor.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.dto.InstructorAssignmentDto;
import com.samdoryu.backend.instructor.dto.InstructorCandidateDto;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

/** 강사 지정 · 해제 · 목록 규칙(FR-AUTH-06 · CONTRACTS_API 「7」) — DB 없이. 실제 HTTP · 인가는 {@code InstructorApiIntegrationTest}. */
class InstructorRosterServiceTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final long WS_ID = 3L;
    private static final long ADMIN_USER_ID = 7L;
    private static final long ADMIN_GITHUB_ID = 1001L;
    private static final long MENTOR = 9001L;          // 허용 목록 · 로그인한 적 있음
    private static final long NEW_MENTOR = 9002L;      // 허용 목록 · 로그인한 적 없음

    private InstructorAssignmentRepository repository;
    private AppUserService appUserService;
    private WorkspaceService workspaceService;
    private WorkspaceEventHub eventHub;
    private InstructorRosterService service;
    private AppUser admin;
    private AppUser mentor;
    private Workspace workspace;

    @BeforeEach
    void setUp() {
        repository = mock(InstructorAssignmentRepository.class);
        appUserService = mock(AppUserService.class);
        workspaceService = mock(WorkspaceService.class);
        eventHub = mock(WorkspaceEventHub.class);
        service = new InstructorRosterService(repository, appUserService, workspaceService,
                new AppProperties("http://localhost:5173", Set.of(NEW_MENTOR, MENTOR), false, null, null), eventHub);

        admin = AppUser.github(ADMIN_GITHUB_ID, "octo-kim", "김옥토", "https://avatars.example/1001");
        ReflectionTestUtils.setField(admin, "id", ADMIN_USER_ID);
        mentor = AppUser.github(MENTOR, "mentor-park", "박멘토", "https://avatars.example/9001");
        workspace = Workspace.github(5001L, "samdoryu", "a", null, admin, T0);
        ReflectionTestUtils.setField(workspace, "id", WS_ID);

        when(appUserService.findGithubUsers(anyCollection())).thenReturn(Map.of(MENTOR, mentor));
        when(appUserService.require(ADMIN_USER_ID)).thenReturn(admin);
        when(workspaceService.requireWorkspace(WS_ID)).thenReturn(workspace);
        when(repository.save(any(InstructorAssignment.class))).thenAnswer(call -> call.getArgument(0));
    }

    private InstructorAssignment assignment(long githubUserId, Instant at) {
        return new InstructorAssignment(workspace, githubUserId, admin, at);
    }

    private static ErrorCode codeOf(Throwable e) {
        return ((ApiException) e).getErrorCode();
    }

    // --- PUT W/instructors/{githubUserId} ---

    @Test
    void assigningAnAllowListedAccountCreatesTheAssignmentAndNotifies() {
        when(repository.findByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(WS_ID, MENTOR))
                .thenReturn(Optional.empty());

        InstructorAssignmentDto dto = service.assign(WS_ID, ADMIN_USER_ID, ADMIN_GITHUB_ID, MENTOR, T0);

        ArgumentCaptor<InstructorAssignment> saved = ArgumentCaptor.forClass(InstructorAssignment.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getWorkspace()).isSameAs(workspace);
        assertThat(saved.getValue().getAssignedBy()).isSameAs(admin);
        assertThat(saved.getValue().getAssignedAt()).isEqualTo(T0);
        verify(eventHub).publishChangeAfterCommit(WS_ID, SnapshotResource.INSTRUCTORS);
        assertThat(dto.githubUserId()).isEqualTo("9001");
        assertThat(dto.githubLogin()).isEqualTo("mentor-park");
        assertThat(dto.displayName()).isEqualTo("박멘토");
        assertThat(dto.assignedBy().userId()).isEqualTo("7");
        assertThat(dto.assignedBy().githubLogin()).isEqualTo("octo-kim");
    }

    @Test
    void alreadyAssignedReturnsThatAssignmentWithoutWriting() {
        InstructorAssignment existing = assignment(MENTOR, T0.minusSeconds(3600));
        when(repository.findByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(WS_ID, MENTOR))
                .thenReturn(Optional.of(existing));

        InstructorAssignmentDto dto = service.assign(WS_ID, ADMIN_USER_ID, ADMIN_GITHUB_ID, MENTOR, T0);

        assertThat(dto.assignedAt()).isEqualTo(T0.minusSeconds(3600));
        verify(repository, never()).save(any());
        verifyNoInteractions(eventHub);
    }

    @Test
    void accountOutsideTheAllowListIsInvalid() {
        assertThatThrownBy(() -> service.assign(WS_ID, ADMIN_USER_ID, ADMIN_GITHUB_ID, 4242L, T0))
                .satisfies(e -> assertThat(codeOf(e)).isEqualTo(ErrorCode.INVALID));
        verify(repository, never()).save(any());
    }

    /** 레포 관리자는 허용 목록 계정일 수 없다 — 자기 자신 확인이 먼저가 아니면 늘 invalid가 된다. */
    @Test
    void assigningYourselfIsConflictEvenOutsideTheAllowList() {
        assertThatThrownBy(() -> service.assign(WS_ID, ADMIN_USER_ID, ADMIN_GITHUB_ID, ADMIN_GITHUB_ID, T0))
                .satisfies(e -> assertThat(codeOf(e)).isEqualTo(ErrorCode.CONFLICT));
        verify(repository, never()).save(any());
    }

    /** 심사용 계정(GitHub 사용자 ID 없음)은 자기 자신 확인에 걸리지 않는다. */
    @Test
    void reviewAccountWithoutGithubIdCanAssign() {
        when(repository.findByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(WS_ID, MENTOR))
                .thenReturn(Optional.empty());

        assertThat(service.assign(WS_ID, ADMIN_USER_ID, null, MENTOR, T0).githubUserId()).isEqualTo("9001");
    }

    // --- DELETE W/instructors/{githubUserId} ---

    @Test
    void revokeKeepsTheRowWithAnEndTimeAndNotifies() {
        InstructorAssignment current = assignment(MENTOR, T0.minusSeconds(60));
        when(repository.findByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(WS_ID, MENTOR))
                .thenReturn(Optional.of(current));

        service.revoke(WS_ID, MENTOR, T0);

        assertThat(current.getUnassignedAt()).isEqualTo(T0);
        assertThat(current.isCurrent()).isFalse();
        verify(repository, never()).delete(any());
        verify(eventHub).publishChangeAfterCommit(WS_ID, SnapshotResource.INSTRUCTORS);
    }

    @Test
    void revokeWithoutCurrentAssignmentIsNotFound() {
        when(repository.findByWorkspaceIdAndInstructorGithubUserIdAndUnassignedAtIsNull(WS_ID, MENTOR))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.revoke(WS_ID, MENTOR, T0))
                .satisfies(e -> assertThat(codeOf(e)).isEqualTo(ErrorCode.NOT_FOUND));
        verifyNoInteractions(eventHub);
    }

    // --- 목록 ---

    @Test
    void candidatesAreTheWholeAllowListByGithubIdWithAssignedFlag() {
        when(repository.findByWorkspaceIdAndUnassignedAtIsNullOrderByAssignedAtAscIdAsc(WS_ID))
                .thenReturn(List.of(assignment(NEW_MENTOR, T0)));

        List<InstructorCandidateDto> candidates = service.candidates(WS_ID);

        assertThat(candidates).extracting(InstructorCandidateDto::githubUserId).containsExactly("9001", "9002");
        assertThat(candidates).extracting(InstructorCandidateDto::isAssigned).containsExactly(false, true);
        assertThat(candidates.get(0).githubLogin()).isEqualTo("mentor-park");
        // 로그인한 적이 없는 강사는 표시 정보를 모른다
        assertThat(candidates.get(1).githubLogin()).isNull();
        assertThat(candidates.get(1).avatarUrl()).isNull();
    }

    @Test
    void listShowsCurrentAssignmentsWithUnknownProfilesAsNull() {
        when(repository.findByWorkspaceIdAndUnassignedAtIsNullOrderByAssignedAtAscIdAsc(WS_ID))
                .thenReturn(List.of(assignment(MENTOR, T0), assignment(NEW_MENTOR, T0.plusSeconds(1))));

        List<InstructorAssignmentDto> list = service.listCurrent(WS_ID);

        assertThat(list).extracting(InstructorAssignmentDto::githubUserId).containsExactly("9001", "9002");
        assertThat(list.get(1).githubLogin()).isNull();
        assertThat(list.get(1).displayName()).isNull();
        assertThat(list.get(1).avatarUrl()).isNull();
    }
}

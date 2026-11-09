package com.samdoryu.backend.help.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.domain.HelpRequestStatus;
import com.samdoryu.backend.help.dto.HelpRequestSummary;
import com.samdoryu.backend.help.repository.HelpCommentRepository;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * #272 "강사에게 요청" 규칙(CONTRACTS_API 「11」 — 2026-11-09) — DB 없이. 검사 순서 대상 → 요청자 → 상태 → (이미 켜짐)
 * → 지정된 강사와 변경 알림을 본다. 실제 HTTP · MySQL은 {@code HelpRequestIntegrationTest}.
 */
class HelpRequestInstructorRequestTest {

    private static final Instant T0 = Instant.parse("2026-11-09T01:00:00Z");
    private static final Instant FIRST_REQUESTED_AT = Instant.parse("2026-11-09T02:00:00Z");
    private static final long WS_ID = 3L;
    private static final long HELP_ID = 40L;
    private static final long ALICE_ID = 11L;
    private static final long BOB_ID = 12L;

    private HelpRequestRepository helpRequestRepository;
    private InstructorAssignmentService instructorAssignmentService;
    private WorkspaceEventHub eventHub;
    private HelpRequestService service;
    private Workspace workspace;
    private Member alice;

    @BeforeEach
    void setUp() {
        helpRequestRepository = mock(HelpRequestRepository.class);
        instructorAssignmentService = mock(InstructorAssignmentService.class);
        eventHub = mock(WorkspaceEventHub.class);
        service = new HelpRequestService(helpRequestRepository, mock(HelpCommentRepository.class),
                instructorAssignmentService, eventHub, mock(EntityManager.class));

        AppUser aliceUser = AppUser.github(1001L, "alice", "앨리스", null);
        workspace = Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0);
        ReflectionTestUtils.setField(workspace, "id", WS_ID);
        alice = Member.collaborator(workspace, aliceUser, 0, true, T0);
        ReflectionTestUtils.setField(alice, "id", ALICE_ID);
    }

    private HelpRequest helpRequest(Workspace in, Member requester, HelpRequestStatus status, Instant requestedAt) {
        HelpRequest help = new HelpRequest(in, requester, "세션이 끊겨요", null, T0);
        ReflectionTestUtils.setField(help, "id", HELP_ID);
        ReflectionTestUtils.setField(help, "status", status);
        ReflectionTestUtils.setField(help, "instructorRequestedAt", requestedAt);
        when(helpRequestRepository.findByIdAndWorkspaceId(HELP_ID, in.getId())).thenReturn(Optional.of(help));
        return help;
    }

    private static WorkspaceAccess member(Long workspaceId, Long memberId) {
        return new WorkspaceAccess(workspaceId, 1L, WorkspaceRole.PARTICIPANT, memberId);
    }

    private static void assertError(Runnable call, ErrorCode code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getErrorCode()).isEqualTo(code));
    }

    @ParameterizedTest
    @EnumSource(value = HelpRequestStatus.class, names = {"OPEN", "DISCUSSING", "ON_AGENDA"})
    void requesterTurnsItOnWhileTheInstructorCanStillAnswer(HelpRequestStatus status) {
        HelpRequest help = helpRequest(workspace, alice, status, null);
        when(instructorAssignmentService.hasCurrentInstructor(WS_ID)).thenReturn(true);

        HelpRequestSummary summary = service.requestInstructor(member(WS_ID, ALICE_ID), HELP_ID);

        assertThat(summary.instructorRequested()).isTrue();
        assertThat(help.getStatus()).isEqualTo(status);
        verify(eventHub).publishChangeAfterCommit(WS_ID, SnapshotResource.HELP_REQUESTS);
    }

    /** 닫힌 글은 강사가 답할 수 없다 — 이미 켜져 있어도 409, 지정 여부는 보지 않는다. */
    @ParameterizedTest
    @EnumSource(value = HelpRequestStatus.class, names = {"RESOLVED", "ENDED"})
    void closedHelpRequestIsAConflictEvenIfAlreadyRequested(HelpRequestStatus status) {
        HelpRequest fresh = helpRequest(workspace, alice, status, null);
        assertError(() -> service.requestInstructor(member(WS_ID, ALICE_ID), HELP_ID), ErrorCode.CONFLICT);
        assertThat(fresh.isInstructorRequested()).isFalse();

        helpRequest(workspace, alice, status, FIRST_REQUESTED_AT);
        assertError(() -> service.requestInstructor(member(WS_ID, ALICE_ID), HELP_ID), ErrorCode.CONFLICT);

        verifyNoInteractions(instructorAssignmentService, eventHub);
    }

    /** 요청자 검사가 상태보다 먼저다 — 다른 팀원은 닫힌 글이어도 403. */
    @Test
    void nonRequesterIsForbiddenBeforeTheStatusCheck() {
        helpRequest(workspace, alice, HelpRequestStatus.RESOLVED, null);

        assertError(() -> service.requestInstructor(member(WS_ID, BOB_ID), HELP_ID), ErrorCode.FORBIDDEN_ROLE);
    }

    @Test
    void newRequestWithoutAnAssignedInstructorIsAConflict() {
        HelpRequest help = helpRequest(workspace, alice, HelpRequestStatus.OPEN, null);
        when(instructorAssignmentService.hasCurrentInstructor(WS_ID)).thenReturn(false);

        assertError(() -> service.requestInstructor(member(WS_ID, ALICE_ID), HELP_ID), ErrorCode.CONFLICT);
        assertThat(help.isInstructorRequested()).isFalse();
        verifyNoInteractions(eventHub);
    }

    /** 이미 켜진 글은 그대로 — 처음 시각 유지, 강사가 해제됐어도 200, 변경 알림 없음. */
    @Test
    void alreadyRequestedStaysAsIsWithoutAnInstructorCheckOrChangeEvent() {
        helpRequest(workspace, alice, HelpRequestStatus.DISCUSSING, FIRST_REQUESTED_AT);

        HelpRequestSummary summary = service.requestInstructor(member(WS_ID, ALICE_ID), HELP_ID);

        assertThat(summary.instructorRequestedAt()).isEqualTo(FIRST_REQUESTED_AT);
        verifyNoInteractions(instructorAssignmentService, eventHub);
    }

    /** 시연 사무실의 강사는 심사용 강사 계정이라 지정 행을 보지 않는다. */
    @Test
    void demoWorkspaceDoesNotLookAtAssignmentRows() {
        Workspace demo = Workspace.demo("시연 사무실", T0);
        ReflectionTestUtils.setField(demo, "id", 4L);
        Member kim = Member.demoSeed(demo, "seed-kim", "김", null, 0);
        ReflectionTestUtils.setField(kim, "id", 21L);
        helpRequest(demo, kim, HelpRequestStatus.OPEN, null);

        HelpRequestSummary summary = service.requestInstructor(member(4L, 21L), HELP_ID);

        assertThat(summary.instructorRequested()).isTrue();
        verifyNoInteractions(instructorAssignmentService);
        verify(eventHub).publishChangeAfterCommit(4L, SnapshotResource.HELP_REQUESTS);
    }
}

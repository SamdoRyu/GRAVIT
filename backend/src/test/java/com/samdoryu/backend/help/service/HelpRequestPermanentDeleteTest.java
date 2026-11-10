package com.samdoryu.backend.help.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.help.domain.HelpComment;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.domain.HelpRequestStatus;
import com.samdoryu.backend.help.repository.HelpCommentRepository;
import com.samdoryu.backend.help.repository.HelpRequestHiddenRepository;
import com.samdoryu.backend.help.repository.HelpRequestRepository;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import com.samdoryu.backend.meeting.service.AgendaItemService;
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
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * #315 ② 모두에게서 영구 삭제 — DB 없이. 검사 순서(대상 → 요청자), 상태와 상관없이 허용, 순환 외래키 때문에 정한 삭제 순서
 * (안건 연결 끊기 → 도움이 된 코멘트 비우기 → 숨김 행 → 코멘트 → 도움 요청), 지웠을 때만 두 조각 변경 알림을 본다.
 * 실제 HTTP · MySQL은 {@code HelpRequestPermanentDeleteIntegrationTest}, 커밋 · 롤백은 {@code HelpRequestDeleteCommitIntegrationTest}.
 */
class HelpRequestPermanentDeleteTest {

    private static final Instant T0 = Instant.parse("2026-11-10T01:00:00Z");
    private static final long WS_ID = 3L;
    private static final long HELP_ID = 40L;
    private static final long ALICE_ID = 11L;
    private static final long BOB_ID = 12L;

    private HelpRequestRepository helpRequestRepository;
    private HelpCommentRepository helpCommentRepository;
    private HelpRequestHiddenRepository hiddenRepository;
    private AgendaItemService agendaItemService;
    private WorkspaceEventHub eventHub;
    private HelpRequestService helpRequestService;
    private HelpRequestDeletionService deletionService;
    private Workspace workspace;
    private Member alice;

    @BeforeEach
    void setUp() {
        helpRequestRepository = mock(HelpRequestRepository.class);
        helpCommentRepository = mock(HelpCommentRepository.class);
        hiddenRepository = mock(HelpRequestHiddenRepository.class);
        agendaItemService = mock(AgendaItemService.class);
        eventHub = mock(WorkspaceEventHub.class);
        helpRequestService = new HelpRequestService(helpRequestRepository, helpCommentRepository, hiddenRepository,
                mock(InstructorAssignmentService.class), eventHub, mock(EntityManager.class));
        deletionService = new HelpRequestDeletionService(helpRequestService, agendaItemService, eventHub);

        AppUser aliceUser = AppUser.github(1001L, "alice", "앨리스", null);
        workspace = Workspace.github(5001L, "samdoryu", "a", null, aliceUser, T0);
        ReflectionTestUtils.setField(workspace, "id", WS_ID);
        alice = Member.collaborator(workspace, aliceUser, 0, true, T0);
        ReflectionTestUtils.setField(alice, "id", ALICE_ID);
    }

    private HelpRequest helpRequest(HelpRequestStatus status) {
        HelpRequest help = new HelpRequest(workspace, alice, "세션이 끊겨요", null, T0);
        ReflectionTestUtils.setField(help, "id", HELP_ID);
        ReflectionTestUtils.setField(help, "status", status);
        when(helpRequestRepository.findForDeleteByIdAndWorkspaceId(HELP_ID, WS_ID)).thenReturn(Optional.of(help));
        return help;
    }

    private static WorkspaceAccess member(Long memberId) {
        return new WorkspaceAccess(WS_ID, 1L, WorkspaceRole.PARTICIPANT, memberId);
    }

    private static void assertError(Runnable call, ErrorCode code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class,
                e -> assertThat(e.getErrorCode()).isEqualTo(code));
    }

    /** 상태와 상관없이 요청자는 지울 수 있다 — 지우는 순서와 두 조각 알림. */
    @ParameterizedTest
    @EnumSource(HelpRequestStatus.class)
    void requesterDeletesInAnyStatusInForeignKeyOrder(HelpRequestStatus status) {
        HelpRequest help = helpRequest(status);
        ReflectionTestUtils.setField(help, "helpfulComment", mock(HelpComment.class));
        when(agendaItemService.detachDeletedHelpRequest(WS_ID, HELP_ID)).thenReturn(true);

        deletionService.delete(member(ALICE_ID), HELP_ID);

        InOrder order = inOrder(agendaItemService, helpRequestRepository, hiddenRepository, helpCommentRepository,
                eventHub);
        order.verify(agendaItemService).detachDeletedHelpRequest(WS_ID, HELP_ID);
        order.verify(helpRequestRepository).flush();
        order.verify(hiddenRepository).deleteAllByHelpRequestId(HELP_ID);
        order.verify(helpCommentRepository).deleteAllByHelpRequestId(HELP_ID);
        order.verify(helpRequestRepository).delete(help);
        order.verify(helpRequestRepository).flush();
        order.verify(eventHub).publishChangeAfterCommit(WS_ID, SnapshotResource.HELP_REQUESTS,
                SnapshotResource.AGENDA_ITEMS);
        assertThat(help.getHelpfulComment()).isNull();
    }

    /** 안건이 된 적 없는 요청 — 바뀐 안건이 없으니 {@code help_requests}만 알린다(CONTRACTS_API 「11」). */
    @Test
    void withoutAgendaItemsOnlyHelpRequestsAreAnnounced() {
        helpRequest(HelpRequestStatus.OPEN);
        when(agendaItemService.detachDeletedHelpRequest(WS_ID, HELP_ID)).thenReturn(false);

        deletionService.delete(member(ALICE_ID), HELP_ID);

        verify(eventHub).publishChangeAfterCommit(WS_ID, SnapshotResource.HELP_REQUESTS);
        verify(eventHub, never()).publishChangeAfterCommit(WS_ID, SnapshotResource.HELP_REQUESTS,
                SnapshotResource.AGENDA_ITEMS);
    }

    /** 없거나 다른 사무실 것(사무실 조건으로 찾음) · 이미 지운 요청은 404 — 아무것도 건드리지 않는다. */
    @Test
    void missingRequestIsNotFound() {
        when(helpRequestRepository.findForDeleteByIdAndWorkspaceId(HELP_ID, WS_ID)).thenReturn(Optional.empty());

        assertError(() -> deletionService.delete(member(ALICE_ID), HELP_ID), ErrorCode.NOT_FOUND);
        verifyNoInteractions(agendaItemService, hiddenRepository, helpCommentRepository, eventHub);
        verify(helpRequestRepository, never()).delete(any());
    }

    /** 요청자가 아닌 팀원은 403 — 아무것도 건드리지 않는다. */
    @Test
    void nonRequesterIsForbidden() {
        helpRequest(HelpRequestStatus.OPEN);

        assertError(() -> deletionService.delete(member(BOB_ID), HELP_ID), ErrorCode.FORBIDDEN_ROLE);
        verifyNoInteractions(agendaItemService, hiddenRepository, helpCommentRepository, eventHub);
        verify(helpRequestRepository, never()).delete(any());
    }

    /** 안건 연결 끊기가 실패하면 도움 요청 쪽은 지우지 않고 알림도 없다(트랜잭션은 롤백 — 커밋 테스트가 본다). */
    @Test
    void failureWhileDetachingAgendaItemsStopsBeforeDeleting() {
        helpRequest(HelpRequestStatus.ON_AGENDA);
        doThrow(new IllegalStateException("boom"))
                .when(agendaItemService).detachDeletedHelpRequest(WS_ID, HELP_ID);

        assertThatThrownBy(() -> deletionService.delete(member(ALICE_ID), HELP_ID))
                .isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(hiddenRepository, helpCommentRepository, eventHub);
        verify(helpRequestRepository, never()).delete(any());
    }
}

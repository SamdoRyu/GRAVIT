package com.samdoryu.backend.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import com.samdoryu.backend.workspace.service.DemoWorkspaceService;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * #58 FR-LRN-23 — 강사 요청함을 쓸 수 있는 사람과 볼 사무실(CONTRACTS_API 「16」). {@code MeResponse.isInstructor}와 같은
 * 재료로 판정한다. DB 없이 판정만 본다 — 실제 HTTP · 지정 행 · 해제는 {@code InstructorInboxIntegrationTest}.
 * 심사용 강사(시연 사무실만 — P15)는 로그인 준비가 무거워 여기서만 본다.
 */
class InstructorInboxAuthorizationTest {

    private static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final long REVIEW_USER_ID = 97L;

    private final InstructorAssignmentService assignments = mock(InstructorAssignmentService.class);
    private final ReviewAccountService reviewAccounts = mock(ReviewAccountService.class);
    private final DemoWorkspaceService demoWorkspaces = mock(DemoWorkspaceService.class);
    private final AuthorizationService authorizationService = new AuthorizationService(
            new AppProperties("http://localhost:5173", Set.of(INSTRUCTOR_GITHUB_ID), true, null, null),
            assignments, mock(WorkspaceService.class), reviewAccounts, demoWorkspaces);

    @AfterEach
    void clearSession() {
        SecurityContextHolder.clearContext();
    }

    private static void login(AppPrincipal principal) {
        SecurityContextHolder.getContext().setAuthentication(principal.toAuthentication());
    }

    private static AppPrincipal github(long userId, long githubUserId) {
        return new AppPrincipal(userId, AccountType.GITHUB, githubUserId, Map.of());
    }

    private void assertFails(ErrorCode code) {
        assertThatThrownBy(authorizationService::requireInstructorInboxWorkspaceIds)
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getErrorCode()).isEqualTo(code));
    }

    @Test
    void anAllowlistedInstructorSeesItsCurrentlyAssignedWorkspaces() {
        login(github(7L, INSTRUCTOR_GITHUB_ID));
        given(assignments.currentWorkspaceIds(INSTRUCTOR_GITHUB_ID)).willReturn(List.of(3L, 5L));

        assertThat(authorizationService.requireInstructorInboxWorkspaceIds()).containsExactly(3L, 5L);
        verifyNoInteractions(demoWorkspaces);
    }

    /** 지정이 없거나 모두 해제됐다 — isInstructor가 false인 사람. */
    @Test
    void anAllowlistedInstructorWithoutAnyCurrentAssignmentIsForbidden() {
        login(github(7L, INSTRUCTOR_GITHUB_ID));
        given(assignments.currentWorkspaceIds(INSTRUCTOR_GITHUB_ID)).willReturn(List.of());

        assertFails(ErrorCode.FORBIDDEN_ROLE);
    }

    @Test
    void aStudentIsForbiddenWithoutLookingAtAssignments() {
        login(github(8L, 1001L));

        assertFails(ErrorCode.FORBIDDEN_ROLE);
        verifyNoInteractions(assignments, demoWorkspaces);
    }

    @Test
    void aReviewInstructorSeesOnlyTheDemoWorkspace() {
        login(new AppPrincipal(REVIEW_USER_ID, AccountType.REVIEW, null, Map.of()));
        given(reviewAccounts.isReviewInstructor(REVIEW_USER_ID)).willReturn(true);
        given(demoWorkspaces.findDemoWorkspaceId()).willReturn(Optional.of(42L));

        assertThat(authorizationService.requireInstructorInboxWorkspaceIds()).containsExactly(42L);
        verifyNoInteractions(assignments);
    }

    /** 심사용 강사는 isInstructor가 true다 — 시연 사무실이 아직 없으면 403이 아니라 빈 요청함. */
    @Test
    void aReviewInstructorWithoutTheDemoWorkspaceGetsNothing() {
        login(new AppPrincipal(REVIEW_USER_ID, AccountType.REVIEW, null, Map.of()));
        given(reviewAccounts.isReviewInstructor(REVIEW_USER_ID)).willReturn(true);
        given(demoWorkspaces.findDemoWorkspaceId()).willReturn(Optional.empty());

        assertThat(authorizationService.requireInstructorInboxWorkspaceIds()).isEmpty();
    }

    @Test
    void aReviewParticipantIsForbidden() {
        login(new AppPrincipal(REVIEW_USER_ID, AccountType.REVIEW, null, Map.of()));
        given(reviewAccounts.isReviewInstructor(REVIEW_USER_ID)).willReturn(false);

        assertFails(ErrorCode.FORBIDDEN_ROLE);
        verifyNoInteractions(assignments, demoWorkspaces);
    }

    @Test
    void withoutASessionIsUnauthorized() {
        assertFails(ErrorCode.UNAUTHORIZED);
    }
}

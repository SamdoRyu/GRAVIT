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
import com.samdoryu.backend.workspace.service.WorkspaceService;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * #60 FR-LIB-01 — 공용 컨벤션 라이브러리 쓰기 권한(CONTRACTS.md 「6」 표). DB 없이 판정만 본다.
 * 실제 HTTP · 강사 지정 행은 {@code ConventionLibraryIntegrationTest}.
 */
class ConventionLibraryEditorAuthorizationTest {

    private static final long INSTRUCTOR_GITHUB_ID = 9001L;

    private final InstructorAssignmentService assignments = mock(InstructorAssignmentService.class);
    private final AuthorizationService authorizationService = new AuthorizationService(
            new AppProperties("http://localhost:5173", Set.of(INSTRUCTOR_GITHUB_ID), true, null, null),
            assignments, mock(WorkspaceService.class), mock(ReviewAccountService.class));

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

    private void assertForbidden() {
        assertThatThrownBy(authorizationService::requireConventionLibraryEditor)
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN_ROLE));
    }

    @Test
    void anAllowlistedGithubInstructorWithACurrentAssignmentMayEdit() {
        AppPrincipal instructor = github(7L, INSTRUCTOR_GITHUB_ID);
        login(instructor);
        given(assignments.hasAnyCurrentAssignment(INSTRUCTOR_GITHUB_ID)).willReturn(true);

        assertThat(authorizationService.requireConventionLibraryEditor()).isEqualTo(instructor);
    }

    @Test
    void anAllowlistedInstructorWithoutAnyCurrentAssignmentIsForbidden() {
        // 지정이 없거나 모두 해제됐다 — MeResponse.isInstructor가 false인 사람
        login(github(7L, INSTRUCTOR_GITHUB_ID));
        given(assignments.hasAnyCurrentAssignment(INSTRUCTOR_GITHUB_ID)).willReturn(false);

        assertForbidden();
    }

    @Test
    void aStudentIsForbiddenWithoutLookingAtAssignments() {
        login(github(8L, 1001L));

        assertForbidden();
        verifyNoInteractions(assignments);
    }

    @Test
    void aReviewAccountIsForbiddenEvenThoughItMayRead() {
        // 심사용 ROLE-04 — 일반 강사 권한 축소가 아니라 데이터 격리 규칙(P15)
        login(new AppPrincipal(97L, AccountType.REVIEW, null, Map.of()));

        assertForbidden();
        verifyNoInteractions(assignments);
    }

    @Test
    void withoutASessionIsUnauthorized() {
        assertThatThrownBy(authorizationService::requireConventionLibraryEditor)
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.UNAUTHORIZED));
    }
}

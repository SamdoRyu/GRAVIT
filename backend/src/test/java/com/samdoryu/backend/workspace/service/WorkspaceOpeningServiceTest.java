package com.samdoryu.backend.workspace.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.auth.service.AppPrincipal;
import com.samdoryu.backend.auth.service.ReviewAccountService;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.github.GithubUserClient;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import com.samdoryu.backend.workspace.dto.OpenWorkspaceRequest;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * #250 — 사무실 열기는 GitHub 계정만(심사용 계정은 시연 사무실에만 — CONTRACTS.md 「6」 · P15). DB 없이 판정 순서만 본다 —
 * 실제 HTTP · 세션 · 로그인 뒤 토큰 정리는 {@code WorkspaceOpeningIntegrationTest} · {@code ReviewLoginIntegrationTest} ·
 * {@code GithubLoginIntegrationTest}.
 */
class WorkspaceOpeningServiceTest {

    private static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant NOW = Instant.parse("2026-11-09T03:00:00Z");
    private static final OpenWorkspaceRequest REQUEST = new OpenWorkspaceRequest("5001", LocalDate.of(2026, 11, 4),
            LocalDate.of(2026, 11, 17), null, true);

    private final GithubUserClient githubUserClient = mock(GithubUserClient.class);
    private final WorkspaceCreator workspaceCreator = mock(WorkspaceCreator.class);
    private final WorkspaceOpeningService service = new WorkspaceOpeningService(githubUserClient,
            mock(WorkspaceRepository.class), workspaceCreator, mock(InstructorAssignmentService.class),
            mock(ReviewAccountService.class), mock(DemoWorkspaceService.class),
            new AppProperties("http://localhost:5173", Set.of(INSTRUCTOR_GITHUB_ID), true, null, null));

    private void assertFails(AppPrincipal principal, Optional<String> token, ErrorCode code) {
        assertThatThrownBy(() -> service.open(principal, token, REQUEST, NOW))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getErrorCode()).isEqualTo(code));
    }

    /** 세션에 이전 GitHub 로그인의 토큰이 남아 있어도 — 레포가 안 보이는 것과 같은 404, GitHub를 부르지 않는다. */
    @Test
    void reviewAccountIsNotFoundEvenWithAGithubTokenInTheSession() {
        AppPrincipal reviewer = new AppPrincipal(97L, AccountType.REVIEW, null, Map.of());

        assertFails(reviewer, Optional.of("gho_previous"), ErrorCode.NOT_FOUND);
        assertFails(reviewer, Optional.empty(), ErrorCode.NOT_FOUND);
        verifyNoInteractions(githubUserClient, workspaceCreator);
    }

    /** 검사 순서는 그대로 — 날짜(400)가 먼저, 허용 목록 강사는 토큰이 있어도 403. */
    @Test
    void checkOrderStaysTheSame() {
        AppPrincipal reviewer = new AppPrincipal(97L, AccountType.REVIEW, null, Map.of());
        OpenWorkspaceRequest backwards = new OpenWorkspaceRequest("5001", LocalDate.of(2026, 11, 17),
                LocalDate.of(2026, 11, 4), null, true);
        assertThatThrownBy(() -> service.open(reviewer, Optional.of("gho_previous"), backwards, NOW))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID));

        AppPrincipal instructor = new AppPrincipal(98L, AccountType.GITHUB, INSTRUCTOR_GITHUB_ID, Map.of());
        assertFails(instructor, Optional.of("gho_user"), ErrorCode.FORBIDDEN_ROLE);
        verifyNoInteractions(githubUserClient, workspaceCreator);
    }
}

package com.samdoryu.backend.auth.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerMapping;

/** FR-AUTH-08 강사 쓰기 기본 거부 — DB 없이 판정만 본다. 실제 등록 경로 전체는 {@code InstructorWriteGuardIntegrationTest}. */
class InstructorWriteGuardTest {

    private static final String W = InstructorWriteGuard.WORKSPACE_PATH;

    private AuthorizationService authorizationService;
    private InstructorWriteGuard guard;
    private HandlerMethod handler;

    @BeforeEach
    void setUp() throws Exception {
        authorizationService = mock(AuthorizationService.class);
        guard = new InstructorWriteGuard(authorizationService);
        handler = new HandlerMethod(new Object(), Object.class.getMethod("toString"));
    }

    private static MockHttpServletRequest request(String method, String pattern) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, pattern.replace("{workspaceId}", "3"));
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, pattern);
        request.setAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE, Map.of("workspaceId", "3"));
        return request;
    }

    private void accessAs(WorkspaceRole role) {
        when(authorizationService.requireWorkspaceAccess("3"))
                .thenReturn(new WorkspaceAccess(3L, 7L, role, role == WorkspaceRole.INSTRUCTOR ? null : 12L));
    }

    private boolean preHandle(MockHttpServletRequest request) {
        return guard.preHandle(request, new MockHttpServletResponse(), handler);
    }

    /** CONTRACTS_API 「0」에서 역할 열에 R4가 있는 사무실 쓰기 전부 — 계약이 바뀌면 여기와 가드를 함께 고친다. */
    @Test
    void allowListIsTheContractsInstructorWrites() {
        assertThat(InstructorWriteGuard.INSTRUCTOR_WRITES).containsExactlyInAnyOrder(
                "POST " + W + "/help-requests/{helpRequestId}/comments",
                "POST " + W + "/agenda-items/{agendaItemId}/instructor-feedback",
                "POST " + W + "/members/{memberId}/decision-cards/{cardId}/follow-up-questions");
    }

    @Test
    void instructorWriteOutsideTheAllowListIsForbiddenRole() {
        accessAs(WorkspaceRole.INSTRUCTOR);

        for (String method : new String[] {"POST", "PUT", "PATCH", "DELETE"}) {
            assertThatThrownBy(() -> preHandle(request(method, W + "/agenda-items")))
                    .as(method)
                    .isInstanceOfSatisfying(ApiException.class,
                            e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.FORBIDDEN_ROLE));
        }
    }

    @Test
    void teamMembersPassToTheController() {
        accessAs(WorkspaceRole.PARTICIPANT);
        assertThat(preHandle(request("POST", W + "/agenda-items"))).isTrue();

        accessAs(WorkspaceRole.REPO_ADMIN);
        assertThat(preHandle(request("PUT", W + "/settings"))).isTrue();
    }

    /** 대상 조건("요청된 건")은 Service가 본다 — 가드는 사무실 접근도 다시 묻지 않는다. */
    @Test
    void allowListedInstructorWritesPassWithoutAnotherCheck() {
        for (String endpoint : InstructorWriteGuard.INSTRUCTOR_WRITES) {
            String[] methodAndPattern = endpoint.split(" ", 2);
            assertThat(preHandle(request(methodAndPattern[0], methodAndPattern[1]))).as(endpoint).isTrue();
        }
        verifyNoInteractions(authorizationService);
    }

    @Test
    void readsAndNonWorkspaceWritesAreNotItsConcern() {
        assertThat(preHandle(request("GET", W + "/snapshot"))).isTrue();
        assertThat(preHandle(request("POST", "/api/logout"))).isTrue();
        assertThat(preHandle(request("POST", "/api/convention-library"))).isTrue();
        assertThat(guard.preHandle(request("POST", W + "/agenda-items"), new MockHttpServletResponse(), new Object()))
                .as("Controller 메서드가 아닌 처리기")
                .isTrue();
        verifyNoInteractions(authorizationService);
    }

    /** 로그인 없음 · 사무실 접근 없음은 인가 서비스의 결과(401 · 404)를 그대로 낸다. */
    @Test
    void accessFailuresComeFromTheAuthorizationService() {
        when(authorizationService.requireWorkspaceAccess("3")).thenThrow(new ApiException(ErrorCode.NOT_FOUND));

        assertThatThrownBy(() -> preHandle(request("POST", W + "/agenda-items")))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.NOT_FOUND));
    }
}

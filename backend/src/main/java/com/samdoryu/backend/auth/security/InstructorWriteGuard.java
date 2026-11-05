package com.samdoryu.backend.auth.security;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

/**
 * FR-AUTH-08 — 강사는 사무실의 모든 화면을 보지만, 쓰기는 <b>기본 거부</b>다. 사무실 경로({@code W})의 쓰기 요청은 아래
 * {@link #INSTRUCTOR_WRITES}에 있는 것만 강사에게 열고, 나머지는 Controller에 닿기 전에 {@code 403 forbidden_role}로 막는다.
 * 그래서 새 쓰기 API가 역할 검사를 빠뜨려도 강사 쓰기는 열리지 않는다.
 *
 * <ul>
 *   <li>허용 목록은 CONTRACTS_API 「0」에서 역할 열에 R4가 있는 쓰기다. 대상 조건("요청된 건")은 각 Service가 본다.
 *       강사 쓰기 API를 더하려면 계약 변경(CONTRACTS.md 「9」) 뒤 여기에 더한다. 경로 변수 이름까지 Controller와 같아야 한다 —
 *       다르면 강사가 막힌다(닫힌 쪽으로 실패).</li>
 *   <li>공용 컨벤션 라이브러리({@code /api/convention-library})는 사무실 경로가 아니라 여기서 보지 않는다(FR-LIB · #60).</li>
 *   <li>검사 순서(CONTRACTS.md 「6」) 1 · 2는 {@link AuthorizationService#requireWorkspaceAccess}가 하므로 로그인 없음
 *       {@code 401} · 사무실 접근 없음 {@code 404}는 그대로다. 역할 검사(4)를 본문 검증보다 먼저 해서 강사 쓰기는 늘 {@code 403}이다.</li>
 * </ul>
 */
@Component
public class InstructorWriteGuard implements HandlerInterceptor {

    static final String WORKSPACE_PATH = "/api/workspaces/{workspaceId}";

    /** 강사(R4)에게 열린 사무실 쓰기 — "메서드 경로 패턴". */
    static final Set<String> INSTRUCTOR_WRITES = Set.of(
            "POST " + WORKSPACE_PATH + "/help-requests/{helpRequestId}/comments",
            "POST " + WORKSPACE_PATH + "/agenda-items/{agendaItemId}/instructor-feedback",
            "POST " + WORKSPACE_PATH + "/members/{memberId}/decision-cards/{cardId}/follow-up-questions");

    private static final Set<String> WRITE_METHODS = Set.of(HttpMethod.POST.name(), HttpMethod.PUT.name(),
            HttpMethod.PATCH.name(), HttpMethod.DELETE.name());

    private final AuthorizationService authorizationService;

    public InstructorWriteGuard(AuthorizationService authorizationService) {
        this.authorizationService = authorizationService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod) || !WRITE_METHODS.contains(request.getMethod())) {
            return true;
        }
        if (!(request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE) instanceof String pattern)
                || !pattern.startsWith(WORKSPACE_PATH)
                || INSTRUCTOR_WRITES.contains(request.getMethod() + " " + pattern)) {
            return true;
        }
        if (authorizationService.requireWorkspaceAccess(workspaceId(request)).role() == WorkspaceRole.INSTRUCTOR) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        return true;
    }

    private static String workspaceId(HttpServletRequest request) {
        Object variables = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        return variables instanceof Map<?, ?> map && map.get("workspaceId") instanceof String id ? id : "";
    }
}

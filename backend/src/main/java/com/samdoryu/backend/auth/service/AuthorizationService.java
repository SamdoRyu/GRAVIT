package com.samdoryu.backend.auth.service;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * 인가 검사의 한 곳(CONTRACTS.md 「6」 검사 순서). Controller가 부른다.
 * 1 로그인 → 2 사무실 접근 → (3 대상 존재는 각 Service) → 4 동작 권한({@link WorkspaceAccess}).
 * 요청 본문 · 헤더의 사용자 값은 믿지 않고 세션의 사용자만 쓴다.
 */
@Service
public class AuthorizationService {

    private final AppProperties appProperties;
    private final InstructorAssignmentService instructorAssignmentService;

    public AuthorizationService(AppProperties appProperties, InstructorAssignmentService instructorAssignmentService) {
        this.appProperties = appProperties;
        this.instructorAssignmentService = instructorAssignmentService;
    }

    /** 검사 순서 1 — 세션의 로그인 사용자. 없으면 {@code unauthorized}. */
    public AppPrincipal currentPrincipal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AppPrincipal principal) {
            return principal;
        }
        throw new ApiException(ErrorCode.UNAUTHORIZED);
    }

    /**
     * 검사 순서 1 · 2 — 경로의 사무실에 들어갈 수 있는지. 들어갈 수 없으면 존재를 숨기고 {@code not_found}.
     *
     * @param workspaceId 경로 변수 그대로(형식이 틀려도 {@code not_found})
     */
    public WorkspaceAccess requireWorkspaceAccess(String workspaceId) {
        AppPrincipal principal = currentPrincipal();
        Long id = Ids.fromPath(workspaceId);

        // 허용 목록의 강사 계정은 콜라보레이터여도 어느 사무실에서도 팀원 역할로 판정하지 않는다(P1 — 권한 상승 방지).
        if (isAllowlistedInstructor(principal)) {
            if (instructorAssignmentService.isCurrentlyAssigned(id, principal.githubUserId())) {
                return new WorkspaceAccess(id, principal.userId(), WorkspaceRole.INSTRUCTOR, null);
            }
            throw new ApiException(ErrorCode.NOT_FOUND);
        }

        AppPrincipal.Membership membership = principal.memberships().get(id);
        if (membership == null) {
            throw new ApiException(ErrorCode.NOT_FOUND);
        }
        return new WorkspaceAccess(id, principal.userId(), membership.role(), membership.memberId());
    }

    private boolean isAllowlistedInstructor(AppPrincipal principal) {
        return principal.githubUserId() != null
                && appProperties.instructorGithubUserIds().contains(principal.githubUserId());
    }
}

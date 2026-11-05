package com.samdoryu.backend.auth.service;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import com.samdoryu.backend.workspace.service.WorkspaceService;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * 인가 검사의 한 곳(CONTRACTS.md 「6」 검사 순서). Controller가 부른다.
 * 1 로그인 → 2 사무실 접근 → (3 대상 존재는 각 Service) → 4 동작 권한({@link WorkspaceAccess}).
 * 사무실 경로의 모든 API가 이 검사를 거치는지는 {@code WorkspaceEndpointGuardTest}가 지킨다(FR-AUTH-04).
 * 요청 본문 · 헤더의 사용자 값은 믿지 않고 세션의 사용자만 쓴다.
 */
@Service
public class AuthorizationService {

    private final AppProperties appProperties;
    private final InstructorAssignmentService instructorAssignmentService;
    private final WorkspaceService workspaceService;

    public AuthorizationService(AppProperties appProperties, InstructorAssignmentService instructorAssignmentService,
            WorkspaceService workspaceService) {
        this.appProperties = appProperties;
        this.instructorAssignmentService = instructorAssignmentService;
        this.workspaceService = workspaceService;
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

        // 심사용 계정은 시연 사무실에만 들어간다(P15). 세션에 무엇이 들어 있든 실제 사무실은 존재를 숨긴다 — 요청마다 DB 확인.
        if (principal.accountType() == AccountType.REVIEW
                && workspaceService.requireWorkspace(id).getKind() != WorkspaceKind.DEMO) {
            throw new ApiException(ErrorCode.NOT_FOUND);
        }

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

    /**
     * 공용 컨벤션 라이브러리 등록 · 수정(CONTRACTS.md 「6」 · CONTRACTS_API 「17」 · FR-LIB-01) — 사무실 경로 밖이라 검사 순서 2가 없다.
     * 실제 GitHub 강사 계정(허용 목록이고 지금 지정된 사무실이 하나 이상 — {@code MeResponse.isInstructor}와 같은 재료)만.
     * 심사용 계정(데이터 격리 — P15) · 학생 · 그 밖의 로그인 사용자는 {@code forbidden_role}. 지정은 요청마다 DB에서 확인한다.
     */
    public AppPrincipal requireConventionLibraryEditor() {
        AppPrincipal principal = currentPrincipal();
        if (principal.accountType() != AccountType.GITHUB
                || !isAllowlistedInstructor(principal)
                || !instructorAssignmentService.hasAnyCurrentAssignment(principal.githubUserId())) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        return principal;
    }

    private boolean isAllowlistedInstructor(AppPrincipal principal) {
        return appProperties.isAllowlistedInstructor(principal.githubUserId());
    }
}

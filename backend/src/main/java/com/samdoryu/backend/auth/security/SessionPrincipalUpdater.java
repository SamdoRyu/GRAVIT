package com.samdoryu.backend.auth.security;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.AppPrincipal;
import com.samdoryu.backend.auth.service.AuthorizationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

/**
 * 로그인 중인 세션의 역할을 바꾼다. 역할은 로그인 때 정해 세션에 두지만(CONTRACTS.md 「6」), 로그인한 뒤 레포 관리자가 사무실을
 * 열면 다시 로그인하지 않아도 그 사무실에 들어가야 한다(#68).
 */
@Component
public class SessionPrincipalUpdater {

    private final AuthorizationService authorizationService;
    private final SecurityContextRepository securityContextRepository;
    private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();

    public SessionPrincipalUpdater(AuthorizationService authorizationService,
            SecurityContextRepository securityContextRepository) {
        this.authorizationService = authorizationService;
        this.securityContextRepository = securityContextRepository;
    }

    /** 지금 세션 사용자에 사무실 하나의 팀원 역할을 더해 세션에 저장한다. */
    public void addMembership(HttpServletRequest request, HttpServletResponse response, Long workspaceId,
            WorkspaceRole role, Long memberId) {
        AppPrincipal updated = authorizationService.currentPrincipal()
                .withMembership(workspaceId, new AppPrincipal.Membership(role, memberId));
        SecurityContext context = contextHolder.createEmptyContext();
        context.setAuthentication(updated.toAuthentication());
        contextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);
    }
}

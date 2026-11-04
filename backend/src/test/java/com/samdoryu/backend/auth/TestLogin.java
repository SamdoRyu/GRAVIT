package com.samdoryu.backend.auth;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.AppPrincipal;
import java.util.HashMap;
import java.util.Map;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

/**
 * 테스트용 로그인 — OAuth 없이 로그인된 세션을 만든다. 테스트 코드에만 있다.
 * 실제 로그인과 같은 {@link AppPrincipal}을 세션의 SecurityContext에 넣으므로 Security · 인가 검사를 그대로 거친다.
 *
 * <pre>{@code
 * MockHttpSession session = TestLogin.githubUser(7L, 1001L)
 *         .member(workspaceId, memberId, WorkspaceRole.PARTICIPANT)
 *         .session();
 * mvc.perform(get("/api/workspaces/{id}/...", workspaceId).session(session));
 * }</pre>
 *
 * 강사: {@code TestLogin.githubUser(userId, githubUserId).session()}에 더해, 그 GitHub 사용자 ID를
 * {@code app.instructor-github-user-ids}(허용 목록)에 넣고 그 사무실에 강사 지정이 있어야 한다.
 * 지정은 {@code instructor_assignment} 행을 넣거나({@code InstructorAssignmentAuthorizationTest} 참고),
 * DB 없이 확인할 때는 {@code @MockitoBean InstructorAssignmentService}로 흉내 낸다.
 * 쓰기 요청은 CSRF 토큰과 {@code Origin}도 보내야 한다(CommonFoundationIntegrationTest 참고).
 */
public final class TestLogin {

    private final Long userId;
    private final AccountType accountType;
    private final Long githubUserId;
    private final Map<Long, AppPrincipal.Membership> memberships = new HashMap<>();

    private TestLogin(Long userId, AccountType accountType, Long githubUserId) {
        this.userId = userId;
        this.accountType = accountType;
        this.githubUserId = githubUserId;
    }

    public static TestLogin githubUser(long userId, long githubUserId) {
        return new TestLogin(userId, AccountType.GITHUB, githubUserId);
    }

    public static TestLogin reviewUser(long userId) {
        return new TestLogin(userId, AccountType.REVIEW, null);
    }

    /** 그 사무실의 팀원으로 둔다 — {@link WorkspaceRole#REPO_ADMIN} 또는 {@link WorkspaceRole#PARTICIPANT}. */
    public TestLogin member(long workspaceId, long memberId, WorkspaceRole role) {
        memberships.put(workspaceId, new AppPrincipal.Membership(role, memberId));
        return this;
    }

    public AppPrincipal principal() {
        return new AppPrincipal(userId, accountType, githubUserId, memberships);
    }

    public MockHttpSession session() {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
                new SecurityContextImpl(principal().toAuthentication()));
        return session;
    }
}

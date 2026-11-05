package com.samdoryu.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.InstructorAssignment;
import com.samdoryu.backend.instructor.repository.InstructorAssignmentRepository;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * FR-AUTH-08 — 지정된 강사의 사무실 쓰기는 계약 역할 열에 R4가 있는 것 말고는 모두 {@code 403 forbidden_role}이다(CONTRACTS.md
 * 「9」 역할: 강사의 평가 · 안건 올리기 · 결정 기록 · 연결 · 팀 설정 · 마감 → 403). 등록된 경로를 앱에서 직접 모으므로 새 쓰기 API도
 * 자동으로 검사한다. 본문은 일부러 비워 둔다 — 역할 검사가 본문 검증보다 먼저라 늘 403이어야 한다.
 * R4 쓰기의 "요청된 건 201 · 요청 안 된 건 403"은 그 기능 테스트가 본다(도움 요청 답변 — {@code HelpRequestIntegrationTest}).
 */
@SpringBootTest(properties = "app.instructor-github-user-ids=" + InstructorWriteGuardIntegrationTest.INSTRUCTOR_GITHUB_ID)
@AutoConfigureMockMvc
@Transactional
class InstructorWriteGuardIntegrationTest {

    static final long INSTRUCTOR_GITHUB_ID = 9001L;
    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final String PREFIX = "/api/workspaces/{workspaceId}";
    private static final String ORIGIN = "http://localhost:5173";
    private static final Set<RequestMethod> WRITES = Set.of(RequestMethod.POST, RequestMethod.PUT,
            RequestMethod.PATCH, RequestMethod.DELETE);
    /** CONTRACTS_API 「0」 역할 열에 R4가 있는 사무실 쓰기 — 가드의 목록과 같은지는 {@code InstructorWriteGuardTest}가 본다. */
    private static final Set<String> CONTRACT_INSTRUCTOR_WRITES = Set.of(
            "POST " + PREFIX + "/help-requests/{helpRequestId}/comments",
            "POST " + PREFIX + "/agenda-items/{agendaItemId}/instructor-feedback",
            "POST " + PREFIX + "/members/{memberId}/decision-cards/{cardId}/follow-up-questions");

    @Autowired MockMvc mvc;
    @Autowired @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping handlerMapping;
    @Autowired AppUserRepository users;
    @Autowired WorkspaceRepository workspaces;
    @Autowired InstructorAssignmentRepository instructorAssignments;

    private record Endpoint(String method, String pattern) {
        String key() {
            return method + " " + pattern;
        }
    }

    private List<Endpoint> writes;
    private Workspace ws;
    private MockHttpSession instructorSession;
    private String csrfToken;

    @BeforeEach
    void setUp() throws Exception {
        writes = new ArrayList<>();
        for (RequestMappingInfo info : handlerMapping.getHandlerMethods().keySet()) {
            Set<String> patterns = info.getPathPatternsCondition() == null
                    ? Set.of() : info.getPathPatternsCondition().getPatternValues();
            for (String pattern : patterns) {
                for (RequestMethod method : info.getMethodsCondition().getMethods()) {
                    if (pattern.startsWith(PREFIX) && WRITES.contains(method)) {
                        writes.add(new Endpoint(method.name(), pattern));
                    }
                }
            }
        }

        AppUser admin = users.saveAndFlush(AppUser.github(1002L, "team-admin", "팀장", null));
        AppUser instructor = users.saveAndFlush(AppUser.github(INSTRUCTOR_GITHUB_ID, "instructor", "강사", null));
        ws = workspaces.saveAndFlush(Workspace.github(5001L, "samdoryu", "a", null, admin, T0));
        instructorAssignments.saveAndFlush(new InstructorAssignment(ws, INSTRUCTOR_GITHUB_ID, admin, T0));
        instructorSession = TestLogin.githubUser(instructor.getId(), INSTRUCTOR_GITHUB_ID).session();

        String setCookie = String.join(";", mvc.perform(get("/api/login-options"))
                .andReturn().getResponse().getHeaders("Set-Cookie"));
        int start = setCookie.indexOf("XSRF-TOKEN=") + "XSRF-TOKEN=".length();
        csrfToken = setCookie.substring(start, setCookie.indexOf(';', start));
    }

    private MockHttpServletResponse perform(Endpoint endpoint) throws Exception {
        String path = endpoint.pattern().replace("{workspaceId}", Ids.toApi(ws.getId())).replaceAll("\\{[^}]+}", "1");
        return mvc.perform(request(HttpMethod.valueOf(endpoint.method()), path).session(instructorSession)
                        .cookie(new Cookie("XSRF-TOKEN", csrfToken)).header("X-XSRF-TOKEN", csrfToken)
                        .header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andReturn().getResponse();
    }

    @Test
    void findsTheWorkspaceWrites() {
        assertThat(writes).extracting(Endpoint::key)
                .contains("POST " + PREFIX + "/agenda-items", "PUT " + PREFIX + "/submissions/{submissionId}/evaluations/mine");
    }

    @Test
    void assignedInstructorGetsForbiddenRoleOnEveryWorkspaceWriteOutsideTheContract() throws Exception {
        for (Endpoint endpoint : writes) {
            if (CONTRACT_INSTRUCTOR_WRITES.contains(endpoint.key())) {
                continue;
            }
            MockHttpServletResponse response = perform(endpoint);
            assertThat(response.getStatus()).as(endpoint.key()).isEqualTo(403);
            assertThat(response.getContentAsString()).as(endpoint.key()).contains("\"forbidden_role\"");
        }
    }

    /** R4 쓰기는 가드가 막지 않는다 — 대상(1번)이 없으니 Service의 404, 또는 빈 본문의 400. */
    @Test
    void contractInstructorWritesReachTheController() throws Exception {
        for (Endpoint endpoint : writes) {
            if (CONTRACT_INSTRUCTOR_WRITES.contains(endpoint.key())) {
                assertThat(perform(endpoint).getStatus()).as(endpoint.key()).isIn(400, 404);
            }
        }
    }
}

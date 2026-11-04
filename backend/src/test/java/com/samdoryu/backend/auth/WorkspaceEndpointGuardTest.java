package com.samdoryu.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import jakarta.servlet.http.Cookie;
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
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * FR-AUTH-04 감시 — 사무실 경로({@code /api/workspaces/{workspaceId}/…})의 <b>모든</b> API가 요청마다 인가 검사를 거치는가.
 * 등록된 경로를 앱에서 직접 모으므로, 새 API가 인가 검사를 빠뜨리면 이 테스트가 실패한다.
 * <ul>
 *   <li>세션 없음 → {@code 401}(CSRF · Origin을 갖춘 쓰기도)</li>
 *   <li>다른 사무실의 팀원 → {@code 2xx}가 나오지 않는다. 읽기는 {@code 404}(존재를 숨김), 쓰기는 {@code 404} 또는 본문 검증
 *       {@code 400}(본문 검증은 인가 전에 돈다 — 그래도 아무것도 쓰지 않는다)</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
class WorkspaceEndpointGuardTest {

    private static final String PREFIX = "/api/workspaces/{workspaceId}";
    private static final String ORIGIN = "http://localhost:5173";
    private static final Set<HttpMethod> WRITES = Set.of(HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH,
            HttpMethod.DELETE);

    @Autowired MockMvc mvc;
    @Autowired @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping handlerMapping;

    private record Endpoint(HttpMethod method, String pattern) {
        String samplePath() {
            return pattern.replaceAll("\\{[^}]+}", "1");
        }
    }

    private List<Endpoint> endpoints;
    private String csrfToken;

    @BeforeEach
    void setUp() throws Exception {
        endpoints = new ArrayList<>();
        for (RequestMappingInfo info : handlerMapping.getHandlerMethods().keySet()) {
            Set<String> patterns = info.getPathPatternsCondition() == null
                    ? Set.of() : info.getPathPatternsCondition().getPatternValues();
            Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
            for (String pattern : patterns) {
                if (!pattern.startsWith(PREFIX)) {
                    continue;
                }
                if (methods.isEmpty()) {
                    endpoints.add(new Endpoint(HttpMethod.GET, pattern));
                }
                for (RequestMethod method : methods) {
                    endpoints.add(new Endpoint(HttpMethod.valueOf(method.name()), pattern));
                }
            }
        }
        String setCookie = String.join(";", mvc.perform(get("/api/login-options"))
                .andReturn().getResponse().getHeaders("Set-Cookie"));
        int start = setCookie.indexOf("XSRF-TOKEN=") + "XSRF-TOKEN=".length();
        csrfToken = setCookie.substring(start, setCookie.indexOf(';', start));
    }

    private MockHttpServletRequestBuilder requestFor(Endpoint endpoint) {
        MockHttpServletRequestBuilder builder = request(endpoint.method(), endpoint.samplePath());
        if (WRITES.contains(endpoint.method())) {
            builder.cookie(new Cookie("XSRF-TOKEN", csrfToken))
                    .header("X-XSRF-TOKEN", csrfToken)
                    .header("Origin", ORIGIN)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{}");
        }
        return builder;
    }

    @Test
    void findsTheWorkspaceEndpoints() {
        assertThat(endpoints).extracting(e -> e.pattern())
                .contains(PREFIX + "/help-requests/{helpRequestId}", PREFIX + "/help-requests");
    }

    @Test
    void everyWorkspaceEndpointRequiresLogin() throws Exception {
        for (Endpoint endpoint : endpoints) {
            int status = mvc.perform(requestFor(endpoint)).andReturn().getResponse().getStatus();
            assertThat(status).as("%s %s — 세션 없음", endpoint.method(), endpoint.pattern()).isEqualTo(401);
        }
    }

    @Test
    void anotherWorkspacesMemberNeverGetsASuccess() throws Exception {
        // 사무실 2의 팀원 — 경로의 사무실 1에는 아무 역할이 없다
        MockHttpSession outsider = TestLogin.githubUser(7L, 1001L).member(2L, 20L, WorkspaceRole.REPO_ADMIN).session();

        for (Endpoint endpoint : endpoints) {
            int status = mvc.perform(requestFor(endpoint).session(outsider)).andReturn().getResponse().getStatus();
            String label = endpoint.method() + " " + endpoint.pattern() + " — 다른 사무실 팀원";
            if (WRITES.contains(endpoint.method())) {
                assertThat(status).as(label).isIn(400, 404);
            } else {
                assertThat(status).as(label).isEqualTo(404);
            }
        }
    }
}

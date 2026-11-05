package com.samdoryu.backend.github;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpRequest;
import org.springframework.http.client.ClientHttpRequestExecution;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.ClientHttpResponse;

/**
 * GitHub 읽기 전용 가드(CON-02 · CONTRACTS.md 「7」 · 「9」 GitHub 읽기 전용) — GitHub로 나가는 <b>모든</b> 요청이 이것을 거친다.
 * 허용: {@code GET}, 설치 토큰 발급({@code POST /app/installations/{id}/access_tokens}), GraphQL query({@code POST /graphql}).
 * 그 밖의 요청(이슈 · PR · 라벨 · 담당자 변경 등 PATCH · PUT · DELETE · 다른 POST, GraphQL mutation)은 <b>보내기 전에</b> 막는다.
 * OAuth 코드 교환(로그인)은 Spring Security의 별도 클라이언트가 github.com으로 보낸다.
 */
public class ReadOnlyGithubGuard implements ClientHttpRequestInterceptor {

    private static final Pattern INSTALLATION_TOKEN = Pattern.compile("/app/installations/\\d+/access_tokens");
    private static final Pattern GRAPHQL_MUTATION = Pattern.compile("\"query\"\\s*:\\s*\"\\s*mutation\\b");

    @Override
    public ClientHttpResponse intercept(HttpRequest request, byte[] body, ClientHttpRequestExecution execution)
            throws IOException {
        if (!isAllowed(request.getMethod(), request.getURI().getPath(), body)) {
            throw new IllegalStateException("GitHub 읽기 전용 위반 — 허용되지 않은 요청: " + request.getMethod() + " "
                    + request.getURI().getPath());
        }
        return execution.execute(request, body);
    }

    static boolean isAllowed(HttpMethod method, String path, byte[] body) {
        if (HttpMethod.GET.equals(method)) {
            return true;
        }
        if (!HttpMethod.POST.equals(method)) {
            return false;
        }
        if (INSTALLATION_TOKEN.matcher(path).matches()) {
            return true;
        }
        if ("/graphql".equals(path)) {
            return !GRAPHQL_MUTATION.matcher(new String(body, StandardCharsets.UTF_8)).find();
        }
        return false;
    }
}

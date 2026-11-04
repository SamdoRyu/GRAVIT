package com.samdoryu.backend.github;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.github.dto.GithubRepoPermission;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/**
 * 로그인한 사용자의 토큰으로 GitHub를 읽는다(CONTRACTS.md 「7」 사용자 · 레포 권한 조회). <b>GET만</b> 보낸다.
 * 토큰은 매개변수로만 받고 저장하거나 로그에 남기지 않는다(NFR-04).
 * <p>
 * 실패는 계약 code로 바꾼다: 401 → {@code github_unauthorized}, 요청 한도(429 · 남은 한도 0인 403) →
 * {@code github_rate_limited}, 그 밖의 오류 · 연결 실패 → {@code unavailable}.
 */
@Component
public class GithubUserClient {

    static final String API_BASE = "https://api.github.com";
    static final int PAGE_SIZE = 100;
    /** 페이지 상한 — 레포 1,000개까지. 무한 반복을 막는다. */
    static final int MAX_PAGES = 10;

    @JsonIgnoreProperties(ignoreUnknown = true)
    record RepoJson(Long id, PermissionsJson permissions) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record PermissionsJson(boolean admin) {
    }

    /** GitHub가 응답하지 않을 때 로그인을 붙잡지 않는다. */
    static final Duration TIMEOUT = Duration.ofSeconds(10);

    private final RestClient restClient;

    public GithubUserClient() {
        this(RestClient.builder().requestFactory(timeoutRequestFactory()));
    }

    /** 테스트가 가짜 HTTP 서버를 붙인 빌더를 넘긴다. */
    GithubUserClient(RestClient.Builder restClientBuilder) {
        this.restClient = restClientBuilder.clone()
                .baseUrl(API_BASE)
                .defaultHeader(HttpHeaders.ACCEPT, "application/vnd.github+json")
                .defaultHeader("X-GitHub-Api-Version", "2022-11-28")
                .build();
    }

    private static JdkClientHttpRequestFactory timeoutRequestFactory() {
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(TIMEOUT);
        return factory;
    }

    /** {@code GET /user/repos} — 사용자가 접근할 수 있는 레포와 admin 여부(앱이 설치된 레포만 보인다). */
    public List<GithubRepoPermission> repositoryPermissions(String accessToken) {
        List<GithubRepoPermission> result = new ArrayList<>();
        for (int page = 1; page <= MAX_PAGES; page++) {
            List<RepoJson> repos = fetchPage(accessToken, page);
            for (RepoJson repo : repos) {
                if (repo.id() != null) {
                    result.add(new GithubRepoPermission(repo.id(),
                            repo.permissions() != null && repo.permissions().admin()));
                }
            }
            if (repos.size() < PAGE_SIZE) {
                break;
            }
        }
        return result;
    }

    private List<RepoJson> fetchPage(String accessToken, int page) {
        try {
            RepoJson[] body = restClient.get()
                    .uri(uri -> uri.path("/user/repos")
                            .queryParam("per_page", PAGE_SIZE)
                            .queryParam("page", page)
                            .build())
                    .headers(headers -> headers.setBearerAuth(accessToken))
                    .retrieve()
                    .onStatus(status -> status.isError(), (request, response) -> {
                        throw new ApiException(errorCodeFor(response));
                    })
                    .body(RepoJson[].class);
            return body == null ? List.of() : List.of(body);
        } catch (ResourceAccessException e) {
            throw new ApiException(ErrorCode.UNAVAILABLE);
        }
    }

    private static ErrorCode errorCodeFor(ClientHttpResponse response) throws java.io.IOException {
        HttpStatusCode status = response.getStatusCode();
        if (status.value() == HttpStatus.UNAUTHORIZED.value()) {
            return ErrorCode.GITHUB_UNAUTHORIZED;
        }
        boolean outOfQuota = "0".equals(response.getHeaders().getFirst("X-RateLimit-Remaining"));
        if (status.value() == HttpStatus.TOO_MANY_REQUESTS.value()
                || (status.value() == HttpStatus.FORBIDDEN.value() && outOfQuota)) {
            return ErrorCode.GITHUB_RATE_LIMITED;
        }
        return ErrorCode.UNAVAILABLE;
    }
}

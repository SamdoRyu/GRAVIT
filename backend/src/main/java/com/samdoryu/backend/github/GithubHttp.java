package com.samdoryu.backend.github;

import com.samdoryu.backend.common.error.ErrorCode;
import java.io.IOException;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * GitHub REST · GraphQL 클라이언트 공통 설정 — 주소 · 헤더 · 타임아웃 · 읽기 전용 가드 · 오류 변환.
 * github 패키지(하위 패키지 포함) 안에서만 쓴다 — GitHub를 부르는 곳은 이 패키지뿐이다(CONTRACTS.md 「7」).
 */
public final class GithubHttp {

    public static final String API_BASE = "https://api.github.com";
    /** 한 페이지 크기 — GitHub REST 최대값. */
    public static final int PAGE_SIZE = 100;
    /** GitHub가 응답하지 않을 때 요청을 붙잡지 않는다. */
    public static final Duration TIMEOUT = Duration.ofSeconds(10);

    private GithubHttp() {
    }

    /** 실제 서버용 빌더 — JDK HttpClient(연결 · 응답 타임아웃). */
    public static RestClient.Builder defaultBuilder() {
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(TIMEOUT);
        return RestClient.builder().requestFactory(factory);
    }

    /** 공통 설정을 얹는다. 테스트는 가짜 HTTP 서버를 붙인 빌더를 넘긴다 — 가드는 그때도 걸린다. */
    public static RestClient build(RestClient.Builder builder) {
        return builder.clone()
                .baseUrl(API_BASE)
                .defaultHeader(HttpHeaders.ACCEPT, "application/vnd.github+json")
                .defaultHeader("X-GitHub-Api-Version", "2022-11-28")
                .requestInterceptor(new ReadOnlyGithubGuard())
                .build();
    }

    public static boolean outOfQuota(ClientHttpResponse response) {
        return "0".equals(response.getHeaders().getFirst("X-RateLimit-Remaining"));
    }

    /** 401 → {@code github_unauthorized}, 요청 한도(429 · 남은 한도 0인 403) → {@code github_rate_limited}, 그 밖 → {@code unavailable}. */
    public static ErrorCode errorCodeFor(ClientHttpResponse response) throws IOException {
        int status = response.getStatusCode().value();
        if (status == HttpStatus.UNAUTHORIZED.value()) {
            return ErrorCode.GITHUB_UNAUTHORIZED;
        }
        if (status == HttpStatus.TOO_MANY_REQUESTS.value()
                || (status == HttpStatus.FORBIDDEN.value() && outOfQuota(response))) {
            return ErrorCode.GITHUB_RATE_LIMITED;
        }
        return ErrorCode.UNAVAILABLE;
    }
}

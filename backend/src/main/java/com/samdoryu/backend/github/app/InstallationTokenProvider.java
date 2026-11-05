package com.samdoryu.backend.github.app;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.github.GithubHttp;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.PrivateKey;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

/**
 * GitHub App 설치 토큰 — 서버가 혼자 그 설치의 레포를 읽는 자격 증명(CONTRACTS.md 「7」 허용된 POST: 설치 토큰 발급).
 * 설치마다 메모리에 두고 만료 5분 전에 다시 받는다(서버 재시작 때 사라짐). 토큰 · 키 · JWT를 로그 · 응답에 남기지 않는다.
 */
class InstallationTokenProvider {

    /** 이 시간보다 적게 남으면 새로 받는다. */
    static final Duration REFRESH_BEFORE = Duration.ofMinutes(5);

    @JsonIgnoreProperties(ignoreUnknown = true)
    record AccessTokenJson(String token, Instant expires_at) {
    }

    private record CachedToken(String value, Instant expiresAt) {
    }

    private final RestClient restClient;
    private final GithubAppProperties properties;
    private final Function<String, PrivateKey> keyLoader;
    private final Clock clock;
    private final Map<Long, CachedToken> cache = new ConcurrentHashMap<>();
    private volatile PrivateKey privateKey;

    InstallationTokenProvider(RestClient restClient, GithubAppProperties properties,
            Function<String, PrivateKey> keyLoader, Clock clock) {
        this.restClient = restClient;
        this.properties = properties;
        this.keyLoader = keyLoader;
        this.clock = clock;
    }

    /** 실제 서버 — 키 파일을 처음 쓸 때 읽는다. */
    static Function<String, PrivateKey> keyFileLoader() {
        return path -> {
            try {
                return GithubAppJwt.parsePrivateKey(Files.readString(Path.of(path)));
            } catch (IOException e) {
                throw new IllegalStateException("GitHub App 개인 키 파일을 읽지 못함", e);
            }
        };
    }

    /**
     * @throws ApiException App이 설정되지 않았거나 설치가 없으면 {@code unavailable}, GitHub 오류는 계약 code
     */
    String token(Long installationId) {
        if (!properties.configured() || installationId == null) {
            throw new ApiException(ErrorCode.UNAVAILABLE, "GitHub App이 설정되지 않았어요");
        }
        Instant now = clock.instant();
        CachedToken cached = cache.get(installationId);
        if (cached != null && cached.expiresAt().isAfter(now.plus(REFRESH_BEFORE))) {
            return cached.value();
        }
        CachedToken fresh = request(installationId, now);
        cache.put(installationId, fresh);
        return fresh.value();
    }

    private CachedToken request(long installationId, Instant now) {
        String jwt = GithubAppJwt.create(properties.id(), privateKey(), now);
        try {
            AccessTokenJson body = restClient.post()
                    .uri("/app/installations/{id}/access_tokens", installationId)
                    .headers(headers -> headers.setBearerAuth(jwt))
                    .retrieve()
                    .onStatus(status -> status.isError(), (request, response) -> {
                        throw new ApiException(GithubHttp.errorCodeFor(response));
                    })
                    .body(AccessTokenJson.class);
            if (body == null || body.token() == null) {
                throw new ApiException(ErrorCode.UNAVAILABLE);
            }
            Instant expiresAt = body.expires_at() != null ? body.expires_at() : now.plus(Duration.ofMinutes(50));
            return new CachedToken(body.token(), expiresAt);
        } catch (ResourceAccessException e) {
            throw new ApiException(ErrorCode.UNAVAILABLE);
        }
    }

    private PrivateKey privateKey() {
        PrivateKey key = privateKey;
        if (key == null) {
            key = keyLoader.apply(properties.privateKeyPath());
            privateKey = key;
        }
        return key;
    }
}

package com.samdoryu.backend.github;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.github.dto.GithubAccount;
import com.samdoryu.backend.github.dto.GithubInstalledRepository;
import com.samdoryu.backend.github.dto.GithubRepoPermission;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriBuilder;

/**
 * 로그인한 사용자의 토큰으로 GitHub를 읽는다(CONTRACTS.md 「7」 사용자 · 레포 권한 조회 · 설치 목록 · 레포 목록). <b>GET만</b>
 * 보낸다. 토큰은 매개변수로만 받고 저장하거나 로그에 남기지 않는다(NFR-04).
 * <p>
 * 실패는 계약 code로 바꾼다: 401 → {@code github_unauthorized}, 요청 한도(429 · 남은 한도 0인 403) →
 * {@code github_rate_limited}, 그 밖의 오류 · 연결 실패 → {@code unavailable}.
 */
@Component
public class GithubUserClient {

    static final int PAGE_SIZE = GithubHttp.PAGE_SIZE;
    /** 페이지 상한 — 목록 하나에 1,000개까지. 무한 반복을 막는다. */
    static final int MAX_PAGES = 10;

    @JsonIgnoreProperties(ignoreUnknown = true)
    record AccountJson(Long id, String login) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record PermissionsJson(boolean admin) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record RepoJson(Long id, String name, AccountJson owner, PermissionsJson permissions) {
        boolean isAdmin() {
            return permissions != null && permissions.admin();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record InstallationJson(Long id, AccountJson account) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record InstallationsPage(List<InstallationJson> installations) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record InstallationReposPage(List<RepoJson> repositories) {
    }

    private final RestClient restClient;

    public GithubUserClient() {
        this(GithubHttp.defaultBuilder());
    }

    /** 테스트가 가짜 HTTP 서버를 붙인 빌더를 넘긴다. 읽기 전용 가드는 그때도 걸린다. */
    GithubUserClient(RestClient.Builder restClientBuilder) {
        this.restClient = GithubHttp.build(restClientBuilder);
    }

    /** {@code GET /user/repos} — 사용자가 접근할 수 있는 레포와 admin 여부(앱이 설치된 레포만 보인다). 로그인 때 역할 판정(#65). */
    public List<GithubRepoPermission> repositoryPermissions(String accessToken) {
        List<GithubRepoPermission> result = new ArrayList<>();
        for (RepoJson repo : pages(accessToken, "/user/repos", RepoJson[].class, List::of)) {
            if (repo.id() != null) {
                result.add(new GithubRepoPermission(repo.id(), repo.isAdmin()));
            }
        }
        return result;
    }

    /**
     * 앱이 설치된 계정(조직 · 개인)의 레포 중 사용자가 접근할 수 있는 것과 그 권한(#68 · FR-GH-01).
     * {@code GET /user/installations} → 설치마다 {@code GET /user/installations/{id}/repositories}.
     */
    public List<GithubInstalledRepository> installedRepositories(String accessToken) {
        List<GithubInstalledRepository> result = new ArrayList<>();
        List<InstallationJson> installations = pages(accessToken, "/user/installations", InstallationsPage.class,
                page -> page.installations() == null ? List.of() : page.installations());
        for (InstallationJson installation : installations) {
            if (installation.id() == null || installation.account() == null) {
                continue;
            }
            List<RepoJson> repos = pages(accessToken, "/user/installations/" + installation.id() + "/repositories",
                    InstallationReposPage.class,
                    page -> page.repositories() == null ? List.of() : page.repositories());
            for (RepoJson repo : repos) {
                if (repo.id() == null || repo.name() == null) {
                    continue;
                }
                AccountJson owner = repo.owner() != null ? repo.owner() : installation.account();
                if (owner.id() == null || owner.login() == null) {
                    continue;
                }
                result.add(new GithubInstalledRepository(installation.id(), owner.id(), owner.login(), repo.id(),
                        repo.name(), repo.isAdmin()));
            }
        }
        return result;
    }

    /** {@code GET /user/orgs} — 사용자가 속한 조직. 앱이 아직 설치되지 않은 조직을 "승인 요청하기"로 보이는 데 쓴다. */
    public List<GithubAccount> organizations(String accessToken) {
        List<GithubAccount> result = new ArrayList<>();
        for (AccountJson org : pages(accessToken, "/user/orgs", AccountJson[].class, List::of)) {
            if (org.id() != null && org.login() != null) {
                result.add(new GithubAccount(org.id(), org.login()));
            }
        }
        return result;
    }

    /**
     * 레포 관리자(admin)의 로그인 이름 — "아직 사무실이 열리지 않았어요" 안내의 팀장 이름(P2).
     * 콜라보레이터 목록을 볼 권한이 없으면(한도가 남은 {@code 403}) 빈 목록 — 안내에서 이름만 빠진다.
     */
    public List<String> repositoryAdminLogins(String accessToken, String owner, String repo) {
        try {
            return restClient.get()
                    .uri(uri -> uri.path("/repos/{owner}/{repo}/collaborators")
                            .queryParam("permission", "admin")
                            .queryParam("per_page", PAGE_SIZE)
                            .build(owner, repo))
                    .headers(headers -> headers.setBearerAuth(accessToken))
                    .exchange((request, response) -> {
                        if (response.getStatusCode().value() == HttpStatus.FORBIDDEN.value() && !outOfQuota(response)) {
                            return List.<String>of();
                        }
                        if (response.getStatusCode().isError()) {
                            throw new ApiException(errorCodeFor(response));
                        }
                        AccountJson[] body = response.bodyTo(AccountJson[].class);
                        return body == null ? List.<String>of()
                                : List.of(body).stream().map(account -> account.login()).filter(l -> l != null).toList();
                    });
        } catch (ResourceAccessException e) {
            throw new ApiException(ErrorCode.UNAVAILABLE);
        }
    }

    /** 페이지를 넘기며 GET — 한 페이지가 {@link #PAGE_SIZE}보다 적으면 끝. */
    private <P, E> List<E> pages(String accessToken, String path, Class<P> pageType,
            Function<P, List<E>> itemsOf) {
        List<E> result = new ArrayList<>();
        for (int page = 1; page <= MAX_PAGES; page++) {
            int pageNumber = page;
            P body = get(accessToken, uri -> uri.path(path)
                    .queryParam("per_page", PAGE_SIZE)
                    .queryParam("page", pageNumber)
                    .build(), pageType);
            List<E> items = body == null ? List.of() : itemsOf.apply(body);
            result.addAll(items);
            if (items.size() < PAGE_SIZE) {
                break;
            }
        }
        return result;
    }

    private <T> T get(String accessToken, Function<UriBuilder, java.net.URI> uri, Class<T> type) {
        try {
            return restClient.get()
                    .uri(uri)
                    .headers(headers -> headers.setBearerAuth(accessToken))
                    .retrieve()
                    .onStatus(status -> status.isError(), (request, response) -> {
                        throw new ApiException(errorCodeFor(response));
                    })
                    .body(type);
        } catch (ResourceAccessException e) {
            throw new ApiException(ErrorCode.UNAVAILABLE);
        }
    }

    private static boolean outOfQuota(ClientHttpResponse response) {
        return GithubHttp.outOfQuota(response);
    }

    private static ErrorCode errorCodeFor(ClientHttpResponse response) throws IOException {
        return GithubHttp.errorCodeFor(response);
    }
}

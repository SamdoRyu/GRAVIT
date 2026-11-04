package com.samdoryu.backend.github;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.github.dto.GithubAccount;
import com.samdoryu.backend.github.dto.GithubInstalledRepository;
import com.samdoryu.backend.github.dto.GithubRepoPermission;
import java.net.SocketTimeoutException;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * 레포 권한 읽기 — 가짜 HTTP 서버로 확인한다(실제 GitHub를 부르지 않음). 기대하지 않은 요청이 나가면 실패한다:
 * 보내는 것은 {@code GET /user/repos}뿐이다(CONTRACTS.md 「7」 읽기 전용).
 */
class GithubUserClientTest {

    private static final String PAGE_1 = "https://api.github.com/user/repos?per_page=100&page=1";
    private static final String PAGE_2 = "https://api.github.com/user/repos?per_page=100&page=2";

    private MockRestServiceServer server;
    private GithubUserClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new GithubUserClient(builder);
    }

    private static String repo(long id, boolean admin) {
        return "{\"id\":" + id + ",\"full_name\":\"o/r" + id + "\",\"private\":true,"
                + "\"permissions\":{\"admin\":" + admin + ",\"maintain\":false,\"push\":true,\"triage\":true,\"pull\":true}}";
    }

    @Test
    void readsAdminAndCollaboratorReposWithOnlyAGetAndTheBearerToken() {
        server.expect(requestTo(PAGE_1))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer gho_user"))
                .andExpect(header("Accept", "application/vnd.github+json"))
                .andRespond(withSuccess("[" + repo(5001, true) + "," + repo(5002, false) + "]",
                        MediaType.APPLICATION_JSON));

        assertThat(client.repositoryPermissions("gho_user")).containsExactly(
                new GithubRepoPermission(5001, true), new GithubRepoPermission(5002, false));
        server.verify();
    }

    @Test
    void followsPagesUntilAShortPage() {
        String fullPage = IntStream.rangeClosed(1, 100).mapToObj(i -> repo(i, false))
                .collect(Collectors.joining(",", "[", "]"));
        server.expect(requestTo(PAGE_1)).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess(fullPage, MediaType.APPLICATION_JSON));
        server.expect(requestTo(PAGE_2)).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("[" + repo(9_000_000_000L, true) + "]", MediaType.APPLICATION_JSON));

        assertThat(client.repositoryPermissions("t")).hasSize(101)
                .last().isEqualTo(new GithubRepoPermission(9_000_000_000L, true));
        server.verify();
    }

    @Test
    void missingPermissionsCountAsCollaborator() {
        server.expect(requestTo(PAGE_1))
                .andRespond(withSuccess("[{\"id\":7}]", MediaType.APPLICATION_JSON));

        assertThat(client.repositoryPermissions("t")).containsExactly(new GithubRepoPermission(7, false));
    }

    private void assertFailsWith(ErrorCode code) {
        assertThatThrownBy(() -> client.repositoryPermissions("t"))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getErrorCode()).isEqualTo(code));
    }

    @Test
    void unauthorizedTokenIsGithubUnauthorized() {
        server.expect(requestTo(PAGE_1)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        assertFailsWith(ErrorCode.GITHUB_UNAUTHORIZED);
    }

    @Test
    void exhaustedQuotaIsGithubRateLimited() {
        server.expect(requestTo(PAGE_1))
                .andRespond(withStatus(HttpStatus.FORBIDDEN).header("X-RateLimit-Remaining", "0"));
        assertFailsWith(ErrorCode.GITHUB_RATE_LIMITED);
    }

    @Test
    void tooManyRequestsIsGithubRateLimited() {
        server.expect(requestTo(PAGE_1)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        assertFailsWith(ErrorCode.GITHUB_RATE_LIMITED);
    }

    @Test
    void forbiddenWithQuotaLeftIsUnavailable() {
        server.expect(requestTo(PAGE_1))
                .andRespond(withStatus(HttpStatus.FORBIDDEN).header("X-RateLimit-Remaining", "4999"));
        assertFailsWith(ErrorCode.UNAVAILABLE);
    }

    @Test
    void serverErrorIsUnavailable() {
        server.expect(requestTo(PAGE_1)).andRespond(withServerError());
        assertFailsWith(ErrorCode.UNAVAILABLE);
    }

    @Test
    void networkFailureIsUnavailable() {
        server.expect(requestTo(PAGE_1)).andRespond(withException(new SocketTimeoutException("timeout")));
        assertFailsWith(ErrorCode.UNAVAILABLE);
    }

    // --- #68 레포 선택 · 사무실 열기 ---

    private static final String INSTALLATIONS = "https://api.github.com/user/installations?per_page=100&page=1";

    private static String installedRepo(long id, String name, long ownerId, String owner, boolean admin) {
        return "{\"id\":" + id + ",\"name\":\"" + name + "\",\"owner\":{\"id\":" + ownerId + ",\"login\":\"" + owner
                + "\",\"type\":\"Organization\"},\"permissions\":{\"admin\":" + admin + ",\"push\":true,\"pull\":true}}";
    }

    @Test
    void installedRepositoriesWalksEveryInstallationWithOnlyGets() {
        server.expect(requestTo(INSTALLATIONS)).andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer gho_user"))
                .andRespond(withSuccess("{\"total_count\":2,\"installations\":["
                        + "{\"id\":11,\"account\":{\"id\":700,\"login\":\"team-samdo\"}},"
                        + "{\"id\":12,\"account\":{\"id\":1001,\"login\":\"octo-kim\"}}]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.github.com/user/installations/11/repositories?per_page=100&page=1"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"total_count\":2,\"repositories\":["
                        + installedRepo(5001, "gitvillage", 700, "team-samdo", true) + ","
                        + installedRepo(5002, "notes", 700, "team-samdo", false) + "]}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://api.github.com/user/installations/12/repositories?per_page=100&page=1"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("{\"total_count\":0,\"repositories\":[]}", MediaType.APPLICATION_JSON));

        assertThat(client.installedRepositories("gho_user")).containsExactly(
                new GithubInstalledRepository(11, 700, "team-samdo", 5001, "gitvillage", true),
                new GithubInstalledRepository(11, 700, "team-samdo", 5002, "notes", false));
        server.verify();
    }

    @Test
    void organizationsAreReadWithAGet() {
        server.expect(requestTo("https://api.github.com/user/orgs?per_page=100&page=1"))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("[{\"id\":700,\"login\":\"team-samdo\"},{\"id\":800,\"login\":\"other-team\"}]",
                        MediaType.APPLICATION_JSON));

        assertThat(client.organizations("t")).containsExactly(new GithubAccount(700, "team-samdo"),
                new GithubAccount(800, "other-team"));
    }

    private static final String ADMINS =
            "https://api.github.com/repos/team-samdo/gitvillage/collaborators?permission=admin&per_page=100";

    @Test
    void adminLoginsAreReadWithAGet() {
        server.expect(requestTo(ADMINS)).andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess("[{\"id\":1,\"login\":\"kim\"},{\"id\":2,\"login\":\"lee\"}]",
                        MediaType.APPLICATION_JSON));

        assertThat(client.repositoryAdminLogins("t", "team-samdo", "gitvillage")).containsExactly("kim", "lee");
    }

    /** 참여자는 콜라보레이터 목록을 볼 권한이 없을 수 있다 — 안내에서 이름만 빠진다. */
    @Test
    void adminLoginsWithoutPermissionAreEmpty() {
        server.expect(requestTo(ADMINS))
                .andRespond(withStatus(HttpStatus.FORBIDDEN).header("X-RateLimit-Remaining", "4999"));

        assertThat(client.repositoryAdminLogins("t", "team-samdo", "gitvillage")).isEmpty();
    }

    @Test
    void adminLoginsOutOfQuotaIsRateLimited() {
        server.expect(requestTo(ADMINS))
                .andRespond(withStatus(HttpStatus.FORBIDDEN).header("X-RateLimit-Remaining", "0"));

        assertThatThrownBy(() -> client.repositoryAdminLogins("t", "team-samdo", "gitvillage"))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.GITHUB_RATE_LIMITED));
    }

    @Test
    void installationsWithAnExpiredTokenIsGithubUnauthorized() {
        server.expect(requestTo(INSTALLATIONS)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> client.installedRepositories("t"))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.GITHUB_UNAUTHORIZED));
    }
}

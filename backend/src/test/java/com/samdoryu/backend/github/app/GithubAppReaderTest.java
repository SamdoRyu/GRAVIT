package com.samdoryu.backend.github.app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.github.GithubHttp;
import com.samdoryu.backend.github.dto.GithubCollaborator;
import com.samdoryu.backend.github.dto.GithubCommit;
import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubIssueLink;
import com.samdoryu.backend.github.dto.GithubPullRequest;
import com.samdoryu.backend.github.dto.GithubRepoRef;
import com.samdoryu.backend.github.dto.GithubReview;
import com.samdoryu.backend.github.dto.GithubUser;
import java.security.PrivateKey;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.ResponseActions;
import org.springframework.web.client.RestClient;

/**
 * 실제 사무실 GitHub 어댑터(#69) — 가짜 GitHub HTTP 서버로 확인한다(실제 GitHub를 부르지 않음).
 * 기대하지 않은 요청이 나가면 실패하고(MockRestServiceServer), 모든 요청은 읽기 전용 가드를 거친다.
 */
class GithubAppReaderTest {

    private static final Instant NOW = Instant.parse("2026-11-05T03:00:00Z");
    private static final GithubRepoRef REPO = new GithubRepoRef("team-samdo", "gitvillage", 77L);
    private static final String API = "https://api.github.com";
    private static final String TOKEN_URL = API + "/app/installations/77/access_tokens";

    private static PrivateKey key;
    private MockRestServiceServer server;
    private GithubAppReader reader;

    @BeforeEach
    void setUp() throws Exception {
        if (key == null) {
            key = GithubAppJwtTest.newKeyPair().getPrivate();
        }
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        RestClient client = GithubHttp.build(builder);
        InstallationTokenProvider tokens = new InstallationTokenProvider(client,
                new GithubAppProperties(123456L, "secrets/test.pem"), path -> key,
                Clock.fixed(NOW, ZoneOffset.UTC));
        reader = new GithubAppReader(client, tokens);
    }

    /** 설치 토큰 발급(허용된 POST) — App JWT로 인증한다. */
    private void expectInstallationToken() {
        server.expect(requestTo(TOKEN_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", startsWith("Bearer ey")))
                .andRespond(withSuccess("{\"token\":\"ghs_install\",\"expires_at\":\"2026-11-05T04:00:00Z\"}",
                        MediaType.APPLICATION_JSON));
    }

    private ResponseActions expectGet(String pathAndQueryStart) {
        return server.expect(requestTo(startsWith(API + pathAndQueryStart)))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer ghs_install"));
    }

    private static String user(long id, String login) {
        return "{\"id\":" + id + ",\"login\":\"" + login + "\",\"avatar_url\":\"https://avatars/" + id + "\"}";
    }

    @Test
    void issuesSkipPullRequestsAndKeepAllAssigneesAndTheClosedReason() {
        expectInstallationToken();
        expectGet("/repos/team-samdo/gitvillage/issues")
                .andExpect(queryParam("state", "all"))
                .andExpect(queryParam("since", "2026-11-04T00:00:00Z"))
                .andRespond(withSuccess("["
                        + "{\"number\":1,\"title\":\"로그인\",\"state\":\"open\",\"state_reason\":null,"
                        + "\"labels\":[{\"name\":\"priority:high\"}],\"assignees\":[" + user(1001, "kim") + ","
                        + user(1002, "lee") + "],\"created_at\":\"2026-11-03T01:00:00Z\","
                        + "\"updated_at\":\"2026-11-04T02:00:00Z\",\"closed_at\":null},"
                        + "{\"number\":2,\"title\":\"PR이 섞여 옴\",\"state\":\"open\",\"labels\":[],\"assignees\":[],"
                        + "\"created_at\":\"2026-11-03T01:00:00Z\",\"updated_at\":\"2026-11-04T02:00:00Z\","
                        + "\"pull_request\":{\"url\":\"x\"}},"
                        + "{\"number\":3,\"title\":\"다크 모드\",\"state\":\"closed\",\"state_reason\":\"not_planned\","
                        + "\"labels\":[],\"assignees\":[],\"created_at\":\"2026-11-03T01:00:00Z\","
                        + "\"updated_at\":\"2026-11-04T05:00:00Z\",\"closed_at\":\"2026-11-04T05:00:00Z\"}]",
                        MediaType.APPLICATION_JSON));

        List<GithubIssue> issues = reader.issuesUpdatedSince(REPO, Instant.parse("2026-11-04T00:00:00Z"));

        assertThat(issues).extracting(i -> i.number()).containsExactly(1, 3);
        assertThat(issues.get(0).assignees()).extracting(u -> u.id()).containsExactly(1001L, 1002L);
        assertThat(issues.get(0).labels()).containsExactly("priority:high");
        assertThat(issues.get(1).closed()).isTrue();
        assertThat(issues.get(1).closedReason()).isEqualTo(GithubIssue.ClosedReason.NOT_PLANNED);
        server.verify();
    }

    @Test
    void theInstallationTokenIsIssuedOnceAndReused() {
        expectInstallationToken();
        expectGet("/repos/team-samdo/gitvillage/collaborators").andRespond(withSuccess("[]",
                MediaType.APPLICATION_JSON));
        expectGet("/repos/team-samdo/gitvillage/issues").andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

        reader.collaborators(REPO);
        reader.issuesUpdatedSince(REPO, null);

        server.verify();
    }

    @Test
    void pullRequestsStopAtTheFirstOneOlderThanSince() {
        expectInstallationToken();
        expectGet("/repos/team-samdo/gitvillage/pulls")
                .andExpect(queryParam("sort", "updated"))
                .andExpect(queryParam("direction", "desc"))
                .andRespond(withSuccess("["
                        + "{\"number\":9,\"title\":\"fix\",\"user\":" + user(1001, "kim") + ",\"draft\":false,"
                        + "\"state\":\"closed\",\"merged_at\":\"2026-11-04T05:00:00Z\",\"head\":{\"sha\":\""
                        + "a".repeat(40) + "\"},\"labels\":[],\"requested_reviewers\":[" + user(1002, "lee") + "],"
                        + "\"created_at\":\"2026-11-03T08:00:00Z\",\"updated_at\":\"2026-11-04T05:00:00Z\","
                        + "\"closed_at\":\"2026-11-04T05:00:00Z\"},"
                        + "{\"number\":8,\"title\":\"draft\",\"user\":" + user(1002, "lee") + ",\"draft\":true,"
                        + "\"state\":\"open\",\"merged_at\":null,\"head\":{\"sha\":\"" + "b".repeat(40) + "\"},"
                        + "\"labels\":[],\"requested_reviewers\":[],\"created_at\":\"2026-11-04T03:30:00Z\","
                        + "\"updated_at\":\"2026-11-04T03:30:00Z\",\"closed_at\":null},"
                        + "{\"number\":7,\"title\":\"old\",\"user\":" + user(1001, "kim") + ",\"draft\":false,"
                        + "\"state\":\"open\",\"head\":{\"sha\":\"" + "c".repeat(40) + "\"},\"labels\":[],"
                        + "\"requested_reviewers\":[],\"created_at\":\"2026-11-01T00:00:00Z\","
                        + "\"updated_at\":\"2026-11-01T00:00:00Z\"}]", MediaType.APPLICATION_JSON));

        List<GithubPullRequest> prs = reader.pullRequestsUpdatedSince(REPO, Instant.parse("2026-11-02T00:00:00Z"));

        assertThat(prs).extracting(p -> p.number()).containsExactly(9, 8);
        GithubPullRequest merged = prs.get(0);
        assertThat(merged.merged()).isTrue();
        assertThat(merged.closed()).isTrue();
        assertThat(merged.headSha()).isEqualTo("a".repeat(40));
        assertThat(merged.author()).isEqualTo(new GithubUser(1001L, "kim", "https://avatars/1001"));
        assertThat(merged.requestedReviewers()).extracting(u -> u.login()).containsExactly("lee");
        assertThat(prs.get(1).draft()).isTrue();
        server.verify();
    }

    @Test
    void pullRequestsFollowPagesWhenEverythingIsNew() {
        expectInstallationToken();
        String fullPage = IntStream.rangeClosed(1, 100).mapToObj(i -> "{\"number\":" + (200 - i)
                        + ",\"title\":\"p\",\"state\":\"open\",\"head\":{\"sha\":\"" + "d".repeat(40) + "\"},"
                        + "\"created_at\":\"2026-11-04T00:00:00Z\",\"updated_at\":\"2026-11-04T00:00:00Z\"}")
                .collect(Collectors.joining(",", "[", "]"));
        expectGet("/repos/team-samdo/gitvillage/pulls").andExpect(queryParam("page", "1"))
                .andRespond(withSuccess(fullPage, MediaType.APPLICATION_JSON));
        expectGet("/repos/team-samdo/gitvillage/pulls").andExpect(queryParam("page", "2"))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

        assertThat(reader.pullRequestsUpdatedSince(REPO, null)).hasSize(100);
        server.verify();
    }

    @Test
    void reviewsSkipPendingOnesAndAreInSubmittedOrder() {
        expectInstallationToken();
        expectGet("/repos/team-samdo/gitvillage/pulls/9/reviews").andRespond(withSuccess("["
                + "{\"user\":" + user(1002, "lee") + ",\"state\":\"APPROVED\",\"submitted_at\":\"2026-11-04T04:30:00Z\"},"
                + "{\"user\":" + user(1003, "park") + ",\"state\":\"PENDING\",\"submitted_at\":null},"
                + "{\"user\":" + user(1002, "lee") + ",\"state\":\"CHANGES_REQUESTED\","
                + "\"submitted_at\":\"2026-11-03T10:00:00Z\"}]", MediaType.APPLICATION_JSON));

        assertThat(reader.reviews(REPO, 9)).extracting(r -> r.state())
                .containsExactly(GithubReview.State.CHANGES_REQUESTED, GithubReview.State.APPROVED);
    }

    /**
     * #261 — PR 커밋을 GitHub 순서대로: SHA · 작성자(이메일과 이어진 GitHub 계정, 없으면 null) · 메시지 첫 줄 · 작성 시각 · 커밋 시각.
     * 마지막 커밋의 커밋 시각이 PR의 마지막 커밋 시각이다. SHA나 시각이 없는 항목은 뺀다.
     */
    @Test
    void pullRequestCommitsCarryShaAuthorFirstLineAndBothTimes() {
        expectInstallationToken();
        expectGet("/repos/team-samdo/gitvillage/pulls/9/commits").andRespond(withSuccess("["
                + "{\"sha\":\"aaa1\",\"author\":" + user(1002, "lee") + ",\"commit\":{\"message\":\"  세션 만료 처리 \\n\\n본문\","
                + "\"author\":{\"date\":\"2026-11-03T08:30:00Z\"},\"committer\":{\"date\":\"2026-11-03T09:00:00Z\"}}},"
                + "{\"sha\":\"bbb2\",\"author\":null,\"commit\":{\"message\":\"rebase로 다시 쓴 커밋\","
                + "\"author\":{\"date\":\"2026-11-03T20:00:00Z\"},\"committer\":{\"date\":\"2026-11-04T04:00:00Z\"}}},"
                + "{\"sha\":null,\"commit\":{\"message\":\"깨진 항목\",\"committer\":{\"date\":\"2026-11-04T05:00:00Z\"}}},"
                + "{\"sha\":\"ccc3\",\"commit\":{\"committer\":{\"date\":\"2026-11-04T06:00:00Z\"}}}]",
                MediaType.APPLICATION_JSON));

        List<GithubCommit> commits = reader.pullRequestCommits(REPO, 9);

        assertThat(commits).extracting(GithubCommit::sha).containsExactly("aaa1", "bbb2", "ccc3");
        assertThat(commits.get(0)).isEqualTo(new GithubCommit("aaa1", new GithubUser(1002L, "lee", "https://avatars/1002"),
                "세션 만료 처리", Instant.parse("2026-11-03T08:30:00Z"), Instant.parse("2026-11-03T09:00:00Z")));
        assertThat(commits.get(1).author()).isNull();
        assertThat(commits.get(1).authoredAt()).isEqualTo(Instant.parse("2026-11-03T20:00:00Z"));
        // 메시지 · 작성 시각이 없으면 빈 제목 · 커밋 시각
        assertThat(commits.get(2).title()).isEmpty();
        assertThat(commits.get(2).authoredAt()).isEqualTo(Instant.parse("2026-11-04T06:00:00Z"));
    }

    @Test
    void firstLineOfACommitMessage() {
        assertThat(GithubAppReader.firstLine("fix: 로그인\r\n\r\n본문")).isEqualTo("fix: 로그인");
        assertThat(GithubAppReader.firstLine("한 줄")).isEqualTo("한 줄");
        assertThat(GithubAppReader.firstLine(null)).isEmpty();
    }

    @Test
    void collaboratorsCarryIdLoginAvatarAndAdmin() {
        expectInstallationToken();
        expectGet("/repos/team-samdo/gitvillage/collaborators").andExpect(queryParam("affiliation", "all"))
                .andRespond(withSuccess("["
                        + "{\"id\":1001,\"login\":\"kim\",\"avatar_url\":\"https://a/1\",\"permissions\":{\"admin\":true}},"
                        + "{\"id\":1002,\"login\":\"lee\",\"avatar_url\":null,\"permissions\":{\"admin\":false}}]",
                        MediaType.APPLICATION_JSON));

        assertThat(reader.collaborators(REPO)).containsExactly(
                new GithubCollaborator(new GithubUser(1001L, "kim", "https://a/1"), true),
                new GithubCollaborator(new GithubUser(1002L, "lee", null), false));
    }

    @Test
    void linkedIssuesComeFromAGraphqlQueryAndOnlyFromThisRepo() {
        expectInstallationToken();
        server.expect(requestTo(API + "/graphql"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string(containsString("closingIssuesReferences")))
                .andExpect(content().string(containsString("\"query\":\"query(")))
                .andRespond(withSuccess("{\"data\":{\"repository\":{\"pullRequest\":{\"closingIssuesReferences\":"
                        + "{\"nodes\":[{\"number\":1,\"repository\":{\"nameWithOwner\":\"team-samdo/gitvillage\"}},"
                        + "{\"number\":5,\"repository\":{\"nameWithOwner\":\"other/repo\"}}]}}}}}",
                        MediaType.APPLICATION_JSON));

        assertThat(reader.linkedIssues(REPO, 9))
                .containsExactly(new GithubIssueLink(1, GithubIssueLink.Source.CLOSING_REFERENCE));
        server.verify();
    }

    @Test
    void githubErrorsBecomeContractCodes() {
        expectInstallationToken();
        expectGet("/repos/team-samdo/gitvillage/issues")
                .andRespond(withStatus(HttpStatus.FORBIDDEN).header("X-RateLimit-Remaining", "0"));

        assertThatThrownBy(() -> reader.issuesUpdatedSince(REPO, null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.GITHUB_RATE_LIMITED));
    }

    @Test
    void aRejectedAppIsGithubUnauthorized() {
        server.expect(requestTo(TOKEN_URL)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> reader.collaborators(REPO))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.GITHUB_UNAUTHORIZED));
    }

    /** App 설정이 없으면 GitHub를 부르지 않고 unavailable — 동기화는 실패로 기록된다. */
    @Test
    void withoutAppSettingsNothingIsSent() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer silent = MockRestServiceServer.bindTo(builder).build();
        RestClient client = GithubHttp.build(builder);
        GithubAppReader unconfigured = new GithubAppReader(client, new InstallationTokenProvider(client,
                new GithubAppProperties(null, null), path -> key, Clock.fixed(NOW, ZoneOffset.UTC)));

        assertThatThrownBy(() -> unconfigured.collaborators(REPO))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.UNAVAILABLE));
        silent.verify();
    }

    // ===== 명세 문서 읽기(#14) =====

    private static final MediaType RAW = MediaType.parseMediaType("application/vnd.github.raw");

    @Test
    void readsTheSpecFileAsRawTextWithEachPathSegmentEncoded() {
        expectInstallationToken();
        server.expect(requestTo(API + "/repos/team-samdo/gitvillage/contents/docs/%EC%9A%94%EA%B5%AC%20%EC%82%AC%ED%95%AD.md"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer ghs_install"))
                .andExpect(header("Accept", GithubAppReader.RAW_CONTENT))
                .andRespond(withSuccess("# 명세\n\n## FR-AUTH-01 로그인\n", RAW));

        assertThat(reader.readFile(REPO, "/docs/요구 사항.md")).contains("# 명세\n\n## FR-AUTH-01 로그인\n");
        server.verify();
    }

    @Test
    void missingFileDirectoryAndOversizedFileAreUnreadable() {
        expectInstallationToken();
        expectGet("/repos/team-samdo/gitvillage/contents/docs/none.md").andRespond(withStatus(HttpStatus.NOT_FOUND));
        expectGet("/repos/team-samdo/gitvillage/contents/docs")
                .andRespond(withSuccess("[{\"name\":\"requirements.md\",\"type\":\"file\"}]", MediaType.APPLICATION_JSON));
        expectGet("/repos/team-samdo/gitvillage/contents/big.md")
                .andRespond(withSuccess("가".repeat(GithubAppReader.MAX_FILE_BYTES / 3 + 1), RAW));

        assertThat(reader.readFile(REPO, "docs/none.md")).isEmpty();
        assertThat(reader.readFile(REPO, "docs")).isEmpty();
        assertThat(reader.readFile(REPO, "big.md")).isEmpty();
        server.verify();
    }

    @Test
    void otherGithubErrorsFailTheSync() {
        expectInstallationToken();
        expectGet("/repos/team-samdo/gitvillage/contents/docs/requirements.md")
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(() -> reader.readFile(REPO, "docs/requirements.md"))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.GITHUB_UNAUTHORIZED));
    }
}

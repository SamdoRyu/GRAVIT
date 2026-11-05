package com.samdoryu.backend.github;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * #69 완료 조건 1 · CONTRACTS.md 「9」 GitHub 읽기 전용 — 허용된 요청(GET · 설치 토큰 발급 · GraphQL query) 밖의 요청은
 * <b>보내기 전에</b> 실패한다. 가짜 HTTP 서버에는 아무 요청도 닿지 않는다.
 */
class ReadOnlyGithubGuardTest {

    private static byte[] body(String json) {
        return json.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void allowsReadsTokenIssuingAndGraphqlQueries() {
        assertThat(ReadOnlyGithubGuard.isAllowed(HttpMethod.GET, "/repos/o/r/issues", new byte[0])).isTrue();
        assertThat(ReadOnlyGithubGuard.isAllowed(HttpMethod.POST, "/app/installations/77/access_tokens",
                new byte[0])).isTrue();
        assertThat(ReadOnlyGithubGuard.isAllowed(HttpMethod.POST, "/graphql",
                body("{\"query\":\"query($owner:String!){repository(owner:$owner){id}}\"}"))).isTrue();
    }

    @Test
    void rejectsEverythingThatCouldChangeGithub() {
        assertThat(ReadOnlyGithubGuard.isAllowed(HttpMethod.PATCH, "/repos/o/r/issues/1", new byte[0])).isFalse();
        assertThat(ReadOnlyGithubGuard.isAllowed(HttpMethod.POST, "/repos/o/r/issues", new byte[0])).isFalse();
        assertThat(ReadOnlyGithubGuard.isAllowed(HttpMethod.POST, "/repos/o/r/issues/1/labels", new byte[0]))
                .isFalse();
        assertThat(ReadOnlyGithubGuard.isAllowed(HttpMethod.PUT, "/repos/o/r/pulls/1/merge", new byte[0])).isFalse();
        assertThat(ReadOnlyGithubGuard.isAllowed(HttpMethod.PUT, "/repos/o/r/collaborators/claude", new byte[0]))
                .isFalse();
        assertThat(ReadOnlyGithubGuard.isAllowed(HttpMethod.DELETE, "/repos/o/r/issues/1/assignees", new byte[0]))
                .isFalse();
        assertThat(ReadOnlyGithubGuard.isAllowed(HttpMethod.POST, "/graphql",
                body("{\"query\":\"mutation { closeIssue(input:{issueId:\\\"x\\\"}) { clientMutationId } }\"}")))
                .isFalse();
        assertThat(ReadOnlyGithubGuard.isAllowed(HttpMethod.POST, "/graphql",
                body("{\"query\":\"  mutation addLabel { x }\"}"))).isFalse();
    }

    /** 실제 클라이언트 설정(GithubHttp)으로 쓰기를 시도하면 GitHub(가짜 서버)에 닿기 전에 실패한다. */
    @Test
    void aWriteThroughTheRealClientFailsBeforeReachingGithub() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        RestClient client = GithubHttp.build(builder);

        assertThatThrownBy(() -> client.patch().uri("/repos/o/r/issues/1").contentType(MediaType.APPLICATION_JSON)
                .body("{\"state\":\"closed\"}").retrieve().toBodilessEntity())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("읽기 전용");

        server.expect(requestTo("https://api.github.com/repos/o/r/issues")).andRespond(withSuccess("[]",
                MediaType.APPLICATION_JSON));
        client.get().uri("/repos/o/r/issues").retrieve().body(String.class);
        server.verify();
    }
}

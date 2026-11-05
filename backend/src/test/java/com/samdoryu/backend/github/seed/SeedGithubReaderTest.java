package com.samdoryu.backend.github.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubIssueLink;
import com.samdoryu.backend.github.dto.GithubPullRequest;
import com.samdoryu.backend.github.dto.GithubRepoRef;
import com.samdoryu.backend.github.dto.GithubReview;
import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import java.time.Instant;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/** Seed 어댑터 — 시연 데이터가 GitHub 어댑터와 같은 모양으로 읽히는지(DB 없음). */
class SeedGithubReaderTest {

    private final SeedGithubReader reader = new SeedGithubReader();

    @Test
    void servesTheDemoWorkspace() {
        assertThat(reader.kind()).isEqualTo(WorkspaceKind.DEMO);
    }

    @Test
    void readsEveryIssueAndPullRequestWhenSinceIsNull() {
        List<GithubIssue> issues = reader.issuesUpdatedSince(GithubRepoRef.DEMO, null);
        List<GithubPullRequest> prs = reader.pullRequestsUpdatedSince(GithubRepoRef.DEMO, null);

        assertThat(issues).hasSize(6);
        assertThat(prs).extracting(p -> p.number()).containsExactly(7, 8, 9, 10);
        // GitHub처럼 이슈와 PR은 번호를 함께 쓴다
        assertThat(Stream.concat(issues.stream().map(i -> i.number()), prs.stream().map(p -> p.number())))
                .doesNotHaveDuplicates();
    }

    @Test
    void coversEveryStateTheSyncHandles() {
        List<GithubIssue> issues = reader.issuesUpdatedSince(GithubRepoRef.DEMO, null);
        List<GithubPullRequest> prs = reader.pullRequestsUpdatedSince(GithubRepoRef.DEMO, null);

        assertThat(issues).anyMatch(i -> i.assignees().size() >= 2)
                .anyMatch(i -> i.assignees().isEmpty())
                .anyMatch(i -> i.closedReason() == GithubIssue.ClosedReason.COMPLETED)
                .anyMatch(i -> i.closedReason() == GithubIssue.ClosedReason.NOT_PLANNED);
        assertThat(prs).anyMatch(p -> p.draft())
                .anyMatch(p -> p.merged())
                .anyMatch(p -> p.closed() && !p.merged())
                .anyMatch(p -> !p.closed() && !p.draft());
        assertThat(prs).allSatisfy(p -> assertThat(p.headSha()).matches("[0-9a-f]{40}"));
    }

    @Test
    void seedAccountsHaveNoGithubIdAndASeedLogin() {
        Stream<GithubUser> users = Stream.concat(
                reader.issuesUpdatedSince(GithubRepoRef.DEMO, null).stream().flatMap(i -> i.assignees().stream()),
                reader.pullRequestsUpdatedSince(GithubRepoRef.DEMO, null).stream().map(p -> p.author()));

        assertThat(users).allSatisfy(u -> {
            assertThat(u.id()).isNull();
            assertThat(u.login()).startsWith("seed-");
        });
    }

    @Test
    void filtersBySince() {
        Instant since = Instant.parse("2026-11-04T03:30:00Z");

        assertThat(reader.issuesUpdatedSince(GithubRepoRef.DEMO, since)).extracting(i -> i.number())
                .containsExactlyInAnyOrder(4, 6);
        assertThat(reader.pullRequestsUpdatedSince(GithubRepoRef.DEMO, since)).extracting(p -> p.number())
                .containsExactly(7, 9);
    }

    @Test
    void returnsReviewsInSubmittedOrderAndLastCommit() {
        assertThat(reader.reviews(GithubRepoRef.DEMO, 9)).extracting(r -> r.state())
                .containsExactly(GithubReview.State.CHANGES_REQUESTED, GithubReview.State.APPROVED);
        assertThat(reader.reviews(GithubRepoRef.DEMO, 8)).isEmpty();
        assertThat(reader.reviews(GithubRepoRef.DEMO, 999)).isEmpty();
        assertThat(reader.lastCommitAt(GithubRepoRef.DEMO, 7)).contains(Instant.parse("2026-11-04T05:50:00Z"));
        assertThat(reader.lastCommitAt(GithubRepoRef.DEMO, 999)).isEmpty();
    }

    @Test
    void brokenSeedFailsAtStartup() {
        assertThatThrownBy(() -> new SeedGithubReader("seed/broken-unknown-field.json"))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> new SeedGithubReader("seed/missing.json"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void collaboratorsAreTheFourSeedMembersAndTheMentorIsNotOne() {
        assertThat(reader.collaborators(GithubRepoRef.DEMO))
                .extracting(c -> c.user().login(), c -> c.admin())
                .containsExactly(tuple("seed-kim", true), tuple("seed-lee", false), tuple("seed-park", false),
                        tuple("seed-choi", false));
        assertThat(reader.collaborators(GithubRepoRef.DEMO)).allSatisfy(c -> assertThat(c.user().id()).isNull());
    }

    @Test
    void linkedIssuesAreOfficialLinksOnly() {
        assertThat(reader.linkedIssues(GithubRepoRef.DEMO, 7))
                .containsExactly(new GithubIssueLink(1, GithubIssueLink.Source.CLOSING_REFERENCE));
        assertThat(reader.linkedIssues(GithubRepoRef.DEMO, 9)).extracting(l -> l.issueNumber()).containsExactly(4);
        assertThat(reader.linkedIssues(GithubRepoRef.DEMO, 10)).isEmpty();
        assertThat(reader.linkedIssues(GithubRepoRef.DEMO, 999)).isEmpty();
    }

    /** #14 — 시연 명세 문서는 정해진 경로 하나뿐이다. */
    @Test
    void demoSpecDocumentIsServedOnlyAtItsPath() {
        assertThat(reader.readFile(GithubRepoRef.DEMO, SeedGithubReader.SPEC_PATH))
                .hasValueSatisfying(markdown -> assertThat(markdown).contains("## FR-AUTH-01 로그인", "## 문서 정리"));
        assertThat(reader.readFile(GithubRepoRef.DEMO, "docs/other.md")).isEmpty();
    }
}

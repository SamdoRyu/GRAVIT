package com.samdoryu.backend.github.seed;

import com.samdoryu.backend.github.GithubReader;
import com.samdoryu.backend.github.dto.GithubCollaborator;
import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubIssueLink;
import com.samdoryu.backend.github.dto.GithubPullRequest;
import com.samdoryu.backend.github.dto.GithubRepoRef;
import com.samdoryu.backend.github.dto.GithubReview;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

/**
 * 시연 사무실의 Seed 어댑터(CONTRACTS.md 「7」 ②). GitHub를 부르지 않고 {@code seed/demo-workspace.json}을 읽어
 * GitHub 어댑터와 같은 모양의 결과를 낸다. 파일이 깨졌으면 서버 시작 때 실패한다.
 * <p>
 * 시연 Seed 계정은 GitHub 사용자 ID가 없고 로그인 이름이 {@code seed-}로 시작한다 — 동기화는 시연 사무실에서만
 * 이 로그인 이름으로 Seed 팀원과 짝짓는다.
 */
@Component
public class SeedGithubReader implements GithubReader {

    static final String RESOURCE = "seed/demo-workspace.json";
    static final String SPEC_RESOURCE = "seed/demo-requirements.md";
    /** 시연 사무실 팀 설정의 명세 문서 경로 — 계약 예시와 같은 값. */
    public static final String SPEC_PATH = "docs/requirements.md";

    /** @param linkedIssueNumbers GitHub 공식 연결을 흉내 낸 이슈 번호(PR 본문은 Seed에 없다) */
    record SeedPullRequest(GithubPullRequest pullRequest, List<GithubReview> reviews, Instant lastCommitAt,
            List<Integer> linkedIssueNumbers) {
        SeedPullRequest {
            reviews = reviews == null ? List.of() : List.copyOf(reviews);
            linkedIssueNumbers = linkedIssueNumbers == null ? List.of() : List.copyOf(linkedIssueNumbers);
        }
    }

    record SeedData(List<GithubCollaborator> collaborators, List<GithubIssue> issues,
            List<SeedPullRequest> pullRequests) {
        SeedData {
            collaborators = List.copyOf(collaborators);
            issues = List.copyOf(issues);
            pullRequests = List.copyOf(pullRequests);
        }
    }

    private final List<GithubCollaborator> collaborators;
    private final List<GithubIssue> issues;
    private final Map<Integer, SeedPullRequest> pullRequests;
    private final String specDocument;

    public SeedGithubReader() {
        this(RESOURCE);
    }

    SeedGithubReader(String resource) {
        SeedData data = load(resource);
        this.collaborators = data.collaborators();
        this.issues = data.issues();
        this.pullRequests = data.pullRequests().stream()
                .collect(Collectors.toUnmodifiableMap(p -> p.pullRequest().number(), Function.identity()));
        this.specDocument = readText(SPEC_RESOURCE);
    }

    private static String readText(String resource) {
        try (InputStream in = new ClassPathResource(resource).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("시연 명세 문서를 읽지 못함: " + resource, e);
        }
    }

    private static SeedData load(String resource) {
        JsonMapper mapper = JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();
        try (InputStream in = new ClassPathResource(resource).getInputStream()) {
            return mapper.readValue(in, SeedData.class);
        } catch (IOException e) {
            throw new IllegalStateException("시연 Seed를 읽지 못함: " + resource, e);
        }
    }

    @Override
    public WorkspaceKind kind() {
        return WorkspaceKind.DEMO;
    }

    @Override
    public List<GithubIssue> issuesUpdatedSince(GithubRepoRef repo, Instant since) {
        return issues.stream()
                .filter(i -> since == null || i.updatedAt().isAfter(since))
                .toList();
    }

    @Override
    public List<GithubPullRequest> pullRequestsUpdatedSince(GithubRepoRef repo, Instant since) {
        return pullRequests.values().stream()
                .map(SeedPullRequest::pullRequest)
                .filter(p -> since == null || p.updatedAt().isAfter(since))
                .sorted(Comparator.comparingInt(GithubPullRequest::number))
                .toList();
    }

    @Override
    public List<GithubReview> reviews(GithubRepoRef repo, int pullRequestNumber) {
        SeedPullRequest pr = pullRequests.get(pullRequestNumber);
        if (pr == null) {
            return List.of();
        }
        return pr.reviews().stream().sorted(Comparator.comparing(GithubReview::submittedAt)).toList();
    }

    @Override
    public Optional<Instant> lastCommitAt(GithubRepoRef repo, int pullRequestNumber) {
        return Optional.ofNullable(pullRequests.get(pullRequestNumber)).map(SeedPullRequest::lastCommitAt);
    }

    @Override
    public List<GithubCollaborator> collaborators(GithubRepoRef repo) {
        return collaborators;
    }

    @Override
    public List<GithubIssueLink> linkedIssues(GithubRepoRef repo, int pullRequestNumber) {
        SeedPullRequest pr = pullRequests.get(pullRequestNumber);
        if (pr == null) {
            return List.of();
        }
        return pr.linkedIssueNumbers().stream()
                .map(number -> new GithubIssueLink(number, GithubIssueLink.Source.CLOSING_REFERENCE))
                .toList();
    }

    /** 시연 명세 문서는 {@link #SPEC_PATH} 하나뿐이다. 다른 경로는 "파일 없음". */
    @Override
    public Optional<String> readFile(GithubRepoRef repo, String path) {
        return SPEC_PATH.equals(path) ? Optional.of(specDocument) : Optional.empty();
    }
}

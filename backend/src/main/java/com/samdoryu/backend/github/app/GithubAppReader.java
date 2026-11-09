package com.samdoryu.backend.github.app;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.github.GithubHttp;
import com.samdoryu.backend.github.GithubReader;
import com.samdoryu.backend.github.dto.GithubCollaborator;
import com.samdoryu.backend.github.dto.GithubCommit;
import com.samdoryu.backend.github.dto.GithubIssue;
import com.samdoryu.backend.github.dto.GithubIssueLink;
import com.samdoryu.backend.github.dto.GithubPullRequest;
import com.samdoryu.backend.github.dto.GithubRepoRef;
import com.samdoryu.backend.github.dto.GithubReview;
import com.samdoryu.backend.github.dto.GithubUser;
import com.samdoryu.backend.workspace.domain.WorkspaceKind;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriBuilder;

/**
 * 실제 사무실의 GitHub 어댑터(CONTRACTS.md 「7」 ① — #69). GitHub App 설치 토큰으로 레포를 <b>읽기만</b> 한다.
 * 모든 요청은 읽기 전용 가드({@code ReadOnlyGithubGuard})를 거친다: GET · 설치 토큰 발급 · GraphQL query만 나간다.
 * 결과는 GitHub 모양 DTO로 바꿔 내보낸다 — GitHub 응답 JSON을 그대로 내보내지 않는다.
 */
public class GithubAppReader implements GithubReader {

    /** 페이지 상한 — 목록 하나에 5,000개까지. 무한 반복을 막는다. */
    static final int MAX_PAGES = 50;
    /** PR 하나가 닫을 이슈를 몇 개까지 읽나 — GitHub 공식 연결(closingIssuesReferences). */
    static final int MAX_LINKED_ISSUES = 50;
    /** 명세 문서 크기 상한(1 MiB) — 넘으면 읽지 못한 것으로 본다. */
    static final int MAX_FILE_BYTES = 1024 * 1024;
    /** 파일 원문을 받는 미디어 타입 — 디렉터리는 이 요청에도 JSON 목록이 온다. */
    static final String RAW_CONTENT = "application/vnd.github.raw+json";

    static final String CLOSING_ISSUES_QUERY = "query($owner:String!,$name:String!,$number:Int!){"
            + "repository(owner:$owner,name:$name){pullRequest(number:$number){"
            + "closingIssuesReferences(first:" + MAX_LINKED_ISSUES + "){nodes{number repository{nameWithOwner}}}}}}";

    @JsonIgnoreProperties(ignoreUnknown = true)
    record UserJson(Long id, String login, String avatar_url) {
        GithubUser toUser() {
            return new GithubUser(id, login, avatar_url);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record LabelJson(String name) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record IssueJson(int number, String title, String state, String state_reason, List<LabelJson> labels,
            List<UserJson> assignees, Instant created_at, Instant updated_at, Instant closed_at,
            Object pull_request) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record HeadJson(String sha) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record PullJson(int number, String title, UserJson user, Boolean draft, String state, Instant merged_at,
            HeadJson head, List<LabelJson> labels, List<UserJson> requested_reviewers, Instant created_at,
            Instant updated_at, Instant closed_at) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record ReviewJson(UserJson user, String state, Instant submitted_at) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CommitDateJson(Instant date) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CommitDetailJson(CommitDateJson committer, CommitDateJson author, String message) {
    }

    /** @param author 커밋 이메일과 이어진 GitHub 계정 — 없으면 null */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record CommitJson(String sha, UserJson author, CommitDetailJson commit) {
        Instant committedAt() {
            if (commit == null) {
                return null;
            }
            if (commit.committer() != null && commit.committer().date() != null) {
                return commit.committer().date();
            }
            return commit.author() == null ? null : commit.author().date();
        }

        Instant authoredAt() {
            if (commit != null && commit.author() != null && commit.author().date() != null) {
                return commit.author().date();
            }
            return committedAt();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record PermissionsJson(Boolean admin) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CollaboratorJson(Long id, String login, String avatar_url, PermissionsJson permissions) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record GraphqlResponse(GraphqlData data, List<Object> errors) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record GraphqlData(GraphqlRepository repository) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record GraphqlRepository(GraphqlPullRequest pullRequest) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record GraphqlPullRequest(GraphqlClosing closingIssuesReferences) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record GraphqlClosing(List<GraphqlIssue> nodes) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record GraphqlIssue(int number, GraphqlRepoName repository) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record GraphqlRepoName(String nameWithOwner) {
    }

    private final RestClient restClient;
    private final InstallationTokenProvider tokens;

    GithubAppReader(RestClient restClient, InstallationTokenProvider tokens) {
        this.restClient = restClient;
        this.tokens = tokens;
    }

    @Override
    public WorkspaceKind kind() {
        return WorkspaceKind.GITHUB;
    }

    /** {@code GET /repos/{o}/{r}/issues?state=all&since=…} — PR(같은 번호 체계)은 뺀다. 담당자 전원 · 닫힘 사유 포함. */
    @Override
    public List<GithubIssue> issuesUpdatedSince(GithubRepoRef repo, Instant since) {
        String token = tokens.token(repo.installationId());
        List<GithubIssue> result = new ArrayList<>();
        for (IssueJson issue : pages(token, uri -> {
            UriBuilder builder = uri.path("/repos/{owner}/{repo}/issues").queryParam("state", "all")
                    .queryParam("sort", "updated").queryParam("direction", "asc");
            if (since != null) {
                builder.queryParam("since", since.toString());
            }
            return builder;
        }, repo, IssueJson[].class, page -> page)) {
            if (issue.pull_request() != null) {
                continue;
            }
            boolean closed = "closed".equals(issue.state());
            result.add(new GithubIssue(issue.number(), Objects.requireNonNullElse(issue.title(), ""), closed,
                    closed ? closedReason(issue.state_reason()) : null, labelNames(issue.labels()),
                    users(issue.assignees()), issue.created_at(), issue.updated_at(), issue.closed_at()));
        }
        return result;
    }

    private static GithubIssue.ClosedReason closedReason(String stateReason) {
        if ("completed".equals(stateReason)) {
            return GithubIssue.ClosedReason.COMPLETED;
        }
        if ("not_planned".equals(stateReason)) {
            return GithubIssue.ClosedReason.NOT_PLANNED;
        }
        return null;
    }

    /**
     * {@code GET /repos/{o}/{r}/pulls?state=all&sort=updated&direction=desc} — 이 목록에는 {@code since}가 없어서, 고친 시각
     * 내림차순으로 읽다가 기준 시각 이전 PR이 나오면 멈춘다.
     */
    @Override
    public List<GithubPullRequest> pullRequestsUpdatedSince(GithubRepoRef repo, Instant since) {
        String token = tokens.token(repo.installationId());
        List<GithubPullRequest> result = new ArrayList<>();
        for (int page = 1; page <= MAX_PAGES; page++) {
            int pageNumber = page;
            PullJson[] body = get(token, uri -> uri.path("/repos/{owner}/{repo}/pulls").queryParam("state", "all")
                    .queryParam("sort", "updated").queryParam("direction", "desc")
                    .queryParam("per_page", GithubHttp.PAGE_SIZE).queryParam("page", pageNumber)
                    .build(repo.owner(), repo.repo()), PullJson[].class);
            List<PullJson> pulls = body == null ? List.of() : List.of(body);
            for (PullJson pull : pulls) {
                if (since != null && pull.updated_at() != null && !pull.updated_at().isAfter(since)) {
                    return result;
                }
                result.add(toPullRequest(pull));
            }
            if (pulls.size() < GithubHttp.PAGE_SIZE) {
                break;
            }
        }
        return result;
    }

    private static GithubPullRequest toPullRequest(PullJson pull) {
        boolean merged = pull.merged_at() != null;
        return new GithubPullRequest(pull.number(), Objects.requireNonNullElse(pull.title(), ""),
                pull.user() == null ? null : pull.user().toUser(), Boolean.TRUE.equals(pull.draft()),
                "closed".equals(pull.state()),
                merged, pull.head() == null ? "" : Objects.requireNonNullElse(pull.head().sha(), ""),
                labelNames(pull.labels()), users(pull.requested_reviewers()), pull.created_at(), pull.updated_at(),
                pull.merged_at(), pull.closed_at());
    }

    /** {@code GET …/pulls/{n}/reviews} — 아직 제출하지 않은 리뷰({@code PENDING})는 뺀다. 제출 시각 순. */
    @Override
    public List<GithubReview> reviews(GithubRepoRef repo, int pullRequestNumber) {
        String token = tokens.token(repo.installationId());
        List<GithubReview> result = new ArrayList<>();
        for (ReviewJson review : pages(token, uri -> uri.path("/repos/{owner}/{repo}/pulls/" + pullRequestNumber
                + "/reviews"), repo, ReviewJson[].class, page -> page)) {
            GithubReview.State state = reviewState(review.state());
            if (state == null || review.user() == null || review.submitted_at() == null) {
                continue;
            }
            result.add(new GithubReview(review.user().toUser(), state, review.submitted_at()));
        }
        result.sort(Comparator.comparing(GithubReview::submittedAt));
        return result;
    }

    private static GithubReview.State reviewState(String state) {
        if (state == null) {
            return null;
        }
        return switch (state) {
            case "APPROVED" -> GithubReview.State.APPROVED;
            case "CHANGES_REQUESTED" -> GithubReview.State.CHANGES_REQUESTED;
            case "COMMENTED" -> GithubReview.State.COMMENTED;
            case "DISMISSED" -> GithubReview.State.DISMISSED;
            default -> null;
        };
    }

    /**
     * {@code GET …/pulls/{n}/commits} — GitHub 순서(오래된 것부터). 작성자는 커밋 이메일과 이어진 GitHub 계정(없으면 null),
     * 제목은 메시지 첫 줄. SHA나 시각이 없는 항목은 뺀다.
     */
    @Override
    public List<GithubCommit> pullRequestCommits(GithubRepoRef repo, int pullRequestNumber) {
        String token = tokens.token(repo.installationId());
        List<GithubCommit> result = new ArrayList<>();
        for (CommitJson commit : pages(token, uri -> uri.path("/repos/{owner}/{repo}/pulls/" + pullRequestNumber
                + "/commits"), repo, CommitJson[].class, page -> page)) {
            if (commit.sha() == null || commit.committedAt() == null) {
                continue;
            }
            GithubUser author = commit.author() == null || commit.author().id() == null
                    || commit.author().login() == null ? null : commit.author().toUser();
            result.add(new GithubCommit(commit.sha(), author,
                    firstLine(commit.commit() == null ? null : commit.commit().message()), commit.authoredAt(),
                    commit.committedAt()));
        }
        return result;
    }

    /** 커밋 메시지 첫 줄(앞뒤 공백 없이). 메시지가 없으면 빈 문자열. */
    static String firstLine(String message) {
        if (message == null) {
            return "";
        }
        int end = message.indexOf('\n');
        return (end < 0 ? message : message.substring(0, end)).strip();
    }

    /** {@code GET …/collaborators?affiliation=all} — 콜라보레이터 전원(GitHub 사용자 ID · 로그인 · 사진 · admin). */
    @Override
    public List<GithubCollaborator> collaborators(GithubRepoRef repo) {
        String token = tokens.token(repo.installationId());
        List<GithubCollaborator> result = new ArrayList<>();
        for (CollaboratorJson collaborator : pages(token, uri -> uri.path("/repos/{owner}/{repo}/collaborators")
                .queryParam("affiliation", "all"), repo, CollaboratorJson[].class, page -> page)) {
            if (collaborator.id() == null || collaborator.login() == null) {
                continue;
            }
            result.add(new GithubCollaborator(new GithubUser(collaborator.id(), collaborator.login(),
                    collaborator.avatar_url()),
                    collaborator.permissions() != null && Boolean.TRUE.equals(collaborator.permissions().admin())));
        }
        return result;
    }

    /**
     * GitHub가 공식으로 인식하는 "이 PR이 닫을 이슈"(GraphQL {@code closingIssuesReferences} — query만). 본문 · 제목의
     * {@code #N}은 읽지 않는다. 다른 레포의 이슈는 뺀다.
     */
    @Override
    public List<GithubIssueLink> linkedIssues(GithubRepoRef repo, int pullRequestNumber) {
        String token = tokens.token(repo.installationId());
        // 순서가 고정된 본문 — 매 요청이 같은 모양이라 로그 · 디버깅이 쉽다
        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put("owner", repo.owner());
        variables.put("name", repo.repo());
        variables.put("number", pullRequestNumber);
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("query", CLOSING_ISSUES_QUERY);
        request.put("variables", variables);
        GraphqlResponse response;
        try {
            response = restClient.post()
                    .uri("/graphql")
                    .headers(headers -> headers.setBearerAuth(token))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .onStatus(status -> status.isError(), (req, res) -> {
                        throw new ApiException(GithubHttp.errorCodeFor(res));
                    })
                    .body(GraphqlResponse.class);
        } catch (ResourceAccessException e) {
            throw new ApiException(ErrorCode.UNAVAILABLE);
        }
        if (response == null || (response.errors() != null && !response.errors().isEmpty())) {
            throw new ApiException(ErrorCode.UNAVAILABLE);
        }
        String fullName = repo.owner() + "/" + repo.repo();
        List<GithubIssueLink> result = new ArrayList<>();
        Optional.ofNullable(response.data()).map(GraphqlData::repository).map(GraphqlRepository::pullRequest)
                .map(GraphqlPullRequest::closingIssuesReferences).map(GraphqlClosing::nodes).orElse(List.of())
                .forEach(node -> {
                    if (node.repository() == null || fullName.equalsIgnoreCase(node.repository().nameWithOwner())) {
                        result.add(new GithubIssueLink(node.number(), GithubIssueLink.Source.CLOSING_REFERENCE));
                    }
                });
        return result;
    }

    /**
     * 기본 브랜치의 파일을 원문(raw)으로 읽는다 — {@code GET /repos/{o}/{r}/contents/{path}}. 경로는 조각마다 인코딩한다.
     * 없음(404) · 디렉터리(JSON 목록이 옴) · {@link #MAX_FILE_BYTES}를 넘는 파일은 "읽지 못함"으로 빈 값을 돌려준다.
     */
    @Override
    public Optional<String> readFile(GithubRepoRef repo, String path) {
        List<String> segments = Arrays.stream(path.split("/")).filter(segment -> !segment.isBlank()).toList();
        if (segments.isEmpty()) {
            return Optional.empty();
        }
        StringBuilder template = new StringBuilder("/repos/{owner}/{repo}/contents");
        List<Object> variables = new ArrayList<>(List.of(repo.owner(), repo.repo()));
        for (int i = 0; i < segments.size(); i++) {
            template.append("/{s").append(i).append('}');
            variables.add(segments.get(i));
        }
        String token = tokens.token(repo.installationId());
        try {
            return restClient.get()
                    .uri(template.toString(), variables.toArray())
                    .headers(headers -> {
                        headers.setBearerAuth(token);
                        headers.set(HttpHeaders.ACCEPT, RAW_CONTENT);
                    })
                    .exchange((request, response) -> {
                        if (response.getStatusCode().value() == HttpStatus.NOT_FOUND.value()) {
                            return Optional.<String>empty();
                        }
                        if (response.getStatusCode().isError()) {
                            throw new ApiException(GithubHttp.errorCodeFor(response));
                        }
                        MediaType type = response.getHeaders().getContentType();
                        if (type != null && type.equalsTypeAndSubtype(MediaType.APPLICATION_JSON)) {
                            return Optional.<String>empty();
                        }
                        byte[] body = response.getBody().readNBytes(MAX_FILE_BYTES + 1);
                        if (body.length > MAX_FILE_BYTES) {
                            return Optional.<String>empty();
                        }
                        return Optional.of(new String(body, StandardCharsets.UTF_8));
                    });
        } catch (ResourceAccessException e) {
            throw new ApiException(ErrorCode.UNAVAILABLE);
        }
    }

    private static List<String> labelNames(List<LabelJson> labels) {
        return labels == null ? List.of()
                : labels.stream().map(label -> label.name()).filter(name -> name != null).toList();
    }

    private static List<GithubUser> users(List<UserJson> users) {
        return users == null ? List.of()
                : users.stream().filter(user -> user.id() != null && user.login() != null)
                        .map(user -> user.toUser()).toList();
    }

    /** 페이지를 넘기며 GET — 한 페이지가 {@link GithubHttp#PAGE_SIZE}보다 적으면 끝. */
    private <P, E> List<E> pages(String token, Function<UriBuilder, UriBuilder> path, GithubRepoRef repo,
            Class<P[]> pageType, Function<P, E> item) {
        List<E> result = new ArrayList<>();
        for (int page = 1; page <= MAX_PAGES; page++) {
            int pageNumber = page;
            P[] body = get(token, uri -> path.apply(uri).queryParam("per_page", GithubHttp.PAGE_SIZE)
                    .queryParam("page", pageNumber).build(repo.owner(), repo.repo()), pageType);
            if (body == null) {
                break;
            }
            for (P element : body) {
                result.add(item.apply(element));
            }
            if (body.length < GithubHttp.PAGE_SIZE) {
                break;
            }
        }
        return result;
    }

    private <T> T get(String token, Function<UriBuilder, URI> uri, Class<T> type) {
        try {
            return restClient.get()
                    .uri(uri)
                    .headers(headers -> headers.setBearerAuth(token))
                    .retrieve()
                    .onStatus(status -> status.isError(), (request, response) -> {
                        throw new ApiException(GithubHttp.errorCodeFor(response));
                    })
                    .body(type);
        } catch (ResourceAccessException e) {
            throw new ApiException(ErrorCode.UNAVAILABLE);
        }
    }
}

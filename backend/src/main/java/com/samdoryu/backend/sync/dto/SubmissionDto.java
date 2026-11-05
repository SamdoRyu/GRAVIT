package com.samdoryu.backend.sync.dto;

import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.evaluation.dto.EvaluationRoundDto;
import com.samdoryu.backend.sync.domain.Priority;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import java.time.Instant;
import java.util.List;

/**
 * GitHub PR의 앱 모델 — CONTRACTS_API 「5」 SubmissionDto. Snapshot {@code submissions}.
 *
 * @param authorMemberId 작성자가 팀원이 아니면 null
 * @param suggestedReviewerMemberIds 추천 리뷰어(FR-FLOW-04 — Should). 아직 계산하지 않아 빈 목록
 * @param linkedTaskIds GitHub 공식 연결만
 * @param isBlocked 서버 계산(FR-FLOW-01) — {@link #of}는 false로 만들고 Snapshot이 {@link #withBlocked}로 채운다
 * @param currentRound 가장 최근 회차(「9」). PR이 닫혀도 마지막 회차를 보인다. 회차가 없으면 null —
 *        {@link #of}는 null로 만들고 Snapshot이 {@link #withCurrentRound}로 채운다
 */
public record SubmissionDto(
        String id,
        int githubPrNumber,
        String title,
        String authorMemberId,
        String authorGithubLogin,
        SubmissionState state,
        String headSha,
        List<String> reviewRequestedMemberIds,
        List<GithubReviewDto> reviews,
        List<String> suggestedReviewerMemberIds,
        List<String> labels,
        Priority priority,
        List<String> linkedTaskIds,
        boolean isBlocked,
        String htmlUrl,
        Instant githubCreatedAt,
        Instant githubUpdatedAt,
        Instant mergedAt,
        Instant closedAt,
        Instant lastCommitAt,
        Instant stateChangedAt,
        Instant syncedAt,
        EvaluationRoundDto currentRound) {

    /**
     * @param reviewRequestedMemberIds 리뷰 요청을 받은 계정 중 팀원인 사람
     * @param repoUrl GitHub 레포 주소, 시연은 null
     */
    public static SubmissionDto of(Submission submission, List<Long> reviewRequestedMemberIds,
            List<GithubReviewDto> reviews, List<String> labels, List<Long> linkedTaskIds, String repoUrl) {
        return new SubmissionDto(
                Ids.toApi(submission.getId()),
                submission.getGithubPrNumber(),
                submission.getTitle(),
                submission.getAuthorMember() == null ? null : Ids.toApi(submission.getAuthorMember().getId()),
                submission.getAuthorGithubLogin(),
                submission.getState(),
                submission.getHeadSha(),
                reviewRequestedMemberIds.stream().map(Ids::toApi).toList(),
                reviews,
                List.of(),
                labels,
                Priority.fromLabels(labels),
                linkedTaskIds.stream().map(Ids::toApi).toList(),
                false,
                repoUrl == null ? null : repoUrl + "/pull/" + submission.getGithubPrNumber(),
                submission.getGithubCreatedAt(),
                submission.getGithubUpdatedAt(),
                submission.getMergedAt(),
                submission.getClosedAt(),
                submission.getLastCommitAt(),
                submission.getStateChangedAt(),
                submission.getSyncedAt(),
                null);
    }

    /** 평가 회차 조각(evaluation 패키지)을 붙인 사본. */
    public SubmissionDto withCurrentRound(EvaluationRoundDto round) {
        return new SubmissionDto(id, githubPrNumber, title, authorMemberId, authorGithubLogin, state, headSha,
                reviewRequestedMemberIds, reviews, suggestedReviewerMemberIds, labels, priority, linkedTaskIds,
                isBlocked, htmlUrl, githubCreatedAt, githubUpdatedAt, mergedAt, closedAt, lastCommitAt, stateChangedAt,
                syncedAt, round);
    }

    /** 막힘 계산(flow 패키지 BlockedRule)을 붙인 사본. */
    public SubmissionDto withBlocked(boolean blocked) {
        return new SubmissionDto(id, githubPrNumber, title, authorMemberId, authorGithubLogin, state, headSha,
                reviewRequestedMemberIds, reviews, suggestedReviewerMemberIds, labels, priority, linkedTaskIds,
                blocked, htmlUrl, githubCreatedAt, githubUpdatedAt, mergedAt, closedAt, lastCommitAt, stateChangedAt,
                syncedAt, currentRound);
    }
}

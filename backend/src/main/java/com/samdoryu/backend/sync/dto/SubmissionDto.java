package com.samdoryu.backend.sync.dto;

import com.samdoryu.backend.evaluation.dto.EvaluationRoundDto;
import com.samdoryu.backend.sync.domain.SubmissionState;
import java.time.Instant;
import java.util.List;

/**
 * GitHub PR의 앱 모델 — CONTRACTS_API 「5」 SubmissionDto. Snapshot {@code submissions}를 채우는 매핑은 #103 2단계에서 더한다.
 *
 * @param authorMemberId 작성자가 팀원이 아니면 null
 * @param priority {@code high} · {@code medium} · {@code low}
 * @param linkedTaskIds GitHub 공식 연결만
 * @param currentRound 가장 최근 회차(「9」). PR이 닫혀도 마지막 회차를 보인다
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
        String priority,
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
}

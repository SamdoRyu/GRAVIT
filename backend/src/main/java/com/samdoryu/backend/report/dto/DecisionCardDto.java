package com.samdoryu.backend.report.dto;

import com.samdoryu.backend.auth.dto.UserRef;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.report.domain.DecisionCard;
import com.samdoryu.backend.report.domain.DecisionCardCells;
import com.samdoryu.backend.report.domain.FollowUpQuestion;
import java.time.Instant;
import java.util.List;

/**
 * 기술 결정 카드 — CONTRACTS_API 「15」 DecisionCardDto. 카드 API(#62)와 회고 리포트의 {@code decisionCards}가 함께 쓴다.
 * 개인 기록이라 Snapshot · SSE에 싣지 않는다.
 *
 * @param confirmed 본인이 확인했는가 — {@code confirmedAt}이 있으면 true
 * @param followUpRequested 강사 꼬리질문을 요청했는가 — {@code followUpRequestedAt}이 있으면 true
 * @param followUpQuestions 강사 꼬리질문, createdAt 오름차순(9칸과 따로 붙는다 — FR-REP-11)
 */
public record DecisionCardDto(
        String id,
        String memberId,
        String submissionId,
        DecisionCardCells cells,
        boolean confirmed,
        Instant confirmedAt,
        boolean followUpRequested,
        Instant followUpRequestedAt,
        List<FollowUpQuestionDto> followUpQuestions,
        Instant createdAt,
        Instant updatedAt) {

    /** @param questions 이 카드의 꼬리질문, createdAt 오름차순 */
    public static DecisionCardDto of(DecisionCard card, List<FollowUpQuestion> questions) {
        return new DecisionCardDto(
                Ids.toApi(card.getId()),
                Ids.toApi(card.getMember().getId()),
                Ids.toApi(card.getSubmission().getId()),
                card.getCells(),
                card.getConfirmedAt() != null,
                card.getConfirmedAt(),
                card.getFollowUpRequestedAt() != null,
                card.getFollowUpRequestedAt(),
                questions.stream().map(FollowUpQuestionDto::of).toList(),
                card.getCreatedAt(),
                card.getUpdatedAt());
    }

    public record FollowUpQuestionDto(String id, UserRef instructor, String body, Instant createdAt) {

        public static FollowUpQuestionDto of(FollowUpQuestion question) {
            return new FollowUpQuestionDto(Ids.toApi(question.getId()), UserRef.of(question.getInstructor()),
                    question.getBody(), question.getCreatedAt());
        }
    }
}

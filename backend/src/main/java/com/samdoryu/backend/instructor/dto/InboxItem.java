package com.samdoryu.backend.instructor.dto;

import com.fasterxml.jackson.annotation.JsonValue;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.workspace.domain.Workspace;
import java.time.Instant;

/**
 * {@code GET /api/instructor/inbox}의 한 줄 — CONTRACTS_API 「16」 InboxItem. 저장하지 않는 계산 값이다(FR-LRN-23).
 *
 * @param targetId helpRequestId · agendaItemId · cardId
 * @param ownerMemberId 요청자 · 안건을 올린 사람 · 카드 주인
 * @param answeredAt 강사 답변 · 피드백 · 꼬리질문이 하나라도 있으면 그 첫 시각
 */
public record InboxItem(Kind kind, String workspaceId, String workspaceDisplayName, String targetId,
        String ownerMemberId, String title, Instant requestedAt, Instant answeredAt) {

    public static InboxItem of(Kind kind, Workspace workspace, Long targetId, Long ownerMemberId, String title,
            Instant requestedAt, Instant answeredAt) {
        return new InboxItem(kind, Ids.toApi(workspace.getId()), workspace.getDisplayName(), Ids.toApi(targetId),
                Ids.toApi(ownerMemberId), title, requestedAt, answeredAt);
    }

    /** 무엇을 요청받았나 — 답은 각 원래 API로 쓴다(도움 요청 코멘트 「11」 · 강사 피드백 「10」 · 꼬리질문 「15」). */
    public enum Kind {

        HELP_REQUEST("help_request"),
        DECISION_FEEDBACK("decision_feedback"),
        FOLLOW_UP_QUESTION("follow_up_question");

        private final String value;

        Kind(String value) {
            this.value = value;
        }

        @JsonValue
        public String value() {
            return value;
        }
    }
}

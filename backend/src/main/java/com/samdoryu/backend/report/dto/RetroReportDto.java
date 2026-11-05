package com.samdoryu.backend.report.dto;

import com.samdoryu.backend.activity.domain.ActivityKind;
import com.samdoryu.backend.auth.dto.UserRef;
import com.samdoryu.backend.meeting.domain.PrDecision;
import com.samdoryu.backend.report.domain.ReportKind;
import java.time.Instant;
import java.util.List;

/**
 * 회고 리포트 — CONTRACTS_API 「15」 RetroReportDto. 배운 점만 저장 값이고 나머지는 읽을 때 계산한다.
 * 개인 기록이라 본인과 지정된 강사의 요청에만 응답한다(NFR-06).
 *
 * @param summary 자동 요약 — 규칙으로 조립(AI 없음)
 * @param areaLabels 담당 기능 영역({@code area:*}, FR-REP-01)
 * @param agendaResults 내가 올린 안건의 결론 · PR 결정(FR-LRN-05 · 12)
 * @param instructorFeedbacks 내가 올린 안건에 달린 강사 피드백(FR-LRN-22)
 * @param activityDistribution 본인 활동 기록 분포(FR-ACT-03)
 * @param decisionCards 본인이 확인한 기술 결정 카드(P11)
 */
public record RetroReportDto(
        String id,
        ReportKind kind,
        Instant createdAt,
        String memberId,
        String summary,
        List<String> areaLabels,
        String learning,
        List<AgendaResult> agendaResults,
        List<InstructorFeedback> instructorFeedbacks,
        List<ActivityShare> activityDistribution,
        List<DecisionCardDto> decisionCards) {

    public record AgendaResult(String agendaItemId, String title, String conclusion, String learning,
            PrDecision prDecision, Instant decidedAt) {
    }

    public record InstructorFeedback(String agendaItemId, UserRef instructor, String body, Instant createdAt) {
    }

    public record ActivityShare(ActivityKind kind, int totalMinutes) {
    }
}

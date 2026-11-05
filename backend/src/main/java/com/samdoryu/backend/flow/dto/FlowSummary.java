package com.samdoryu.backend.flow.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 팀 단위 흐름 계산 값 — CONTRACTS_API 「5」 FlowSummary. 사람별 합계 · 순위 없음(P6).
 *
 * @param blockedMemberIds 막힌 도형이 있는 팀원 — 아바타 강조(FR-FLOW-02)
 * @param reviewConcentratedMemberIds 리뷰 편중 — 몰렸다는 표시만(FR-FLOW-03)
 * @param assignmentConcentratedMemberIds 담당 편중(FR-FLOW-07)
 * @param averageReviewWaitHours 평균 리뷰 대기, 소수 첫째 자리(FR-FLOW-05)
 * @param latestStandupDate 최근 변화 뷰의 기준(FR-FLOW-08)
 */
public record FlowSummary(
        List<String> blockedMemberIds,
        List<String> reviewConcentratedMemberIds,
        List<String> assignmentConcentratedMemberIds,
        int openSubmissionCount,
        Double averageReviewWaitHours,
        LocalDate latestStandupDate) {

    /** 열린 PR 수만 있을 때 — 나머지 값은 #22 · #24 등 흐름 Issue가 채운다. */
    public static FlowSummary openSubmissionsOnly(int openSubmissionCount) {
        return new FlowSummary(List.of(), List.of(), List.of(), openSubmissionCount, null, null);
    }
}

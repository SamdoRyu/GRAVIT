package com.samdoryu.backend.activity.dto;

import com.samdoryu.backend.activity.domain.ActivityConfirmation;
import com.samdoryu.backend.activity.domain.ActivityKind;
import com.samdoryu.backend.activity.domain.ActivityRecord;
import com.samdoryu.backend.activity.domain.ActivityStatus;
import com.samdoryu.backend.common.id.Ids;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/**
 * 활동 기록 — CONTRACTS_API 「14」 ActivityRecordDto. 작성자 · 확인자는 팀에 보인다(CONTRACTS.md 「6」 익명이 아닌 기록).
 *
 * @param durationMinutes 본인 분포에만 쓰고 팀 화면에 합산하지 않는다(P6)
 * @param confirmedByMemberIds 확인한 팀원 — 확인한 순서
 */
public record ActivityRecordDto(String id, String authorMemberId, ActivityKind kind, String content,
        int durationMinutes, ActivityStatus status, List<String> confirmedByMemberIds, Instant createdAt) {

    /** @param confirmations 이 활동의 확인 행 전부(순서 무관) */
    public static ActivityRecordDto of(ActivityRecord record, List<ActivityConfirmation> confirmations) {
        List<String> confirmers = confirmations.stream()
                .sorted(Comparator.comparing(ActivityConfirmation::getConfirmedAt)
                        .thenComparing(ActivityConfirmation::getId))
                .map(confirmation -> Ids.toApi(confirmation.getConfirmer().getId()))
                .toList();
        return new ActivityRecordDto(Ids.toApi(record.getId()), Ids.toApi(record.getAuthor().getId()),
                record.getKind(), record.getContent(), record.getDurationMinutes(),
                ActivityStatus.of(!confirmers.isEmpty()), confirmers, record.getCreatedAt());
    }
}

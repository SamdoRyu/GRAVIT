package com.samdoryu.backend.evaluation.dto;

import com.samdoryu.backend.evaluation.domain.Verdict;
import java.time.Instant;

/**
 * 한 사람이 남긴 평가 — 학습 타임라인 {@code evaluation_given}(#172 · FR-LRN-08) 재료. 본인이 남긴 평가라 익명성과 충돌하지 않는다
 * (CONTRACTS.md 「5」 {@code myEvaluation}과 같은 값). 서비스 사이에서만 쓰고 그대로 응답하지 않는다.
 */
public record GivenEvaluation(String submissionId, Verdict verdict, String reason, Instant updatedAt) {
}

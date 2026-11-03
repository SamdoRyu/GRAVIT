package com.samdoryu.backend.auth.service;

import org.springframework.stereotype.Component;

/**
 * R4 판정 자리 — 그 사무실에 이 강사가 지금 지정돼 있는가(해제 시각 없는 {@code InstructorAssignment}).
 * 강사 지정은 요청마다 DB에서 확인한다(CONTRACTS.md 「6」).
 * {@code instructor_assignment} 테이블은 #7 T4-a에서 만든다. 그 전까지는 아무도 지정돼 있지 않다고 답한다.
 */
@Component
public class InstructorAssignmentLookup {

    public boolean isAssigned(Long workspaceId, Long instructorGithubUserId) {
        // TODO(#7 T4-a): instructor_assignment에서 (workspaceId, instructorGithubUserId, revokedAt IS NULL) 조회
        return false;
    }
}

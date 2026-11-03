package com.samdoryu.backend.auth.service;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;

/**
 * 사무실 접근 검사(CONTRACTS.md 「6」 검사 순서 2)를 통과한 결과. 동작 권한(검사 순서 4)은 이 값으로 확인한다.
 * 경로 대상이 이 사무실 것인지(검사 순서 3)는 각 Service가 {@code findByIdAndWorkspaceId}로 확인한다.
 *
 * @param memberId 그 사무실의 팀원 ID. 강사는 null
 */
public record WorkspaceAccess(Long workspaceId, Long userId, WorkspaceRole role, Long memberId) {

    /** 팀원(참여자 · 레포 관리자)만. 팀원 ID를 돌려준다. */
    public Long requireTeamMember() {
        if (!role.isTeamMember()) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
        return memberId;
    }

    /** 그 사무실의 레포 관리자(R2)만. */
    public void requireRepoAdmin() {
        if (role != WorkspaceRole.REPO_ADMIN) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
    }

    /** 그 사무실에 지금 지정된 강사(R4)만. */
    public void requireInstructor() {
        if (role != WorkspaceRole.INSTRUCTOR) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
    }

    public boolean isSelf(Long targetMemberId) {
        return memberId != null && memberId.equals(targetMemberId);
    }

    /** 경로의 팀원이 본인일 때만(개인 API 쓰기). */
    public void requireSelf(Long targetMemberId) {
        if (!isSelf(targetMemberId)) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
    }

    /** 본인 또는 지정된 강사(개인 API 읽기 — 「본인 · R4」). 다른 학생은 {@code forbidden_role}. */
    public void requireSelfOrInstructor(Long targetMemberId) {
        if (role != WorkspaceRole.INSTRUCTOR && !isSelf(targetMemberId)) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE);
        }
    }
}

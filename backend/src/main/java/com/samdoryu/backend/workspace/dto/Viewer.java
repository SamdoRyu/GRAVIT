package com.samdoryu.backend.workspace.dto;

import com.samdoryu.backend.auth.domain.WorkspaceRole;

/**
 * Snapshot을 요청한 사람 — CONTRACTS_API 「5」 Viewer.
 *
 * @param memberId 강사는 null
 * @param activityConsented 팀원이 수집 동의를 했는가(처음 입장 화면 분기 — P12). 강사는 false
 */
public record Viewer(String userId, WorkspaceRole role, String memberId, boolean activityConsented) {
}

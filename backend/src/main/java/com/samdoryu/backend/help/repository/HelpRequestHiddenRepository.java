package com.samdoryu.backend.help.repository;

import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.help.domain.HelpRequestHidden;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 사용자별 숨김(#315). 도움 요청이 사무실 조건을 통과한 뒤에 부른다. 사용자는 늘 세션 사용자다 — 요청 본문의 값을 쓰지 않는다.
 */
public interface HelpRequestHiddenRepository extends JpaRepository<HelpRequestHidden, Long> {

    /** 없으면 만든다 — 이미 숨겼으면(동시에 두 번 포함) 처음 시각을 그대로 두고 아무것도 바꾸지 않는다. */
    @Modifying
    @Query(value = "INSERT INTO help_request_hidden (help_request_id, user_id, hidden_at)"
            + " VALUES (:helpRequestId, :userId, :hiddenAt) ON DUPLICATE KEY UPDATE hidden_at = hidden_at",
            nativeQuery = true)
    int insertIfAbsent(@Param("helpRequestId") Long helpRequestId, @Param("userId") Long userId,
            @Param("hiddenAt") Instant hiddenAt);

    /** 숨김 해제 — 없으면 0행. */
    @Modifying
    @Query("delete from HelpRequestHidden h where h.helpRequest.id = :helpRequestId and h.user.id = :userId")
    int deleteByHelpRequestIdAndUserId(@Param("helpRequestId") Long helpRequestId, @Param("userId") Long userId);

    /** 영구 삭제 — 모든 사용자의 숨김 행. 도움 요청보다 먼저 지운다. */
    @Modifying
    @Query("delete from HelpRequestHidden h where h.helpRequest.id = :helpRequestId")
    int deleteAllByHelpRequestId(@Param("helpRequestId") Long helpRequestId);

    /** 이 사용자가 숨긴, 이 사무실의 도움 요청 — 숨김 목록. 숨긴 시각 내림차순(CONTRACTS_API 「11」). */
    @Query("select r from HelpRequestHidden h join h.helpRequest r"
            + " where h.user.id = :userId and r.workspace.id = :workspaceId order by h.hiddenAt desc, h.id desc")
    List<HelpRequest> findHiddenHelpRequestsNewestFirst(@Param("userId") Long userId,
            @Param("workspaceId") Long workspaceId);

    /** 이 사용자가 숨긴, 이 사무실의 도움 요청 ID — Snapshot {@code helpRequests}. */
    @Query("select h.helpRequest.id from HelpRequestHidden h"
            + " where h.user.id = :userId and h.helpRequest.workspace.id = :workspaceId")
    Set<Long> findHelpRequestIdsByUserIdAndWorkspaceId(@Param("userId") Long userId,
            @Param("workspaceId") Long workspaceId);

    /** 이 사용자가 숨긴 도움 요청 중 주어진 것 — 강사 요청함. 빈 목록으로 부르지 않는다. */
    @Query("select h.helpRequest.id from HelpRequestHidden h"
            + " where h.user.id = :userId and h.helpRequest.id in :helpRequestIds")
    Set<Long> findHiddenAmong(@Param("userId") Long userId,
            @Param("helpRequestIds") Collection<Long> helpRequestIds);
}

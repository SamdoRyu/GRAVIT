package com.samdoryu.backend.report.repository;

import com.samdoryu.backend.report.domain.DecisionCard;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 경로의 팀원 조건으로 찾는다 — 팀원은 먼저 사무실 조건으로 찾는다(CONTRACTS_API.md 「15」 공통 접근 규칙). */
public interface DecisionCardRepository extends JpaRepository<DecisionCard, Long> {

    Optional<DecisionCard> findByIdAndMemberId(Long id, Long memberId);

    boolean existsByMemberIdAndSubmissionId(Long memberId, Long submissionId);

    /** {@code GET W/members/{memberId}/decision-cards} — createdAt 내림차순, 같으면 나중에 만든 것 먼저. */
    List<DecisionCard> findByMemberIdOrderByCreatedAtDescIdDesc(Long memberId);

    /** 강사 요청함 — 여러 사무실에서 꼬리질문을 요청한 카드를 주인 · 사무실 · PR과 함께. 빈 목록으로 부르지 않는다. */
    @Query("select c from DecisionCard c join fetch c.member m join fetch m.workspace join fetch c.submission"
            + " where m.workspace.id in :workspaceIds and c.followUpRequestedAt is not null")
    List<DecisionCard> findFollowUpRequestedByWorkspaceIds(@Param("workspaceIds") Collection<Long> workspaceIds);
}

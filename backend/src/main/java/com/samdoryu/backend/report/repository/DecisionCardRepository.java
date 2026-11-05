package com.samdoryu.backend.report.repository;

import com.samdoryu.backend.report.domain.DecisionCard;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 경로의 팀원 조건으로 찾는다 — 팀원은 먼저 사무실 조건으로 찾는다(CONTRACTS_API.md 「15」 공통 접근 규칙). */
public interface DecisionCardRepository extends JpaRepository<DecisionCard, Long> {

    Optional<DecisionCard> findByIdAndMemberId(Long id, Long memberId);

    boolean existsByMemberIdAndSubmissionId(Long memberId, Long submissionId);

    /** {@code GET W/members/{memberId}/decision-cards} — createdAt 내림차순, 같으면 나중에 만든 것 먼저. */
    List<DecisionCard> findByMemberIdOrderByCreatedAtDescIdDesc(Long memberId);
}

package com.samdoryu.backend.activity.repository;

import com.samdoryu.backend.activity.domain.PeerFeedback;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** 받는 사람 기준으로만 읽는다 — 작성자 기준 조회는 두지 않는다(익명성). */
public interface PeerFeedbackRepository extends JpaRepository<PeerFeedback, Long> {

    List<PeerFeedback> findByWorkspaceIdAndRecipientIdOrderByCreatedAtDesc(Long workspaceId, Long recipientMemberId);
}

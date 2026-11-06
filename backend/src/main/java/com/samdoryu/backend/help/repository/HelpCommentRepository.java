package com.samdoryu.backend.help.repository;

import com.samdoryu.backend.help.domain.HelpComment;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 도움 요청 아래에서만 찾는다 — 도움 요청이 사무실 조건을 통과한 뒤에 부른다. */
public interface HelpCommentRepository extends JpaRepository<HelpComment, Long> {

    List<HelpComment> findByHelpRequestIdOrderByCreatedAtAscIdAsc(Long helpRequestId);

    Optional<HelpComment> findByIdAndHelpRequestId(Long id, Long helpRequestId);

    /** 도움 요청 여럿의 강사 답변 — 강사 요청함의 답변 시각. 빈 목록으로 부르지 않는다. */
    List<HelpComment> findByHelpRequestIdInAndInstructorAnswerTrue(Collection<Long> helpRequestIds);
}

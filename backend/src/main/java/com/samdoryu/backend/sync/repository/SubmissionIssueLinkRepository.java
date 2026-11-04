package com.samdoryu.backend.sync.repository;

import com.samdoryu.backend.sync.domain.SubmissionIssueLink;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SubmissionIssueLinkRepository extends JpaRepository<SubmissionIssueLink, Long> {

    List<SubmissionIssueLink> findBySubmissionId(Long submissionId);
}

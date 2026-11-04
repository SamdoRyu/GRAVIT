package com.samdoryu.backend.instructor.repository;

import com.samdoryu.backend.instructor.domain.ConventionLibraryItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConventionLibraryItemRepository extends JpaRepository<ConventionLibraryItem, Long> {

    /** {@code GET /api/convention-library} — target, name 순. */
    List<ConventionLibraryItem> findAllByOrderByTargetAscNameAsc();
}

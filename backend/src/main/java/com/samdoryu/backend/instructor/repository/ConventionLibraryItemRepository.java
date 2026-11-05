package com.samdoryu.backend.instructor.repository;

import com.samdoryu.backend.instructor.domain.ConventionLibraryItem;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ConventionLibraryItemRepository extends JpaRepository<ConventionLibraryItem, Long> {

    /** DB 문자열 순(target 이름의 알파벳 순). API 정렬은 {@code ConventionLibraryService}가 계약의 target 순서로 한다. */
    List<ConventionLibraryItem> findAllByOrderByTargetAscNameAsc();

    /** {@code GET /api/convention-library} — 만든 강사를 함께 읽는다(항목마다 따로 읽지 않게). */
    @Query("select i from ConventionLibraryItem i join fetch i.author")
    List<ConventionLibraryItem> findAllWithAuthor();
}

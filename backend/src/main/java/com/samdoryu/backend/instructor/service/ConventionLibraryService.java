package com.samdoryu.backend.instructor.service;

import com.samdoryu.backend.instructor.domain.ConventionLibraryItem;
import com.samdoryu.backend.instructor.dto.ConventionLibraryItemDto;
import com.samdoryu.backend.instructor.repository.ConventionLibraryItemRepository;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 공용 컨벤션 라이브러리(FR-LIB · CONTRACTS_API 「17」). 서버 전체에 하나 — 사무실 단위가 아니다.
 * 읽기(#61)는 로그인한 사람 전부(심사용 계정 포함). 등록 · 편집은 #60.
 */
@Service
public class ConventionLibraryService {

    /**
     * {@code target}, {@code name} 순 — target은 계약의 {@code ConventionTarget} 순서(branch_name → … → pr_template)
     * [구현 기본값 — #61]. DB에 저장된 문자열의 알파벳 순서와 달라 정렬은 여기서 한다. 같으면 id.
     */
    static final Comparator<ConventionLibraryItem> ORDER = Comparator
            .comparing(ConventionLibraryItem::getTarget)
            .thenComparing(ConventionLibraryItem::getName)
            .thenComparing(ConventionLibraryItem::getId);

    private final ConventionLibraryItemRepository conventionLibraryItemRepository;

    public ConventionLibraryService(ConventionLibraryItemRepository conventionLibraryItemRepository) {
        this.conventionLibraryItemRepository = conventionLibraryItemRepository;
    }

    /** {@code GET /api/convention-library}. 만든 강사를 함께 읽는다. */
    @Transactional(readOnly = true)
    public List<ConventionLibraryItemDto> listAll() {
        return conventionLibraryItemRepository.findAllWithAuthor().stream()
                .sorted(ORDER)
                .map(ConventionLibraryItemDto::of)
                .toList();
    }
}

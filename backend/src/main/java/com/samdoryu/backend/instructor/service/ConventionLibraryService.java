package com.samdoryu.backend.instructor.service;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.instructor.domain.ConventionLibraryItem;
import com.samdoryu.backend.instructor.dto.ConventionLibraryItemDto;
import com.samdoryu.backend.instructor.dto.ConventionLibraryItemRequest;
import com.samdoryu.backend.instructor.repository.ConventionLibraryItemRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 공용 컨벤션 라이브러리(FR-LIB · CONTRACTS_API 「17」). 서버 전체에 하나 — 사무실 단위가 아니다.
 * 읽기(#61)는 로그인한 사람 전부(심사용 계정 포함). 등록 · 편집(#60)은 실제 GitHub 강사 계정만 — 역할은 Controller가
 * {@code AuthorizationService.requireConventionLibraryEditor}로 먼저 본다. 지우기는 없다.
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
    private final AppUserService appUserService;

    public ConventionLibraryService(ConventionLibraryItemRepository conventionLibraryItemRepository,
            AppUserService appUserService) {
        this.conventionLibraryItemRepository = conventionLibraryItemRepository;
        this.appUserService = appUserService;
    }

    /** {@code GET /api/convention-library}. 만든 강사를 함께 읽는다. */
    @Transactional(readOnly = true)
    public List<ConventionLibraryItemDto> listAll() {
        return conventionLibraryItemRepository.findAllWithAuthor().stream()
                .sorted(ORDER)
                .map(ConventionLibraryItemDto::of)
                .toList();
    }

    /** {@code POST /api/convention-library} — 만든 강사는 세션 사용자다(본문의 작성자 값은 없다). */
    @Transactional
    public ConventionLibraryItemDto create(Long authorUserId, ConventionLibraryItemRequest request) {
        AppUser author = appUserService.require(authorUserId);
        ConventionLibraryItem item = conventionLibraryItemRepository.save(new ConventionLibraryItem(request.target(),
                request.name(), request.content(), request.description(), author, now()));
        return ConventionLibraryItemDto.of(item);
    }

    /**
     * {@code PUT /api/convention-library/{itemId}} — 다른 강사가 만든 항목도 고친다(FR-LIB-01). 네 칸을 요청 값으로 바꾸고
     * 수정 시각을 새로 한다. {@code author}는 만든 강사 그대로다. 없는 항목은 {@code not_found}.
     */
    @Transactional
    public ConventionLibraryItemDto update(Long itemId, ConventionLibraryItemRequest request) {
        ConventionLibraryItem item = conventionLibraryItemRepository.findById(itemId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        item.update(request.target(), request.name(), request.content(), request.description(), now());
        return ConventionLibraryItemDto.of(item);
    }

    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MICROS);
    }
}

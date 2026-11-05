package com.samdoryu.backend.instructor.dto;

import com.samdoryu.backend.auth.dto.UserRef;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.domain.ConventionLibraryItem;
import com.samdoryu.backend.instructor.domain.ConventionTarget;
import java.time.Instant;

/**
 * 공용 컨벤션 라이브러리 항목 — CONTRACTS_API 「17」 ConventionLibraryItemDto.
 *
 * @param content 패턴 · 예시 · 템플릿 본문
 * @param author 만든 강사(다른 강사가 고쳐도 바뀌지 않는다)
 */
public record ConventionLibraryItemDto(
        String id,
        ConventionTarget target,
        String name,
        String content,
        String description,
        UserRef author,
        Instant updatedAt) {

    public static ConventionLibraryItemDto of(ConventionLibraryItem item) {
        return new ConventionLibraryItemDto(
                Ids.toApi(item.getId()),
                item.getTarget(),
                item.getName(),
                item.getContent(),
                item.getDescription(),
                UserRef.of(item.getAuthor()),
                item.getUpdatedAt());
    }
}

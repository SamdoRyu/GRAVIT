package com.samdoryu.backend.common.dto;

import java.util.List;

/**
 * 페이지 응답 — CONTRACTS_API 「공통 타입」 PageResponse. 페이지가 있는 목록(학습 타임라인 · 활동 기록)만 쓴다(CONTRACTS.md 「4」).
 * Spring {@code Page}를 그대로 직렬화하지 않는다. {@code page} · {@code size} 범위(0~ · 1~100)는 Controller가 검증한다.
 *
 * @param page 0부터
 */
public record PageResponse<T>(List<T> items, int page, int size, long totalItems, int totalPages) {

    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 100;

    /** 이미 정렬된 전체 목록에서 한 페이지를 자른다. 마지막 페이지 뒤는 빈 {@code items}. */
    public static <T> PageResponse<T> slice(List<T> all, int page, int size) {
        int from = (int) Math.min((long) page * size, all.size());
        int to = Math.min(from + size, all.size());
        return new PageResponse<>(List.copyOf(all.subList(from, to)), page, size, all.size(),
                (all.size() + size - 1) / size);
    }
}

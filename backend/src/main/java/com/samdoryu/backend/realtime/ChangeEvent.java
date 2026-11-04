package com.samdoryu.backend.realtime;

import java.time.Instant;
import java.util.List;

/**
 * SSE {@code change} 이벤트 본문 — 바뀐 자원 종류만 담는다. ID · 내용 · 개인 지표는 담지 않는다(CONTRACTS_API.md 「6」).
 * 예: {@code {"resources":["tasks","submissions"],"at":"2026-11-05T03:00:05Z"}}
 */
public record ChangeEvent(List<SnapshotResource> resources, Instant at) {

    public ChangeEvent {
        resources = List.copyOf(resources);
    }
}

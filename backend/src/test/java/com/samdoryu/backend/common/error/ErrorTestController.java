package com.samdoryu.backend.common.error;

import com.samdoryu.backend.common.id.Ids;
import java.time.Instant;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** 테스트에만 있는 경로 — 전역 예외 처리 · ID 변환 · 시각 직렬화를 실제 HTTP로 확인한다. */
@RestController
class ErrorTestController {

    record EchoRequest(String name) {
    }

    record ItemResponse(String id) {
    }

    record TimeResponse(Instant at) {
    }

    @GetMapping("/api/test/errors/{code}")
    void error(@PathVariable String code) {
        throw new ApiException(ErrorCode.valueOf(code));
    }

    @GetMapping("/api/test/boom")
    void boom() {
        throw new IllegalStateException("internal detail that must not leak");
    }

    @PostMapping("/api/test/echo")
    EchoRequest echo(@RequestBody EchoRequest request) {
        return request;
    }

    @GetMapping("/api/test/items/{itemId}")
    ItemResponse item(@PathVariable String itemId) {
        return new ItemResponse(Ids.toApi(Ids.fromPath(itemId)));
    }

    @GetMapping("/api/test/time")
    TimeResponse time() {
        return new TimeResponse(Instant.parse("2026-11-03T05:12:00Z"));
    }
}

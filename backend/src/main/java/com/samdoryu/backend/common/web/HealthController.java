package com.samdoryu.backend.common.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /api/health} — 누구나(CONTRACTS_API.md 「2」). */
@RestController
public class HealthController {

    public record HealthResponse(boolean ok) {
    }

    @GetMapping("/api/health")
    public HealthResponse health() {
        return new HealthResponse(true);
    }
}

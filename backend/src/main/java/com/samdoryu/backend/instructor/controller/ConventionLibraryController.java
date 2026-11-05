package com.samdoryu.backend.instructor.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.instructor.dto.ConventionLibraryItemDto;
import com.samdoryu.backend.instructor.service.ConventionLibraryService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 공용 컨벤션 라이브러리 — CONTRACTS_API 「17」. 사무실 경로 밖이다. */
@RestController
@RequestMapping("/api/convention-library")
public class ConventionLibraryController {

    private final AuthorizationService authorizationService;
    private final ConventionLibraryService conventionLibraryService;

    public ConventionLibraryController(AuthorizationService authorizationService,
            ConventionLibraryService conventionLibraryService) {
        this.authorizationService = authorizationService;
        this.conventionLibraryService = conventionLibraryService;
    }

    /** 로그인한 사람 전부(학생 · 강사 · 심사용 계정) — 사무실 접근과 상관없다. 세션이 없으면 {@code unauthorized}. */
    @GetMapping
    public List<ConventionLibraryItemDto> list() {
        authorizationService.currentPrincipal();
        return conventionLibraryService.listAll();
    }
}

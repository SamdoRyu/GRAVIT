package com.samdoryu.backend.instructor.controller;

import com.samdoryu.backend.auth.service.AppPrincipal;
import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.instructor.dto.ConventionLibraryItemDto;
import com.samdoryu.backend.instructor.dto.ConventionLibraryItemRequest;
import com.samdoryu.backend.instructor.service.ConventionLibraryService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 공용 컨벤션 라이브러리 — CONTRACTS_API 「17」. 사무실 경로 밖이다(그래서 {@code InstructorWriteGuard}가 보지 않는다).
 * 쓰기는 역할(403)을 대상 조회(404)보다 먼저 본다 [구현 기본값 — #60] — 쓰기 권한이 없으면 항목 ID와 상관없이 {@code forbidden_role}.
 * 본문 형식 · 길이 · target 오류는 다른 쓰기 API처럼 본문을 읽을 때 {@code invalid}다.
 */
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

    /** 실제 GitHub 강사 계정만(FR-LIB-01). 만든 강사는 세션 사용자. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ConventionLibraryItemDto create(@Valid @RequestBody ConventionLibraryItemRequest request) {
        AppPrincipal editor = authorizationService.requireConventionLibraryEditor();
        return conventionLibraryService.create(editor.userId(), request);
    }

    /** 같은 역할. 다른 강사가 만든 항목도 고친다(FR-LIB-01). */
    @PutMapping("/{itemId}")
    public ConventionLibraryItemDto update(@PathVariable String itemId,
            @Valid @RequestBody ConventionLibraryItemRequest request) {
        authorizationService.requireConventionLibraryEditor();
        return conventionLibraryService.update(Ids.fromPath(itemId), request);
    }
}

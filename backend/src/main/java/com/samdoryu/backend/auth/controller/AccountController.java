package com.samdoryu.backend.auth.controller;

import com.samdoryu.backend.auth.dto.LoginOptions;
import com.samdoryu.backend.auth.dto.MeResponse;
import com.samdoryu.backend.auth.service.AccountService;
import com.samdoryu.backend.auth.service.AuthorizationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 로그인 · 세션(CONTRACTS_API.md 「2」). GitHub 로그인 시작 · 콜백과 {@code POST /api/logout}은 Spring Security 필터가
 * 맡는다({@code SecurityConfig}). 두 GET 응답에는 CSRF 쿠키도 실린다.
 */
@RestController
public class AccountController {

    private final AccountService accountService;
    private final AuthorizationService authorizationService;

    public AccountController(AccountService accountService, AuthorizationService authorizationService) {
        this.accountService = accountService;
        this.authorizationService = authorizationService;
    }

    /** 누구나 — 로그인 전 화면이 쓴다. */
    @GetMapping("/api/login-options")
    LoginOptions loginOptions() {
        return accountService.loginOptions();
    }

    /** 로그인 — 세션이 없으면 Security가 401. */
    @GetMapping("/api/me")
    MeResponse me() {
        return accountService.me(authorizationService.currentPrincipal());
    }
}

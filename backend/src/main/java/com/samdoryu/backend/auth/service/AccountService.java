package com.samdoryu.backend.auth.service;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.dto.LoginOptions;
import com.samdoryu.backend.auth.dto.MeResponse;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 로그인한 사용자 자신의 정보와 로그인 방법 안내(CONTRACTS_API.md 「2」). */
@Service
public class AccountService {

    /** Spring Security 기본 GitHub 로그인 시작 경로(CONTRACTS.md 「10」). */
    public static final String GITHUB_LOGIN_URL = "/oauth2/authorization/github";

    /** 보안 심사용 ID/PW 로그인(CONTRACTS_API 「2」) — 켜진 환경에서만 처리기가 있다. */
    public static final String REVIEW_LOGIN_URL = "/api/review-login";

    private final AppUserRepository appUserRepository;
    private final InstructorAssignmentService instructorAssignmentService;
    private final ReviewAccountService reviewAccountService;
    private final AppProperties appProperties;

    public AccountService(AppUserRepository appUserRepository,
            InstructorAssignmentService instructorAssignmentService, ReviewAccountService reviewAccountService,
            AppProperties appProperties) {
        this.appUserRepository = appUserRepository;
        this.instructorAssignmentService = instructorAssignmentService;
        this.reviewAccountService = reviewAccountService;
        this.appProperties = appProperties;
    }

    public LoginOptions loginOptions() {
        return new LoginOptions(GITHUB_LOGIN_URL, appProperties.reviewLoginEnabled());
    }

    /**
     * {@code GET /api/me}. 사무실별 역할은 넣지 않는다.
     * {@code isInstructor}: 허용 목록의 GitHub 계정이고 지금 지정된 사무실이 하나 이상(지정은 요청마다 DB 확인), 또는 심사용
     * 강사 계정(시연 사무실 — 로그인할 때 만들어진다).
     */
    @Transactional(readOnly = true)
    public MeResponse me(AppPrincipal principal) {
        AppUser user = appUserRepository.findById(principal.userId())
                .orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED));
        boolean isInstructor = user.getAccountType() == AccountType.REVIEW
                ? reviewAccountService.isReviewInstructor(user.getId())
                : appProperties.isAllowlistedInstructor(user.getGithubUserId())
                        && instructorAssignmentService.hasAnyCurrentAssignment(user.getGithubUserId());
        return MeResponse.of(user, isInstructor);
    }
}

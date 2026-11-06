package com.samdoryu.backend.auth.service;

import com.samdoryu.backend.auth.domain.AccountType;
import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.domain.ReviewAccount;
import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.repository.AppUserRepository;
import com.samdoryu.backend.auth.repository.ReviewAccountRepository;
import com.samdoryu.backend.auth.security.ReviewLoginProperties;
import com.samdoryu.backend.auth.security.ReviewLoginThrottle;
import com.samdoryu.backend.common.security.AppProperties;
import com.samdoryu.backend.workspace.service.DemoWorkspaceService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 보안 심사용 ID/PW 로그인(FR-AUTH-01 · P15). 계정과 시연 사무실 역할은 서버 설정({@code REVIEW_ACCOUNTS})이 기준이고,
 * {@code review_account} 행은 처음 로그인할 때 만들어 앱 사용자(작성자 · 세션)를 잇는다.
 * <ul>
 *   <li>심사용 로그인이 꺼진 환경에서는 설정을 읽지 않는다 — 계정이 없다. 켜진 환경에서 설정이 틀리면 서버가 켜지지 않는다.</li>
 *   <li>실패 이유(없는 아이디 · 틀린 비밀번호 · 사용 불가 · 잠김)를 구분하지 않는다. 없는 아이디 · 잠긴 계정도 해시 비교를 한 번
 *       해 걸리는 시간을 맞춘다.</li>
 *   <li>반복 실패 제한({@link ReviewLoginThrottle}, #165) — 여러 번 틀린 계정은 한동안 맞는 비밀번호도 받지 않는다.</li>
 *   <li>참여자 · 레포 관리자는 시연 사무실의 Seed 팀원 하나로 행동한다(세션에 역할 · 팀원). 강사(ROLE-04)는 세션에 두지 않고
 *       요청마다 {@link #isReviewInstructor}로 확인한다(CONTRACTS.md 「6」 역할 판정).</li>
 *   <li>DB의 {@code enabled}가 꺼진 계정은 설정에 있어도 로그인할 수 없다(운영자가 막은 계정).</li>
 * </ul>
 */
@Slf4j
@Service
public class ReviewAccountService {

    private final ReviewAccountRepository reviewAccountRepository;
    private final AppUserRepository appUserRepository;
    private final DemoWorkspaceService demoWorkspaceService;
    private final PasswordEncoder passwordEncoder;
    private final ReviewLoginThrottle throttle;
    private final Map<String, ReviewAccountSpec> specs;
    /** 없는 아이디일 때 비교할 해시 — 있는 아이디와 걸리는 시간을 맞춘다. */
    private final String timingDummyHash;

    public ReviewAccountService(ReviewAccountRepository reviewAccountRepository, AppUserRepository appUserRepository,
            DemoWorkspaceService demoWorkspaceService, PasswordEncoder passwordEncoder, ReviewLoginThrottle throttle,
            AppProperties appProperties, ReviewLoginProperties reviewLoginProperties) {
        this.reviewAccountRepository = reviewAccountRepository;
        this.appUserRepository = appUserRepository;
        this.demoWorkspaceService = demoWorkspaceService;
        this.passwordEncoder = passwordEncoder;
        this.throttle = throttle;
        this.specs = (appProperties.reviewLoginEnabled()
                ? ReviewAccountSpec.parse(reviewLoginProperties.accounts())
                : List.<ReviewAccountSpec>of())
                .stream().collect(Collectors.toUnmodifiableMap(ReviewAccountSpec::username, Function.identity()));
        this.timingDummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    /**
     * 아이디 · 비밀번호 확인 — 맞으면 그 계정 설정. DB를 읽지 않는다: bcrypt 비교(느리게 만든 해시)가 DB 연결을 잡고 있지 않아야
     * 반복 시도로 연결이 바닥나지 않는다. 다음은 {@link #login}.
     */
    public Optional<ReviewAccountSpec> verify(String username, String password) {
        ReviewAccountSpec spec = username == null ? null : specs.get(username);
        if (spec == null || password == null || throttle.isLocked(spec.username())) {
            passwordEncoder.matches(password == null ? "" : password, timingDummyHash);
            return Optional.empty();
        }
        if (!passwordEncoder.matches(password, spec.passwordHash())) {
            throttle.failed(spec.username());
            return Optional.empty();
        }
        throttle.succeeded(spec.username());
        return Optional.of(spec);
    }

    /**
     * {@link #verify}를 통과한 계정의 로그인 — 세션에 둘 로그인 사용자. 운영자가 막은 계정 · 맡을 Seed 팀원이 없으면 비어 있다.
     * 호출한 쪽은 실패를 {@code unauthorized} 하나로 답한다. 시연 사무실이 없으면 만들고 Seed로 채운다.
     */
    @Transactional
    public Optional<AppPrincipal> login(ReviewAccountSpec spec, Instant now) {
        ReviewAccount account = reviewAccountRepository.findByUsername(spec.username())
                .orElseGet(() -> create(spec));
        if (!account.isEnabled()) {
            return Optional.empty();
        }
        account.replacePasswordHash(spec.passwordHash());

        Long demoWorkspaceId = demoWorkspaceService.ensureDemoWorkspace(now);
        Map<Long, AppPrincipal.Membership> memberships = Map.of();
        if (spec.role().isTeamMember()) {
            Optional<Long> memberId = demoWorkspaceService.currentSeedMemberId(demoWorkspaceId, spec.seedLogin());
            if (memberId.isEmpty()) {
                log.warn("심사용 계정이 맡을 Seed 팀원이 시연 사무실에 없다: account={}, seedLogin={}", spec.username(),
                        spec.seedLogin());
                return Optional.empty();
            }
            memberships = Map.of(demoWorkspaceId, new AppPrincipal.Membership(spec.role(), memberId.get()));
        }
        return Optional.of(new AppPrincipal(account.getUser().getId(), AccountType.REVIEW, null, memberships));
    }

    /** 심사용 강사(ROLE-04)인가 — 요청마다: 계정이 사용 가능하고 설정의 역할이 강사. */
    @Transactional(readOnly = true)
    public boolean isReviewInstructor(Long userId) {
        return reviewAccountRepository.findByUserId(userId)
                .filter(ReviewAccount::isEnabled)
                .map(account -> specs.get(account.getUsername()))
                .filter(spec -> spec.role() == WorkspaceRole.INSTRUCTOR)
                .isPresent();
    }

    private ReviewAccount create(ReviewAccountSpec spec) {
        AppUser user = appUserRepository.save(AppUser.review(spec.username()));
        return reviewAccountRepository.save(new ReviewAccount(user, spec.username(), spec.passwordHash()));
    }
}

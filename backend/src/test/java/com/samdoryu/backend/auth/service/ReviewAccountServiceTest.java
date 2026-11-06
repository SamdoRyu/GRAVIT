package com.samdoryu.backend.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

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
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

/** 심사용 로그인 판정(P15 · CONTRACTS_API 「2」) — DB 없이. 실제 HTTP · 세션 · CSRF는 {@code ReviewLoginIntegrationTest}. */
class ReviewAccountServiceTest {

    private static final Instant T0 = Instant.parse("2026-11-05T03:00:00Z");
    private static final long DEMO_ID = 50L;
    private static final long SEED_LEE_MEMBER_ID = 501L;
    private static final String STUDENT_PASSWORD = "student-" + System.nanoTime();
    private static final String MENTOR_PASSWORD = "mentor-" + System.nanoTime();

    private final PasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private ReviewAccountRepository reviewAccounts;
    private AppUserRepository appUsers;
    private DemoWorkspaceService demoWorkspaceService;
    private ReviewAccountService service;

    @BeforeEach
    void setUp() {
        reviewAccounts = mock(ReviewAccountRepository.class);
        appUsers = mock(AppUserRepository.class);
        demoWorkspaceService = mock(DemoWorkspaceService.class);
        String config = "rev-student:participant:seed-lee:" + encoder.encode(STUDENT_PASSWORD)
                + ";rev-mentor:instructor::" + encoder.encode(MENTOR_PASSWORD);
        service = newService(true, config);

        when(reviewAccounts.findByUsername(any())).thenReturn(Optional.empty());
        when(appUsers.save(any(AppUser.class))).thenAnswer(call -> {
            AppUser user = call.getArgument(0);
            ReflectionTestUtils.setField(user, "id", 70L);
            return user;
        });
        when(reviewAccounts.save(any(ReviewAccount.class))).thenAnswer(call -> call.getArgument(0));
        when(demoWorkspaceService.ensureDemoWorkspace(T0)).thenReturn(DEMO_ID);
        when(demoWorkspaceService.currentSeedMemberId(DEMO_ID, "seed-lee")).thenReturn(Optional.of(SEED_LEE_MEMBER_ID));
    }

    private ReviewAccountService newService(boolean enabled, String config) {
        return new ReviewAccountService(reviewAccounts, appUsers, demoWorkspaceService, encoder, new ReviewLoginThrottle(),
                new AppProperties("http://localhost:5173", Set.of(), enabled, null, null),
                new ReviewLoginProperties(config));
    }

    /** 로그인 처리기와 같은 순서 — 비밀번호 확인(DB 밖) → 로그인(트랜잭션). */
    private static Optional<AppPrincipal> authenticate(ReviewAccountService target, String username, String password) {
        return target.verify(username, password).flatMap(spec -> target.login(spec, T0));
    }

    private Optional<AppPrincipal> authenticate(String username, String password) {
        return authenticate(service, username, password);
    }

    private ReviewAccount existing(String username, long userId) {
        AppUser user = AppUser.review(username);
        ReflectionTestUtils.setField(user, "id", userId);
        return new ReviewAccount(user, username, "$2a$04$" + "x".repeat(53));
    }

    @Test
    void firstLoginCreatesTheAccountAndActsAsTheSeedMember() {
        Optional<AppPrincipal> principal = authenticate("rev-student", STUDENT_PASSWORD);

        assertThat(principal).isPresent();
        assertThat(principal.get().accountType()).isEqualTo(AccountType.REVIEW);
        assertThat(principal.get().githubUserId()).isNull();
        assertThat(principal.get().userId()).isEqualTo(70L);
        assertThat(principal.get().memberships()).containsOnlyKeys(DEMO_ID);
        assertThat(principal.get().memberships().get(DEMO_ID).role()).isEqualTo(WorkspaceRole.PARTICIPANT);
        assertThat(principal.get().memberships().get(DEMO_ID).memberId()).isEqualTo(SEED_LEE_MEMBER_ID);

        ArgumentCaptor<AppUser> user = ArgumentCaptor.forClass(AppUser.class);
        verify(appUsers).save(user.capture());
        assertThat(user.getValue().getAccountType()).isEqualTo(AccountType.REVIEW);
        verify(reviewAccounts).save(any(ReviewAccount.class));
    }

    @Test
    void existingAccountTakesTheConfiguredHash() {
        ReviewAccount account = existing("rev-student", 71L);
        when(reviewAccounts.findByUsername("rev-student")).thenReturn(Optional.of(account));

        assertThat(authenticate("rev-student", STUDENT_PASSWORD)).isPresent();

        assertThat(encoder.matches(STUDENT_PASSWORD, account.getPasswordHash())).isTrue();
        verify(reviewAccounts, never()).save(any());
    }

    /** 강사는 세션에 역할을 두지 않는다 — 요청마다 확인. */
    @Test
    void instructorHasNoMembershipInTheSession() {
        Optional<AppPrincipal> principal = authenticate("rev-mentor", MENTOR_PASSWORD);

        assertThat(principal).isPresent();
        assertThat(principal.get().memberships()).isEmpty();
        verify(demoWorkspaceService).ensureDemoWorkspace(T0);
    }

    @Test
    void wrongPasswordUnknownUserAndMissingPasswordAllFailTheSameWay() {
        assertThat(authenticate("rev-student", "wrong")).isEmpty();
        assertThat(authenticate("nobody", STUDENT_PASSWORD)).isEmpty();
        assertThat(authenticate(null, null)).isEmpty();
        assertThat(authenticate("rev-student", null)).isEmpty();
        verifyNoInteractions(appUsers, demoWorkspaceService);
    }

    /** #165 — 여러 번 틀리면 맞는 비밀번호도 같은 실패(DB를 건드리지 않음). 다른 계정은 영향이 없다. */
    @Test
    void repeatedWrongPasswordsLockOnlyThatAccount() {
        for (int i = 0; i < 5; i++) {
            assertThat(authenticate("rev-student", "wrong-" + i)).isEmpty();
        }

        assertThat(authenticate("rev-student", STUDENT_PASSWORD)).isEmpty();
        verifyNoInteractions(appUsers, demoWorkspaceService);
        assertThat(authenticate("rev-mentor", MENTOR_PASSWORD)).isPresent();
    }

    /** 운영자가 DB에서 막은 계정은 설정에 있어도 로그인할 수 없다. */
    @Test
    void disabledAccountCannotLogIn() {
        ReviewAccount account = existing("rev-student", 71L);
        account.disable();
        when(reviewAccounts.findByUsername("rev-student")).thenReturn(Optional.of(account));

        assertThat(authenticate("rev-student", STUDENT_PASSWORD)).isEmpty();
        verifyNoInteractions(demoWorkspaceService);
    }

    @Test
    void missingSeedMemberFailsTheLogin() {
        when(demoWorkspaceService.currentSeedMemberId(DEMO_ID, "seed-lee")).thenReturn(Optional.empty());

        assertThat(authenticate("rev-student", STUDENT_PASSWORD)).isEmpty();
    }

    /** 꺼진 환경에서는 설정을 읽지 않는다 — 틀린 설정이어도 서버가 켜지고, 계정이 없다. */
    @Test
    void disabledEnvironmentHasNoAccounts() {
        ReviewAccountService off = newService(false, "not a valid config");

        assertThat(authenticate(off, "rev-student", STUDENT_PASSWORD)).isEmpty();
    }

    @Test
    void reviewInstructorIsCheckedFromTheAccountAndConfig() {
        when(reviewAccounts.findByUserId(80L)).thenReturn(Optional.of(existing("rev-mentor", 80L)));
        when(reviewAccounts.findByUserId(81L)).thenReturn(Optional.of(existing("rev-student", 81L)));
        ReviewAccount disabledMentor = existing("rev-mentor", 82L);
        disabledMentor.disable();
        when(reviewAccounts.findByUserId(82L)).thenReturn(Optional.of(disabledMentor));
        when(reviewAccounts.findByUserId(83L)).thenReturn(Optional.empty());

        assertThat(service.isReviewInstructor(80L)).isTrue();
        assertThat(service.isReviewInstructor(81L)).isFalse();
        assertThat(service.isReviewInstructor(82L)).isFalse();
        assertThat(service.isReviewInstructor(83L)).isFalse();
    }
}

package com.samdoryu.backend.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 서버 단위 사용자(CONTRACTS.md 「2」). 이메일은 두지 않는다(NFR-04).
 * GitHub 계정은 {@code githubUserId}(바뀌지 않는 키)로 찾고, {@code githubLogin}은 표시용이다.
 */
@Entity
@Table(name = "app_user")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AppUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AccountType accountType;

    private Long githubUserId;

    @Column(length = 39)
    private String githubLogin;

    @Column(nullable = false)
    private String displayName;

    @Column(length = 512)
    private String avatarUrl;

    private AppUser(AccountType accountType, Long githubUserId, String githubLogin, String displayName,
            String avatarUrl) {
        this.accountType = accountType;
        this.githubUserId = githubUserId;
        this.githubLogin = githubLogin;
        this.displayName = Objects.requireNonNull(displayName);
        this.avatarUrl = avatarUrl;
    }

    /** GitHub 계정 — 로그인할 때, 또는 동기화가 아직 로그인하지 않은 콜라보레이터를 만들 때. */
    public static AppUser github(long githubUserId, String githubLogin, String displayName, String avatarUrl) {
        return new AppUser(AccountType.GITHUB, githubUserId, githubLogin, displayName, avatarUrl);
    }

    /** 심사용 계정(P15) — GitHub 칸이 없다. */
    public static AppUser review(String displayName) {
        return new AppUser(AccountType.REVIEW, null, null, displayName, null);
    }

    /** 로그인 · 동기화 때 GitHub의 표시 값으로 맞춘다. */
    public void updateGithubProfile(String githubLogin, String displayName, String avatarUrl) {
        if (accountType != AccountType.GITHUB) {
            throw new IllegalStateException("GitHub 계정만 GitHub 표시 값을 가진다");
        }
        this.githubLogin = githubLogin;
        this.displayName = Objects.requireNonNull(displayName);
        this.avatarUrl = avatarUrl;
    }
}

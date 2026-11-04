package com.samdoryu.backend.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 보안 심사용 ID/PW 계정(CONTRACTS.md 「2」 · P15). AppUser({@code REVIEW}) 1–1.
 * 비밀번호는 Spring {@code PasswordEncoder} 해시만 받는다 — 평문을 받는 생성 경로가 없다.
 */
@Entity
@Table(name = "review_account")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReviewAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private AppUser user;

    @Column(nullable = false, unique = true, length = 64)
    private String username;

    @Column(nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private boolean enabled;

    /**
     * @param passwordHash {@code PasswordEncoder.encode(...)}의 결과
     */
    public ReviewAccount(AppUser user, String username, String passwordHash) {
        if (user.getAccountType() != AccountType.REVIEW) {
            throw new IllegalArgumentException("심사용 계정은 REVIEW 사용자에만 붙는다");
        }
        this.user = user;
        this.username = Objects.requireNonNull(username);
        this.passwordHash = Objects.requireNonNull(passwordHash);
        this.enabled = true;
    }

    public void disable() {
        this.enabled = false;
    }

    /** toString에 해시가 실리지 않도록 직접 쓴다. */
    @Override
    public String toString() {
        return "ReviewAccount(id=" + id + ", username=" + username + ", enabled=" + enabled + ")";
    }
}

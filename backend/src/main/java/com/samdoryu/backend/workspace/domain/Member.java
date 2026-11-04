package com.samdoryu.backend.workspace.domain;

import com.samdoryu.backend.auth.domain.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 사무실의 팀원(CONTRACTS.md 「2」). 테이블 이름은 {@code team_member}다 — {@code MEMBER}가 MySQL 8 예약어다.
 * 행을 지우지 않는다: 콜라보레이터에서 빠지면 {@link #remove(Instant)}로 빠진 시각을 남기고 책상 자리를 비운다.
 * 허용 목록의 강사 계정은 콜라보레이터여도 팀원 행을 만들지 않는다(P1) — 동기화가 지킨다.
 * GitHub 칸(로그인 이름 · 사진 · 레포 관리자 여부 · 시각)은 동기화가, 앱 칸(책상 · 수집 동의)은 앱이 쓴다(「2」 소유).
 */
@Entity
@Table(name = "team_member")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member {

    /** 책상 자리 번호 범위(0~9) — 테마의 자리 번호이고 좌표가 아니다. */
    public static final int MIN_DESK_INDEX = 0;
    public static final int MAX_DESK_INDEX = 9;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    /** 시연 Seed 팀원은 없다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private AppUser user;

    @Column(length = 39)
    private String githubLogin;

    @Column(nullable = false)
    private String displayName;

    @Column(length = 512)
    private String avatarUrl;

    /** 빠진 팀원은 null. */
    private Integer deskIndex;

    @Column(name = "is_repo_admin", nullable = false)
    private boolean repoAdmin;

    private Instant activityConsentedAt;

    private Instant removedAt;

    private Instant syncedAt;

    private Member(Workspace workspace, AppUser user, String githubLogin, String displayName, String avatarUrl,
            int deskIndex, boolean repoAdmin, Instant syncedAt) {
        if (deskIndex < MIN_DESK_INDEX || deskIndex > MAX_DESK_INDEX) {
            throw new IllegalArgumentException("deskIndex는 " + MIN_DESK_INDEX + "~" + MAX_DESK_INDEX);
        }
        this.workspace = Objects.requireNonNull(workspace);
        this.user = user;
        this.githubLogin = githubLogin;
        this.displayName = Objects.requireNonNull(displayName);
        this.avatarUrl = avatarUrl;
        this.deskIndex = deskIndex;
        this.repoAdmin = repoAdmin;
        this.syncedAt = syncedAt;
    }

    /** 동기화가 콜라보레이터를 팀원으로 만들 때. 책상은 처음 들어올 때 빈 자리를 받는다. */
    public static Member collaborator(Workspace workspace, AppUser user, int deskIndex, boolean repoAdmin,
            Instant syncedAt) {
        Objects.requireNonNull(user);
        return new Member(workspace, user, user.getGithubLogin(), user.getDisplayName(), user.getAvatarUrl(),
                deskIndex, repoAdmin, Objects.requireNonNull(syncedAt));
    }

    /** 시연 사무실 Seed 팀원 — 사용자 · GitHub 칸이 없다. */
    public static Member demoSeed(Workspace workspace, String displayName, String avatarUrl, int deskIndex) {
        return new Member(workspace, null, null, displayName, avatarUrl, deskIndex, false, null);
    }

    /** 콜라보레이터에서 빠짐 — 행은 남기고 책상 자리를 비운다(과거 평가 · 안건 · 코멘트가 가리킨다). */
    public void remove(Instant removedAt) {
        this.removedAt = Objects.requireNonNull(removedAt);
        this.deskIndex = null;
    }

    public boolean isRemoved() {
        return removedAt != null;
    }
}

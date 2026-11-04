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
import org.hibernate.annotations.DynamicUpdate;

/**
 * 사무실의 팀원(CONTRACTS.md 「2」). 테이블 이름은 {@code team_member}다 — {@code MEMBER}가 MySQL 8 예약어다.
 * 행을 지우지 않는다: 콜라보레이터에서 빠지면 {@link #remove(Instant)}로 빠진 시각을 남기고 책상 자리를 비운다.
 * 허용 목록의 강사 계정은 콜라보레이터여도 팀원 행을 만들지 않는다(P1) — 동기화가 지킨다.
 * GitHub 칸(로그인 이름 · 사진 · 레포 관리자 여부 · 시각)은 동기화가, 앱 칸(책상 · 수집 동의)은 앱이 쓴다(「2」 소유).
 * <p>
 * {@link DynamicUpdate}: 바뀐 열만 UPDATE한다. 동기화가 팀원을 읽은 뒤 그 사이에 앱이 책상 · 수집 동의를 바꿔도, 동기화는
 * 자기가 바꾼 GitHub 칸만 써서 앱 칸을 옛 값으로 덮어쓰지 않는다(#71 완료 조건 1).
 */
@Entity
@DynamicUpdate
@Table(name = "team_member")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member {

    /**
     * 책상 자리 번호 범위(0~7, 최대 8자리 — 우주정거장 작업 포드 8개, 계약 2fbb17b). 테마의 자리 번호이고 좌표가 아니다.
     * 8자리가 다 차 있으면 새 팀원은 자리 없이(null) 들어온다 — 팀원 권한은 같다.
     */
    public static final int MIN_DESK_INDEX = 0;
    public static final int MAX_DESK_INDEX = 7;

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

    /** 빠진 팀원과 자리가 없는 팀원(8자리가 다 참)은 null. */
    private Integer deskIndex;

    @Column(name = "is_repo_admin", nullable = false)
    private boolean repoAdmin;

    private Instant activityConsentedAt;

    private Instant removedAt;

    private Instant syncedAt;

    private Member(Workspace workspace, AppUser user, String githubLogin, String displayName, String avatarUrl,
            Integer deskIndex, boolean repoAdmin, Instant syncedAt) {
        requireValidDesk(deskIndex);
        this.workspace = Objects.requireNonNull(workspace);
        this.user = user;
        this.githubLogin = githubLogin;
        this.displayName = Objects.requireNonNull(displayName);
        this.avatarUrl = avatarUrl;
        this.deskIndex = deskIndex;
        this.repoAdmin = repoAdmin;
        this.syncedAt = syncedAt;
    }

    private static void requireValidDesk(Integer deskIndex) {
        if (deskIndex != null && (deskIndex < MIN_DESK_INDEX || deskIndex > MAX_DESK_INDEX)) {
            throw new IllegalArgumentException("deskIndex는 " + MIN_DESK_INDEX + "~" + MAX_DESK_INDEX);
        }
    }

    /**
     * 동기화가 콜라보레이터를 팀원으로 만들 때. 책상은 처음 들어올 때 빈 자리를 받는다.
     *
     * @param deskIndex 빈 자리. 8자리가 다 찼으면 null
     */
    public static Member collaborator(Workspace workspace, AppUser user, Integer deskIndex, boolean repoAdmin,
            Instant syncedAt) {
        Objects.requireNonNull(user);
        return new Member(workspace, user, user.getGithubLogin(), user.getDisplayName(), user.getAvatarUrl(),
                deskIndex, repoAdmin, Objects.requireNonNull(syncedAt));
    }

    /**
     * 시연 사무실 Seed 팀원 — 사용자 · GitHub 사용자 ID가 없다.
     *
     * @param seedLogin Seed 어댑터 결과의 로그인 이름(예: {@code seed-kim}). 시연 사무실 동기화가 이 이름으로 담당자 · 작성자를 짝짓는다
     */
    public static Member demoSeed(Workspace workspace, String seedLogin, String displayName, String avatarUrl,
            Integer deskIndex) {
        return new Member(workspace, null, Objects.requireNonNull(seedLogin), displayName, avatarUrl, deskIndex,
                false, null);
    }

    /**
     * 동기화 — 지금 팀원의 GitHub 칸을 맞춘다. <b>앱 칸(책상 · 수집 동의)은 덮어쓰지 않는다</b>(「2」 소유).
     */
    public void syncGithubFields(String githubLogin, String displayName, String avatarUrl, boolean repoAdmin,
            Instant syncedAt) {
        this.githubLogin = githubLogin;
        this.displayName = Objects.requireNonNull(displayName);
        this.avatarUrl = avatarUrl;
        this.repoAdmin = repoAdmin;
        this.syncedAt = Objects.requireNonNull(syncedAt);
    }

    /**
     * 빠졌던 팀원이 다시 콜라보레이터가 됨 — 다시 들어온 것이므로 빈 책상을 새로 받는다.
     *
     * @param deskIndex 빈 자리. 8자리가 다 찼으면 null
     */
    public void rejoin(Integer deskIndex) {
        if (!isRemoved()) {
            throw new IllegalStateException("빠지지 않은 팀원");
        }
        requireValidDesk(deskIndex);
        this.removedAt = null;
        this.deskIndex = deskIndex;
    }

    /** GitHub 사용자 ID — 실제 팀원은 사용자의 것, 시연 Seed 팀원은 없다(null). */
    public Long githubUserId() {
        return user == null ? null : user.getGithubUserId();
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

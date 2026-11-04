package com.samdoryu.backend.workspace.domain;

import com.samdoryu.backend.auth.domain.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * 사무실(CONTRACTS.md 「2」 · P2). 사무실 단위 데이터는 모두 이 행을 가리킨다.
 * {@code GITHUB} 종류만 레포 칸이 있고 {@code githubRepoId} 하나에 사무실 하나다(DB 유일 제약).
 */
@Entity
@Table(name = "workspace")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Workspace {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private WorkspaceKind kind;

    @Column(unique = true)
    private Long githubRepoId;

    @Column(length = 100)
    private String githubOwner;

    @Column(length = 100)
    private String githubRepo;

    /** GitHub App 설치 ID — 응답에 내지 않는다. */
    private Long githubInstallationId;

    @Column(nullable = false)
    private String displayName;

    /** 연 사람 — 시연 사무실은 Seed라 없다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "opened_by_user_id")
    private AppUser openedBy;

    @Column(nullable = false)
    private Instant openedAt;

    private Workspace(WorkspaceKind kind, Long githubRepoId, String githubOwner, String githubRepo,
            Long githubInstallationId, String displayName, AppUser openedBy, Instant openedAt) {
        this.kind = kind;
        this.githubRepoId = githubRepoId;
        this.githubOwner = githubOwner;
        this.githubRepo = githubRepo;
        this.githubInstallationId = githubInstallationId;
        this.displayName = Objects.requireNonNull(displayName);
        this.openedBy = openedBy;
        this.openedAt = Objects.requireNonNull(openedAt);
    }

    /** 팀 레포의 사무실. 표시 이름은 {@code owner/repo}. */
    public static Workspace github(long githubRepoId, String githubOwner, String githubRepo,
            Long githubInstallationId, AppUser openedBy, Instant openedAt) {
        Objects.requireNonNull(githubOwner);
        Objects.requireNonNull(githubRepo);
        return new Workspace(WorkspaceKind.GITHUB, githubRepoId, githubOwner, githubRepo, githubInstallationId,
                githubOwner + "/" + githubRepo, Objects.requireNonNull(openedBy), openedAt);
    }

    /** 시연 사무실 — GitHub 칸이 없다. */
    public static Workspace demo(String displayName, Instant openedAt) {
        return new Workspace(WorkspaceKind.DEMO, null, null, null, null, displayName, null, openedAt);
    }
}

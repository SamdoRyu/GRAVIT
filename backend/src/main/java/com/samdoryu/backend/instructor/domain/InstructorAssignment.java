package com.samdoryu.backend.instructor.domain;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.workspace.domain.Workspace;
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
 * 사무실의 강사 지정(CONTRACTS.md 「2」 · FR-AUTH-06 · P1).
 * 강사는 AppUser가 아니라 GitHub 사용자 ID로 가리킨다 — 아직 로그인하지 않은 강사도 지정할 수 있다.
 * 해제해도 행을 지우지 않고 해제 시각을 남긴다. 현재 지정(해제 시각 없음)은 (사무실, GitHub 사용자 ID)당 하나 —
 * DB의 생성 열 {@code current_flag} 유일 제약이 막는다(매핑하지 않는다).
 */
@Entity
@Table(name = "instructor_assignment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InstructorAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false)
    private Long instructorGithubUserId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "assigned_by_user_id", nullable = false)
    private AppUser assignedBy;

    @Column(nullable = false)
    private Instant assignedAt;

    private Instant unassignedAt;

    public InstructorAssignment(Workspace workspace, long instructorGithubUserId, AppUser assignedBy,
            Instant assignedAt) {
        this.workspace = Objects.requireNonNull(workspace);
        this.instructorGithubUserId = instructorGithubUserId;
        this.assignedBy = Objects.requireNonNull(assignedBy);
        this.assignedAt = Objects.requireNonNull(assignedAt);
    }

    /** 해제 — 그 강사의 그 사무실 권한은 다음 요청부터 없다. */
    public void unassign(Instant unassignedAt) {
        if (this.unassignedAt != null) {
            throw new IllegalStateException("이미 해제된 지정");
        }
        this.unassignedAt = Objects.requireNonNull(unassignedAt);
    }

    public boolean isCurrent() {
        return unassignedAt == null;
    }
}

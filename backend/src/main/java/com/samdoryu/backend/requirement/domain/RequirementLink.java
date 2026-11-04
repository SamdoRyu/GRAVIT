package com.samdoryu.backend.requirement.domain;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.sync.domain.Task;
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
 * 요구사항 ↔ 이슈 연결(CONTRACTS.md 「2」 · FR-REQ-04). (요구사항, 이슈) 유일.
 * 동기화 · 재동기화가 지우지 않는다 — 지우는 것은 레포 관리자의 {@code DELETE}뿐. GitHub 이슈는 바뀌지 않는다.
 */
@Entity
@Table(name = "requirement_link")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RequirementLink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requirement_id", nullable = false)
    private Requirement requirement;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "task_id", nullable = false)
    private Task task;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "linked_by_user_id", nullable = false)
    private AppUser linkedBy;

    @Column(nullable = false)
    private Instant linkedAt;

    public RequirementLink(Requirement requirement, Task task, AppUser linkedBy, Instant linkedAt) {
        this.requirement = Objects.requireNonNull(requirement);
        this.task = Objects.requireNonNull(task);
        this.linkedBy = Objects.requireNonNull(linkedBy);
        this.linkedAt = Objects.requireNonNull(linkedAt);
    }
}

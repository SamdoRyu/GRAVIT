package com.samdoryu.backend.plan.domain;

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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 앱에 저장하는 작업 마감(CONTRACTS.md 「2」 · FR-PLAN-02 · 03 · P14). Task 1–1.
 * GitHub 이슈는 바뀌지 않고 동기화도 덮지 않는다. 마감 지우기는 행 삭제다(지울 수 있는 기록 둘 중 하나).
 * 고칠 수 있는 사람(레포 관리자 · 그 이슈의 담당자 전원)은 Service가 검사한다.
 */
@Entity
@Table(name = "task_due_date")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TaskDueDate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "task_id", nullable = false, unique = true)
    private Task task;

    @Column(nullable = false)
    private LocalDate dueDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "updated_by_user_id", nullable = false)
    private AppUser updatedBy;

    @Column(nullable = false)
    private Instant updatedAt;

    public TaskDueDate(Task task, LocalDate dueDate, AppUser updatedBy, Instant updatedAt) {
        this.task = Objects.requireNonNull(task);
        change(dueDate, updatedBy, updatedAt);
    }

    public void change(LocalDate dueDate, AppUser updatedBy, Instant updatedAt) {
        this.dueDate = Objects.requireNonNull(dueDate);
        this.updatedBy = Objects.requireNonNull(updatedBy);
        this.updatedAt = Objects.requireNonNull(updatedAt);
    }
}

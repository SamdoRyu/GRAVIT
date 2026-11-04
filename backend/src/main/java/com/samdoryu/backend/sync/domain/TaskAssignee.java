package com.samdoryu.backend.sync.domain;

import com.samdoryu.backend.workspace.domain.Member;
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
 * 이슈 담당자 — Task와 Member의 다대다를 표현하는 중간 Entity(CONTRACTS.md 「2」).
 * 동기화가 GitHub 담당자 전원으로 맞추고, 팀원이 아닌 담당자는 넣지 않는다. 대표 담당자는 저장하지 않는다.
 */
@Entity
@Table(name = "task_assignee")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TaskAssignee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "task_id", nullable = false)
    private Task task;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(nullable = false)
    private Instant syncedAt;

    public TaskAssignee(Task task, Member member, Instant syncedAt) {
        this.task = Objects.requireNonNull(task);
        this.member = Objects.requireNonNull(member);
        this.syncedAt = Objects.requireNonNull(syncedAt);
    }
}

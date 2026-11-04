package com.samdoryu.backend.activity.domain;

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

/** 활동 확인 — 확인자마다 한 행, (활동, 확인자) 유일(FR-ACT-02). 작성자 본인은 확인할 수 없다. */
@Entity
@Table(name = "activity_confirmation")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ActivityConfirmation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "activity_record_id", nullable = false)
    private ActivityRecord activityRecord;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "confirmer_member_id", nullable = false)
    private Member confirmer;

    @Column(nullable = false)
    private Instant confirmedAt;

    public ActivityConfirmation(ActivityRecord activityRecord, Member confirmer, Instant confirmedAt) {
        if (Objects.equals(activityRecord.getAuthor().getId(), confirmer.getId())) {
            throw new IllegalArgumentException("작성자는 자기 활동을 확인할 수 없다");
        }
        this.activityRecord = activityRecord;
        this.confirmer = confirmer;
        this.confirmedAt = Objects.requireNonNull(confirmedAt);
    }
}

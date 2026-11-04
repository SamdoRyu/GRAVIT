package com.samdoryu.backend.instructor.domain;

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
 * 공용 컨벤션 라이브러리 항목(CONTRACTS.md 「2」 · FR-LIB). 서버 전체에 하나 — 사무실 단위가 아니다. 지우기 API는 없다.
 * 쓰기는 GitHub 계정 강사만(심사용 계정 · 학생은 {@code forbidden_role}) — Service가 검사한다.
 * 다른 강사가 만든 항목도 고칠 수 있고, {@code author}는 만든 강사로 남는다.
 */
@Entity
@Table(name = "convention_library_item")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ConventionLibraryItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ConventionTarget target;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, columnDefinition = "mediumtext")
    private String content;

    @Column(columnDefinition = "text")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_user_id", nullable = false)
    private AppUser author;

    @Column(nullable = false)
    private Instant updatedAt;

    public ConventionLibraryItem(ConventionTarget target, String name, String content, String description,
            AppUser author, Instant at) {
        this.author = Objects.requireNonNull(author);
        update(target, name, content, description, at);
    }

    public void update(ConventionTarget target, String name, String content, String description, Instant at) {
        this.target = Objects.requireNonNull(target);
        this.name = Objects.requireNonNull(name);
        this.content = Objects.requireNonNull(content);
        this.description = description;
        this.updatedAt = Objects.requireNonNull(at);
    }
}

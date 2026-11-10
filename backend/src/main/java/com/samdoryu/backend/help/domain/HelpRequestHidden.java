package com.samdoryu.backend.help.domain;

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
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 도움 요청 "나에게서만 삭제"(#315) — 사용자(AppUser)마다 숨긴 도움 요청. (도움 요청, 사용자)마다 한 행(V7 유일 제약)이고,
 * 해제하면 행을 지운다. 원본 · 코멘트는 그대로이고 다른 사용자에게는 영향이 없다. 행은 {@code HelpRequestService}가
 * 저장소 쿼리로만 만들고 지운다 — 동시에 두 번 숨겨도 한 행만 남게.
 */
@Entity
@Table(name = "help_request_hidden")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class HelpRequestHidden {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "help_request_id", nullable = false)
    private HelpRequest helpRequest;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @Column(nullable = false)
    private Instant hiddenAt;
}

package com.samdoryu.backend.auth.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 보안 심사용 로그인 반복 실패 제한(#165 · CONTRACTS.md 「6」 `[제안]`). 설정에 있는 계정마다 {@link #WINDOW} 안에
 * {@link #MAX_FAILURES}번 틀리면 {@link #LOCK} 동안 맞는 비밀번호도 받지 않는다. 응답은 언제나 같은 {@code unauthorized}다.
 * 서버 하나의 메모리 기록이다 — 다시 켜면 비워진다. 설정에 있는 계정만 기록하므로 계정 수보다 커지지 않는다.
 */
@Slf4j
@Component
public class ReviewLoginThrottle {

    /** [구현 기본값] */
    static final int MAX_FAILURES = 5;
    static final Duration WINDOW = Duration.ofMinutes(15);
    static final Duration LOCK = Duration.ofMinutes(15);

    private record Failures(int count, Instant firstAt, Instant lockedUntil) {
    }

    private final Map<String, Failures> failures = new ConcurrentHashMap<>();
    private final Clock clock;

    public ReviewLoginThrottle() {
        this(Clock.systemUTC());
    }

    /** 테스트용 — 시계를 바꿔 끼운다. Spring은 인자 없는 생성자를 쓴다. */
    public ReviewLoginThrottle(Clock clock) {
        this.clock = clock;
    }

    /** 지금 잠겨 있는가. */
    public boolean isLocked(String username) {
        Failures f = failures.get(username);
        return f != null && f.lockedUntil() != null && clock.instant().isBefore(f.lockedUntil());
    }

    /** 틀린 비밀번호 하나. {@link #MAX_FAILURES}번째면 잠근다. */
    public void failed(String username) {
        Instant now = clock.instant();
        AtomicBoolean lockedNow = new AtomicBoolean();
        failures.compute(username, (name, f) -> {
            if (f != null && f.lockedUntil() != null && now.isBefore(f.lockedUntil())) {
                return f; // 잠긴 동안의 실패는 잠금을 늘리지도 풀지도 않는다
            }
            if (f == null || f.firstAt() == null || !now.isBefore(f.firstAt().plus(WINDOW))) {
                f = new Failures(0, now, null);
            }
            int count = f.count() + 1;
            if (count < MAX_FAILURES) {
                return new Failures(count, f.firstAt(), null);
            }
            lockedNow.set(true);
            return new Failures(0, null, now.plus(LOCK));
        });
        if (lockedNow.get()) {
            log.warn("심사용 로그인 잠금: account={}, {}번 실패, {}까지", username, MAX_FAILURES, now.plus(LOCK));
        }
    }

    /** 맞는 비밀번호 — 실패 기록을 지운다. */
    public void succeeded(String username) {
        failures.remove(username);
    }
}

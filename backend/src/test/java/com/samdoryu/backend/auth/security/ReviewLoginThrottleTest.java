package com.samdoryu.backend.auth.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

/** #165 반복 실패 제한 — 15분 안에 5번 틀리면 15분 잠금 [구현 기본값]. 시계는 테스트가 움직인다. */
class ReviewLoginThrottleTest {

    /** 테스트가 시각을 옮기는 시계 */
    private static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-11-05T03:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }
    }

    private final TestClock clock = new TestClock();
    private final ReviewLoginThrottle throttle = new ReviewLoginThrottle(clock);

    private void fail(String username, int times) {
        for (int i = 0; i < times; i++) {
            throttle.failed(username);
        }
    }

    @Test
    void theFifthFailureLocksForFifteenMinutes() {
        fail("rev", ReviewLoginThrottle.MAX_FAILURES - 1);
        assertThat(throttle.isLocked("rev")).isFalse();

        throttle.failed("rev");
        assertThat(throttle.isLocked("rev")).isTrue();

        clock.advance(ReviewLoginThrottle.LOCK.minusSeconds(1));
        assertThat(throttle.isLocked("rev")).isTrue();
        clock.advance(Duration.ofSeconds(1));
        assertThat(throttle.isLocked("rev")).isFalse();
    }

    @Test
    void failuresWhileLockedNeitherExtendNorLiftTheLock() {
        fail("rev", ReviewLoginThrottle.MAX_FAILURES);
        clock.advance(Duration.ofMinutes(10));
        fail("rev", ReviewLoginThrottle.MAX_FAILURES);

        assertThat(throttle.isLocked("rev")).isTrue();
        clock.advance(ReviewLoginThrottle.LOCK.minus(Duration.ofMinutes(10)));
        assertThat(throttle.isLocked("rev")).isFalse();
    }

    @Test
    void failuresSpreadBeyondTheWindowDoNotLock() {
        fail("rev", ReviewLoginThrottle.MAX_FAILURES - 1);
        clock.advance(ReviewLoginThrottle.WINDOW);
        throttle.failed("rev");

        assertThat(throttle.isLocked("rev")).isFalse();
    }

    @Test
    void aSuccessClearsTheFailures() {
        fail("rev", ReviewLoginThrottle.MAX_FAILURES - 1);
        throttle.succeeded("rev");
        throttle.failed("rev");

        assertThat(throttle.isLocked("rev")).isFalse();
    }

    @Test
    void afterTheLockEndsCountingStartsAgain() {
        fail("rev", ReviewLoginThrottle.MAX_FAILURES);
        clock.advance(ReviewLoginThrottle.LOCK);
        throttle.failed("rev");

        assertThat(throttle.isLocked("rev")).isFalse();
        fail("rev", ReviewLoginThrottle.MAX_FAILURES - 1);
        assertThat(throttle.isLocked("rev")).isTrue();
    }

    @Test
    void accountsAreCountedSeparately() {
        fail("rev-a", ReviewLoginThrottle.MAX_FAILURES);

        assertThat(throttle.isLocked("rev-a")).isTrue();
        assertThat(throttle.isLocked("rev-b")).isFalse();
    }
}

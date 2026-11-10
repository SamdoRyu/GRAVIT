package com.samdoryu.backend.workspace;

import java.util.concurrent.atomic.AtomicLong;
import org.hibernate.SessionEventListener;

/**
 * EXP-FLUSH 테스트 전용 — Hibernate 세션 이벤트로 flush를 센다({@code hibernate.session.events.auto}로 세션마다 붙는다).
 * <ul>
 *   <li>auto-flush 검사: 쿼리 직전마다 호출된다. flush 모드가 AUTO 미만이면 dirty check 없이 끝난다(검사 엔티티 0)</li>
 *   <li>dirty check 패스: auto-flush가 실제로 영속성 컨텍스트 전체를 훑은 횟수(검사 엔티티 &gt; 0)</li>
 *   <li>전체 flush: 명시적 flush · 커밋 flush</li>
 * </ul>
 * 스레드가 섞이지 않게 한 번에 한 요청만 재는 테스트에서 쓴다.
 */
public class FlushCountingListener implements SessionEventListener {

    static final AtomicLong AUTO_FLUSH_CHECKS = new AtomicLong();
    static final AtomicLong DIRTY_CHECK_PASSES = new AtomicLong();
    static final AtomicLong AUTO_FLUSH_ENTITIES = new AtomicLong();
    static final AtomicLong FULL_FLUSHES = new AtomicLong();
    static final AtomicLong FULL_FLUSH_ENTITIES = new AtomicLong();

    static void reset() {
        AUTO_FLUSH_CHECKS.set(0);
        DIRTY_CHECK_PASSES.set(0);
        AUTO_FLUSH_ENTITIES.set(0);
        FULL_FLUSHES.set(0);
        FULL_FLUSH_ENTITIES.set(0);
    }

    static String report() {
        return "autoFlushChecks=" + AUTO_FLUSH_CHECKS + " dirtyCheckPasses=" + DIRTY_CHECK_PASSES
                + " autoFlushEntitiesChecked=" + AUTO_FLUSH_ENTITIES + " fullFlushes=" + FULL_FLUSHES
                + " fullFlushEntities=" + FULL_FLUSH_ENTITIES;
    }

    /** 검사한 엔티티 수는 auto-flush가 영속성 컨텍스트를 실제로 훑었을 때만 0보다 크다(Hibernate 7: 모드가 AUTO 미만이면 건너뜀). */
    @Override
    public void partialFlushEnd(int numberOfEntities, int numberOfCollections) {
        AUTO_FLUSH_CHECKS.incrementAndGet();
        AUTO_FLUSH_ENTITIES.addAndGet(numberOfEntities);
        if (numberOfEntities > 0) {
            DIRTY_CHECK_PASSES.incrementAndGet();
        }
    }

    @Override
    public void flushEnd(int numberOfEntities, int numberOfCollections) {
        FULL_FLUSHES.incrementAndGet();
        FULL_FLUSH_ENTITIES.addAndGet(numberOfEntities);
    }
}

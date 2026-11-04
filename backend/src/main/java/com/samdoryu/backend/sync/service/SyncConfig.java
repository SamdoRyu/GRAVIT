package com.samdoryu.backend.sync.service;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.task.TaskExecutor;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

/**
 * 동기화 실행 환경 — 수동 동기화용 스레드 풀, 5분 폴링, 서버 시작 때 멈춘 동기화 정리. 스케줄링(@Scheduled)은 여기서 켠다
 * (SSE keep-alive도 쓴다).
 */
@Configuration
@EnableScheduling
public class SyncConfig {

    static final String SYNC_EXECUTOR = "syncExecutor";

    /** 수동 동기화를 요청 스레드 밖에서 돌린다. 사무실마다 한 번에 하나라 작게 둔다. */
    @Bean(name = SYNC_EXECUTOR)
    TaskExecutor syncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("sync-");
        executor.initialize();
        return executor;
    }

    /**
     * 자동 폴링 — 5분마다(CONTRACTS_API.md 「4」 상수). 끄려면 {@code app.sync.polling-enabled=false}.
     * 명세 문서는 폴링에서 다시 읽지 않는다(2026-10-28 결정 — #14).
     */
    @Component
    @ConditionalOnProperty(name = "app.sync.polling-enabled", havingValue = "true", matchIfMissing = true)
    static class SyncPoller {

        private final SyncService syncService;

        SyncPoller(SyncService syncService) {
            this.syncService = syncService;
        }

        @Scheduled(fixedDelay = 5, initialDelay = 5, timeUnit = TimeUnit.MINUTES)
        void poll() {
            syncService.pollAll();
        }
    }

    /** 서버가 동기화 도중 꺼졌다면 실행 중 표시가 남는다 — 시작할 때 실패로 정리해 계속 409가 되지 않게 한다(단일 서버). */
    @Slf4j
    @Component
    static class InterruptedSyncCleaner {

        private final SyncStateRecorder recorder;

        InterruptedSyncCleaner(SyncStateRecorder recorder) {
            this.recorder = recorder;
        }

        @EventListener(ApplicationReadyEvent.class)
        void clean() {
            try {
                List<Long> workspaceIds = recorder.failInterrupted(Instant.now());
                if (!workspaceIds.isEmpty()) {
                    log.warn("멈췄던 동기화를 실패로 정리함: workspaces={}", workspaceIds);
                }
            } catch (RuntimeException e) {
                // DB를 못 읽으면 서버는 그대로 뜨고, 남은 실행 중 표시는 다음 시작 때 다시 정리한다
                log.error("멈춘 동기화 정리 실패", e);
            }
        }
    }
}

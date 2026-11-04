package com.samdoryu.backend.realtime;

import com.samdoryu.backend.auth.domain.WorkspaceRole;
import com.samdoryu.backend.auth.service.AppPrincipal;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.instructor.service.InstructorAssignmentService;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.web.session.HttpSessionDestroyedEvent;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 사무실별 SSE 연결과 이벤트 보내기(CONTRACTS_API.md 「6」 · CONTRACTS.md 「6」 SSE).
 * <ul>
 *   <li>연결은 Controller가 로그인 · 사무실 접근을 검사한 뒤에만 등록한다.</li>
 *   <li>이벤트에는 자원 종류 · 동기화 상태만 담는다 — 화면은 권한 검사를 거친 REST로 다시 읽는다.</li>
 *   <li>쓰기 쪽은 {@link #publishChangeAfterCommit}을 부른다 — 트랜잭션이 커밋된 뒤에만 나간다.</li>
 *   <li>30초마다 keep-alive 주석({@code : ping}). 그때 강사 지정이 풀렸으면 그 연결을 닫는다.</li>
 *   <li>세션이 끝나면(로그아웃 · 만료) 그 세션의 연결을 닫는다.</li>
 * </ul>
 */
@Slf4j
@Component
public class WorkspaceEventHub {

    /** 연결 유지 시간 — 세션 만료(60분)와 같다. 화면(EventSource)은 끊기면 다시 연결하고 Snapshot을 다시 읽는다. */
    static final Duration EMITTER_TIMEOUT = Duration.ofMinutes(60);
    static final String CHANGE = "change";
    static final String SYNC = "sync";

    private record Subscription(WorkspaceAccess access, AppPrincipal principal, String sessionId,
            SseEmitter emitter) {
    }

    private final Map<Long, Set<Subscription>> subscriptions = new ConcurrentHashMap<>();
    private final InstructorAssignmentService instructorAssignmentService;

    public WorkspaceEventHub(InstructorAssignmentService instructorAssignmentService) {
        this.instructorAssignmentService = instructorAssignmentService;
    }

    /** 검사를 마친 연결을 등록한다. */
    public SseEmitter subscribe(WorkspaceAccess access, AppPrincipal principal, String sessionId) {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT.toMillis());
        Subscription subscription = new Subscription(access, principal, sessionId, emitter);
        Set<Subscription> set = subscriptions.computeIfAbsent(access.workspaceId(), id -> ConcurrentHashMap.newKeySet());
        set.add(subscription);
        Runnable remove = () -> set.remove(subscription);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(error -> remove.run());
        return emitter;
    }

    /** 커밋된 뒤에 {@code change}를 보낸다. 트랜잭션 밖에서 부르면 바로 보낸다. */
    public void publishChangeAfterCommit(Long workspaceId, SnapshotResource... resources) {
        ChangeEvent event = new ChangeEvent(List.of(resources), Instant.now());
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send(workspaceId, CHANGE, event);
                }
            });
        } else {
            send(workspaceId, CHANGE, event);
        }
    }

    /** 동기화가 끝난 뒤(상태 기록이 커밋된 뒤) 부른다. */
    public void publishSync(Long workspaceId, Object syncStatus) {
        send(workspaceId, SYNC, syncStatus);
    }

    private void send(Long workspaceId, String name, Object data) {
        for (Subscription subscription : subscriptions.getOrDefault(workspaceId, Set.of())) {
            try {
                subscription.emitter().send(SseEmitter.event().name(name).data(data));
            } catch (IOException | IllegalStateException e) {
                close(subscription);
            }
        }
    }

    /** 30초마다 keep-alive. 강사 지정이 풀린 연결은 닫는다(지정은 요청마다 DB 확인 — 「6」). */
    @Scheduled(fixedRate = 30, timeUnit = TimeUnit.SECONDS)
    public void keepAlive() {
        for (Set<Subscription> set : subscriptions.values()) {
            for (Subscription subscription : set) {
                if (!stillAllowed(subscription)) {
                    close(subscription);
                    continue;
                }
                try {
                    subscription.emitter().send(SseEmitter.event().comment("ping"));
                } catch (IOException | IllegalStateException e) {
                    close(subscription);
                }
            }
        }
    }

    private boolean stillAllowed(Subscription subscription) {
        if (subscription.access().role() != WorkspaceRole.INSTRUCTOR) {
            return true;
        }
        return instructorAssignmentService.isCurrentlyAssigned(subscription.access().workspaceId(),
                subscription.principal().githubUserId());
    }

    /** 로그아웃 · 세션 만료 — 그 세션의 연결을 닫는다. */
    @EventListener
    public void onSessionDestroyed(HttpSessionDestroyedEvent event) {
        String sessionId = event.getId();
        for (Set<Subscription> set : subscriptions.values()) {
            for (Subscription subscription : set) {
                if (subscription.sessionId().equals(sessionId)) {
                    close(subscription);
                }
            }
        }
    }

    private void close(Subscription subscription) {
        Set<Subscription> set = subscriptions.get(subscription.access().workspaceId());
        if (set != null) {
            set.remove(subscription);
        }
        try {
            subscription.emitter().complete();
        } catch (IllegalStateException e) {
            log.debug("이미 닫힌 SSE 연결");
        }
    }

    /** 테스트 · 진단용 — 사무실의 열린 연결 수. */
    int connectionCount(Long workspaceId) {
        return subscriptions.getOrDefault(workspaceId, Set.of()).size();
    }
}

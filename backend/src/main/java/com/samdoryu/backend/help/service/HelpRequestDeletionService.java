package com.samdoryu.backend.help.service;

import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.help.domain.HelpRequest;
import com.samdoryu.backend.meeting.service.AgendaItemService;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 도움 요청 "모두에게서 영구 삭제"(#315 ②) — 도움 요청과 그 안건을 한 트랜잭션으로 묶는다. {@code AgendaItemService}가 이미
 * {@link HelpRequestService}에 기대고 있어(전환 · 거두기 · 결정) 거꾸로 부르면 순환 의존이 되므로 둘을 함께 부르는 자리를 따로 둔다.
 * 어느 단계가 실패하든 전부 롤백된다.
 */
@Service
public class HelpRequestDeletionService {

    private final HelpRequestService helpRequestService;
    private final AgendaItemService agendaItemService;
    private final WorkspaceEventHub eventHub;

    public HelpRequestDeletionService(HelpRequestService helpRequestService, AgendaItemService agendaItemService,
            WorkspaceEventHub eventHub) {
        this.helpRequestService = helpRequestService;
        this.agendaItemService = agendaItemService;
        this.eventHub = eventHub;
    }

    /**
     * 검사 순서는 대상(404) → 요청자(403)이고 상태와 상관없이 지운다. 안건 연결 끊기 → 도움 요청 · 코멘트 · 숨김 행 삭제 순서다.
     * 커밋 뒤 {@code help_requests} 변경 알림, 안건이 바뀌었으면 {@code agenda_items}도 함께.
     */
    @Transactional
    public void delete(WorkspaceAccess access, Long helpRequestId) {
        HelpRequest helpRequest = helpRequestService.lockForPermanentDelete(access, helpRequestId);
        boolean agendaChanged = agendaItemService.detachDeletedHelpRequest(access.workspaceId(), helpRequestId);
        helpRequestService.deletePermanently(helpRequest);
        if (agendaChanged) {
            eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.HELP_REQUESTS,
                    SnapshotResource.AGENDA_ITEMS);
        } else {
            eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.HELP_REQUESTS);
        }
    }
}

package com.samdoryu.backend.meeting.controller;

import com.samdoryu.backend.auth.service.AuthorizationService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.meeting.dto.StandupDto;
import com.samdoryu.backend.meeting.dto.StandupSaveRequest;
import com.samdoryu.backend.meeting.service.StandupService;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 스탠드업 — CONTRACTS_API 「12」. 날짜는 사무실 접근 검사 뒤에 읽는다 — 권한 없는 사무실은 날짜와 상관없이 {@code 404}.
 * "막힌 것" → 도움 요청은 화면이 {@code POST W/help-requests}({@code fromStandupId})로 한다.
 */
@RestController
@RequestMapping("/api/workspaces/{workspaceId}/standups")
public class StandupController {

    private final AuthorizationService authorizationService;
    private final StandupService standupService;

    public StandupController(AuthorizationService authorizationService, StandupService standupService) {
        this.authorizationService = authorizationService;
        this.standupService = standupService;
    }

    /** 접근 — 팀원 · 지정된 강사. {@code date} 없음 · 형식 오류는 {@code invalid}. */
    @GetMapping
    public List<StandupDto> list(@PathVariable String workspaceId, @RequestParam(required = false) String date) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        return standupService.listByDate(access.workspaceId(), parseDate(date));
    }

    /** 팀원 — 강사는 {@code forbidden_role}. 있으면 고치고 없으면 만든다. */
    @PutMapping("/{date}/mine")
    public StandupDto saveMine(@PathVariable String workspaceId, @PathVariable String date,
            @Valid @RequestBody StandupSaveRequest request) {
        WorkspaceAccess access = authorizationService.requireWorkspaceAccess(workspaceId);
        Long memberId = access.requireTeamMember();
        return standupService.saveMine(access.workspaceId(), memberId, parseDate(date), request);
    }

    /** {@code YYYY-MM-DD}(한국 시간 달력 날짜). 없거나 형식이 틀리면 {@code invalid}. */
    private static LocalDate parseDate(String date) {
        if (date == null) {
            throw new ApiException(ErrorCode.INVALID, "날짜(YYYY-MM-DD)가 필요해요");
        }
        try {
            return LocalDate.parse(date);
        } catch (DateTimeParseException e) {
            throw new ApiException(ErrorCode.INVALID, "날짜는 YYYY-MM-DD 형식이에요");
        }
    }
}

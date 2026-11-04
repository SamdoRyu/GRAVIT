package com.samdoryu.backend.workspace.service;

import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.workspace.domain.Member;
import com.samdoryu.backend.workspace.domain.Workspace;
import com.samdoryu.backend.workspace.repository.MemberRepository;
import com.samdoryu.backend.workspace.repository.WorkspaceRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 사무실 · 팀원 읽기. 다른 패키지는 이 Service로 사무실과 팀원을 읽는다(Repository 직접 사용 금지). */
@Service
public class WorkspaceService {

    private final WorkspaceRepository workspaceRepository;
    private final MemberRepository memberRepository;

    public WorkspaceService(WorkspaceRepository workspaceRepository, MemberRepository memberRepository) {
        this.workspaceRepository = workspaceRepository;
        this.memberRepository = memberRepository;
    }

    /** 사무실이 없으면 {@code not_found}. 접근 권한 검사는 하지 않는다 — Controller가 인가 서비스로 먼저 한다. */
    @Transactional(readOnly = true)
    public Workspace requireWorkspace(Long workspaceId) {
        return workspaceRepository.findById(workspaceId).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
    }

    /** 지금 팀원(빠진 팀원 제외). */
    @Transactional(readOnly = true)
    public List<Member> currentMembers(Long workspaceId) {
        return memberRepository.findByWorkspaceIdAndRemovedAtIsNull(workspaceId);
    }
}

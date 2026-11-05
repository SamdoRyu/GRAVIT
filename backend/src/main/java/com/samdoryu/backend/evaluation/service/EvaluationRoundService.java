package com.samdoryu.backend.evaluation.service;

import com.samdoryu.backend.auth.domain.AppUser;
import com.samdoryu.backend.auth.service.AppUserService;
import com.samdoryu.backend.auth.service.WorkspaceAccess;
import com.samdoryu.backend.common.error.ApiException;
import com.samdoryu.backend.common.error.ErrorCode;
import com.samdoryu.backend.common.id.Ids;
import com.samdoryu.backend.evaluation.domain.Evaluation;
import com.samdoryu.backend.evaluation.domain.EvaluationRound;
import com.samdoryu.backend.evaluation.domain.RoundOpenedReason;
import com.samdoryu.backend.evaluation.dto.EvaluateRequest;
import com.samdoryu.backend.evaluation.dto.EvaluationRoundDto;
import com.samdoryu.backend.evaluation.repository.EvaluationRepository;
import com.samdoryu.backend.evaluation.repository.EvaluationRoundRepository;
import com.samdoryu.backend.realtime.SnapshotResource;
import com.samdoryu.backend.realtime.WorkspaceEventHub;
import com.samdoryu.backend.sync.domain.Submission;
import com.samdoryu.backend.sync.domain.SubmissionState;
import com.samdoryu.backend.sync.service.SyncedItemService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * PR 평가 · 평가 회차(CONTRACTS_API 「9」, CONTRACTS.md 「3」 평가 회차 · 「5」 익명성 · FR-LRN-01 · 02).
 * <ul>
 *   <li>회차는 동기화가 연다 — 이 Issue(#19)는 새 PR의 1회차({@code new_pr})만. 새 커밋 · 회의 재평가 회차는 #46.</li>
 *   <li>평가자는 1인 1회 · 작성자 제외 검사와 {@code myEvaluation}을 고르는 데만 쓰고 어느 응답에도 담지 않는다.</li>
 * </ul>
 * 인가 검사 순서 1 · 2는 Controller가 끝낸 뒤 부른다. 여기서는 순서 3(대상 404) → 4(역할 403) → 5(작성자 403 · 상태 409)를 본다.
 */
@Service
public class EvaluationRoundService {

    private final EvaluationRoundRepository evaluationRoundRepository;
    private final EvaluationRepository evaluationRepository;
    private final SyncedItemService syncedItemService;
    private final AppUserService appUserService;
    private final WorkspaceEventHub eventHub;

    public EvaluationRoundService(EvaluationRoundRepository evaluationRoundRepository,
            EvaluationRepository evaluationRepository, SyncedItemService syncedItemService,
            AppUserService appUserService, WorkspaceEventHub eventHub) {
        this.evaluationRoundRepository = evaluationRoundRepository;
        this.evaluationRepository = evaluationRepository;
        this.syncedItemService = syncedItemService;
        this.appUserService = appUserService;
        this.eventHub = eventHub;
    }

    /** 제출의 현재 회차(회차 번호가 가장 큰 것) ID. 아직 회차가 없으면 null. */
    @Transactional(readOnly = true)
    public Long currentRoundId(Long submissionId) {
        return evaluationRoundRepository.findFirstBySubmissionIdOrderByRoundNumberDesc(submissionId)
                .map(EvaluationRound::getId)
                .orElse(null);
    }

    /**
     * 동기화가 PR을 저장한 뒤 부른다 — 회차가 하나도 없는 PR에 1회차({@code new_pr}, 그때의 {@code headSha})를 연다.
     * 이미 회차가 있으면 아무것도 하지 않는다.
     * <p>
     * [구현 기본값 — #19] 처음 동기화 때 이미 머지 · 닫힌 PR도 1회차를 연다(「3」 "동기화로 새 PR이 들어옴"). 평가는 받지 않지만
     * {@code currentRound}가 null이 아니라 0 · 0으로 보인다. 이 기능 전에 저장된 PR은 다음에 GitHub에서 바뀌어 다시 읽힐 때 열린다.
     */
    @Transactional
    public void openFirstRoundIfAbsent(Submission submission, Instant now) {
        if (evaluationRoundRepository.findFirstBySubmissionIdOrderByRoundNumberDesc(submission.getId()).isPresent()) {
            return;
        }
        evaluationRoundRepository.save(
                new EvaluationRound(submission, 1, submission.getHeadSha(), RoundOpenedReason.NEW_PR, now));
    }

    /** {@code GET W/submissions/{id}/rounds} — 접근 가능한 사람 전부. 회차 번호 내림차순(현재 회차가 처음). */
    @Transactional(readOnly = true)
    public List<EvaluationRoundDto> listRounds(WorkspaceAccess access, Long submissionId) {
        Submission submission = syncedItemService.requireSubmission(access.workspaceId(), submissionId);
        List<EvaluationRound> rounds = evaluationRoundRepository.findBySubmissionIdOrderByRoundNumberDesc(
                submission.getId());
        Map<Long, List<Evaluation>> evaluations = evaluationsByRound(rounds);
        boolean canEvaluateCurrent = canEvaluate(access, submission, viewer(access));
        return rounds.stream()
                .map(round -> EvaluationRoundDto.of(round, evaluations.getOrDefault(round.getId(), List.of()),
                        access.userId(), canEvaluateCurrent && round == rounds.getFirst()))
                .toList();
    }

    /** Snapshot {@code submissions[].currentRound} 조각 — PR ID → 현재 회차. 회차가 없는 PR은 빠진다. */
    @Transactional(readOnly = true)
    public Map<Long, EvaluationRoundDto> currentRounds(WorkspaceAccess access) {
        List<EvaluationRound> rounds = evaluationRoundRepository.findCurrentRoundsInWorkspace(access.workspaceId());
        Map<Long, List<Evaluation>> evaluations = evaluationsByRound(rounds);
        AppUser viewer = viewer(access);
        return rounds.stream().collect(Collectors.toMap(
                round -> round.getSubmission().getId(),
                round -> EvaluationRoundDto.of(round, evaluations.getOrDefault(round.getId(), List.of()),
                        access.userId(), canEvaluate(access, round.getSubmission(), viewer))));
    }

    /**
     * {@code PUT W/submissions/{id}/evaluations/mine} — 내 평가를 처음이면 만들고, 있으면 고친다(1인 1회).
     * 회차 ID 형식 {@code invalid} → PR 없음 {@code not_found} → 강사 · 작성자 {@code forbidden_role} →
     * 닫힌 PR · 현재 회차가 아님 {@code conflict}. 이유 검사({@code invalid})는 #20 — 그 전에는 {@link Evaluation}이
     * 1~200자가 아닌 이유를 저장하지 않는다.
     */
    @Transactional
    public EvaluationRoundDto evaluate(WorkspaceAccess access, Long submissionId, EvaluateRequest request,
            Instant now) {
        String reason = request.reason();
        Long roundId = Ids.fromBody(request.roundId());
        Submission submission = syncedItemService.requireSubmission(access.workspaceId(), submissionId);
        access.requireTeamMember();
        AppUser evaluator = viewer(access);
        if (isAuthor(access, submission, evaluator)) {
            throw new ApiException(ErrorCode.FORBIDDEN_ROLE, "자기 PR은 평가할 수 없어요");
        }
        if (!acceptsEvaluations(submission)) {
            throw new ApiException(ErrorCode.CONFLICT, "머지되거나 닫힌 PR은 평가를 받지 않아요");
        }
        // 현재 회차만 받는다 — 그 사이 새 회차가 열렸으면 이전 회차 평가가 새 회차에 섞이지 않게 거절한다
        EvaluationRound round = evaluationRoundRepository.findFirstBySubmissionIdOrderByRoundNumberDesc(
                        submission.getId())
                .filter(current -> current.getId().equals(roundId))
                .orElseThrow(() -> new ApiException(ErrorCode.CONFLICT, "새 평가 회차가 열렸어요. 다시 불러와 주세요"));

        evaluationRepository.findByRoundIdAndEvaluatorId(round.getId(), evaluator.getId()).ifPresentOrElse(
                mine -> mine.revise(request.verdict(), reason, now),
                () -> evaluationRepository.save(new Evaluation(round, evaluator, request.verdict(), reason, now)));
        try {
            evaluationRepository.flush();
        } catch (DataIntegrityViolationException e) {
            // 같은 사람이 같은 회차에 동시에 처음 평가 — (회차, 평가자) 유일 제약
            throw new ApiException(ErrorCode.CONFLICT, "평가가 동시에 저장됐어요. 다시 불러와 주세요");
        }
        eventHub.publishChangeAfterCommit(access.workspaceId(), SnapshotResource.SUBMISSIONS);
        return EvaluationRoundDto.of(round, evaluationRepository.findByRoundIdOrderByIdAsc(round.getId()),
                access.userId(), true);
    }

    private Map<Long, List<Evaluation>> evaluationsByRound(List<EvaluationRound> rounds) {
        if (rounds.isEmpty()) {
            return Map.of();
        }
        return evaluationRepository.findByRoundIdInOrderByIdAsc(rounds.stream().map(EvaluationRound::getId).toList())
                .stream()
                .collect(Collectors.groupingBy(evaluation -> evaluation.getRound().getId()));
    }

    private AppUser viewer(WorkspaceAccess access) {
        return appUserService.require(access.userId());
    }

    /** 현재 회차에 지금 평가할 수 있는지 — 화면 표시용(서버는 평가 요청 때 다시 검사한다). */
    private static boolean canEvaluate(WorkspaceAccess access, Submission submission, AppUser viewer) {
        return access.role().isTeamMember() && !isAuthor(access, submission, viewer)
                && acceptsEvaluations(submission);
    }

    /**
     * 작성자 판정은 내부 ID와 GitHub 사용자 ID로만 한다(CONTRACTS.md 「6」 식별자 원칙). 팀원 매칭이 늦어 작성자 팀원이
     * 비어 있어도 GitHub 사용자 ID가 같으면 작성자다.
     */
    private static boolean isAuthor(WorkspaceAccess access, Submission submission, AppUser viewer) {
        if (submission.getAuthorMember() != null && access.isSelf(submission.getAuthorMember().getId())) {
            return true;
        }
        return viewer.getGithubUserId() != null && viewer.getGithubUserId().equals(submission.getAuthorGithubUserId());
    }

    /** 열린 PR(Draft 포함)만 평가를 받는다. 머지 · 닫히면 마지막 회차는 그대로 보인다. */
    private static boolean acceptsEvaluations(Submission submission) {
        return submission.getState() == SubmissionState.OPEN || submission.getState() == SubmissionState.DRAFT;
    }
}

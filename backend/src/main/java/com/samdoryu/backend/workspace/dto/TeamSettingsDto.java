package com.samdoryu.backend.workspace.dto;

import com.samdoryu.backend.workspace.domain.TeamSettings;
import java.time.LocalDate;

/** 팀 설정 — CONTRACTS_API 「5」 TeamSettings(Entity와 이름이 겹쳐 {@code Dto}를 붙였다). */
public record TeamSettingsDto(
        LocalDate projectStartDate,
        LocalDate projectEndDate,
        String specDocumentPath,
        int reviewWaitHours,
        int noCommitHours) {

    public static TeamSettingsDto of(TeamSettings settings) {
        return new TeamSettingsDto(settings.getProjectStartDate(), settings.getProjectEndDate(),
                settings.getSpecDocumentPath(), settings.getReviewWaitHours(), settings.getNoCommitHours());
    }
}

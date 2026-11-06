package com.samdoryu.backend.activity.dto;

import jakarta.validation.constraints.NotNull;

/** {@code PUT W/activity-consent} 요청 — CONTRACTS_API 「14」. */
public record ActivityConsentRequest(@NotNull Boolean consented) {
}

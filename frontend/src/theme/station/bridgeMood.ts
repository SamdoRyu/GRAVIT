// 회의 중 브리지 연출(#299)이 정거장 불빛 · 안건 도형에 알려 주는 값. 소유: C.
// focus 0 ~ 1 = 회의가 진행되는 정도(부드럽게 차오르고 빠진다) — 정거장 나머지 불빛이 그만큼 살짝 어두워진다(ambient.tsx).
// spin · angle = 안건 도형이 탁자 위를 도는 세기와 지금 각도(라디안, -π ~ π — scene/TaskBox).
// scene/MeetingRoomState가 매 프레임 쓴다.
export const bridgeMood = { focus: 0, spin: 0, angle: 0 }

// 목업 데이터. 실제 연동 시 이 모양 그대로 서버(서블릿) JSON 응답으로 바꾸면 됨.
// 3D 씬 안의 화물 배치는 아직 scene/station.js에 고정 좌표로 들어 있음 (README의 "다음 범위" 참고).

export const repo = {
  name: 'team3/pet-walk-matching',
  syncedAgo: '3분 전',
  syncedAt: '14:32'
};

export const me = 'K';

export const members = {
  K: { login: 'dev-kim', color: '#5fc4b8' },
  L: { login: 'dev-lee', color: '#f29a52' },
  P: { login: 'dev-park', color: '#b39ae6' },
  C: { login: 'dev-choi', color: '#f2a7b8' }
};

export const metrics = [
  { value: 5, label: '이유 달린 리뷰' },
  { value: 1, label: '해결한 도움 요청' },
  { value: 1, label: '기록한 결정' }
];

export const views = [
  { id: 'default', label: '기본' },
  { id: 'blocked', label: '막힘', count: 3 },
  { id: 'learn', label: '배움', todo: true },
  { id: 'recent', label: '최근 변화', todo: true }
];

export const blockedSummary = { crew: 1, cargo: 2, rule: '이슈 3일 · 리뷰 대기 2일 기준' };

// 도형: cube(이슈) prism(PR) sphere(도움 요청) octa(배운 점) pad(기타 기록) holo(앱이 찾은 후보)
export const board = {
  help: [
    { title: 'JPA 연관관계 매핑이 계속 실패해요', author: 'P', when: '2시간 전', status: 'discuss', comments: 3 },
    { title: 'GitHub Actions에서만 테스트가 깨져요', author: 'C', when: '어제', status: 'solved', comments: 5, note: '타임존 설정이 원인' }
  ],
  learned: [
    { title: '@Transactional은 같은 클래스 안에서 호출하면 프록시를 거치지 않는다', author: 'L', from: 'PR #21 리뷰에서' }
  ],
  decisions: [
    { title: '브랜치 이름은 feat/이슈번호-요약으로 통일', meta: '10/30 회의 · 찬성 4 · 이유 3개 기록', followUp: '다음 회의에서 후속 확인' }
  ],
  rules: 4,
  notices: 1
};

export const agenda = {
  minutes: 14,
  confirmed: [
    { shape: 'cube', title: '#3 로그인 세션 만료 처리', sub: '완료 선반에서 다시 꺼냄 · 닫힌 이슈', reopened: true },
    { shape: 'prism', title: 'PR #21 산책 매칭 요청 API', sub: '해결 안 된 리뷰 스레드 2', badge: 'talk', link: 'pr21' },
    { shape: 'sphere', title: 'JPA 연관관계 매핑이 계속 실패해요', sub: 'dev-park · 코멘트 3' },
    { shape: 'octa', title: '@Transactional 자기 호출 함정', sub: '배운 점 · dev-lee' },
    { shape: 'pad', title: '브랜치 이름 규칙, 잘 지켜지고 있나?', sub: '10/30 결정 후속 확인', badge: 'check' }
  ],
  candidates: [
    { shape: 'holo', title: '#9 회원가입 유효성 검사', sub: '담당자 없이 6일째 백로그 선반에 있어요' }
  ]
};

export const prDetail = {
  pr21: {
    number: 21,
    title: '산책 매칭 요청 API 추가',
    where: '검토 영역에서 리뷰 중',
    assignee: 'L',
    issue: '#14 산책 매칭 거리 기준 정하기',
    review: '해결 안 된 스레드 2 · 리뷰어 2명',
    branch: 'feat/14-match-request',
    votes: [
      { kind: 'clean', who: 'C', reason: '거리 계산을 테스트로 고정해 둬서 기준이 바뀌어도 안심돼요.' },
      { kind: 'smell', who: 'P', reason: 'MatchRequest와 Member를 꼭 양방향으로 매핑해야 할까요? 목록 조회에서 N+1이 생길 것 같아요.' }
    ],
    url: 'https://github.com/',
    onAgenda: true
  }
};

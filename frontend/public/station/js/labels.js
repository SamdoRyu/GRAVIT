// 3D 좌표를 화면 좌표로 바꾼 라벨 목록을 HTML로 그림 (scene/station.js의 onLabels 콜백에서 호출)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TF = {
  center: 'translate(-50%, -50%)',
  above: 'translate(-50%, -100%)',
  below: 'translate(-50%, 0)',
  right: 'translate(0, -50%)',
  left: 'translate(-100%, -50%)'
};

const BADGE = {
  talk: ['해결 안 된 리뷰 스레드', '<circle r="7.4" fill="#232a5c" stroke="#fffaf0" stroke-width="1.4"/><path d="M-3.5 -3.2 h7 a1.4 1.4 0 0 1 1.4 1.4 v3 a1.4 1.4 0 0 1 -1.4 1.4 h-3.2 l-2.6 2 v-2 h-1.2 a1.4 1.4 0 0 1 -1.4 -1.4 v-3 a1.4 1.4 0 0 1 1.4 -1.4 z" fill="#fffaf0"/>'],
  conflict: ['병합 충돌', '<circle r="7.4" fill="#232a5c" stroke="#fffaf0" stroke-width="1.4"/><path d="M1.2 -5 L-3 1 L0 1 L-1.2 5 L3 -1 L0 -1 Z" fill="#ffb36b"/>'],
  clock: ['PR 없이 오래 작업 중', '<circle r="7.4" fill="#232a5c" stroke="#fffaf0" stroke-width="1.4"/><circle r="4" fill="none" stroke="#fffaf0" stroke-width="1.4"/><path d="M0 -2.4 V0 L1.8 1.2" stroke="#fffaf0" stroke-width="1.4" fill="none" stroke-linecap="round"/>'],
  warn: ['오래 방치됨', '<circle r="7.4" fill="#f29a52" stroke="#fffaf0" stroke-width="1.4"/><path d="M0 -4.6 L4.4 3.2 L-4.4 3.2 Z" fill="#232a5c"/><rect x="-.6" y="-1.8" width="1.2" height="2.8" fill="#ffd2a6"/><rect x="-.6" y="1.6" width="1.2" height="1" fill="#ffd2a6"/>'],
  check: ['지난 회의 결정 후속 확인', '<circle r="7.4" fill="#232a5c" stroke="#fffaf0" stroke-width="1.4"/><path d="M-3 0 L-1 2.2 L3.2 -2.2" stroke="#8ff0e0" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>']
};

function one(l) {
  const pos = `left:${l.x}px;top:${l.y}px;transform:${TF[l.align || 'center']}`;
  switch (l.kind) {
    case 'module':
      return `<div class="lbl lbl-module" style="${pos}">${esc(l.text)}</div>`;
    case 'badge': {
      const b = BADGE[l.b] || BADGE.talk;
      return `<div class="lbl lbl-badge" style="${pos}"><svg width="22" height="22" viewBox="-8 -8 16 16" role="img" aria-label="${b[0]}">${b[1]}</svg></div>`;
    }
    case 'avatar':
      return `<div class="lbl lbl-avatar" style="${pos};background:${esc(l.color)}">${esc(l.text)}</div>`;
    case 'name':
      return `<div class="lbl lbl-name" style="${pos}">${esc(l.text)}</div>`;
    case 'tag':
      return `<div class="lbl lbl-tag" style="${pos};border:${esc(l.border || '1px solid rgba(143,240,224,.5)')}"><b>${esc(l.text)}</b>${l.sub ? `<span style="color:${esc(l.subColor || '#c3cbe6')}">${esc(l.sub)}</span>` : ''}</div>`;
    case 'callout':
      return `<div class="lbl lbl-callout" style="${pos}"><b>${esc(l.text)}</b><span>${esc(l.sub)}</span></div>`;
    case 'bubble':
      return `<div class="lbl lbl-bubble" style="${pos}"><span>${esc(l.sub)}</span><b>${esc(l.text)}</b><i></i></div>`;
    case 'rescue':
      return `<div class="lbl lbl-rescue" style="${pos}"><svg width="28" height="28" viewBox="-14 -14 28 28" role="img" aria-label="구조 신호: 도움 요청 중"><circle r="13" fill="#ffb36b" opacity=".3"><animate attributeName="r" values="9;13.5;9" dur="2.2s" repeatCount="indefinite"/></circle><circle r="9.5" fill="#ffb36b" stroke="#fffaf0" stroke-width="1.5"/><circle r="5" fill="none" stroke="#e2604a" stroke-width="3"/><circle r="5" fill="none" stroke="#fffaf0" stroke-width="3" stroke-dasharray="3.9 3.9"/></svg></div>`;
    case 'leader':
      return `<div class="lbl lbl-leader" style="left:${l.x}px;top:${l.y}px;width:${l.len}px;transform:rotate(${l.ang}deg)"></div>`;
    default:
      return '';
  }
}

export function renderLabels(container, labels) {
  container.innerHTML = labels.map(one).join('');
}

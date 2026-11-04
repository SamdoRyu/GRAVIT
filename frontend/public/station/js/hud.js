// HUD(상단 바, 사이드바, PR 상세 패널, 레이더 미니맵 + 범례) 렌더링
import { repo, me, members, metrics, views, blockedSummary, board, agenda, prDetail } from './data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shape = (id, size = 34, extra = '') => `<svg class="shape" width="${size}" height="${size}" aria-hidden="true"><use href="#s-${id}"/></svg>${extra}`;
const avatar = (id, size = 18) => `<span class="mini-av" style="width:${size}px;height:${size}px;background:${members[id].color}">${id}</span>`;
const commentIcon = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 3 h10 v6 h-5 l-3 2.5 v-2.5 h-2 z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';

// ---------- 상단 바 + 정보 뷰 스위치 ----------
export function renderTopBar(el, state) {
  const meeting = state.view === 'meeting';
  const activeView = state.view === 'blocked' ? 'blocked' : 'default';
  el.innerHTML = `
  <header class="topbar panel">
    <div class="brand">
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="7.5" fill="#f6b9b0"/><ellipse cx="15" cy="15" rx="13.5" ry="5" fill="none" stroke="#8ff0e0" stroke-width="1.6" transform="rotate(-20 15 15)"/><rect x="23" y="6" width="4" height="4" fill="#fffaf0" transform="rotate(45 25 8)"/></svg>
      <span>GitVillage</span>
    </div>
    <button type="button" class="repo" aria-label="정거장(레포) 바꾸기">
      <svg width="22" height="22" aria-hidden="true"><use href="#s-cube"/></svg>
      <span class="stack"><small>정거장</small><b>${esc(repo.name)}</b></span>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 L6 7.5 L9 4.5" stroke="#aab5d8" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>
    </button>
    <div class="divider"></div>
    <section class="metrics" aria-label="이번 주 학습 지표">
      <small>이번 주</small>
      ${metrics.map((m) => `<div class="metric"><b>${m.value}</b><span>${esc(m.label)}</span></div>`).join('')}
    </section>
    <div class="spacer"></div>
    <div class="sync"><small>지상 통신 수신</small><b>${esc(repo.syncedAgo)} · ${esc(repo.syncedAt)}</b></div>
    <button type="button" class="btn ${meeting ? 'btn-teal' : 'btn-outline'}" data-action="meeting" aria-pressed="${meeting}">
      ${meeting ? `회의 중 · ${agenda.minutes}분` : '회의'}<span class="count">${agenda.confirmed.length}</span>
    </button>
    <button type="button" class="btn btn-orange" data-action="create">+ 만들기</button>
    <button type="button" class="me" aria-label="내 메뉴 (${members[me].login})">${avatar(me, 36)}</button>
  </header>
  <div class="viewrow">
    <div class="seg panel" role="group" aria-label="정보 뷰">
      ${views.map((v) => `<button type="button" data-view="${v.id}" aria-pressed="${v.id === activeView && !meeting}">${esc(v.label)}${v.count ? `<span class="count">${v.count}</span>` : ''}</button>`).join('')}
    </div>
    ${state.view === 'blocked' ? `<div class="blocked-hint">기준 시간을 넘긴 승무원 <b>${blockedSummary.crew}</b> · 화물 <b>${blockedSummary.cargo}</b><small>${esc(blockedSummary.rule)}</small></div>` : ''}
  </div>`;
}

// ---------- 사이드바 (게시판 / 안건 / 학습 일지) ----------
const statusPill = (s) => s === 'solved' ? '<span class="pill pill-teal">해결</span>' : s === 'discuss' ? '<span class="pill pill-orange">논의 중</span>' : '<span class="pill">열림</span>';

function boardTab() {
  return `
    <section class="sec">
      <div class="sec-h">${shape('sphere', 20)}<h2>도움 요청</h2><span class="n">${board.help.length}</span><div class="spacer"></div><button type="button" class="link">+ 신호 보내기</button></div>
      ${board.help.map((h) => `
        <article class="card ${h.status === 'solved' ? 'dim' : ''}">${shape('sphere')}
          <div class="card-b"><h3>${esc(h.title)}</h3>
            <div class="meta">${avatar(h.author)} ${members[h.author].login} · ${esc(h.when)}</div>
            <div class="meta">${statusPill(h.status)}<span class="row">${commentIcon}코멘트 ${h.comments}</span>${h.note ? `<span>· ${esc(h.note)}</span>` : ''}</div>
          </div></article>`).join('')}
    </section>
    <section class="sec">
      <div class="sec-h">${shape('octa', 20)}<h2>배운 점</h2><span class="n">${board.learned.length}</span></div>
      ${board.learned.map((l) => `<article class="card">${shape('octa')}<div class="card-b"><h3>${esc(l.title)}</h3><div class="meta">${avatar(l.author)} ${members[l.author].login} · ${esc(l.from)}</div></div></article>`).join('')}
    </section>
    <section class="sec">
      <div class="sec-h">${shape('pad', 20)}<h2>결정 기록</h2><span class="n">${board.decisions.length}</span></div>
      ${board.decisions.map((d) => `<article class="card">${shape('pad')}<div class="card-b"><h3>${esc(d.title)}</h3><div class="meta">${esc(d.meta)}</div><div class="meta teal">${shape('b-check', 16)} ${esc(d.followUp)}</div></div></article>`).join('')}
    </section>
    <div class="spacer-v"></div>
    <nav class="foot" aria-label="공용 게시 공간"><a href="#rules">팀 규칙 <span>${board.rules}</span></a><a href="#notice">공지 <span>${board.notices}</span></a></nav>`;
}

function agendaTab() {
  return `
    <div class="sec-h"><h2>확정 안건</h2><span class="n">${agenda.confirmed.length}</span><div class="spacer"></div><small class="teal">회의실 테이블에 올라감</small></div>
    <ol class="agenda">
      ${agenda.confirmed.map((a) => `
        <li ${a.link ? `data-open="${a.link}" tabindex="0" role="button"` : ''}>
          <span class="ico">${shape(a.shape, 36)}${a.reopened ? '<i class="reopen"></i>' : ''}${a.badge ? `<svg class="ico-badge" width="16" height="16"><use href="#s-b-${a.badge}"/></svg>` : ''}</span>
          <span class="txt"><b>${esc(a.title)}</b><small class="${a.reopened ? 'warm' : a.badge === 'check' ? 'teal' : ''}">${esc(a.sub)}</small></span>
        </li>`).join('')}
    </ol>
    <div class="sec-h"><h2>앱이 찾은 후보</h2><span class="n">${agenda.candidates.length}</span></div>
    ${agenda.candidates.map((c) => `
      <article class="card cand">
        <div class="row">${shape(c.shape, 36)}<span class="txt"><b>${esc(c.title)}</b><small>${esc(c.sub)}</small></span></div>
        <div class="row"><button type="button" class="btn btn-teal-outline grow">안건으로 확정</button><button type="button" class="btn btn-ghost grow">이번엔 넘기기</button></div>
      </article>`).join('')}
    <div class="spacer-v"></div>
    <button type="button" class="btn btn-teal big">${shape('pad', 18)} 결정 기록하기</button>`;
}

export function renderSidebar(el, state) {
  const tab = state.tab;
  const tabs = [['board', '게시판'], ['agenda', `안건 ${agenda.confirmed.length}`], ['journal', '학습 일지']];
  el.innerHTML = `
  <aside class="sidebar panel" aria-label="정거장 사이드바">
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</div>
    <div class="tabpanel" role="tabpanel">${tab === 'agenda' ? agendaTab() : tab === 'journal' ? '<p class="empty">학습 일지는 다음 범위에서 만들어요.</p>' : boardTab()}</div>
  </aside>`;
}

// ---------- PR 상세 패널 ----------
export function renderDetail(el, id) {
  const d = prDetail[id];
  if (!d) { el.innerHTML = ''; return; }
  const clean = d.votes.filter((v) => v.kind === 'clean').length, smell = d.votes.length - clean;
  el.innerHTML = `
  <aside class="sidebar panel detail" aria-label="PR #${d.number} 상세">
    <div class="tabpanel">
      <div class="row top">${shape('prism', 46)}
        <div class="grow"><small class="teal">PR #${d.number} · ${esc(d.where)}</small><h2 class="title">${esc(d.title)}</h2></div>
        <button type="button" class="icon-btn" data-action="close" aria-label="상세 닫기"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 3 L11 11 M11 3 L3 11" stroke="#c9d1ec" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </div>
      <dl class="dl">
        <dt>담당자</dt><dd>${avatar(d.assignee, 20)} ${members[d.assignee].login}</dd>
        <dt>연결 이슈</dt><dd>${shape('cube', 18)} ${esc(d.issue)}</dd>
        <dt>리뷰</dt><dd><svg width="16" height="16"><use href="#s-b-talk"/></svg> ${esc(d.review)}</dd>
        <dt>브랜치</dt><dd class="mono">${esc(d.branch)}</dd>
      </dl>
      <div class="hr"></div>
      <section><div class="sec-h"><h2>투표 이유</h2><small>클린 ${clean} · 스멜 ${smell}</small></div>
        <ul class="votes">${d.votes.map((v) => `<li><div class="meta"><span class="pill ${v.kind === 'clean' ? 'pill-teal' : 'pill-orange'}">${v.kind === 'clean' ? '클린' : '스멜'}</span>${avatar(v.who)} ${members[v.who].login}</div><p>${esc(v.reason)}</p></li>`).join('')}</ul>
      </section>
      <form class="vote" onsubmit="return false">
        <b>내 투표</b>
        <div class="row" role="group" aria-label="클린 또는 스멜">
          <button type="button" class="btn btn-teal-outline grow" data-vote="clean" aria-pressed="false">클린</button>
          <button type="button" class="btn btn-orange grow" data-vote="smell" aria-pressed="true">스멜</button>
        </div>
        <label for="smell-reason" class="warm">스멜 이유 (필수)</label>
        <textarea id="smell-reason" rows="3" placeholder="어떤 부분이 왜 걸리는지 적어 주세요"></textarea>
        <small>남긴 이유는 팀 학습 타임라인에 기록돼요.</small>
        <button type="submit" class="btn btn-teal big">투표 남기기</button>
      </form>
      <div class="row"><a class="btn btn-ghost" href="${esc(d.url)}" target="_blank" rel="noopener">GitHub에서 열기 ↗</a>${d.onAgenda ? '<small>회의 안건에 올라가 있어요</small>' : ''}</div>
    </div>
  </aside>`;
}

// ---------- 레이더 미니맵 + 범례 ----------
const VP = { default: [10, 48, 158, 84], blocked: [10, 48, 158, 84], meeting: [50, 52, 50, 34], pr: [88, 96, 46, 30] };
export function renderMinimap(el, state) {
  const vp = VP[state.view] || VP.default;
  const alerts = state.view === 'blocked';
  el.innerHTML = `
  <div class="minimap">
    <svg width="184" height="184" viewBox="0 0 184 184" role="img" aria-label="정거장 전체 레이더 미니맵">
      <defs><clipPath id="mm-clip"><circle cx="92" cy="92" r="87"/></clipPath>
        <linearGradient id="mm-sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8ff0e0" stop-opacity="0"/><stop offset="1" stop-color="#8ff0e0" stop-opacity=".45"/></linearGradient></defs>
      <circle cx="92" cy="92" r="88" fill="#111838" fill-opacity=".92" stroke="#8ff0e0" stroke-opacity=".5" stroke-width="1.5"/>
      <g clip-path="url(#mm-clip)">
        <circle cx="92" cy="300" r="180" fill="#f6b9b0" opacity=".16"/>
        <circle cx="92" cy="92" r="30" fill="none" stroke="#8ff0e0" stroke-opacity=".15"/>
        <circle cx="92" cy="92" r="58" fill="none" stroke="#8ff0e0" stroke-opacity=".15"/>
        <path d="M92 4 V180 M4 92 H180" stroke="#8ff0e0" stroke-opacity=".12"/>
        <path d="M92 92 L92 4 A88 88 0 0 1 168 48 Z" fill="url(#mm-sweep)" opacity=".5"/>
        <g transform="translate(92 92) scale(.17) translate(-100 -250) matrix(1 .5 -1 .5 0 0)" fill="#f3ead8" fill-opacity=".85">
          <circle cx="120" cy="120" r="72"/><rect x="250" y="30" width="110" height="90"/><rect x="40" y="260" width="110" height="140"/>
          <rect x="200" y="220" width="160" height="160"/><rect x="400" y="240" width="160" height="56"/><rect x="420" y="140" width="90" height="70"/><rect x="420" y="0" width="100" height="90"/>
        </g>
        <circle cx="70.6" cy="92.9" r="3" fill="#5fc4b8" stroke="#111838"/><circle cx="84.2" cy="99.7" r="3" fill="#f29a52" stroke="#111838"/>
        <circle cx="56.3" cy="99.7" r="3" fill="#b39ae6" stroke="#111838"/><circle cx="70.6" cy="106.5" r="3" fill="#f2a7b8" stroke="#111838"/>
        ${alerts ? '<g fill="none" stroke="#ffb36b" stroke-width="1.8"><circle cx="56.3" cy="99.7" r="6"/><circle cx="31.7" cy="86.5" r="5"/><circle cx="117" cy="116" r="5"/></g>' : ''}
        <rect x="${vp[0]}" y="${vp[1]}" width="${vp[2]}" height="${vp[3]}" rx="4" fill="#8ff0e0" fill-opacity=".06" stroke="#c4fff4" stroke-width="1.4" stroke-dasharray="4 3"/>
      </g>
      <text x="92" y="170" text-anchor="middle" font-size="10" fill="#aab5d8">레이더</text>
    </svg>
    <section class="legend panel" aria-label="화물 모양 범례">
      <h2>화물은 모양으로 읽어요</h2>
      <ul class="shapes">
        <li>${shape('cube')}이슈</li><li>${shape('prism')}PR</li><li>${shape('sphere')}도움 요청</li><li>${shape('octa')}배운 점</li><li>${shape('pad')}기타 기록</li>
      </ul>
      <div class="hr"></div>
      <div class="row small">${shape('holo', 20)} 반투명 = 앱이 찾은 안건 후보, 불투명 = 확정 안건</div>
      <ul class="badges">
        <li><svg width="16" height="16"><use href="#s-b-talk"/></svg>리뷰 스레드</li>
        <li><svg width="16" height="16"><use href="#s-b-conflict"/></svg>충돌</li>
        <li><svg width="16" height="16"><use href="#s-b-clock"/></svg>PR 없이 작업</li>
        <li><svg width="16" height="16"><use href="#s-b-warn"/></svg>방치</li>
        <li><svg width="16" height="16"><use href="#s-b-check"/></svg>결정 후속</li>
      </ul>
    </section>
  </div>`;
}

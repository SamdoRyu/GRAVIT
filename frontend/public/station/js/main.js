// 화면 전체를 묶는 진입점: 해시 라우팅 → HUD 렌더 → 3D 씬 생성
//   #/            기본 뷰
//   #/blocked     막힘 뷰
//   #/meeting     회의실(지휘 브리지 확대) + 안건 탭
//   #/pr/21       PR 상세 + 클린/스멜 투표
import { createStation } from './scene/station.js';
import { renderLabels } from './labels.js';
import { renderTopBar, renderSidebar, renderDetail, renderMinimap } from './hud.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const labelLayer = $('#labels');
const topEl = $('#top');
const sideEl = $('#side');
const mapEl = $('#map');
const toastEl = $('#toast');
const errEl = $('#avatar-error');

const state = { view: 'default', tab: 'board', pr: null };
const SCENE_VIEW = { default: 'default', blocked: 'blocked', meeting: 'bridge', pr: 'scanner' };
let station = null;
let sceneView = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('blocked')) return { view: 'blocked' };
  if (h.startsWith('meeting')) return { view: 'meeting' };
  const m = h.match(/^pr\/(\d+)/);
  if (m) return { view: 'pr', pr: 'pr' + m[1] };
  return { view: 'default' };
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

function buildScene() {
  const want = SCENE_VIEW[state.view];
  if (station && sceneView === want) return;
  if (station) station.dispose();
  sceneView = want;
  errEl.hidden = true;
  station = createStation(canvas, {
    view: want,
    onLabels: (labels) => renderLabels(labelLayer, labels),
    onSelect: (id) => { if (id === 'pr21') location.hash = '#/pr/21'; },
    onError: (e) => { errEl.textContent = '아바타 오류: ' + (e.message || e); errEl.hidden = false; }
  });
}

function render() {
  Object.assign(state, { pr: null }, parseHash());
  if (state.view === 'meeting') state.tab = 'agenda';
  else if (state.tab === 'agenda' && state.view !== 'meeting') state.tab = 'board';
  renderTopBar(topEl, state);
  if (state.view === 'pr') renderDetail(sideEl, state.pr); else renderSidebar(sideEl, state);
  renderMinimap(mapEl, state);
  buildScene();
}

// ---------- 이벤트 (위임) ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-view],[data-action],[data-tab],[data-open],[data-vote]');
  if (!t) return;
  if (t.dataset.view) {
    const v = t.dataset.view;
    if (v === 'learn' || v === 'recent') { toast('배움·최근 변화 뷰는 다음 범위에서 만들어요'); return; }
    location.hash = v === 'blocked' ? '#/blocked' : '#/';
  } else if (t.dataset.action === 'meeting') {
    location.hash = state.view === 'meeting' ? '#/' : '#/meeting';
  } else if (t.dataset.action === 'close') {
    location.hash = '#/';
  } else if (t.dataset.action === 'create') {
    toast('이슈·PR은 GitHub 작성 화면으로 이동해요 (목업)');
  } else if (t.dataset.tab) {
    if (t.dataset.tab === 'agenda') { location.hash = '#/meeting'; return; }
    state.tab = t.dataset.tab;
    renderSidebar(sideEl, state);
  } else if (t.dataset.open === 'pr21') {
    location.hash = '#/pr/21';
  } else if (t.dataset.vote) {
    sideEl.querySelectorAll('[data-vote]').forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
  }
});
$('#reset').addEventListener('click', () => station && station.resetView());

// 창 크기가 바뀌면 씬을 다시 만듦 (라벨 좌표와 화면 비율 재계산)
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { sceneView = null; buildScene(); }, 250);
});

window.addEventListener('hashchange', render);
render();

# GitVillage 프론트 데모 (우주정거장 메인 화면 전체)

팀 레포 하나 = 우주정거장 하나. 이슈·PR은 화물, 팀원은 승무원(스페이 아바타).
이 폴더 하나로 **메인 화면 전체**(3D 정거장 + 상단바 + 사이드바 + 미니맵/범례 + 4개 화면)가 돌아갑니다.
데이터는 전부 목업이고, 빌드 도구 없이 정적 파일만으로 실행됩니다.

## 실행

ES 모듈과 GLB를 `fetch`로 읽기 때문에 파일을 더블클릭하면 안 되고, 로컬 서버로 열어야 합니다.

```bash
cd gitvillage-front-demo
python3 -m http.server 8080      # 또는 npx serve .
# 브라우저에서 http://localhost:8080
```

- three.js는 `index.html`의 importmap으로 **r150(three@0.150.1)** 을 CDN에서 받습니다. 시안의 조명·색감이 이 버전 기준이라 버전을 올리면 색이 달라질 수 있습니다.
- 권장 해상도 1440×900 (사이드바 376px, 좌측 하단 레이더+범례 고정 배치 기준).

## 화면(해시 라우트)

| 주소 | 화면 | 3D 씬 모드 |
|---|---|---|
| `#/` | 기본: 게시판 탭, 정거장 전체 | `default` |
| `#/blocked` | 막힘: 막힌 화물만 강조, 구조 신호·배지 | `blocked` |
| `#/meeting` | 회의 중: 지휘 브리지 확대 + 안건 탭(확정 5, 앱이 찾은 후보 1) | `bridge` |
| `#/pr/21` | PR #21 상세: 검토 영역 확대 + 클린/스멜 투표 | `scanner` |

조작: 드래그 360° 회전(컷어웨이가 카메라 방향을 따라 열림), 휠 확대, 아바타 클릭 시 반가워하기, 3D의 PR #21 클릭 시 상세로 이동.
`배움`·`최근 변화` 탭은 버튼만 있고 아직 화면이 없습니다(토스트로 안내).

## 폴더 구조

```
index.html            HUD 뼈대, 도형 아이콘 SVG 스프라이트, importmap
css/app.css           HUD·라벨 스타일 (다크 패널, 파스텔 포인트)
js/main.js            진입점: 해시 라우팅 → HUD 렌더 → 3D 씬 생성, 클릭 이벤트 위임
js/data.js            목업 데이터 (레포, 팀원, 지표, 게시판, 안건, PR 상세)
js/hud.js             renderTopBar / renderSidebar / renderDetail / renderMinimap
js/labels.js          3D 좌표를 화면 좌표로 바꾼 라벨을 HTML로 그림
js/scene/station.js   createStation(canvas, opts): 정거장 모듈·화물·조명·카메라·컷어웨이·아바타
js/stationAvatar.js   GLB 아바타 헬퍼 (StationAvatar, replaceAstronaut)
models/spay_avatar.glb   승무원 아바타 (화면에 사용)
models/raco_avatar.glb   강사 아바타 (현재 화면에는 안 나옴, 강사 화면용으로 보관)
```

### `createStation(canvas, opts)`

```js
const station = createStation(canvas, {
  view: 'default' | 'blocked' | 'bridge' | 'scanner',
  avatarUrl: './models/spay_avatar.glb',   // 생략 가능
  onLabels: (labels) => {},  // 매 프레임 라벨 좌표 목록
  onSelect: (id) => {},      // 3D 화물 클릭 (현재 'pr21'만)
  onError:  (err) => {}      // 아바타 로딩 실패
});
station.resetView();
station.dispose();           // 화면 전환·리사이즈 때 호출
```

### 아바타 규격

- 키 1, 원점은 서 있을 때 발바닥 / 앉았을 때 엉덩이 닿는 면, 정면 +Z.
- 애니메이션: `Idle`, `Sit`, `Cheer`, `SitCheer`.
- 앉힐 때 의자 높이 = 표시 키 × 0.14.
- r150은 출력이 Linear라 아바타 텍스처는 `LinearEncoding`으로 맞춰 둠(station.js에서 처리).

## 실제 데이터와 목업 구분

| 부분 | 상태 |
|---|---|
| 상단바·사이드바·안건·PR 상세 텍스트 | `data.js` 목업. 같은 모양의 JSON으로 바꾸면 됨 |
| 3D 화물의 개수·위치 | `station.js` 안에 **고정 좌표**로 들어 있음 |
| 투표·결정 기록·만들기 버튼 | 화면 반응만 있고 저장 안 함 |
| 지상 통신 수신(동기화 시각) | 고정 문구 |

## 범위 (다른 대화/저장소에 넘길 때)

**이번 범위 (바로 시작 가능)**
1. 이 정적 프론트를 저장소에 그대로 옮겨 붙이기 (파일 구조 유지, three r150 고정).
2. 4개 화면이 저장소 안에서 똑같이 뜨는지 확인 (1440×900).

**다음 범위**
3. `data.js`를 서버(서블릿) JSON 응답으로 교체: 레포·팀원·지표·게시판·안건·PR 상세.
4. 이슈/PR 데이터 → 3D 화물 배치 규칙 만들기 (상태별 모듈, 화물 모양 5종, 배지 5종). 지금은 고정 좌표.
5. 투표·결정 기록·안건 확정을 실제 저장으로 연결.

**나중 범위**
6. `배움`·`최근 변화` 화면, `학습 일지` 탭 내용.
7. 레포 간 이동 연출 (정박한 우주선 클릭 → 다른 정거장으로 이동).
8. 강사(라코) 화면.

### 다른 대화에 붙여 넣을 요청문

> 첨부한 `gitvillage-front-demo`는 GitVillage 메인 화면 전체 프론트 데모야 (3D 정거장 + HUD + 4개 화면, 목업 데이터). README의 "이번 범위" 1~2번만 해줘: 저장소에 이 구조 그대로 옮기고, 4개 라우트(`#/`, `#/blocked`, `#/meeting`, `#/pr/21`)가 똑같이 뜨는지 확인. three는 r150 고정, 디자인·좌표는 건드리지 말 것. 끝나면 3번(`data.js` → 서버 JSON) 진행 전에 필요한 API 응답 모양을 먼저 정리해서 보여줘.

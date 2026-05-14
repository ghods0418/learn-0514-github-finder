# GitHub Finder — 제작 프롬프트 (PROMPT)

이 문서는 **GitHub Finder** 단일 페이지 앱을 설계·구현·재생성할 때 따를 수 있는 요구사항 명세입니다. 에이전트나 개발자에게 그대로 전달해도 됩니다.

---

## 목표

GitHub **공개** REST API만 사용해, 사용자명으로 **프로필**과 **최신 저장소 목록**을 조회·표시하는 웹 앱을 만든다. **HTML, CSS, JavaScript만** 사용한다. **프레임워크·번들러·빌드 도구는 사용하지 않는다.**

---

## 파일 구조

| 파일 | 역할 |
|------|------|
| `index.html` | 시맨틱 마크업, 접근용 `id`, 헤더·검색 카드·상태·프로필·저장소·푸터 |
| `style.css` | 전역 스타일, Flexbox 레이아웃, 카드·배지·반응형 |
| `app.js` | `fetch` + `async`/`await`, DOM 갱신, 예외 처리, 자기 검증 |
| `README.md` | 사용자용 설명 (실행 방법, API, 예외, 보안 안내 등) |
| `PROMPT.md` | 본 문서 (구현 스펙·프롬프트) |

---

## 기술 조건

- **언어/런타임**: 순수 브라우저 — `fetch`, `async`/`await`.
- **입력**: 검색 버튼 클릭과 입력란 **Enter** 모두 지원.
- **저장소 표시 전략**: 저장소 API로 **최대 100개**를 한 번 받아 캐시한 뒤, 화면에는 처음 **5개**만 표시. **더보기** 클릭 시 **5개씩** 추가. 남은 항목이 없으면 더보기 버튼 숨김.
- **Forks**: GitHub 필드 **`forks_count`**만 사용한다 (`forks`로 `undefined`가 나오지 않게).
- **날짜**: `new Date(user.created_at).toLocaleDateString()` 형태로 표시.
- **외부 링크**: 프로필·저장소 링크는 `target="_blank"` + `rel="noopener noreferrer"`.
- **null/빈 문자열**: 화면에는 **「정보 없음」**. 숫자 **0**은 유효 값으로 그대로 표시( `null`/`undefined`만 「정보 없음」 처리 구분).
- **블로그 URL 없음**: 「정보 없음」. 값이 있으면 링크로 표시(프로토콜 없으면 `https://` 보강).

---

## 사용 API

1. 사용자 프로필  
   `GET https://api.github.com/users/{username}`

2. 사용자 저장소 목록 (생성일 기준, 최대 100개)  
   `GET https://api.github.com/users/{username}/repos?sort=created&per_page=100`

공통 응답 처리 권장:

- **404**: 사용자 없음으로 처리, API 본문을 소비한 뒤 사용자에게 안내.
- **403 + Rate limit**: `X-RateLimit-Remaining: 0` 및/또는 본문 `message`에 rate limit 관련 문구가 있으면 **비인증 시간당 약 60회** 등 한도 안내. 프로필 단계에서 실패하면 UI 초기화(`clearUI()`); 저장소 단계만 실패하면 프로필은 유지하고 저장소 영역·상태로 안내.
- 그 외 비정상 상태: 일반 API 실패 메시지.

---

## UI 영역 (필수)

1. **Header**  
   - 제목: `GitHub Finder`

2. **검색 카드**  
   - 제목·설명·입력·버튼 (한글 예시):  
     - 제목: 「GitHub 사용자 검색」  
     - 설명: 「사용자 이름을 입력하여 프로필과 저장소를 확인하세요。」  
     - placeholder: 「GitHub 사용자명…」  
     - 버튼: 「검색」  
   - 전체 컨테이너 **max-width 약 1000px**, 검색 영역은 카드 형태.

3. **상태 메시지** (`#status-message`)  
   - 로딩, 빈 입력, 사용자 없음, API 실패, Rate limit, 저장소 전용 실패 등 구분 가능한 스타일/문구.

4. **프로필 카드** (`#profile-container`)  
   - 왼쪽: 아바타, **View Profile** 버튼  
   - 오른쪽: 표시 이름, `@login`, bio, Public Repos / Gists, Followers / Following, Company, Website/Blog, Location, Member Since  
   - **모바일**: 프로필이 세로로 쌓이도록 반응형.

5. **Latest Repos** (`#repos-section`, `#repos-list`, `#load-more-btn`)  
   - 제목: `Latest Repos` (또는 동등한 표기)  
   - 각 행: 흰 카드, 저장소명 링크, **Stars / Watchers / Forks** 배지  
   - 배지: `.repos-badge` + `--stars` `#4a90e2`, `--watchers` `#aab2bd`, `--forks` `#2ecc71`, 흰 글자, **동일 너비·패딩**, 한 줄(`nowrap`), 배지 간 `gap`은 좁게(예: 4px).  
   - 메시지 전용 행(저장소 없음 등)은 배지 없이 구분 클래스로 스타일.

6. **Footer**  
   - 하단 중앙: `GitHub Finder ©`  
   - 작은 회색 톤. `body`를 column flex로 두어 내용이 짧아도 푸터가 하단에 붙도록 할 수 있음.

---

## 동작·상태 규칙

- **빈 입력**: API 호출 없이 메시지만 표시.
- **새 검색 전**: 반드시 **`clearUI()`**로 이전 프로필·저장소 DOM, 캐시 배열, 더보기 상태, 플래그 등을 초기화한 뒤 새 요청을 시작한다.
- **검색 중**: 검색 버튼 **비활성화**, `searchInProgress` 등으로 **중복 요청 무시**.
- **저장소 API만 실패**: 프로필은 유지. 저장소 목록 영역에 실패 문구(한도 메시지와 구분 가능하면 더 좋음).

---

## JavaScript 구조 (함수 분리 권장)

초보자용 주석을 충분히 달고, 역할별로 분리한다.

- `init()` — 이벤트 바인딩, **`selfCheckDom()`**만 호출.
- `handleSearch()` — 입력 검증, `clearUI()`, 로딩, `getUser` / `getRepos`, `displayProfile`, `displayRepos`, 예외 처리, busy 해제.
- `getUser(username)` / `getRepos(username)` — 공통 JSON·에러 처리 권장.
- `displayProfile(user)` — 끝에서 **`selfCheckProfileAfterRender(user)`**.
- `displayRepos()` — `try`/`finally`에서 항상 **`selfCheckReposAfterRender(lastFetchedUser, allReposCache)`**.
- `showMessage(text, kind)` / `clearUI()` / `setSearchBusy(bool)`  
- `escapeHtml()` 등 XSS 방지용 이스케이프.

성공 시 사용자·저장소 JSON은 **`console.log`**로 남겨 디버깅 가능하게 한다.

---

## 자기 검증 (`selfCheck*`)

결과는 **`console.log` / `console.warn` / `console.error`**로 구분한다 (예: ✅ / ⚠️ / ❌).

- **`selfCheckDom()`**: `init()`에서만 — 필수 `id` 요소 존재 여부.
- **`selfCheckProfileAfterRender(user)`**: `login`, `avatar_url`, `html_url`, bio 경고, 프로필 DOM 비어 있지 않은지.
- **`selfCheckReposAfterRender(user, repos)`**: `repos`가 배열인지, 저장소 섹션 DOM에 내용이 있는지.

---

## 보안 (README·코드 주석과 정합)

향후 **PAT·API Key**를 쓸 경우, **소스 코드에 직접 하드코딩하지 말 것**. 서버 프록시·환경 변수·비공개 설정 등으로 관리한다는 안내를 README에 포함한다.

---

## 완료 기준 (체크리스트)

- [ ] 프레임워크 없이 HTML/CSS/JS만으로 동작  
- [ ] 위 두 API 엔드포인트·쿼리 파라미터 준수  
- [ ] Enter + 버튼 검색, 기본 5개 + 더보기 5개씩  
- [ ] `forks_count`, 날짜·링크·null 처리 규칙 준수  
- [ ] Rate limit·404·빈 입력·네트워크 실패·빈 저장소 처리  
- [ ] `clearUI()` + 검색 중 버튼 비활성화·중복 방지  
- [ ] Flexbox 기반 레이아웃, Latest Repos 배지 스타일  
- [ ] `selfCheckDom` / `selfCheckProfileAfterRender` / `selfCheckReposAfterRender` 호출 시점 준수  
- [ ] README에 실행 방법·예외·자기 검증·보안 안내  

이 체크리스트를 만족하면 본 PROMPT에 따른 구현으로 간주한다.

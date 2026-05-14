# GitHub Finder

HTML, CSS, JavaScript만으로 만든 GitHub 사용자 검색 앱입니다. **GitHub 공개 REST API**로 프로필과 **생성일 기준 최신** 저장소 목록을 불러와 화면에 표시합니다. React·Vue 등 **프레임워크와 빌드 도구는 사용하지 않습니다.**

## 원격 저장소

- <https://github.com/ghods0418/learn-0514-github-finder>

다른 GitHub 계정으로 옮기려면 새 저장소를 만든 뒤 `git remote set-url origin <새-URL>` 하고 `git push -u origin main` 하면 됩니다.

## 주요 기능

- **검색**: 사용자명 입력 후 **검색** 버튼 또는 **Enter**
- **중복 방지**: 검색 중에는 검색 버튼 비활성화, 진행 중 추가 검색 요청 무시
- **프로필 카드**: 아바타, View Profile, 이름·로그인·소개, Public Repos / Gists, Followers / Following, 회사·블로그·위치·가입일 (Flexbox, 모바일에서는 세로 스택)
- **최신 저장소 (Latest Repos)**: 저장소명 링크, Stars / Watchers / Forks — **`forks_count`** 필드 사용
- **더보기**: API에서 저장소를 **최대 100개**까지 한 번 받은 뒤, 화면에는 처음 **5개**만 표시하고 **더보기**로 **5개씩** 추가. 더 이상 없으면 버튼 숨김
- **검색 카드 UI**: 제목·설명·placeholder **한글** (예: GitHub 사용자 검색)
- **푸터**: 페이지 하단 중앙 `GitHub Finder ©`
- **예외 처리**: 빈 입력, 404, **비인증 API Rate Limit(시간당 약 60회)** , 기타 API 오류, 저장소 없음, 저장소 목록만 실패
- **디버깅**: 성공 시 사용자·저장소 JSON을 `console.log`로 출력
- **자기 검증**: `selfCheckDom`, `selfCheckProfileAfterRender`, `selfCheckReposAfterRender` (콘솔 log / warn / error)

## 사용 API

| 용도 | 요청 |
| ---- | ---- |
| 사용자 프로필 | `GET https://api.github.com/users/{username}` |
| 저장소 목록 (최신 생성 순, 최대 100개) | `GET https://api.github.com/users/{username}/repos?sort=created&per_page=100` |

## 실행 방법

1. 저장소를 클론하거나 폴더를 내려받습니다.
2. **`index.html`**을 브라우저에서 엽니다.
   - `file://`로 열어도 대부분의 환경에서 GitHub API가 동작합니다.
   - 문제가 있으면 정적 서버로 해당 폴더를 띄운 뒤 접속해 보세요.  
     예: `npx serve .` , VS Code **Live Server** 등

## 파일 구조

| 파일 | 설명 |
| ---- | ---- |
| `index.html` | 헤더, 검색 카드, 상태 메시지, 프로필·저장소 영역, 푸터 |
| `style.css` | Flexbox 레이아웃, 카드·**컬러 배지**(Stars / Watchers / Forks), 반응형 |
| `app.js` | `fetch` + `async`/`await`, DOM 갱신, Rate limit 판별, 자기 검증 |
| `README.md` | 프로젝트 설명 (본 문서) |
| `PROMPT.md` | 구현 스펙·재생성용 프롬프트 (에이전트·검수용) |

## UI·스타일 요약

- 전체 콘텐츠 **max-width 약 1000px** 컨테이너
- **Latest Repos** 각 행은 흰색 카드 + 테두리·그림자
- 배지: `.repos-badge--stars` (#4a90e2), `--watchers` (#aab2bd), `--forks` (#2ecc71), 흰 글자, **동일 너비**·한 줄(`nowrap`), 배지 간격은 좁은 `gap` 사용

## 상태 관리와 `clearUI()`

새 검색이 시작될 때 이전 결과(프로필 HTML, 저장소 목록, 캐시, 더보기 카운터 등)가 남으면 화면이 섞일 수 있습니다. **`handleSearch()`** 안에서 유효한 검색 직전에 **`clearUI()`**로 비운 뒤 API를 호출합니다.

## 예외 처리

| 상황 | 동작 |
| ---- | ---- |
| 입력이 비어 있음 | API 호출 없이 상태 영역에 안내 |
| 사용자 없음 (404) | 사용자 없음 안내, UI 정리 |
| Rate Limit (403 등, 응답·헤더로 판별) | 한도 도달 안내; 프로필 단계에서 막히면 `clearUI()` 후 메시지 |
| 프로필 API 기타 실패 | 실패 안내 및 UI 초기화 |
| 저장소 API만 실패 | 프로필 유지, 상태·목록 영역에 안내(한도 메시지 구분 가능) |
| 저장소 배열이 비어 있음 | 「저장소가 없습니다.」 |
| 문자열 등 `null` / 빈 값 | 「정보 없음」(숫자 **0**은 그대로 표시) |
| 블로그 URL 없음 | 「정보 없음」 |

## 자기 검증 (`selfCheck*`)

| 함수 | 호출 시점 |
| ---- | --------- |
| `selfCheckDom()` | `init()`에서만 — 필수 DOM `id` 존재 여부 |
| `selfCheckProfileAfterRender(user)` | `displayProfile()` 직후 — `login` / `avatar_url` / `html_url` 등 및 프로필 DOM |
| `selfCheckReposAfterRender(user, repos)` | `displayRepos()`의 `finally` — 배열 여부·저장소 목록 DOM |

## 보안 (토큰·API Key)

현재는 **비로그인 공개 API**만 사용합니다. 이후 **Personal Access Token(PAT)** 등을 쓸 경우 **소스 코드에 토큰을 직접 넣지 마세요.** 서버 프록시, 환경 변수, 버전 관리에서 제외된 설정 등으로 비밀 값을 관리하세요.

## 참고 링크

- [GitHub REST API — Rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- 외부 링크는 `target="_blank"` 및 `rel="noopener noreferrer"` 사용

## 라이선스

별도 라이선스 파일이 없으면 저장소 소유자의 정책을 따릅니다. 필요 시 `LICENSE` 파일을 추가하세요.

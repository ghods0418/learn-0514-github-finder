/**
 * GitHub Finder — GitHub 공개 REST API로 사용자 프로필과 저장소를 조회합니다.
 * HTML/CSS/JavaScript만 사용 (프레임워크 없음).
 */

/** 한 번에 보여줄 저장소 개수 (기본 5) */
const REPOS_PAGE_SIZE = 5;

/** 현재 표시 중인 저장소 개수 (더보기로 증가) */
let visibleRepoCount = REPOS_PAGE_SIZE;

/** 마지막으로 불러온 전체 저장소 배열 (더보기용) */
let allReposCache = [];

/** 저장소 목록 API 요청이 실패했는지 (빈 배열과 구분) */
let repoListRequestFailed = false;

/** 마지막으로 성공적으로 불러온 사용자 JSON (더보기 후 selfCheck용) */
let lastFetchedUser = null;

/** 검색 API 호출 중 여부 — 중복 요청 방지 */
let searchInProgress = false;

// ---------------------------------------------------------------------------
// 유틸: null/빈 문자열이면 "정보 없음"
// ---------------------------------------------------------------------------

/**
 * API나 폼에서 온 값이 비어 있으면 화면용 기본 문구로 바꿉니다.
 * @param {*} value 원본 값
 * @returns {string}
 */
function displayOrFallback(value) {
  if (value === null || value === undefined || value === "") {
    return "정보 없음";
  }
  return String(value);
}

/** 숫자 통계: null/undefined만 "정보 없음", 0은 그대로 표시 */
function displayNumberStat(value) {
  if (value === null || value === undefined) {
    return "정보 없음";
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * GitHub REST 응답을 한 번 읽고, 성공 시 파싱된 JSON을 반환합니다.
 * 404, Rate Limit(비인증 시간당 60회 등), 기타 오류는 code가 있는 Error로 던집니다.
 * @param {string} url
 * @returns {Promise<object|Array>}
 */
async function fetchGithubJson(url) {
  const response = await fetch(url);
  const rateRemaining = response.headers.get("x-ratelimit-remaining");
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (response.status === 404) {
    const err = new Error("USER_NOT_FOUND");
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  if (!response.ok) {
    const msg = data && typeof data.message === "string" ? data.message : "";
    if (response.status === 403) {
      const likelyRateLimit =
        rateRemaining === "0" ||
        /rate limit exceeded|api rate limit|secondary rate limit/i.test(msg);
      if (likelyRateLimit) {
        const err = new Error("RATE_LIMIT");
        err.code = "RATE_LIMIT";
        throw err;
      }
    }

    const err = new Error(`HTTP_${response.status}`);
    err.code = "HTTP_ERROR";
    err.status = response.status;
    throw err;
  }

  return data;
}

/**
 * GitHub 사용자 프로필을 가져옵니다.
 * @param {string} username 공백 제거된 사용자명
 * @returns {Promise<object>} 사용자 JSON
 */
async function getUser(username) {
  const url = `https://api.github.com/users/${encodeURIComponent(username)}`;
  return fetchGithubJson(url);
}

/**
 * 사용자 저장소 목록을 가져옵니다 (최신 생성 순, 최대 100개).
 * 전체를 한 번에 받은 뒤 화면에서는 5개씩만 노출합니다.
 * @param {string} username
 * @returns {Promise<Array>}
 */
async function getRepos(username) {
  const base = `https://api.github.com/users/${encodeURIComponent(username)}/repos`;
  const params = new URLSearchParams({
    sort: "created",
    per_page: "100",
  });
  return fetchGithubJson(`${base}?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// UI: 메시지 / 초기화
// ---------------------------------------------------------------------------

/**
 * 상태 메시지 영역에 텍스트와 스타일을 표시합니다.
 * @param {string} message HTML 이스케이프된 일반 텍스트 권장
 * @param {"loading"|"error"|"info"|""} kind
 */
function showMessage(message, kind = "info") {
  const el = document.getElementById("status-message");
  if (!el) return;

  el.textContent = message;
  el.className = "status-message";
  if (kind === "loading") {
    el.classList.add("status-message--loading");
  } else if (kind === "error") {
    el.classList.add("status-message--error");
  } else if (kind === "info") {
    el.classList.add("status-message--info");
  }
}

/**
 * 프로필·저장소·상태 영역을 비웁니다.
 * 이전 검색 결과가 남은 채로 새 검색이 들어오면 데이터가 섞이므로,
 * 새 요청 직전에 반드시 호출하는 것이 중요합니다.
 */
function clearUI() {
  showMessage("", "");

  const profileEl = document.getElementById("profile-container");
  if (profileEl) {
    profileEl.innerHTML = "";
    profileEl.hidden = true;
  }

  const reposSection = document.getElementById("repos-section");
  const reposList = document.getElementById("repos-list");
  const loadMoreBtn = document.getElementById("load-more-btn");

  if (reposList) reposList.innerHTML = "";
  if (reposSection) reposSection.hidden = true;
  if (loadMoreBtn) {
    loadMoreBtn.hidden = true;
    loadMoreBtn.onclick = null;
  }

  allReposCache = [];
  visibleRepoCount = REPOS_PAGE_SIZE;
  repoListRequestFailed = false;
  lastFetchedUser = null;
}

/**
 * 검색 중에는 버튼을 비활성화해 연타·Enter 중복 요청을 막습니다.
 * @param {boolean} isBusy
 */
function setSearchBusy(isBusy) {
  const btn = document.getElementById("search-btn");
  if (btn) {
    btn.disabled = isBusy;
    btn.setAttribute("aria-busy", isBusy ? "true" : "false");
  }
}

// ---------------------------------------------------------------------------
// UI: 프로필 / 저장소 렌더링
// ---------------------------------------------------------------------------

/**
 * 사용자 프로필 카드를 DOM에 그립니다.
 * @param {object} user GitHub API users 응답
 */
function displayProfile(user) {
  const container = document.getElementById("profile-container");
  if (!container) return;

  const name = displayOrFallback(user.name);
  const login = user.login ? `@${user.login}` : "정보 없음";
  const bio = displayOrFallback(user.bio);
  const company = displayOrFallback(user.company);
  const blogRaw = user.blog;
  const blogDisplay =
    blogRaw === null || blogRaw === undefined || String(blogRaw).trim() === ""
      ? "정보 없음"
      : String(blogRaw).trim();
  const location = displayOrFallback(user.location);
  const memberSince =
    user.created_at != null
      ? new Date(user.created_at).toLocaleDateString()
      : "정보 없음";

  const profileUrl = user.html_url || "#";
  const avatarUrl = user.avatar_url || "";

  // 웹사이트 링크: 값이 있을 때만 실제 URL로 감싸기
  let blogHtml;
  if (blogDisplay === "정보 없음") {
    blogHtml = "정보 없음";
  } else {
    let href = blogDisplay;
    if (!/^https?:\/\//i.test(href)) {
      href = `https://${href}`;
    }
    blogHtml = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
      blogDisplay
    )}</a>`;
  }

  container.innerHTML = `
    <div class="profile-card__avatar-wrap">
      <img class="profile-card__avatar" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(
    user.login || "avatar"
  )} 프로필 이미지" width="160" height="160" />
      <a class="profile-card__profile-link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">View Profile</a>
    </div>
    <div class="profile-card__body">
      <h3 class="profile-card__name">${escapeHtml(name)}</h3>
      <p class="profile-card__login">${escapeHtml(login)}</p>
      <p class="profile-card__bio">${escapeHtml(bio)}</p>
      <div class="profile-stats">
        <div class="profile-stat">
          <span class="profile-stat__label">Public Repos</span>
          <span class="profile-stat__value">${escapeHtml(displayNumberStat(user.public_repos))}</span>
        </div>
        <div class="profile-stat">
          <span class="profile-stat__label">Public Gists</span>
          <span class="profile-stat__value">${escapeHtml(displayNumberStat(user.public_gists))}</span>
        </div>
        <div class="profile-stat">
          <span class="profile-stat__label">Followers</span>
          <span class="profile-stat__value">${escapeHtml(displayNumberStat(user.followers))}</span>
        </div>
        <div class="profile-stat">
          <span class="profile-stat__label">Following</span>
          <span class="profile-stat__value">${escapeHtml(displayNumberStat(user.following))}</span>
        </div>
      </div>
      <ul class="profile-meta">
        <li><strong>Company:</strong> ${escapeHtml(company)}</li>
        <li><strong>Website/Blog:</strong> ${blogHtml}</li>
        <li><strong>Location:</strong> ${escapeHtml(location)}</li>
        <li><strong>Member Since:</strong> ${escapeHtml(memberSince)}</li>
      </ul>
    </div>
  `;

  container.hidden = false;
  selfCheckProfileAfterRender(user);
}

/**
 * HTML 속성/텍스트에 넣기 전 이스케이프
 * @param {string} str
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 저장소 목록을 DOM에 그립니다.
 * API로 전체 목록을 이미 받아 둔 뒤(allReposCache), 기본 5개만 보이게 하고
 * "더보기"로 5개씩 늘립니다. 남은 항목이 없으면 더보기 버튼을 숨깁니다.
 */
function displayRepos() {
  const reposSection = document.getElementById("repos-section");
  const reposList = document.getElementById("repos-list");
  const loadMoreBtn = document.getElementById("load-more-btn");

  try {
    if (!reposSection || !reposList || !loadMoreBtn) return;

    reposList.innerHTML = "";

    if (repoListRequestFailed && (!Array.isArray(allReposCache) || allReposCache.length === 0)) {
      const li = document.createElement("li");
      li.className = "repos-item repos-item--message";
      li.textContent = "저장소 목록을 가져올 수 없습니다.";
      reposList.appendChild(li);
      loadMoreBtn.hidden = true;
      reposSection.hidden = false;
      return;
    }

    if (!Array.isArray(allReposCache) || allReposCache.length === 0) {
      const li = document.createElement("li");
      li.className = "repos-item repos-item--message";
      li.textContent = "저장소가 없습니다.";
      reposList.appendChild(li);
      loadMoreBtn.hidden = true;
      reposSection.hidden = false;
      return;
    }

    const slice = allReposCache.slice(0, visibleRepoCount);

    slice.forEach((repo) => {
      const name = repo.name || "정보 없음";
      const htmlUrl = repo.html_url || "#";
      const stars = repo.stargazers_count ?? 0;
      const watchers = repo.watchers_count ?? repo.watchers ?? 0;
      const forks = repo.forks_count ?? 0;

      const li = document.createElement("li");
      li.className = "repos-item";
      li.innerHTML = `
      <div class="repos-item__main">
        <div class="repos-item__name">
          <a href="${escapeHtml(htmlUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        name
      )}</a>
        </div>
      </div>
      <div class="repos-item__stats">
        <span class="repos-badge repos-badge--stars">Stars: ${escapeHtml(String(stars))}</span>
        <span class="repos-badge repos-badge--watchers">Watchers: ${escapeHtml(String(watchers))}</span>
        <span class="repos-badge repos-badge--forks">Forks: ${escapeHtml(String(forks))}</span>
      </div>
    `;
      reposList.appendChild(li);
    });

    loadMoreBtn.hidden = allReposCache.length <= visibleRepoCount;
    loadMoreBtn.onclick = () => {
      visibleRepoCount += REPOS_PAGE_SIZE;
      displayRepos();
    };

    reposSection.hidden = false;
  } finally {
    selfCheckReposAfterRender(lastFetchedUser, allReposCache);
  }
}

// ---------------------------------------------------------------------------
// 검색 흐름
// ---------------------------------------------------------------------------

/**
 * 검색 버튼/Enter 공통 처리
 */
async function handleSearch() {
  const input = document.getElementById("search-input");
  const raw = input ? input.value : "";
  const username = raw.trim();

  if (!username) {
    clearUI();
    showMessage("사용자명을 입력해 주세요.", "error");
    return;
  }

  if (searchInProgress) {
    console.warn("⚠️ 이미 검색 중입니다. 요청을 무시합니다.");
    return;
  }

  searchInProgress = true;
  setSearchBusy(true);

  try {
    clearUI();
    showMessage("로딩 중...", "loading");

    const user = await getUser(username);
    console.log("GitHub 사용자 API 응답:", user);
    repoListRequestFailed = false;

    lastFetchedUser = user;

    let repos = [];
    try {
      repos = await getRepos(username);
      console.log("GitHub 저장소 API 응답:", repos);
    } catch (repoErr) {
      console.warn("저장소 목록 요청 실패, 프로필만 표시:", repoErr);
      repos = [];
      repoListRequestFailed = true;
      if (repoErr.code === "RATE_LIMIT") {
        showMessage(
          "GitHub API 호출 한도에 도달했습니다. 비인증 요청은 시간당 약 60회로 제한됩니다. 잠시 후 다시 시도해 주세요.",
          "error"
        );
      } else {
        showMessage("저장소 목록을 가져오지 못했습니다. 프로필만 표시합니다.", "info");
      }
    }

    allReposCache = Array.isArray(repos) ? repos : [];
    visibleRepoCount = REPOS_PAGE_SIZE;

    displayProfile(user);
    displayRepos();

    if (!repoListRequestFailed) {
      showMessage("", "");
    }
  } catch (e) {
    console.error("검색 처리 오류:", e);
    clearUI();

    if (e.code === "USER_NOT_FOUND") {
      showMessage("해당 사용자를 찾을 수 없습니다. (404)", "error");
    } else if (e.code === "RATE_LIMIT") {
      showMessage(
        "GitHub API 호출 한도에 도달했습니다. 비인증 요청은 시간당 약 60회로 제한됩니다. 잠시 후 다시 시도해 주세요.",
        "error"
      );
    } else {
      showMessage("API 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.", "error");
    }
  } finally {
    searchInProgress = false;
    setSearchBusy(false);
  }
}

// ---------------------------------------------------------------------------
// 자기 검증 (개발·학습용)
// ---------------------------------------------------------------------------

/**
 * 필수 DOM 요소 존재 여부만 검사합니다. init()에서 한 번 호출합니다.
 * 결과는 console.log / error 로 구분합니다.
 */
function selfCheckDom() {
  const input = document.getElementById("search-input");
  const btn = document.getElementById("search-btn");
  const status = document.getElementById("status-message");
  const profile = document.getElementById("profile-container");
  const reposSection = document.getElementById("repos-section");
  const reposList = document.getElementById("repos-list");

  if (input) {
    console.log("✅ input 요소 확인 완료");
  } else {
    console.error("❌ input 요소(#search-input)를 찾을 수 없습니다.");
  }

  if (btn) {
    console.log("✅ 검색 button 요소 확인 완료");
  } else {
    console.error("❌ 검색 button 요소(#search-btn)를 찾을 수 없습니다.");
  }

  if (status) {
    console.log("✅ 상태 메시지 영역 확인 완료");
  } else {
    console.error("❌ 상태 메시지 영역(#status-message)을 찾을 수 없습니다.");
  }

  if (profile) {
    console.log("✅ 프로필 출력 영역 확인 완료");
  } else {
    console.error("❌ 프로필 출력 영역(#profile-container)을 찾을 수 없습니다.");
  }

  if (reposSection && reposList) {
    console.log("✅ 저장소 출력 영역 확인 완료");
  } else {
    console.error("❌ 저장소 출력 영역(#repos-section / #repos-list)을 찾을 수 없습니다.");
  }
}

/**
 * displayProfile() 직후: API 필수 필드와 프로필 DOM 렌더 결과를 검사합니다.
 * @param {object|null} user
 */
function selfCheckProfileAfterRender(user) {
  const profile = document.getElementById("profile-container");

  if (user && typeof user === "object") {
    if (user.login) {
      console.log("✅ 사용자 데이터 login 확인 완료");
    } else {
      console.error("❌ 사용자 응답에 login 이 없습니다.");
    }
    if (user.avatar_url) {
      console.log("✅ 사용자 데이터 avatar_url 확인 완료");
    } else {
      console.warn("⚠️ 사용자 응답에 avatar_url 이 없습니다.");
    }
    if (user.html_url) {
      console.log("✅ 사용자 데이터 html_url 확인 완료");
    } else {
      console.warn("⚠️ 사용자 응답에 html_url 이 없습니다.");
    }

    if (!user.bio) {
      console.warn("⚠️ bio 값이 없습니다. 기본값으로 대체합니다.");
    }
  } else {
    console.warn("⚠️ selfCheckProfileAfterRender: user 데이터가 없습니다.");
  }

  if (profile && !profile.hidden && profile.innerHTML.trim().length > 0) {
    console.log("✅ 렌더링 후 프로필 영역에 내용이 있습니다.");
  } else {
    console.error("❌ 렌더링 후 프로필 영역이 비어 있거나 숨겨져 있습니다.");
  }
}

/**
 * displayRepos() 직후(또는 early return 포함 모든 종료 경로): 저장소 배열·목록 DOM을 검사합니다.
 * @param {object|null} user 현재 화면에 대응하는 사용자(없으면 일부 경고만 생략)
 * @param {Array} repos 전체 저장소 캐시(allReposCache)
 */
function selfCheckReposAfterRender(user, repos) {
  const reposSection = document.getElementById("repos-section");
  const reposList = document.getElementById("repos-list");

  if (repos !== null && repos !== undefined) {
    if (Array.isArray(repos)) {
      console.log("✅ 저장소 데이터가 배열입니다.");
    } else {
      console.error("❌ 저장소 데이터가 배열이 아닙니다.");
    }
  }

  if (reposSection && reposList && !reposSection.hidden) {
    if (reposList.innerHTML.trim().length > 0) {
      console.log("✅ 렌더링 후 저장소 영역에 내용이 있습니다.");
    } else {
      console.error("❌ 렌더링 후 저장소 영역이 비어 있습니다.");
    }
  } else if (user && Array.isArray(repos) && repos.length > 0) {
    console.warn("⚠️ 저장소가 있는데 저장소 섹션이 숨겨져 있거나 목록이 비어 있습니다.");
  }
}

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------

/**
 * 이벤트 연결 및 최초 자기 검증
 */
function init() {
  const input = document.getElementById("search-input");
  const btn = document.getElementById("search-btn");

  if (btn) {
    btn.addEventListener("click", () => {
      handleSearch();
    });
  }

  if (input) {
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        handleSearch();
      }
    });
  }

  // 필수 DOM만 검증 (렌더링 검증은 displayProfile / displayRepos 이후에 수행)
  selfCheckDom();
}

document.addEventListener("DOMContentLoaded", init);

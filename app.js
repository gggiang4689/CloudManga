const $ = (id) => document.getElementById(id);

let allManga = [];

const AUTH_KEYS = {
  state: "cloudmanga_oauth_state",
  verifier: "cloudmanga_pkce_verifier",
  tokens: "cloudmanga_tokens"
};

// ---------- Các hàm PKCE ----------

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, b =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[b % 66]
  ).join("");
}

function base64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function createCodeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64url(digest);
}

// ---------- Đăng nhập / Đăng ký ----------

async function startLogin(signup = false) {
  const verifier = randomString();
  const state = randomString(32);
  const challenge = await createCodeChallenge(verifier);

  sessionStorage.setItem(AUTH_KEYS.verifier, verifier);
  sessionStorage.setItem(AUTH_KEYS.state, state);

  const domain = CONFIG.cognitoDomain.replace(/\/$/, "");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CONFIG.clientId,
    redirect_uri: CONFIG.redirectUri,
    scope: "openid email",
    state: state,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  const path = signup ? "/signup" : "/oauth2/authorize";

  window.location.href = `${domain}${path}?${params}`;
}

async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const oauthError = params.get("error");

  if (oauthError) {
    throw new Error(
      params.get("error_description") || oauthError
    );
  }

  if (!code) return;

  const returnedState = params.get("state");
  const expectedState = sessionStorage.getItem(AUTH_KEYS.state);
  const verifier = sessionStorage.getItem(AUTH_KEYS.verifier);

  if (!expectedState || !verifier ||
      returnedState !== expectedState) {
    throw new Error("OAuth state không hợp lệ. Hãy đăng nhập lại.");
  }

  // Tránh sử dụng lại state của lần đăng nhập trước.
  sessionStorage.removeItem(AUTH_KEYS.state);
  sessionStorage.removeItem(AUTH_KEYS.verifier);

  const domain = CONFIG.cognitoDomain.replace(/\/$/, "");

  const response = await fetch(`${domain}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CONFIG.clientId,
      code: code,
      redirect_uri: CONFIG.redirectUri,
      code_verifier: verifier
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error_description || data.error || "Không lấy được token"
    );
  }

  sessionStorage.setItem(
    AUTH_KEYS.tokens,
    JSON.stringify({
      ...data,
      saved_at: Date.now()
    })
  );

  // Xóa authorization code khỏi thanh địa chỉ.
  history.replaceState({}, "", window.location.pathname);
}

// Chỉ đọc claims để hiển thị trên giao diện.
// Việc xác thực token phải do API Gateway thực hiện.
function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      Math.ceil(normalized.length / 4) * 4, "="
    );

    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

function getTokens() {
  try {
    return JSON.parse(
      sessionStorage.getItem(AUTH_KEYS.tokens) || "null"
    );
  } catch {
    return null;
  }
}

function updateAccountUI() {
  const tokens = getTokens();

  const loggedIn = Boolean(
    tokens?.access_token &&
    decodeJwt(tokens.access_token).exp * 1000 > Date.now()
  );

  $("loginBtn").classList.toggle("hidden", loggedIn);
  $("signupBtn").classList.toggle("hidden", loggedIn);
  $("logoutBtn").classList.toggle("hidden", !loggedIn);
  $("username").classList.toggle("hidden", !loggedIn);

  if (loggedIn) {
    const claims = decodeJwt(tokens.id_token);
    $("username").textContent =
      claims.email || claims["cognito:username"] || "Tài khoản";
  } else {
    sessionStorage.removeItem(AUTH_KEYS.tokens);
    $("username").textContent = "";
  }
}

function logout() {
  sessionStorage.removeItem(AUTH_KEYS.tokens);
  sessionStorage.removeItem(AUTH_KEYS.state);
  sessionStorage.removeItem(AUTH_KEYS.verifier);

  const domain = CONFIG.cognitoDomain.replace(/\/$/, "");

  const params = new URLSearchParams({
    client_id: CONFIG.clientId,
    logout_uri: CONFIG.redirectUri
  });

  window.location.href = `${domain}/logout?${params}`;
}

// ---------- Lấy manga từ API Gateway ----------

function createMangaCard(manga) {
  const card = document.createElement("article");
  card.className = "manga-card";
  card.style.cursor = "pointer";
  card.setAttribute("role", "link");
  card.setAttribute("tabindex", "0");

  const detailUrl =
    `./detail.html?id=${encodeURIComponent(manga.id)}`;

  card.addEventListener("click", () => {
    window.location.href = detailUrl;
  });

  // Hỗ trợ mở bằng bàn phím
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      window.location.href = detailUrl;
    }
  });

  const cover = document.createElement("div");
  cover.className = "cover";

  // Dùng ảnh nếu API trả về URL công khai hợp lệ.
  // Đường dẫn S3 riêng tư không thể tải trực tiếp.
  const imageUrl = manga.coverUrl || manga.imageUrl;

  if (imageUrl && /^https:\/\//i.test(imageUrl)) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = manga.title || "Manga";
    img.onerror = () => {
      cover.replaceChildren();
      cover.textContent = manga.title || "MANGA";
    };
    cover.appendChild(img);
  } else {
    cover.textContent = manga.title || "MANGA";
  }

  const info = document.createElement("div");
  info.className = "manga-info";

  const title = document.createElement("h3");
  title.textContent = manga.title || "Chưa có tên";

  const description = document.createElement("p");
  description.textContent = manga.genre || "Chưa cập nhật thể loại";

  const tag = document.createElement("span");
  tag.className = "manga-tag";

  const chapters = manga.chapters ?? manga.chapterCount;
  tag.textContent = Array.isArray(chapters)
    ? `${chapters.length} chương`
    : chapters != null
      ? `${chapters} chương`
      : "Manga";

  info.append(title, description, tag);
  card.append(cover, info);

  return card;
}

function renderManga(items) {
  const grid = $("mangaGrid");
  grid.replaceChildren();

  $("mangaCount").textContent = `${items.length} bộ truyện`;

  if (items.length === 0) {
    $("status").textContent = "Không tìm thấy truyện phù hợp.";
    return;
  }

  $("status").textContent = "";

  items.forEach(manga => {
    grid.appendChild(createMangaCard(manga));
  });
}

async function loadManga() {
  $("status").textContent = "Đang lấy dữ liệu từ AWS...";

  try {
    const response = await fetch(CONFIG.apiUrl);

    if (!response.ok) {
      throw new Error(`API Gateway trả về HTTP ${response.status}`);
    }

    const data = await response.json();

    allManga = Array.isArray(data)
      ? data
      : Array.isArray(data.manga)
        ? data.manga
        : [];

    renderManga(allManga);
  } catch (error) {
    $("status").textContent =
      `Không tải được danh sách manga: ${error.message}`;

    console.error("CloudManga API error:", error);
  }
}

// ---------- Khởi động ứng dụng ----------

async function init() {
  $("loginBtn").addEventListener("click", () => startLogin(false));
  $("signupBtn").addEventListener("click", () => startLogin(true));
  $("logoutBtn").addEventListener("click", logout);

  $("searchInput").addEventListener("input", (event) => {
    const keyword = event.target.value.toLowerCase().trim();

    const filtered = allManga.filter(manga =>
      String(manga.title || "").toLowerCase().includes(keyword)
    );

    renderManga(filtered);
  });

  try {
    await handleCallback();
  } catch (error) {
    console.error("Cognito login error:", error);
    alert(`Lỗi đăng nhập Cognito: ${error.message}`);
    history.replaceState({}, "", window.location.pathname);
  }

  updateAccountUI();
  await loadManga();
}

init();

/* ===== CLOUDMANGA REVIEWS ===== */

const reviewParams = new URLSearchParams(window.location.search);
const reviewMangaId = reviewParams.get("id");

let selectedRating = 0;

const reviewForm = document.getElementById("reviewForm");
const reviewComment = document.getElementById("reviewComment");
const submitReview = document.getElementById("submitReview");
const reviewsStatus = document.getElementById("reviewsStatus");
const reviewsList = document.getElementById("reviewsList");
const reviewLoginMessage = document.getElementById("reviewLoginMessage");

function getReviewsApiUrl() {
  const url = new URL(CONFIG.apiUrl);
  url.pathname = url.pathname.replace(/\/manga\/?$/, "/reviews");
  return url;
}

function getSavedTokens() {
  try {
    return JSON.parse(
      sessionStorage.getItem("cloudmanga_tokens") || "null"
    );
  } catch {
    return null;
  }
}

function decodeTokenPayload(token) {
  try {
    const payload = token.split(".")[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded = payload.padEnd(
      Math.ceil(payload.length / 4) * 4, "="
    );

    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

function getAccessToken() {
  const tokens = getSavedTokens();
  if (!tokens?.access_token) return null;

  const claims = decodeTokenPayload(tokens.access_token);

  if (!claims.exp || claims.exp * 1000 <= Date.now()) {
    return null;
  }

  return tokens.access_token;
}

function getCurrentUserId() {
  const tokens = getSavedTokens();
  if (!getAccessToken() || !tokens?.id_token) return null;

  return decodeTokenPayload(tokens.id_token).sub || null;
}

function updateReviewLoginState() {
  const loggedIn = Boolean(getAccessToken());

  reviewForm.classList.toggle("hidden", !loggedIn);

  if (loggedIn) {
    reviewLoginMessage.textContent =
      "Bạn có thể chấm điểm và viết nhận xét. " +
      "Gửi lại sẽ cập nhật đánh giá trước đó.";
  } else {
    reviewLoginMessage.textContent =
      "Hãy đăng nhập trên trang chủ để gửi đánh giá.";
  }
}

function paintStars() {
  document.querySelectorAll("#starRating button").forEach(button => {
    const rating = Number(button.dataset.rating);
    button.classList.toggle("selected", rating <= selectedRating);
    button.setAttribute(
      "aria-pressed",
      String(rating === selectedRating)
    );
  });
}

document.querySelectorAll("#starRating button").forEach(button => {
  button.addEventListener("click", () => {
    selectedRating = Number(button.dataset.rating);
    paintStars();
  });
});

async function loadReviews() {
  if (!reviewMangaId || !/^\d+$/.test(reviewMangaId)) {
    reviewsStatus.textContent = "ID truyện không hợp lệ.";
    return;
  }

  reviewsStatus.textContent = "Đang tải đánh giá...";
  reviewsList.replaceChildren();

  try {
    const url = getReviewsApiUrl();
    url.searchParams.set("mangaId", reviewMangaId);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    document.getElementById("averageRating").textContent =
      `★ ${Number(data.averageRating || 0).toFixed(1)}`;

    document.getElementById("reviewCount").textContent =
      `${data.totalReviews || 0} đánh giá`;

    const reviews = Array.isArray(data.reviews)
      ? data.reviews
      : [];

    if (reviews.length === 0) {
      reviewsStatus.textContent =
        "Chưa có đánh giá nào. Hãy là người đầu tiên!";
      return;
    }

    reviewsStatus.textContent = "";

    const currentUserId = getCurrentUserId();

    reviews.forEach(review => {
      const item = document.createElement("article");
      item.className = "review-item";

      const heading = document.createElement("div");
      heading.className = "review-item-heading";

      const author = document.createElement("strong");
      author.textContent = review.userId === currentUserId
        ? "Đánh giá của bạn"
        : "Thành viên CloudManga";

      const stars = document.createElement("span");
      stars.className = "review-stars";
      const rating = Math.max(
        0, Math.min(5, Number(review.rating) || 0)
      );
      stars.textContent = "★".repeat(rating) +
        "☆".repeat(5 - rating);

      const comment = document.createElement("p");
      comment.textContent =
        review.comment || "Không có nhận xét.";

      heading.append(author, stars);
      item.append(heading, comment);

      if (review.updatedAt) {
        const date = document.createElement("small");
        const parsedDate = new Date(review.updatedAt);

        date.textContent = Number.isNaN(parsedDate.getTime())
          ? ""
          : parsedDate.toLocaleString("vi-VN");

        item.appendChild(date);
      }

      reviewsList.appendChild(item);

      // Cho phép sửa đánh giá của chính tài khoản hiện tại
      if (review.userId === currentUserId) {
        selectedRating = Number(review.rating);
        reviewComment.value = review.comment || "";
        paintStars();
        submitReview.textContent = "Cập nhật đánh giá";
      }
    });

  } catch (error) {
    console.error("Reviews GET error:", error);
    reviewsStatus.textContent =
      "Không tải được đánh giá: " + error.message;
  }
}

reviewForm.addEventListener("submit", async event => {
  event.preventDefault();

  const token = getAccessToken();

  if (!token) {
    alert("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");
    updateReviewLoginState();
    return;
  }

  if (selectedRating < 1 || selectedRating > 5) {
    alert("Bạn cần chọn từ 1 đến 5 sao.");
    return;
  }

  const comment = reviewComment.value.trim();

  if (comment.length > 500) {
    alert("Nhận xét không được vượt quá 500 ký tự.");
    return;
  }

  submitReview.disabled = true;
  submitReview.textContent = "Đang lưu...";

  try {
    const response = await fetch(
      getReviewsApiUrl().toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          mangaId: reviewMangaId,
          rating: selectedRating,
          comment: comment
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || `HTTP ${response.status}`
      );
    }

    alert("Đánh giá đã được lưu thành công!");
    await loadReviews();

  } catch (error) {
    console.error("Reviews POST error:", error);
    alert("Không thể lưu đánh giá: " + error.message);
  } finally {
    submitReview.disabled = false;
    submitReview.textContent = "Gửi / cập nhật đánh giá";
  }
});

updateReviewLoginState();
loadReviews();

const detailStatus = document.getElementById("detailStatus");
const detailContent = document.getElementById("detailContent");

async function loadMangaDetail() {
  // Lấy ID truyện từ URL
  const params = new URLSearchParams(window.location.search);
  const mangaId = params.get("id");

  if (!mangaId) {
    detailStatus.textContent = "Không tìm thấy ID truyện.";
    return;
  }

  try {
    // Lấy dữ liệu từ API Gateway hiện có
    const response = await fetch(CONFIG.apiUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const mangaList = data.manga || [];

    // ID trong manga.json là số 1, 2, 3...
    const manga = mangaList.find(
      item => String(item.id) === mangaId
    );

    if (!manga) {
      detailStatus.textContent = "Không tìm thấy truyện này.";
      return;
    }

    renderMangaDetail(manga);

    detailStatus.classList.add("hidden");
    detailContent.classList.remove("hidden");

  } catch (error) {
    console.error("Lỗi tải chi tiết truyện:", error);
    detailStatus.textContent =
      "Không thể tải thông tin truyện: " + error.message;
  }
}

function renderMangaDetail(manga) {
  document.title = `${manga.title} | CloudManga`;

  // Tên truyện
  document.getElementById("detailTitle").textContent =
    manga.title || "Chưa có tên";

  // Thể loại
  document.getElementById("detailGenre").textContent =
    manga.genre || "Đang cập nhật";

  // Số chương
  const chapters = Math.max(
    0,
    Math.min(1000, Number(manga.chapters) || 0)
  );

  document.getElementById("detailChapters").textContent =
    chapters;

  // Mô tả
  document.getElementById("detailDescription").textContent =
    manga.description ||
    "Thông tin và nội dung truyện sẽ được cập nhật.";

  // Ảnh bìa từ S3
  const cover = document.getElementById("detailCover");

  if (
    typeof manga.coverUrl === "string" &&
    manga.coverUrl.startsWith("https://")
  ) {
    cover.src = manga.coverUrl;
  } else {
    cover.alt = "Chưa có ảnh bìa";
    cover.hidden = true;
  }

  // Tạo danh sách chương
  const chapterList = document.getElementById("chapterList");
  chapterList.replaceChildren();

  for (let i = 1; i <= chapters; i++) {
    const chapter = document.createElement("a");
    chapter.className = "chapter-item";

    chapter.href =
      `./reader.html?id=${encodeURIComponent(manga.id)}&chapter=${i}`;

    const name = document.createElement("span");
    name.textContent = `Chương ${i}`;

    const status = document.createElement("span");
    status.className = "chapter-status";
    status.textContent = "Đọc chương →";

    chapter.append(name, status);
    chapterList.appendChild(chapter);
  }

  if (chapters === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Chưa có chương nào.";
    chapterList.appendChild(empty);
  }
}

loadMangaDetail();

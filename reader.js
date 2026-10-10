const params = new URLSearchParams(window.location.search);

const mangaId = params.get("id");
const chapter = Number(params.get("chapter"));

const readerTitle = document.getElementById("readerTitle");
const readerInfo = document.getElementById("readerInfo");
const readerPages = document.getElementById("readerPages");
const readerStatus = document.getElementById("readerStatus");

const buttons = {
  prev: [
    document.getElementById("prevChapter"),
    document.getElementById("prevChapterBottom")
  ],
  next: [
    document.getElementById("nextChapter"),
    document.getElementById("nextChapterBottom")
  ]
};

function chapterUrl(chapterNumber) {
  return `./reader.html?id=${encodeURIComponent(mangaId)}` +
    `&chapter=${chapterNumber}`;
}

function setupNavigation(maxChapters) {
  const hasPrevious = chapter > 1;
  const hasNext = chapter < maxChapters;

  buttons.prev.forEach(button => {
    button.disabled = !hasPrevious;

    button.onclick = () => {
      if (hasPrevious) {
        window.location.href = chapterUrl(chapter - 1);
      }
    };
  });

  buttons.next.forEach(button => {
    button.disabled = !hasNext;

    button.onclick = () => {
      if (hasNext) {
        window.location.href = chapterUrl(chapter + 1);
      }
    };
  });
}

async function loadChapter() {
  if (
    !mangaId ||
    !/^\d+$/.test(mangaId) ||
    !Number.isInteger(chapter) ||
    chapter < 1
  ) {
    readerStatus.textContent = "Đường dẫn chương không hợp lệ.";
    return;
  }

  document.getElementById("backToDetail").href =
    `./detail.html?id=${encodeURIComponent(mangaId)}`;

  // Lấy thông tin truyện để biết tổng số chương
  try {
    const metadataResponse = await fetch(CONFIG.apiUrl);

    if (!metadataResponse.ok) {
      throw new Error("Không lấy được thông tin truyện");
    }

    const metadata = await metadataResponse.json();

    const manga = (metadata.manga || []).find(
      item => String(item.id) === mangaId
    );

    if (!manga) {
      throw new Error("Không tìm thấy truyện");
    }

    const maxChapters = Number(manga.chapters) || 0;

    if (chapter > maxChapters) {
      throw new Error("Chương không tồn tại");
    }

    setupNavigation(maxChapters);

    readerTitle.textContent = `${manga.title} - Chương ${chapter}`;
    document.title = `${manga.title} - Chương ${chapter} | CloudManga`;

    const chapterApi = new URL(CONFIG.apiUrl);
    chapterApi.pathname =
      chapterApi.pathname.replace(/\/manga\/?$/, "/chapter");

    chapterApi.searchParams.set("mangaId", mangaId);
    chapterApi.searchParams.set("chapter", String(chapter));

    const response = await fetch(chapterApi.toString());

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }

    readerInfo.textContent = `${data.totalPages} trang`;

    readerPages.replaceChildren();

    for (const page of data.pages) {
      const img = document.createElement("img");

      img.src = page.url;
      img.alt = `Trang ${page.page}`;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";

      img.onerror = () => {
        console.error(`Không tải được trang ${page.page}`);
      };

      readerPages.appendChild(img);
    }

    readerStatus.classList.add("hidden");

  } catch (error) {
    readerStatus.classList.remove("hidden");
    readerStatus.textContent = error.message;
    console.error(error);
  }
}

loadChapter();


const PLAYER_URL = "https://playjs.purei.org/";

const DB_NAME = "PS2InBrowser";
const STORE_NAME = "games";

let db;
let temporaryGame = null;
let installPrompt = null;

const $ = id => document.getElementById(id);

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = action(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getGames() {
  return transaction("readonly", store => store.getAll());
}

async function saveGame(file, title) {
  const game = {
    id: crypto.randomUUID(),
    title: title || file.name,
    filename: file.name,
    size: file.size,
    type: file.name.split(".").pop().toUpperCase(),
    added: new Date().toISOString(),
    file
  };

  await transaction("readwrite", store => store.add(game));
  return game;
}

async function deleteGame(id) {
  await transaction("readwrite", store => store.delete(id));
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + " KB";
  }
  if (bytes < 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function createGameCard(game) {
  const card = document.createElement("article");
  card.className = "game-card";

  const cover = document.createElement("div");
  cover.className = "game-cover";
  cover.textContent = "PS2";

  const title = document.createElement("h3");
  title.textContent = game.title;

  const info = document.createElement("p");
  info.textContent =
    `${game.type} · ${formatSize(game.size)}`;

  const play = document.createElement("button");
  play.className = "primary-btn";
  play.textContent = "EXPORT & PLAY";
  play.addEventListener("click", () => exportAndPlay(game.id));

  const remove = document.createElement("button");
  remove.className = "secondary-btn";
  remove.textContent = "REMOVE";
  remove.addEventListener("click", async () => {
    if (!confirm("Remove this game from your library?")) return;
    await deleteGame(game.id);
    await refreshLibrary();
  });

  card.append(cover, title, info, play, remove);
  return card;
}

async function refreshLibrary() {
  const games = await getGames();

  $("gameGrid").replaceChildren();
  $("libraryGrid").replaceChildren();

  $("gameCount").textContent =
    `${games.length} GAME${games.length === 1 ? "" : "S"}`;

  $("emptyLibrary").hidden = games.length > 0;

  games.forEach(game => {
    $("gameGrid").appendChild(createGameCard(game));
    $("libraryGrid").appendChild(createGameCard(game));
  });
}

function showPage(page) {
  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle("active", section.id === page);
  });

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });
}

function openImport() {
  $("importDialog").hidden = false;
  $("importStatus").textContent = "";
}

function closeImport() {
  $("importDialog").hidden = true;
  $("permanentFile").value = "";
  $("gameTitle").value = "";
}

async function importPermanentGame() {
  const file = $("permanentFile").files[0];

  if (!file) {
    $("importStatus").textContent = "Please select a game file.";
    return;
  }

  $("saveGameBtn").disabled = true;
  $("importStatus").textContent = "Saving game to this device...";

  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const free = (estimate.quota || Infinity) -
                   (estimate.usage || 0);

      if (file.size > free) {
        throw new Error("Not enough browser storage space.");
      }
    }

    await saveGame(file, $("gameTitle").value.trim());

    $("importStatus").textContent =
      "Game saved successfully!";

    await refreshLibrary();

    setTimeout(closeImport, 1000);
  } catch (error) {
    $("importStatus").textContent =
      "Could not save: " + error.message;
  } finally {
    $("saveGameBtn").disabled = false;
  }
}

function launchPlayer() {
  const player = window.open(PLAYER_URL, "_blank");

  if (!player) {
    alert("Please allow pop-ups for this website.");
    return false;
  }

  return true;
}

async function exportAndPlay(id) {
  const player = launchPlayer();
  if (!player) return;

  try {
    const games = await getGames();
    const game = games.find(item => item.id === id);

    if (!game) throw new Error("Game not found.");

    const url = URL.createObjectURL(game.file);
    const link = document.createElement("a");

    link.href = url;
    link.download = game.filename;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 60000);

    alert(
      "Your saved game is being exported. " +
      "In the Play! browser tab, select the exported game file."
    );
  } catch (error) {
    alert("Could not export game: " + error.message);
  }
}

function temporaryPlay() {
  const file = $("temporaryFile").files[0];

  if (!file) {
    $("temporaryStatus").textContent =
      "Select a game file first.";
    return;
  }

  temporaryGame = file;

  $("temporaryStatus").textContent =
    `${file.name} selected. Opening Play!`;

  if (!launchPlayer()) return;

  alert(
    "In the Play! tab, use its file chooser and select " +
    file.name + " from your device. " +
    "This temporary selection was not saved to your library."
  );
}

async function checkStorage() {
  if (!navigator.storage || !navigator.storage.estimate) {
    $("storageStatus").textContent =
      "Storage information is unavailable.";
    return;
  }

  const estimate = await navigator.storage.estimate();

  $("storageStatus").textContent =
    `Used: ${formatSize(estimate.usage || 0)} · ` +
    `Available quota: ${formatSize(estimate.quota || 0)}`;
}

document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
  });
});

$("browseBtn").addEventListener("click", openImport);
$("emptyAddBtn").addEventListener("click", openImport);
$("closeImport").addEventListener("click", closeImport);
$("saveGameBtn").addEventListener("click", importPermanentGame);
$("temporaryPlayBtn").addEventListener("click", temporaryPlay);
$("storageBtn").addEventListener("click", checkStorage);

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  $("installBtn").hidden = false;
});

$("installBtn").addEventListener("click", async () => {
  if (!installPrompt) return;

  installPrompt.prompt();
  await installPrompt.userChoice;

  installPrompt = null;
  $("installBtn").hidden = true;
});

window.addEventListener("appinstalled", () => {
  $("installBtn").hidden = true;
});

async function startApp() {
  try {
    db = await openDatabase();
    await refreshLibrary();
  } catch (error) {
    console.error(error);
    alert("Could not open game storage: " + error.message);
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("./sw.js")
      .catch(error => console.error("PWA error:", error));
  }
}

startApp();

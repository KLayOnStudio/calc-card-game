// FuncMons - game logic.
// Screens: #setup-screen -> #game-screen -> #win-screen

const setupScreen = document.getElementById("setup-screen");
const gameScreen = document.getElementById("game-screen");
const winScreen = document.getElementById("win-screen");
const round2Screen = document.getElementById("round2-screen");

const guestToggle = document.getElementById("guest-toggle");
const nonGuestFields = document.getElementById("non-guest-fields");
const schoolYearSelect = document.getElementById("school-year-select");
const campusSelect = document.getElementById("campus-select");
const classSelect = document.getElementById("class-select");
const weekSelect = document.getElementById("week-select");
const studentIdInput = document.getElementById("student-id");
const pairCountOptions = document.getElementById("pair-count-options");
const startBtn = document.getElementById("start-btn");
const startHint = document.getElementById("start-hint");

let selectedPairCount = null;

function populateSelect(select, options) {
  select.innerHTML = [`<option value="" disabled selected>Select...</option>`]
    .concat(options.map((opt) => `<option value="${opt}">${opt}</option>`))
    .join("");
}

populateSelect(schoolYearSelect, SCHOOL_YEARS);
populateSelect(campusSelect, CAMPUSES);
populateSelect(classSelect, CLASSES);

// The Week dropdown depends on which class is selected (each class has its
// own weekly curriculum, see curriculum.js) and defaults to today's
// auto-detected week — but can be overridden to study ahead or review.
function populateWeekOptions(className) {
  if (!className) {
    weekSelect.innerHTML = `<option value="" disabled selected>Select a class first</option>`;
    weekSelect.disabled = true;
    return;
  }

  const weeks = getAvailableWeeks(className);
  if (weeks.length === 0) {
    weekSelect.innerHTML = `<option value="" disabled selected>No content yet</option>`;
    weekSelect.disabled = true;
    return;
  }

  weekSelect.disabled = false;
  weekSelect.innerHTML = weeks.map((w) => `<option value="${w}">Week ${w}</option>`).join("");
  weekSelect.value = String(getCurrentWeekNumber(className));
}

// A persistent per-browser identity for guest/tester play, generated once
// so repeat guest sessions on the same device still build up the
// repetition bonus and show progress on the leaderboard.
const GUEST_ID_KEY = "funcmons.guestId";

function generateGuestId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `Guest-${suffix}`;
}

function getGuestId() {
  try {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = generateGuestId();
      localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
  } catch (err) {
    console.warn("Could not access localStorage for guest ID", err);
    return generateGuestId();
  }
}

// Guests skip every field except pair count: School Year/Campus/Class/Week
// all get hidden and auto-filled (Class -> GUEST_CLASS, which has its own
// curriculum.js entry, since content generation still needs some class to
// key off of even though nobody picked one).
function applyGuestMode(isGuest) {
  nonGuestFields.classList.toggle("hidden", isGuest);

  if (isGuest) {
    populateWeekOptions(GUEST_CLASS);
    studentIdInput.value = getGuestId();
  } else {
    populateWeekOptions(classSelect.value);
    if (studentIdInput.value === getGuestId()) studentIdInput.value = "";
  }
}

// Remember the last-used setup fields on this browser/device so returning
// students don't have to re-enter everything. On a shared computer this
// will also pre-fill the previous student's info; typing/reselecting
// simply overwrites it.
const SETUP_CACHE_KEY = "funcmons.setup.v1";

function loadSetupCache() {
  try {
    const raw = localStorage.getItem(SETUP_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("Could not read cached setup fields", err);
    return {};
  }
}

function saveSetupCache() {
  try {
    localStorage.setItem(
      SETUP_CACHE_KEY,
      JSON.stringify({
        isGuest: guestToggle.checked,
        schoolYear: schoolYearSelect.value,
        campus: campusSelect.value,
        className: classSelect.value,
        studentId: studentIdInput.value.trim(),
        pairCount: selectedPairCount,
      })
    );
  } catch (err) {
    console.warn("Could not cache setup fields", err);
  }
}

const cachedSetup = loadSetupCache();
if (cachedSetup.isGuest) guestToggle.checked = true;
if (SCHOOL_YEARS.includes(cachedSetup.schoolYear)) schoolYearSelect.value = cachedSetup.schoolYear;
if (CAMPUSES.includes(cachedSetup.campus)) campusSelect.value = cachedSetup.campus;
if (CLASSES.includes(cachedSetup.className)) classSelect.value = cachedSetup.className;
if (cachedSetup.studentId) studentIdInput.value = cachedSetup.studentId;
if (cachedSetup.pairCount) {
  const pill = pairCountOptions.querySelector(`.pill[data-pairs="${cachedSetup.pairCount}"]`);
  if (pill) {
    pill.classList.add("selected");
    selectedPairCount = cachedSetup.pairCount;
  }
}
applyGuestMode(guestToggle.checked);

guestToggle.addEventListener("change", () => {
  applyGuestMode(guestToggle.checked);
  updateStartButton();
  saveSetupCache();
});

[schoolYearSelect, campusSelect].forEach((select) => {
  select.addEventListener("change", () => {
    updateStartButton();
    saveSetupCache();
  });
});

classSelect.addEventListener("change", () => {
  populateWeekOptions(classSelect.value);
  updateStartButton();
  saveSetupCache();
});

weekSelect.addEventListener("change", updateStartButton);

const cardGrid = document.getElementById("card-grid");
const hudPlayer = document.getElementById("hud-player");
const hudMoves = document.getElementById("hud-moves");
const hudTime = document.getElementById("hud-time");
const quitBtn = document.getElementById("quit-btn");

const winSummary = document.getElementById("win-summary");
const leaderboardBody = document.getElementById("leaderboard-body");
const round2Btn = document.getElementById("round2-btn");
const playAgainBtn = document.getElementById("play-again-btn");
const changeSettingsBtn = document.getElementById("change-settings-btn");

const r2Play = document.getElementById("r2-play");
const r2Complete = document.getElementById("r2-complete");
const r2HudPlayer = document.getElementById("r2-hud-player");
const r2HudSolved = document.getElementById("r2-hud-solved");
const r2HudMistakes = document.getElementById("r2-hud-mistakes");
const r2HudTime = document.getElementById("r2-hud-time");
const r2ProgressFill = document.getElementById("r2-progress-fill");
const r2QuitBtn = document.getElementById("r2-quit-btn");
const r2InstructionsNotation = document.getElementById("r2-instructions-notation");
const r2Equals = document.getElementById("r2-equals");
const r2Sides = document.querySelectorAll(".r2-side");
const r2Summary = document.getElementById("r2-summary");
const r2BackBtn = document.getElementById("r2-back-btn");

let state = null; // set by startGame()
let r2State = null; // set by startRound2()
let timerInterval = null;
let r2TimerInterval = null;

function showScreen(screen) {
  [setupScreen, gameScreen, winScreen, round2Screen].forEach((s) => s.classList.add("hidden"));
  screen.classList.remove("hidden");
}

// ---------- Setup screen ----------

pairCountOptions.addEventListener("click", (e) => {
  const btn = e.target.closest(".pill");
  if (!btn) return;
  [...pairCountOptions.children].forEach((c) => c.classList.remove("selected"));
  btn.classList.add("selected");
  selectedPairCount = Number(btn.dataset.pairs);
  updateStartButton();
  saveSetupCache();
});

studentIdInput.addEventListener("input", () => {
  updateStartButton();
  saveSetupCache();
});

function updateStartButton() {
  // Class/Week/pair-count are hard requirements — without them there's no
  // content to generate at all. Guests get Class filled in automatically
  // (GUEST_CLASS), so that check only applies to non-guests.
  const hardRequirementsMissing = [];
  if (!guestToggle.checked && !classSelect.value) hardRequirementsMissing.push("Class");
  if (!weekSelect.value) hardRequirementsMissing.push("Week");
  if (!selectedPairCount) hardRequirementsMissing.push("Number of pairs");

  startBtn.disabled = hardRequirementsMissing.length > 0;

  if (hardRequirementsMissing.length) {
    startHint.textContent = `Still needed: ${hardRequirementsMissing.join(", ")}`;
    return;
  }

  // School Year/Campus/Student ID are only needed for the result to count
  // toward the student's record — the game is still playable without them.
  const missingForRecord = [];
  if (!guestToggle.checked) {
    if (!schoolYearSelect.value) missingForRecord.push("School Year");
    if (!campusSelect.value) missingForRecord.push("Campus");
  }
  if (!studentIdInput.value.trim()) missingForRecord.push("Student ID");

  startHint.textContent = missingForRecord.length
    ? `Playing without: ${missingForRecord.join(", ")} — this game won't count toward your record.`
    : "";
}

updateStartButton();

startBtn.addEventListener("click", async () => {
  const studentId = studentIdInput.value.trim();
  const className = guestToggle.checked ? GUEST_CLASS : classSelect.value;

  // Only bother claiming an ID if there's an ID to protect — guests/blank
  // IDs have nothing for another student to collide with.
  if (studentId) {
    startBtn.disabled = true;
    const claim = await claimStudentId({ className, studentId });
    startBtn.disabled = false;
    if (!claim.ok) {
      startHint.textContent = claim.message;
      return;
    }
  }

  startGame({
    studentId,
    schoolYear: guestToggle.checked ? "Guest/Alumni" : schoolYearSelect.value,
    campus: guestToggle.checked ? GUEST_CAMPUS : campusSelect.value,
    className,
    weekNumber: Number(weekSelect.value),
    pairCount: selectedPairCount,
  });
});

changeSettingsBtn.addEventListener("click", () => {
  showScreen(setupScreen);
});

quitBtn.addEventListener("click", () => {
  stopTimer();
  showScreen(setupScreen);
});

// ---------- Game setup ----------

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(className, weekNumber, pairCount) {
  const sessionPairs = generateSessionPairs(className, weekNumber, pairCount);
  const cards = sessionPairs.flatMap((pair) => [
    { pairId: pair.id, type: "function", latex: pair.func },
    { pairId: pair.id, type: "derivative", latex: pair.deriv },
  ]);
  return { deck: shuffle(cards).map((card, index) => ({ ...card, cardIndex: index })), sessionPairs };
}

function startGame({ studentId, schoolYear, campus, className, weekNumber, pairCount }) {
  const { deck, sessionPairs } = buildDeck(className, weekNumber, pairCount);

  state = {
    studentId,
    schoolYear,
    campus,
    className,
    weekNumber,
    pairCount,
    deck,
    sessionPairs,
    flipped: [],
    matchedPairIds: new Set(),
    matchCount: 0,
    moves: 0,
    seconds: 0,
    locked: false,
  };

  hudPlayer.textContent = studentId || "Guest";
  hudMoves.textContent = "0";
  hudTime.textContent = "0:00";

  renderGrid();
  showScreen(gameScreen);
  sizeCardGrid();
  startTimer();
}

// ---------- Fit-to-screen card sizing ----------
// Cards are sized in px (not left to CSS auto-fit) so the whole grid — up
// to a 4x6 board for 12 pairs — always fits the viewport without scrolling,
// which matters most on the phones students are expected to play on.

const CARD_GAP = 12;
const CARD_ASPECT = 3 / 4; // width / height

function sizeCardGrid() {
  if (!state || gameScreen.classList.contains("hidden")) return;

  const cols = 4;
  const rows = Math.ceil(state.deck.length / cols);

  const gridRect = cardGrid.getBoundingClientRect();
  const availableWidth = gridRect.width;
  const availableHeight = window.innerHeight - gridRect.top - 16;

  const widthPerCol = (availableWidth - CARD_GAP * (cols - 1)) / cols;
  const heightPerRow = (availableHeight - CARD_GAP * (rows - 1)) / rows;

  const cardWidth = Math.max(60, Math.min(widthPerCol, heightPerRow * CARD_ASPECT));
  const cardHeight = cardWidth / CARD_ASPECT;

  cardGrid.style.gridTemplateColumns = `repeat(${cols}, ${cardWidth}px)`;
  cardGrid.style.gridTemplateRows = `repeat(${rows}, ${cardHeight}px)`;
}

window.addEventListener("resize", sizeCardGrid);
window.addEventListener("orientationchange", sizeCardGrid);

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    state.seconds += 1;
    hudTime.textContent = formatTime(state.seconds);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------- Rendering ----------

function renderGrid() {
  cardGrid.innerHTML = "";
  state.deck.forEach((card) => {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.cardIndex = card.cardIndex;

    el.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-back">?</div>
        <div class="card-face card-front"></div>
      </div>
    `;

    el.querySelector(".card-front").innerHTML = katex.renderToString(card.latex, {
      throwOnError: false,
    });

    el.addEventListener("click", () => onCardClick(card.cardIndex));
    cardGrid.appendChild(el);
  });
}

function cardElByIndex(index) {
  return cardGrid.querySelector(`.card[data-card-index="${index}"]`);
}

// ---------- Game logic ----------

function onCardClick(cardIndex) {
  if (state.locked) return;

  const card = state.deck[cardIndex];
  if (state.matchedPairIds.has(`${card.pairId}-${card.type}-open`)) return;
  if (state.flipped.some((c) => c.cardIndex === cardIndex)) return;
  if (isMatched(card)) return;

  flipCard(cardIndex);
  state.flipped.push(card);

  if (state.flipped.length === 2) {
    state.moves += 1;
    hudMoves.textContent = String(state.moves);
    state.locked = true;

    const [a, b] = state.flipped;
    const isMatch = a.pairId === b.pairId && a.type !== b.type;

    if (isMatch) {
      setTimeout(() => {
        state.matchCount += 1;
        markMatched(a, state.matchCount);
        markMatched(b, state.matchCount);
        state.flipped = [];
        state.locked = false;
        checkWin();
      }, 400);
    } else {
      setTimeout(() => {
        unflipCard(a.cardIndex);
        unflipCard(b.cardIndex);
        state.flipped = [];
        state.locked = false;
      }, 900);
    }
  }
}

function isMatched(card) {
  return state.matchedPairIds.has(card.pairId);
}

function flipCard(index) {
  cardElByIndex(index).classList.add("flipped");
}

function unflipCard(index) {
  cardElByIndex(index).classList.remove("flipped");
}

const PAIR_COLOR_COUNT = 8;

function markMatched(card, matchNumber) {
  state.matchedPairIds.add(card.pairId);

  const el = cardElByIndex(card.cardIndex);
  const colorSlot = ((matchNumber - 1) % PAIR_COLOR_COUNT) + 1;
  el.style.setProperty("--pair-color", `var(--pair-color-${colorSlot})`);

  const badge = document.createElement("span");
  badge.className = "pair-badge";
  badge.textContent = matchNumber;
  el.querySelector(".card-front").appendChild(badge);

  el.classList.add("matched", "match-pop");
}

async function checkWin() {
  if (state.matchedPairIds.size < state.pairCount) return;

  stopTimer();

  const isIdentified = state.studentId && state.schoolYear && state.campus && state.className;

  state.round1Score = computeRound1Score(state.moves, state.seconds);

  if (isIdentified) {
    await submitResult({
      studentId: state.studentId,
      schoolYear: state.schoolYear,
      campus: state.campus,
      className: state.className,
      pairs: state.pairCount,
      round: 1,
      moves: state.moves,
      seconds: state.seconds,
    });
  }

  const who = state.studentId || "You";
  winSummary.textContent = `${who} matched all ${state.pairCount} pairs in ${state.moves} moves and ${formatTime(state.seconds)}.`;
  if (!isIdentified) {
    winSummary.textContent += " (Not recorded — School Year, Campus, Class, and Student ID were missing.)";
  }

  await renderLeaderboard("week");
  showScreen(winScreen);
}

// ---------- Win screen / leaderboard ----------

document.querySelectorAll("#round1-tab-group .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#round1-tab-group .tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    renderLeaderboard(tab.dataset.range);
  });
});

async function renderLeaderboard(range) {
  const rows = await getLeaderboard({
    pairs: state.pairCount,
    round: 1,
    range,
    schoolYear: state.schoolYear,
    campus: state.campus,
    className: state.className,
  });

  leaderboardBody.innerHTML = rows
    .map(
      (row, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(row.studentId)}</td>
          <td>${formatTime(row.seconds)}</td>
          <td>${row.moves}</td>
        </tr>
      `
    )
    .join("");

  if (rows.length === 0) {
    leaderboardBody.innerHTML = `<tr><td colspan="4">No results yet.</td></tr>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

playAgainBtn.addEventListener("click", () => {
  startGame({
    studentId: state.studentId,
    schoolYear: state.schoolYear,
    campus: state.campus,
    className: state.className,
    weekNumber: state.weekNumber,
    pairCount: state.pairCount,
  });
});

// ---------- Round 2: which side needs d/d? ----------
// Reuses the pairs from the Round 1 game just won. Each pair is shown as
// "[left] = [right]" (sides randomized) and the student taps whichever side
// is the original function — the one that needs the d/d? prefix to make the
// equation true. Wrong taps send the pair to the back of the queue instead
// of dropping it, so a missed pair has to be recognized again later rather
// than just retried immediately.

function diffNotation(variable) {
  return `\\dfrac{d}{d${variable}}`;
}

function wrapWithNotation(latex, variable) {
  return `${diffNotation(variable)}\\left(${latex}\\right)`;
}

// Vibration API has no effect (and no error) on browsers that don't support
// it — notably iOS Safari, which has never implemented it. Feature-checked
// so this is always safe to call.
function vibrate(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

round2Btn.addEventListener("click", startRound2);

function startRound2() {
  const usedPairIds = [...new Set(state.deck.map((c) => c.pairId))];
  const pairs = usedPairIds.map((id) => state.sessionPairs.find((p) => p.id === id));

  r2State = {
    studentId: state.studentId,
    queue: shuffle(pairs),
    total: pairs.length,
    solved: 0,
    mistakes: 0,
    seconds: 0,
    current: null,
    locked: false,
  };

  r2HudPlayer.textContent = state.studentId || "Guest";
  r2HudTime.textContent = "0:00";
  updateR2Hud();
  r2Complete.classList.add("hidden");
  r2Play.classList.remove("hidden");

  showScreen(round2Screen);
  startR2Timer();
  renderNextR2Item();
}

function startR2Timer() {
  stopR2Timer();
  r2TimerInterval = setInterval(() => {
    r2State.seconds += 1;
    r2HudTime.textContent = formatTime(r2State.seconds);
  }, 1000);
}

function stopR2Timer() {
  if (r2TimerInterval) clearInterval(r2TimerInterval);
  r2TimerInterval = null;
}

function updateR2Hud() {
  r2HudSolved.textContent = `${r2State.solved}/${r2State.total}`;
  r2HudMistakes.textContent = String(r2State.mistakes);
  r2ProgressFill.style.width = `${(r2State.solved / r2State.total) * 100}%`;
}

async function renderNextR2Item() {
  if (r2State.queue.length === 0) {
    stopR2Timer();
    r2Play.classList.add("hidden");
    r2Complete.classList.remove("hidden");

    const round2Score = computeRound2Score(r2State.seconds, r2State.mistakes);
    const overallScore = state.round1Score + round2Score;
    const isIdentified = state.studentId && state.schoolYear && state.campus && state.className;

    if (isIdentified) {
      await submitResult({
        studentId: state.studentId,
        schoolYear: state.schoolYear,
        campus: state.campus,
        className: state.className,
        pairs: state.pairCount,
        round: 2,
        mistakes: r2State.mistakes,
        seconds: r2State.seconds,
        overallScore,
      });
    }

    const who = r2State.studentId || "You";
    const tries = r2State.mistakes === 1 ? "1 miss" : `${r2State.mistakes} misses`;
    r2Summary.textContent = `${who} sorted every pair correctly in ${formatTime(r2State.seconds)} (${tries} along the way). Overall score: ${overallScore}.`;
    if (!isIdentified) {
      r2Summary.textContent += " (Not recorded — School Year, Campus, Class, and Student ID were missing.)";
    }

    await renderR2Leaderboard("week");
    return;
  }

  const pair = r2State.queue.shift();
  const functionOnLeft = Math.random() < 0.5;

  r2State.current = { pair, functionSide: functionOnLeft ? "left" : "right" };
  r2State.locked = false;

  r2InstructionsNotation.innerHTML = katex.renderToString(diffNotation(pair.variable), {
    throwOnError: false,
  });

  r2Equals.textContent = "=";
  r2Equals.classList.remove("correct", "incorrect");

  r2Sides.forEach((sideEl) => {
    const isFunctionSide = sideEl.dataset.side === r2State.current.functionSide;
    const latex = isFunctionSide ? pair.func : pair.deriv;
    sideEl.innerHTML = katex.renderToString(latex, { throwOnError: false });
    sideEl.classList.remove("correct", "incorrect");
    sideEl.disabled = false;
  });
}

r2Sides.forEach((sideEl) => {
  sideEl.addEventListener("click", () => onR2SideClick(sideEl));
});

function onR2SideClick(sideEl) {
  if (r2State.locked) return;
  r2State.locked = true;
  r2Sides.forEach((s) => (s.disabled = true));

  const { pair, functionSide } = r2State.current;
  const isCorrect = sideEl.dataset.side === functionSide;

  if (isCorrect) {
    sideEl.classList.add("correct");
    sideEl.innerHTML = katex.renderToString(wrapWithNotation(pair.func, pair.variable), {
      throwOnError: false,
    });
    r2Equals.classList.add("correct");
    r2State.solved += 1;
    updateR2Hud();
    setTimeout(renderNextR2Item, 700);
  } else {
    sideEl.classList.add("incorrect");
    sideEl.innerHTML = katex.renderToString(wrapWithNotation(pair.deriv, pair.variable), {
      throwOnError: false,
    });
    r2Equals.textContent = "≠";
    vibrate(200);
    r2Equals.classList.add("incorrect");
    r2State.mistakes += 1;
    r2State.queue.push(pair);
    updateR2Hud();
    setTimeout(renderNextR2Item, 900);
  }
}

r2QuitBtn.addEventListener("click", () => {
  stopR2Timer();
  showScreen(setupScreen);
});

r2BackBtn.addEventListener("click", () => {
  showScreen(setupScreen);
});

const r2LeaderboardBody = document.getElementById("r2-leaderboard-body");

document.querySelectorAll("#round2-tab-group .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#round2-tab-group .tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    renderR2Leaderboard(tab.dataset.range);
  });
});

async function renderR2Leaderboard(range) {
  const rows = await getOverallLeaderboard({
    pairs: state.pairCount,
    range,
    schoolYear: state.schoolYear,
    campus: state.campus,
    className: state.className,
  });

  r2LeaderboardBody.innerHTML = rows
    .map(
      (row, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(row.studentId)}</td>
          <td>${row.score}</td>
          <td>${row.sessions}</td>
        </tr>
      `
    )
    .join("");

  if (rows.length === 0) {
    r2LeaderboardBody.innerHTML = `<tr><td colspan="4">No results yet.</td></tr>`;
  }
}

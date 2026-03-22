import {
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  examsCollection,
  attemptsCollection,
  ipHistoriesCollection,
  serverTimestamp
} from "./js/firebase-client.js?v=20260322a";

const examTitle = document.getElementById("examTitle");
const examSubtitle = document.getElementById("examSubtitle");
const examLoading = document.getElementById("examLoading");
const examError = document.getElementById("examError");
const examPanel = document.getElementById("examPanel");
const questionList = document.getElementById("questionList");
const examForm = document.getElementById("examForm");
const resultBox = document.getElementById("resultBox");
const reviewBox = document.getElementById("reviewBox");
const themeToggle = document.getElementById("themeToggle");
const timerDisplay = document.getElementById("timerDisplay");
const timerHint = document.getElementById("timerHint");
const timerProgress = document.getElementById("timerProgress");
const progressText = document.getElementById("progressText");
const submitBtn = document.getElementById("submitBtn");
const backToExamsLink = document.getElementById("backToExamsLink");

let currentExam = null;
let timerInterval = null;
let timerDeadline = null;
let timerDurationSeconds = 0;
let isSubmitting = false;
let hasSubmitted = false;
let allowPageExit = false;
let currentIpAddress = "";
let currentIpHash = "";
let currentAttempt = null;
let renderCycle = 0;
const IP_CACHE_KEY = "firebase-exams:last-known-ip";
const IP_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
}

function bootTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) {
    setTheme(saved);
    return;
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(prefersDark ? "dark" : "light");
}

function readParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    examId: params.get("examId"),
    name: params.get("name") || "",
    phone: params.get("phone") || ""
  };
}

function showError(message) {
  stopTimer();
  examLoading.classList.add("hidden");
  examPanel.classList.add("hidden");
  examError.textContent = message;
  examError.classList.remove("hidden");
}

function normalizeDigits(value) {
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function normalizePhone(phone) {
  return normalizeDigits(phone).replace(/\D/g, "");
}

function isValidEgyptPhone(phone) {
  return /^01[0125]\d{8}$/.test(normalizePhone(phone));
}

async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCachedIp() {
  try {
    const raw = localStorage.getItem(IP_CACHE_KEY);
    if (!raw) return "";

    const parsed = JSON.parse(raw);
    const ip = String(parsed?.ip || "").trim();
    const savedAt = Number(parsed?.savedAt || 0);

    if (!ip || !savedAt) return "";
    if (Date.now() - savedAt > IP_CACHE_MAX_AGE_MS) return "";
    return ip;
  } catch (error) {
    console.error("IP cache read failed", error);
    return "";
  }
}

function writeCachedIp(ip) {
  if (!ip) return;

  try {
    localStorage.setItem(IP_CACHE_KEY, JSON.stringify({ ip, savedAt: Date.now() }));
  } catch (error) {
    console.error("IP cache write failed", error);
  }
}

async function fetchJsonIp(endpoint, field = "ip") {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) return "";

    const payload = await response.json();
    return String(payload?.[field] || "").trim();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchTextIp(endpoint, extractor) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) return "";

    const payload = await response.text();
    return String(extractor(payload) || "").trim();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchCurrentIp() {
  const endpoints = [
    () => fetchJsonIp("https://api64.ipify.org?format=json"),
    () => fetchJsonIp("https://api.ipify.org?format=json"),
    () => fetchJsonIp("https://api.ip.sb/jsonip"),
    () => fetchJsonIp("https://ipapi.co/json/"),
    () =>
      fetchTextIp("https://www.cloudflare.com/cdn-cgi/trace", (payload) =>
        payload
          .split("\n")
          .find((line) => line.startsWith("ip="))
          ?.slice(3)
      )
  ];

  for (const resolveIp of endpoints) {
    try {
      const ip = await resolveIp();
      if (ip) {
        writeCachedIp(ip);
        return { ip, source: "live" };
      }
    } catch (error) {
      console.error("IP fetch failed", error);
    }
  }

  const cachedIp = readCachedIp();
  if (cachedIp) {
    return { ip: cachedIp, source: "cache" };
  }

  throw new Error("IP lookup failed");
}

function buildAttemptId(examId, ipHash) {
  return `${examId}__${ipHash}`;
}

function formatAttemptDate(ts) {
  if (!ts) return "بدون تاريخ";
  const value = typeof ts.toDate === "function" ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!value) return "بدون تاريخ";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function parseDurationToMinutes(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? value : null;
  }

  const raw = normalizeDigits(value).trim().toLowerCase();
  if (!raw) return null;

  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (/(hour|hours|hr|hrs|ساعة|ساعات)/.test(raw)) {
    return amount * 60;
  }

  return amount;
}

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, "0")).join(":");
  }

  return [minutes, remainingSeconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function updateTimerUI(remainingSeconds) {
  timerDisplay.textContent = formatClock(remainingSeconds);

  if (!timerDurationSeconds) {
    timerProgress.style.width = "0%";
    return;
  }

  const elapsedRatio = 1 - remainingSeconds / timerDurationSeconds;
  timerProgress.style.width = `${Math.min(100, Math.max(0, elapsedRatio * 100))}%`;

  const statusCard = timerDisplay.closest(".status-card");
  if (!statusCard) return;

  statusCard.classList.toggle("is-warning", remainingSeconds > 0 && remainingSeconds <= Math.min(300, timerDurationSeconds / 3));
  statusCard.classList.toggle("is-danger", remainingSeconds > 0 && remainingSeconds <= 60);
}

function stopTimer() {
  if (timerInterval) {
    window.clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateAnsweredProgress() {
  const totalQuestions = questionList.querySelectorAll(".question-item").length;
  if (!totalQuestions) {
    progressText.textContent = "أجب عن جميع الأسئلة ثم أرسل الحل.";
    return;
  }

  let answered = 0;
  for (let index = 0; index < totalQuestions; index += 1) {
    if (examForm.querySelector(`input[name="answer_${index}"]:checked`)) {
      answered += 1;
    }
  }

  progressText.textContent = `تمت الإجابة عن ${answered} من ${totalQuestions} أسئلة.`;
}

function startTimer(durationMinutes) {
  stopTimer();

  const minutes = parseDurationToMinutes(durationMinutes);
  if (!minutes) {
    timerDeadline = null;
    timerDurationSeconds = 0;
    timerDisplay.textContent = "غير محدد";
    timerHint.textContent = "لم يتم العثور على مدة رقمية صالحة لهذا الاختبار.";
    timerProgress.style.width = "0%";
    return;
  }

  timerDurationSeconds = Math.round(minutes * 60);
  timerDeadline = Date.now() + timerDurationSeconds * 1000;
  timerHint.textContent = `مدة الاختبار ${minutes} دقيقة، وسيتم الإرسال تلقائيًا عند انتهاء الوقت.`;
  updateTimerUI(timerDurationSeconds);

  timerInterval = window.setInterval(() => {
    const remainingSeconds = Math.max(0, Math.round((timerDeadline - Date.now()) / 1000));
    updateTimerUI(remainingSeconds);

    if (remainingSeconds <= 0) {
      stopTimer();
      submitExam(true);
    }
  }, 1000);
}

function normalizeQuestions(exam) {
  const list = Array.isArray(exam.questions) ? exam.questions : [];
  return list
    .map((q) => {
      const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter(Boolean) : [];
      const correctIndex = Number(q.correctIndex ?? q.correctindex ?? q.correct_answer_index);
      return {
        text: String(q.text || "").trim(),
        options,
        correctIndex,
        points: Number(q.points || 1)
      };
    })
    .filter((q) => q.text && q.options.length >= 2 && Number.isInteger(q.correctIndex));
}

function renderQuestions(questions, answersMap = null, reviewMode = false) {
  questionList.innerHTML = "";

  questions.forEach((q, idx) => {
    const card = document.createElement("article");
    card.className = "question-item";

    const title = document.createElement("h3");
    title.textContent = `${idx + 1}. ${q.text}`;
    card.appendChild(title);

    const points = document.createElement("p");
    points.className = "muted";
    points.textContent = `${q.points} درجة`;
    card.appendChild(points);

    const attemptAnswer = answersMap ? answersMap.get(idx) : null;

    q.options.forEach((option, optionIdx) => {
      const label = document.createElement("label");
      label.className = "option-row";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = `answer_${idx}`;
      input.value = String(optionIdx);
      input.required = !reviewMode;

      if (attemptAnswer && attemptAnswer.selectedIndex === optionIdx) {
        input.checked = true;
        label.classList.add("option-selected");
      }

      if (reviewMode) {
        input.disabled = true;
        if (optionIdx === q.correctIndex) {
          label.classList.add("option-correct");
        } else if (attemptAnswer && attemptAnswer.selectedIndex === optionIdx && !attemptAnswer.isCorrect) {
          label.classList.add("option-wrong");
        }
      }

      const span = document.createElement("span");
      span.textContent = option;

      label.appendChild(input);
      label.appendChild(span);
      card.appendChild(label);
    });

    questionList.appendChild(card);
  });

  updateAnsweredProgress();
}

function calculateResult(questions, formData) {
  let score = 0;
  let total = 0;
  const answers = [];

  questions.forEach((q, idx) => {
    const rawSelected = formData.get(`answer_${idx}`);
    const selectedIndex = rawSelected === null ? -1 : Number(rawSelected);
    const isCorrect = selectedIndex === q.correctIndex;
    total += q.points;
    if (isCorrect) score += q.points;

    answers.push({
      questionIndex: idx,
      selectedIndex,
      correctIndex: q.correctIndex,
      isCorrect,
      points: q.points
    });
  });

  return { score, total, answers };
}

function prefillCandidate(name, phone) {
  const nameInput = document.getElementById("candidateName");
  const phoneInput = document.getElementById("candidatePhone");
  if (nameInput) nameInput.value = name;
  if (phoneInput) phoneInput.value = normalizePhone(phone);
}

function lockCandidateForm() {
  const nameInput = document.getElementById("candidateName");
  const phoneInput = document.getElementById("candidatePhone");
  if (nameInput) nameInput.readOnly = true;
  if (phoneInput) phoneInput.readOnly = true;
}

function hasExamSessionInProgress() {
  return Boolean(currentExam && !hasSubmitted && !currentAttempt);
}

async function getExistingAttempt(examId, ipHash) {
  if (!examId || !ipHash) return null;
  const snap = await getDoc(doc(attemptsCollection, buildAttemptId(examId, ipHash)));
  return snap.exists() ? snap.data() : null;
}

function renderAttemptReview(exam, attempt) {
  stopTimer();
  currentAttempt = attempt;
  hasSubmitted = true;
  allowPageExit = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "تم التسليم";

  prefillCandidate(attempt.candidateName || "", attempt.candidatePhone || "");
  lockCandidateForm();

  const questions = normalizeQuestions(exam);
  const answersMap = new Map(
    (Array.isArray(attempt.answers) ? attempt.answers : []).map((answer) => [Number(answer.questionIndex), answer])
  );

  renderQuestions(questions, answersMap, true);
  examPanel.classList.remove("hidden");
  examLoading.classList.add("hidden");
  examError.classList.add("hidden");

  resultBox.innerHTML = `
    <h2>لقد تم إجراء الامتحان بالفعل</h2>
    <p class="muted">تم تسليم هذا الاختبار سابقًا من نفس الـ IP.</p>
    <p class="muted">الدرجة: <strong>${attempt.score || 0}</strong> من ${attempt.total || 0}</p>
    <p class="muted">تاريخ التسليم: ${formatAttemptDate(attempt.submittedAt)}</p>
  `;
  resultBox.classList.remove("hidden");

  reviewBox.innerHTML = `
    <h3>مراجعة الإجابات المختارة</h3>
    <p class="muted">الاختيار الصحيح مميز باللون الأخضر، واختيارك الخاطئ مميز باللون الأحمر.</p>
  `;
  reviewBox.classList.remove("hidden");
  progressText.textContent = "هذه مراجعة للمحاولة السابقة من نفس الـ IP.";
  timerHint.textContent = "تم فتح وضع المراجعة بدل إعادة الامتحان.";
}

async function saveIpHistory(attemptEntry) {
  if (!currentIpHash) return;

  const historyRef = doc(ipHistoriesCollection, currentIpHash);
  const historySnap = await getDoc(historyRef);
  const existing = historySnap.exists() ? historySnap.data().attemptsByExam || {} : {};
  existing[currentExam.id] = attemptEntry;

  await setDoc(historyRef, {
    ipAddress: currentIpAddress,
    updatedAt: serverTimestamp(),
    attemptsByExam: existing
  });
}

async function submitExam(autoSubmitted = false, options = {}) {
  const { keepExitAllowed = false } = options;
  if (!currentExam || isSubmitting || hasSubmitted || currentAttempt) return;

  const name = document.getElementById("candidateName").value.trim();
  const phone = normalizePhone(document.getElementById("candidatePhone").value);
  if (!name || !phone) {
    alert("يرجى إدخال الاسم ورقم الهاتف.");
    return;
  }

  if (!isValidEgyptPhone(phone)) {
    alert("أدخل رقم هاتف مصري صحيح مكوّن من 11 رقمًا ويبدأ بـ 010 أو 011 أو 012 أو 015.");
    document.getElementById("candidatePhone").focus();
    return;
  }

  const alreadySubmitted = await getExistingAttempt(currentExam.id, currentIpHash);
  if (alreadySubmitted) {
    renderAttemptReview(currentExam, alreadySubmitted);
    return;
  }

  const questions = normalizeQuestions(currentExam);
  const formData = new FormData(examForm);
  const { score, total, answers } = calculateResult(questions, formData);
  const timeSpentSeconds = timerDurationSeconds && timerDeadline
    ? Math.max(0, timerDurationSeconds - Math.max(0, Math.round((timerDeadline - Date.now()) / 1000)))
    : null;

  isSubmitting = true;
  submitBtn.disabled = true;
  submitBtn.textContent = autoSubmitted ? "انتهى الوقت..." : "جارٍ الإرسال...";

  try {
    const attemptData = {
      examId: currentExam.id,
      examTitle: currentExam.title || "",
      candidateName: name,
      candidatePhone: phone,
      ipAddress: currentIpAddress,
      ipHash: currentIpHash,
      score,
      total,
      answers,
      autoSubmitted,
      durationLabel: currentExam.duration || "",
      timeSpentSeconds,
      submittedAt: serverTimestamp()
    };

    await setDoc(doc(attemptsCollection, buildAttemptId(currentExam.id, currentIpHash)), attemptData);
    await saveIpHistory({
      examId: currentExam.id,
      examTitle: currentExam.title || "",
      candidateName: name,
      candidatePhone: phone,
      score,
      total,
      submittedAt: new Date(),
      submittedAtMs: Date.now()
    });

    hasSubmitted = true;
    if (keepExitAllowed) {
      allowPageExit = true;
    }
    stopTimer();
    examForm.querySelectorAll("input").forEach((input) => {
      input.disabled = true;
    });
    lockCandidateForm();
    resultBox.innerHTML = `
      <h2>${autoSubmitted ? "انتهى الوقت وتم الإرسال" : "تم إرسال النتيجة"}</h2>
      <p class="muted">درجتك: <strong>${score}</strong> من ${total}</p>
      <p class="muted">تم حفظ المحاولة على هذا الـ IP: ${currentIpAddress}</p>
    `;
    resultBox.classList.remove("hidden");
    reviewBox.classList.add("hidden");
    progressText.textContent = "تم حفظ إجاباتك بنجاح.";
    timerHint.textContent = autoSubmitted ? "تم إرسال الإجابات تلقائيًا بعد انتهاء الوقت." : "تم إرسال الإجابات قبل انتهاء الوقت.";
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  } catch (error) {
    console.error(error);
    alert("تعذر إرسال الاختبار. حاول مرة أخرى.");
    submitBtn.disabled = false;
    submitBtn.textContent = "إرسال الإجابات";
    isSubmitting = false;
    return;
  }

  isSubmitting = false;
}

function watchExam(examId) {
  const ref = doc(examsCollection, examId);

  onSnapshot(
    ref,
    async (snap) => {
      const cycle = ++renderCycle;

      if (!snap.exists()) {
        showError("الاختبار غير موجود.");
        return;
      }

      currentExam = { id: snap.id, ...snap.data() };
      allowPageExit = false;
      hasSubmitted = false;
      isSubmitting = false;
      currentAttempt = null;
      submitBtn.disabled = false;
      submitBtn.textContent = "إرسال الإجابات";
      resultBox.classList.add("hidden");
      reviewBox.classList.add("hidden");

      const questions = normalizeQuestions(currentExam);

      examLoading.classList.add("hidden");
      examError.classList.add("hidden");

      if (!questions.length) {
        showError("هذا الاختبار لا يحتوي على أسئلة إلكترونية حتى الآن.");
        return;
      }

      if (!currentExam.isEnabled) {
        showError("هذا الاختبار غير مفعّل حاليًا.");
        return;
      }

      examTitle.textContent = currentExam.title || "الاختبار الإلكتروني";
      examSubtitle.textContent = `${currentExam.subject || "عام"} • المدة: ${currentExam.duration || "غير محددة"}`;

      const existingAttempt = await getExistingAttempt(currentExam.id, currentIpHash);
      if (cycle !== renderCycle) return;

      if (existingAttempt) {
        renderAttemptReview(currentExam, existingAttempt);
        return;
      }

      renderQuestions(questions);
      startTimer(currentExam.duration);
      examPanel.classList.remove("hidden");
    },
    (error) => {
      console.error(error);
      showError("تعذر تحميل الاختبار. تحقق من إعدادات Firebase والقواعد.");
    }
  );
}

examForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await submitExam(false);
});

examForm.addEventListener("change", updateAnsweredProgress);

if (backToExamsLink) {
  backToExamsLink.addEventListener("click", async (e) => {
    if (!hasExamSessionInProgress()) return;

    e.preventDefault();
    const ok = window.confirm("سيتم تسليم الاختبار عند الخروج. هل تريد المتابعة؟");
    if (!ok) return;

    await submitExam(true, { keepExitAllowed: true });
    if (allowPageExit) {
      window.location.href = backToExamsLink.href;
    }
  });
}

window.addEventListener("beforeunload", (event) => {
  if (!hasExamSessionInProgress() || allowPageExit) return;

  event.preventDefault();
  event.returnValue = "سيتم تسليم الاختبار عند الخروج.";
});

window.addEventListener("pagehide", () => {
  if (!hasExamSessionInProgress() || allowPageExit) return;
  submitExam(true, { keepExitAllowed: true });
});

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
});

async function init() {
  bootTheme();

  const params = readParams();
  if (!params.examId) {
    showError("معرّف الاختبار غير موجود في الرابط.");
    return;
  }

  try {
    const ipLookup = await fetchCurrentIp();
    currentIpAddress = ipLookup.ip;
    currentIpHash = await sha256Hex(currentIpAddress);
  } catch (error) {
    console.error(error);
    showError("تعذر التحقق من الـ IP الحالي، ولا يمكن فتح الامتحان بدون هذا التحقق.");
    return;
  }

  prefillCandidate(params.name, params.phone);
  watchExam(params.examId);
}

init();

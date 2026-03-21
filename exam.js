import {
  doc,
  onSnapshot,
  addDoc,
  getDocs,
  examsCollection,
  attemptsCollection,
  query,
  serverTimestamp,
  where,
  limit
} from "./js/firebase-client.js?v=20260218c";

const examTitle = document.getElementById("examTitle");
const examSubtitle = document.getElementById("examSubtitle");
const examLoading = document.getElementById("examLoading");
const examError = document.getElementById("examError");
const examPanel = document.getElementById("examPanel");
const questionList = document.getElementById("questionList");
const examForm = document.getElementById("examForm");
const resultBox = document.getElementById("resultBox");
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

function renderQuestions(questions) {
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

    q.options.forEach((option, optionIdx) => {
      const label = document.createElement("label");
      label.className = "option-row";
      label.innerHTML = `<input type=\"radio\" name=\"answer_${idx}\" value=\"${optionIdx}\" required><span>${option}</span>`;
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
  if (phoneInput) phoneInput.value = phone;
}

function hasExamSessionInProgress() {
  return Boolean(currentExam && !hasSubmitted);
}

async function hasExistingAttempt(examId, phone) {
  const phoneValue = String(phone || "").trim();
  if (!examId || !phoneValue) return false;

  const attemptsQuery = query(
    attemptsCollection,
    where("examId", "==", examId),
    where("candidatePhone", "==", phoneValue),
    limit(1)
  );
  const snapshot = await getDocs(attemptsQuery);
  return !snapshot.empty;
}

async function submitExam(autoSubmitted = false, options = {}) {
  const { keepExitAllowed = false } = options;
  if (!currentExam || isSubmitting || hasSubmitted) return;

  const name = document.getElementById("candidateName").value.trim();
  const phone = document.getElementById("candidatePhone").value.trim();
  if (!name || !phone) {
    alert("يرجى إدخال الاسم ورقم الهاتف.");
    return;
  }

  const alreadySubmitted = await hasExistingAttempt(currentExam.id, phone);
  if (alreadySubmitted) {
    hasSubmitted = true;
    allowPageExit = true;
    stopTimer();
    alert("تم تسليم هذا الاختبار مسبقًا من نفس رقم الهاتف، ولا يمكن التسليم أكثر من مرة.");
    showError("تم تسجيل محاولة سابقة لهذا الاختبار من نفس رقم الهاتف.");
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
    await addDoc(attemptsCollection, {
      examId: currentExam.id,
      examTitle: currentExam.title || "",
      candidateName: name,
      candidatePhone: phone,
      score,
      total,
      answers,
      autoSubmitted,
      durationLabel: currentExam.duration || "",
      timeSpentSeconds,
      submittedAt: serverTimestamp()
    });

    hasSubmitted = true;
    if (keepExitAllowed) {
      allowPageExit = true;
    }
    stopTimer();
    examForm.querySelectorAll("input").forEach((input) => {
      input.disabled = true;
    });
    resultBox.innerHTML = `
      <h2>${autoSubmitted ? "انتهى الوقت وتم الإرسال" : "تم إرسال النتيجة"}</h2>
      <p class="muted">درجتك: <strong>${score}</strong> من ${total}</p>
    `;
    resultBox.classList.remove("hidden");
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
    (snap) => {
      if (!snap.exists()) {
        showError("الاختبار غير موجود.");
        return;
      }

      currentExam = { id: snap.id, ...snap.data() };
      allowPageExit = false;
      hasSubmitted = false;
      isSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "إرسال الإجابات";
      resultBox.classList.add("hidden");
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

bootTheme();

const params = readParams();
if (!params.examId) {
  showError("معرّف الاختبار غير موجود في الرابط.");
} else {
  prefillCandidate(params.name, params.phone);
  watchExam(params.examId);
}

import {
  auth,
  examsCollection,
  attemptsCollection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "./firebase-client.js?v=20260322a";
import { enableAutoPageLoader, hideGlobalLoader, setInlineLoader, showGlobalLoader, withGlobalLoader } from "./page-loader.js";

const authCard = document.getElementById("authCard");
const adminPanel = document.getElementById("adminPanel");
const loginForm = document.getElementById("loginForm");
const authError = document.getElementById("authError");
const logoutBtn = document.getElementById("logoutBtn");
const examForm = document.getElementById("examForm");
const formTitle = document.getElementById("formTitle");
const formFeedback = document.getElementById("formFeedback");
const editingId = document.getElementById("editingId");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const adminList = document.getElementById("adminList");
const adminLoading = document.getElementById("adminLoading");
const adminEmpty = document.getElementById("adminEmpty");
const adminItemTemplate = document.getElementById("adminItemTemplate");
const attemptsList = document.getElementById("attemptsList");
const attemptsLoading = document.getElementById("attemptsLoading");
const attemptsEmpty = document.getElementById("attemptsEmpty");
const attemptItemTemplate = document.getElementById("attemptItemTemplate");
const themeToggle = document.getElementById("themeToggle");
const questionBuilder = document.getElementById("questionBuilder");
const addQuestionBtn = document.getElementById("addQuestionBtn");
const attemptDetailsModal = document.getElementById("attemptDetailsModal");
const attemptDetailsTitle = document.getElementById("attemptDetailsTitle");
const attemptDetailsMeta = document.getElementById("attemptDetailsMeta");
const attemptDetailsBody = document.getElementById("attemptDetailsBody");
const closeAttemptDetailsModal = document.getElementById("closeAttemptDetailsModal");
const backToHomeBtn = document.getElementById("backToHomeBtn");

let unsubscribeExams = null;
let unsubscribeAttempts = null;
let authResolved = false;
let hasLoadedAdminExams = false;
let hasLoadedAdminAttempts = false;

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

function showAuthError(message) {
  authError.textContent = message;
  authError.classList.remove("hidden");
}

function clearAuthError() {
  authError.classList.add("hidden");
  authError.textContent = "";
}

function setFeedback(message, isError = false) {
  formFeedback.textContent = message;
  formFeedback.style.color = isError ? "#b91c1c" : "";
}

function finishAdminInitialLoading() {
  if (!authResolved) return;
  if (authCard.classList.contains("hidden")) {
    if (!hasLoadedAdminExams || !hasLoadedAdminAttempts) return;
  }
  hideGlobalLoader();
}

function formatFirebaseError(error, fallback) {
  if (!error) return fallback;
  const code = error.code ? ` (${error.code})` : "";
  const message = error.message ? `: ${error.message}` : "";
  return `${fallback}${code}${message}`;
}

function resetFormMode() {
  editingId.value = "";
  formTitle.textContent = "إنشاء اختبار";
  cancelEditBtn.classList.add("hidden");
  examForm.reset();
  document.getElementById("isEnabled").checked = false;
  questionBuilder.innerHTML = "";
  addQuestionBuilderItem();
}

function parseDateInput(inputValue) {
  const ms = Date.parse(inputValue);
  if (Number.isNaN(ms)) return null;
  return Timestamp.fromDate(new Date(ms));
}

function toDatetimeLocal(ts) {
  if (!ts || typeof ts.toDate !== "function") return "";
  const date = ts.toDate();
  const offsetMs = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

function normalizeQuestionShape(question) {
  const options = Array.isArray(question.options) ? question.options.map((o) => String(o).trim()).filter(Boolean) : [];
  const rawCorrectIndex = question.correctIndex ?? question.correctindex ?? question.correct_answer_index;
  const correctIndex = Number(rawCorrectIndex);
  const points = Number(question.points || 1);

  return {
    text: String(question.text || "").trim(),
    options,
    correctIndex,
    points
  };
}

function validateQuestions(questions) {
  questions.forEach((q, idx) => {
    if (!q.text) {
      throw new Error(`السؤال رقم ${idx + 1} يفتقد نص السؤال.`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`يجب أن يحتوي السؤال رقم ${idx + 1} على خيارين على الأقل.`);
    }
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      throw new Error(`الإجابة الصحيحة في السؤال رقم ${idx + 1} غير صالحة.`);
    }
    if (!Number.isFinite(q.points) || q.points <= 0) {
      throw new Error(`يجب أن تكون درجة السؤال رقم ${idx + 1} أكبر من صفر.`);
    }
  });
}

function refreshQuestionTitles() {
  const items = questionBuilder.querySelectorAll(".builder-item");
  items.forEach((item, idx) => {
    const title = item.querySelector(".builder-title");
    if (title) title.textContent = `السؤال ${idx + 1}`;
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function addQuestionBuilderItem(data = null) {
  const q = data ? normalizeQuestionShape(data) : { text: "", options: ["", "", "", ""], correctIndex: 0, points: 1 };

  const item = document.createElement("div");
  item.className = "builder-item";
  item.innerHTML = `
    <div class="builder-head">
      <h3 class="builder-title">السؤال</h3>
      <button type="button" class="btn btn-danger btn-sm builder-remove">حذف</button>
    </div>
    <div class="field">
      <label>نص السؤال</label>
      <input type="text" class="q-text" value="${escapeHtml(q.text)}" placeholder="اكتب السؤال هنا" />
    </div>
    <div class="builder-options">
      <div class="field"><label>الخيار 1</label><input type="text" class="q-option" value="${escapeHtml(q.options[0] || "")}" /></div>
      <div class="field"><label>الخيار 2</label><input type="text" class="q-option" value="${escapeHtml(q.options[1] || "")}" /></div>
      <div class="field"><label>الخيار 3</label><input type="text" class="q-option" value="${escapeHtml(q.options[2] || "")}" /></div>
      <div class="field"><label>الخيار 4</label><input type="text" class="q-option" value="${escapeHtml(q.options[3] || "")}" /></div>
    </div>
    <div class="builder-meta">
      <div class="field">
        <label>الخيار الصحيح</label>
        <select class="q-correct-index">
          <option value="0">الخيار 1</option>
          <option value="1">الخيار 2</option>
          <option value="2">الخيار 3</option>
          <option value="3">الخيار 4</option>
        </select>
      </div>
      <div class="field">
        <label>الدرجة</label>
        <input type="number" class="q-points" min="1" value="${Number(q.points || 1)}" />
      </div>
    </div>
  `;

  item.querySelector(".q-correct-index").value = String(Number.isInteger(q.correctIndex) ? q.correctIndex : 0);
  item.querySelector(".builder-remove").addEventListener("click", () => {
    item.remove();
    if (!questionBuilder.querySelector(".builder-item")) {
      addQuestionBuilderItem();
    }
    refreshQuestionTitles();
  });

  questionBuilder.appendChild(item);
  refreshQuestionTitles();
}

function getQuestionsFromBuilder() {
  const items = [...questionBuilder.querySelectorAll(".builder-item")];
  const questions = items.map((item) => {
    const text = item.querySelector(".q-text").value.trim();
    const options = [...item.querySelectorAll(".q-option")]
      .map((input) => input.value.trim())
      .filter(Boolean);
    const correctIndex = Number(item.querySelector(".q-correct-index").value);
    const points = Number(item.querySelector(".q-points").value || 1);
    return { text, options, correctIndex, points };
  });

  const hasAnyContent = questions.some((q) => q.text || q.options.length > 0);
  if (!hasAnyContent) return [];

  validateQuestions(questions);
  return questions;
}

function loadQuestionsInBuilder(questions) {
  questionBuilder.innerHTML = "";
  const list = Array.isArray(questions) ? questions : [];

  if (!list.length) {
    addQuestionBuilderItem();
    return;
  }

  list.forEach((question) => addQuestionBuilderItem(question));
}

function renderAdminList(exams) {
  adminList.innerHTML = "";
  adminLoading.classList.add("hidden");

  if (!exams.length) {
    adminEmpty.classList.remove("hidden");
    return;
  }

  adminEmpty.classList.add("hidden");

  exams.forEach((exam) => {
    const node = adminItemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('[data-role="title"]').textContent = exam.title || "بدون عنوان";

    const dateText = exam.date?.toDate ? exam.date.toDate().toLocaleString("ar") : "بدون تاريخ";
    const questionCount = Array.isArray(exam.questions) ? exam.questions.length : 0;
    const statusText = exam.isEnabled ? "مفعّل" : "غير مفعّل";
    node.querySelector('[data-role="meta"]').textContent = `${exam.subject || "عام"} • ${dateText} • ${questionCount} سؤال • ${statusText}`;

    node.querySelector('[data-action="edit"]').addEventListener("click", () => {
      editingId.value = exam.id;
      formTitle.textContent = "تعديل الاختبار";
      cancelEditBtn.classList.remove("hidden");

      document.getElementById("title").value = exam.title || "";
      document.getElementById("subject").value = exam.subject || "";
      document.getElementById("date").value = toDatetimeLocal(exam.date);
      document.getElementById("duration").value = exam.duration || "";
      document.getElementById("description").value = exam.description || "";
      document.getElementById("downloadLink").value = exam.downloadLink || "";
      document.getElementById("isEnabled").checked = Boolean(exam.isEnabled);
      loadQuestionsInBuilder(exam.questions || []);
      setFeedback("تم تفعيل وضع التعديل.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    node.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      const ok = window.confirm(`هل تريد حذف الاختبار "${exam.title}"؟`);
      if (!ok) return;

      try {
        await withGlobalLoader("جارٍ حذف الاختبار...", async () => {
          await deleteDoc(doc(examsCollection, exam.id));
        });
        setFeedback("تم حذف الاختبار بنجاح.");
      } catch (error) {
        console.error(error);
        setFeedback(formatFirebaseError(error, "تعذر حذف الاختبار"), true);
      }
    });

    adminList.appendChild(node);
  });
}

function formatAttemptDate(ts) {
  if (!ts || typeof ts.toDate !== "function") return "بدون تاريخ";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(ts.toDate());
}

function normalizeAttemptQuestions(questionSource) {
  const list = Array.isArray(questionSource) ? questionSource : [];
  return list
    .map((question) => {
      const options = Array.isArray(question.options) ? question.options.map((option) => String(option || "").trim()).filter(Boolean) : [];
      const correctIndex = Number(question.correctIndex ?? question.correctindex ?? question.correct_answer_index);
      return {
        text: String(question.text || "").trim(),
        options,
        correctIndex,
        points: Number(question.points || 1)
      };
    })
    .filter((question) => question.text && question.options.length >= 2 && Number.isInteger(question.correctIndex));
}

function closeAttemptDetails() {
  attemptDetailsModal.classList.add("hidden");
  attemptDetailsModal.setAttribute("aria-hidden", "true");
  attemptDetailsBody.innerHTML = "";
  attemptDetailsTitle.textContent = "تفاصيل المحاولة";
  attemptDetailsMeta.textContent = "";
}

function renderAttemptDetails(attempt, questions) {
  const answersMap = new Map(
    (Array.isArray(attempt.answers) ? attempt.answers : []).map((answer) => [Number(answer.questionIndex), answer])
  );

  attemptDetailsTitle.textContent = `${attempt.candidateName || "بدون اسم"} - ${attempt.examTitle || "اختبار بدون عنوان"}`;
  attemptDetailsMeta.textContent =
    `هاتف الطالب: ${attempt.candidatePhone || "بدون رقم"} • هاتف ولي الأمر: ${attempt.guardianPhone || "بدون رقم"} • ` +
    `الدرجة: ${Number(attempt.score || 0)} / ${Number(attempt.total || 0)} • ${formatAttemptDate(attempt.submittedAt)}`;
  attemptDetailsBody.innerHTML = "";

  if (!questions.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "تعذر تحميل نصوص الأسئلة لهذه المحاولة.";
    attemptDetailsBody.appendChild(empty);
  } else {
    questions.forEach((question, index) => {
      const answer = answersMap.get(index);
      const item = document.createElement("article");
      item.className = "question-item";

      const title = document.createElement("h3");
      title.textContent = `${index + 1}. ${question.text}`;
      item.appendChild(title);

      const points = document.createElement("p");
      points.className = "muted";
      points.textContent = `${question.points} درجة`;
      item.appendChild(points);

      question.options.forEach((option, optionIndex) => {
        const row = document.createElement("div");
        row.className = "option-row";

        if (optionIndex === question.correctIndex) {
          row.classList.add("option-correct");
        }

        if (answer?.selectedIndex === optionIndex) {
          row.classList.add("option-selected");
          if (!answer.isCorrect) {
            row.classList.add("option-wrong");
          }
        }

        const label = document.createElement("span");
        label.textContent = option;
        row.appendChild(label);
        item.appendChild(row);
      });

      const summary = document.createElement("p");
      summary.className = "muted";
      if (!answer || answer.selectedIndex < 0) {
        summary.textContent = "لم يجب الطالب على هذا السؤال.";
      } else {
        const selectedOption = question.options[answer.selectedIndex] || "اختيار غير معروف";
        const resultLabel = answer.isCorrect ? "إجابة صحيحة" : "إجابة خاطئة";
        summary.textContent = `اختيار الطالب: ${selectedOption} • ${resultLabel}`;
      }
      item.appendChild(summary);

      attemptDetailsBody.appendChild(item);
    });
  }

  attemptDetailsModal.classList.remove("hidden");
  attemptDetailsModal.setAttribute("aria-hidden", "false");
}

async function openAttemptDetails(attempt) {
  attemptDetailsTitle.textContent = "جارٍ تحميل تفاصيل المحاولة...";
  attemptDetailsMeta.textContent = "";
  setInlineLoader(attemptDetailsBody, "جارٍ تحميل الأسئلة والإجابات...");
  attemptDetailsModal.classList.remove("hidden");
  attemptDetailsModal.setAttribute("aria-hidden", "false");

  try {
    await withGlobalLoader("جارٍ تحميل تفاصيل المحاولة...", async () => {
      let questions = normalizeAttemptQuestions(attempt.questionSnapshot);

      if (!questions.length && attempt.examId) {
        const examSnap = await getDoc(doc(examsCollection, attempt.examId));
        if (examSnap.exists()) {
          questions = normalizeAttemptQuestions(examSnap.data().questions);
        }
      }

      renderAttemptDetails(attempt, questions);
    });
  } catch (error) {
    console.error(error);
    attemptDetailsTitle.textContent = "تعذر تحميل التفاصيل";
    attemptDetailsMeta.textContent = "";
    attemptDetailsBody.innerHTML = '<p class="muted">حدث خطأ أثناء تحميل تفاصيل إجابات الطالب.</p>';
  }
}

function renderAttemptsList(attempts) {
  attemptsList.innerHTML = "";
  attemptsLoading.classList.add("hidden");

  if (!attempts.length) {
    attemptsEmpty.classList.remove("hidden");
    return;
  }

  attemptsEmpty.classList.add("hidden");

  attempts.forEach((attempt) => {
    const node = attemptItemTemplate.content.firstElementChild.cloneNode(true);
    const studentName = attempt.candidateName || "بدون اسم";
    const studentPhone = attempt.candidatePhone || "بدون رقم";
    const guardianPhone = attempt.guardianPhone || "بدون رقم";
    const studentIp = attempt.ipAddress || "بدون IP";
    const examName = attempt.examTitle || "اختبار بدون عنوان";
    const score = Number.isFinite(Number(attempt.score)) ? Number(attempt.score) : 0;
    const total = Number.isFinite(Number(attempt.total)) ? Number(attempt.total) : 0;

    node.querySelector('[data-role="student"]').textContent = studentName;
    node.querySelector('[data-role="exam"]').textContent = `الاختبار: ${examName}`;
    node.querySelector('[data-role="meta"]').textContent = `رقم الهاتف: ${studentPhone} • ولي الأمر: ${guardianPhone} • IP: ${studentIp} • ${formatAttemptDate(attempt.submittedAt)}`;
    node.querySelector('[data-role="score"]').textContent = `${score} / ${total}`;
    node.querySelector('[data-action="view-details"]').addEventListener("click", () => {
      openAttemptDetails(attempt);
    });

    attemptsList.appendChild(node);
  });
}

function watchExams() {
  if (unsubscribeExams) unsubscribeExams();
  setInlineLoader(adminLoading, "جارٍ تحميل الاختبارات...");
  adminLoading.classList.remove("hidden");

  const q = query(examsCollection, orderBy("date", "desc"));
  unsubscribeExams = onSnapshot(
    q,
    (snapshot) => {
      hasLoadedAdminExams = true;
      finishAdminInitialLoading();
      const exams = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      renderAdminList(exams);
    },
    (error) => {
      hasLoadedAdminExams = true;
      finishAdminInitialLoading();
      console.error(error);
      setFeedback(formatFirebaseError(error, "تعذر تحميل قائمة الاختبارات"), true);
      adminLoading.classList.add("hidden");
    }
  );
}

function watchAttempts() {
  if (unsubscribeAttempts) unsubscribeAttempts();
  setInlineLoader(attemptsLoading, "جارٍ تحميل المحاولات...");
  attemptsLoading.classList.remove("hidden");

  const q = query(attemptsCollection, orderBy("submittedAt", "desc"));
  unsubscribeAttempts = onSnapshot(
    q,
    (snapshot) => {
      hasLoadedAdminAttempts = true;
      finishAdminInitialLoading();
      const attempts = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      renderAttemptsList(attempts);
    },
    (error) => {
      hasLoadedAdminAttempts = true;
      finishAdminInitialLoading();
      console.error(error);
      attemptsLoading.classList.add("hidden");
      attemptsEmpty.classList.remove("hidden");
      setFeedback(formatFirebaseError(error, "تعذر تحميل المحاولات المسلّمة"), true);
    }
  );
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthError();

  const form = new FormData(loginForm);
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");

  if (!email || !password) {
    showAuthError("البريد الإلكتروني وكلمة المرور مطلوبان.");
    return;
  }

  try {
    await withGlobalLoader("جارٍ تسجيل الدخول...", async () => {
      await signInWithEmailAndPassword(auth, email, password);
    });
    loginForm.reset();
  } catch (error) {
    console.error(error);
    showAuthError(formatFirebaseError(error, "فشل تسجيل الدخول"));
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await withGlobalLoader("جارٍ تسجيل الخروج...", async () => {
      await signOut(auth);
    });
  } catch (error) {
    console.error(error);
    showAuthError(formatFirebaseError(error, "فشل تسجيل الخروج"));
  }
});

cancelEditBtn.addEventListener("click", () => {
  resetFormMode();
  setFeedback("تم إلغاء التعديل.");
});

examForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("title").value.trim();
  const subject = document.getElementById("subject").value.trim();
  const dateInput = document.getElementById("date").value;
  const duration = document.getElementById("duration").value.trim();
  const description = document.getElementById("description").value.trim();
  const downloadLink = document.getElementById("downloadLink").value.trim();
  const isEnabled = document.getElementById("isEnabled").checked;

  if (!title || !subject || !dateInput || !duration || !description) {
    setFeedback("يرجى تعبئة جميع الحقول المطلوبة.", true);
    return;
  }

  const date = parseDateInput(dateInput);
  if (!date) {
    setFeedback("قيمة التاريخ غير صالحة.", true);
    return;
  }

  let questions;
  try {
    questions = getQuestionsFromBuilder().map(normalizeQuestionShape);
  } catch (error) {
    setFeedback(error.message, true);
    return;
  }

  const payload = {
    title,
    subject,
    date,
    duration,
    description,
    downloadLink: downloadLink || "",
    isEnabled,
    questions,
    hasOnlineExam: questions.length > 0
  };

  try {
    await withGlobalLoader(editingId.value ? "جارٍ تحديث الاختبار..." : "جارٍ إنشاء الاختبار...", async () => {
      if (editingId.value) {
        await updateDoc(doc(examsCollection, editingId.value), payload);
        setFeedback("تم تحديث الاختبار بنجاح.");
      } else {
        await addDoc(examsCollection, {
          ...payload,
          createdAt: serverTimestamp()
        });
        setFeedback("تم إنشاء الاختبار بنجاح.");
      }
    });

    resetFormMode();
  } catch (error) {
    console.error(error);
    setFeedback(formatFirebaseError(error, "فشل الحفظ"), true);
  }
});

onAuthStateChanged(auth, (user) => {
  authResolved = true;
  if (user) {
    authCard.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    hasLoadedAdminExams = false;
    hasLoadedAdminAttempts = false;
    watchExams();
    watchAttempts();
  } else {
    if (unsubscribeExams) {
      unsubscribeExams();
      unsubscribeExams = null;
    }
    if (unsubscribeAttempts) {
      unsubscribeAttempts();
      unsubscribeAttempts = null;
    }
    authCard.classList.remove("hidden");
    adminPanel.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    adminList.innerHTML = "";
    attemptsList.innerHTML = "";
    setInlineLoader(adminLoading, "جارٍ تحميل الاختبارات...");
    setInlineLoader(attemptsLoading, "جارٍ تحميل المحاولات...");
    adminLoading.classList.remove("hidden");
    attemptsLoading.classList.remove("hidden");
    attemptsEmpty.classList.add("hidden");
    resetFormMode();
    clearAuthError();
    finishAdminInitialLoading();
  }
});

bootTheme();
enableAutoPageLoader();
showGlobalLoader("جارٍ تحميل لوحة الإدارة...");
addQuestionBuilderItem();

if (addQuestionBtn) {
  addQuestionBtn.addEventListener("click", () => addQuestionBuilderItem());
}

closeAttemptDetailsModal?.addEventListener("click", closeAttemptDetails);
attemptDetailsModal?.addEventListener("click", (event) => {
  if (event.target === attemptDetailsModal) {
    closeAttemptDetails();
  }
});

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
});

backToHomeBtn?.addEventListener("click", () => {
  showGlobalLoader("جارٍ الانتقال إلى الصفحة الرئيسية...");
  window.location.href = "index.html";
});

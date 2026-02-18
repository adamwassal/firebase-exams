import {
  auth,
  examsCollection,
  doc,
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
} from "./firebase-client.js?v=20260218c";

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
const themeToggle = document.getElementById("themeToggle");
const questionBuilder = document.getElementById("questionBuilder");
const addQuestionBtn = document.getElementById("addQuestionBtn");

let unsubscribeExams = null;

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

function formatFirebaseError(error, fallback) {
  if (!error) return fallback;
  const code = error.code ? ` (${error.code})` : "";
  const message = error.message ? `: ${error.message}` : "";
  return `${fallback}${code}${message}`;
}

function resetFormMode() {
  editingId.value = "";
  formTitle.textContent = "Create Exam";
  cancelEditBtn.classList.add("hidden");
  examForm.reset();
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
      throw new Error(`Question #${idx + 1} is missing text.`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`Question #${idx + 1} must have at least 2 options.`);
    }
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      throw new Error(`Question #${idx + 1} has invalid correct answer.`);
    }
    if (!Number.isFinite(q.points) || q.points <= 0) {
      throw new Error(`Question #${idx + 1} points must be greater than 0.`);
    }
  });
}

function refreshQuestionTitles() {
  const items = questionBuilder.querySelectorAll(".builder-item");
  items.forEach((item, idx) => {
    const title = item.querySelector(".builder-title");
    if (title) title.textContent = `Question ${idx + 1}`;
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
      <h3 class="builder-title">Question</h3>
      <button type="button" class="btn btn-danger btn-sm builder-remove">Remove</button>
    </div>
    <div class="field">
      <label>Question Text</label>
      <input type="text" class="q-text" value="${escapeHtml(q.text)}" placeholder="Write your question" />
    </div>
    <div class="builder-options">
      <div class="field"><label>Option 1</label><input type="text" class="q-option" value="${escapeHtml(q.options[0] || "")}" /></div>
      <div class="field"><label>Option 2</label><input type="text" class="q-option" value="${escapeHtml(q.options[1] || "")}" /></div>
      <div class="field"><label>Option 3</label><input type="text" class="q-option" value="${escapeHtml(q.options[2] || "")}" /></div>
      <div class="field"><label>Option 4</label><input type="text" class="q-option" value="${escapeHtml(q.options[3] || "")}" /></div>
    </div>
    <div class="builder-meta">
      <div class="field">
        <label>Correct Option</label>
        <select class="q-correct-index">
          <option value="0">Option 1</option>
          <option value="1">Option 2</option>
          <option value="2">Option 3</option>
          <option value="3">Option 4</option>
        </select>
      </div>
      <div class="field">
        <label>Points</label>
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
    node.querySelector('[data-role="title"]').textContent = exam.title || "Untitled";

    const dateText = exam.date?.toDate ? exam.date.toDate().toLocaleString() : "No date";
    const questionCount = Array.isArray(exam.questions) ? exam.questions.length : 0;
    node.querySelector('[data-role="meta"]').textContent = `${exam.subject || "General"} • ${dateText} • ${questionCount} Q`;

    node.querySelector('[data-action="edit"]').addEventListener("click", () => {
      editingId.value = exam.id;
      formTitle.textContent = "Edit Exam";
      cancelEditBtn.classList.remove("hidden");

      document.getElementById("title").value = exam.title || "";
      document.getElementById("subject").value = exam.subject || "";
      document.getElementById("date").value = toDatetimeLocal(exam.date);
      document.getElementById("duration").value = exam.duration || "";
      document.getElementById("description").value = exam.description || "";
      document.getElementById("downloadLink").value = exam.downloadLink || "";
      loadQuestionsInBuilder(exam.questions || []);
      setFeedback("Editing mode enabled.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    node.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      const ok = window.confirm(`Delete exam \"${exam.title}\"?`);
      if (!ok) return;

      try {
        await deleteDoc(doc(examsCollection, exam.id));
        setFeedback("Exam deleted successfully.");
      } catch (error) {
        console.error(error);
        setFeedback(formatFirebaseError(error, "Failed to delete exam"), true);
      }
    });

    adminList.appendChild(node);
  });
}

function watchExams() {
  if (unsubscribeExams) unsubscribeExams();

  const q = query(examsCollection, orderBy("date", "desc"));
  unsubscribeExams = onSnapshot(
    q,
    (snapshot) => {
      const exams = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      renderAdminList(exams);
    },
    (error) => {
      console.error(error);
      setFeedback(formatFirebaseError(error, "Could not load exams list"), true);
      adminLoading.classList.add("hidden");
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
    showAuthError("Email and password are required.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
  } catch (error) {
    console.error(error);
    showAuthError(formatFirebaseError(error, "Login failed"));
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    showAuthError(formatFirebaseError(error, "Logout failed"));
  }
});

cancelEditBtn.addEventListener("click", () => {
  resetFormMode();
  setFeedback("Edit canceled.");
});

examForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = document.getElementById("title").value.trim();
  const subject = document.getElementById("subject").value.trim();
  const dateInput = document.getElementById("date").value;
  const duration = document.getElementById("duration").value.trim();
  const description = document.getElementById("description").value.trim();
  const downloadLink = document.getElementById("downloadLink").value.trim();

  if (!title || !subject || !dateInput || !duration || !description) {
    setFeedback("Please fill all required fields.", true);
    return;
  }

  const date = parseDateInput(dateInput);
  if (!date) {
    setFeedback("Invalid date value.", true);
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
    questions,
    hasOnlineExam: questions.length > 0
  };

  try {
    if (editingId.value) {
      await updateDoc(doc(examsCollection, editingId.value), payload);
      setFeedback("Exam updated successfully.");
    } else {
      await addDoc(examsCollection, {
        ...payload,
        createdAt: serverTimestamp()
      });
      setFeedback("Exam created successfully.");
    }

    resetFormMode();
  } catch (error) {
    console.error(error);
    setFeedback(formatFirebaseError(error, "Save failed"), true);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    authCard.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    watchExams();
  } else {
    if (unsubscribeExams) {
      unsubscribeExams();
      unsubscribeExams = null;
    }
    authCard.classList.remove("hidden");
    adminPanel.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    adminList.innerHTML = "";
    resetFormMode();
    clearAuthError();
  }
});

bootTheme();
addQuestionBuilderItem();

if (addQuestionBtn) {
  addQuestionBtn.addEventListener("click", () => addQuestionBuilderItem());
}

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
});

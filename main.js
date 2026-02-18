import {
  addDoc,
  examsCollection,
  registrationsCollection,
  attemptsCollection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "./js/firebase-client.js?v=20260218";

const cardsGrid = document.getElementById("cardsGrid");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const examCardTemplate = document.getElementById("examCardTemplate");
const searchInput = document.getElementById("searchInput");
const subjectFilter = document.getElementById("subjectFilter");
const themeToggle = document.getElementById("themeToggle");

const registerModal = document.getElementById("registerModal");
const registerExamTitle = document.getElementById("registerExamTitle");
const registerForm = document.getElementById("registerForm");
const closeRegisterModal = document.getElementById("closeRegisterModal");
const registerFeedback = document.getElementById("registerFeedback");

const examModal = document.getElementById("examModal");
const examModalTitle = document.getElementById("examModalTitle");
const onlineExamForm = document.getElementById("onlineExamForm");
const questionList = document.getElementById("questionList");
const closeExamModal = document.getElementById("closeExamModal");
const examResult = document.getElementById("examResult");

let allExams = [];
let selectedExamForRegistration = null;
let selectedExamForTest = null;

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

function formatDate(ts) {
  if (!ts || typeof ts.toDate !== "function") return "No date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(ts.toDate());
}

function normalize(str) {
  return String(str || "").toLowerCase().trim();
}

function renderSubjects(exams) {
  const subjects = [...new Set(exams.map((e) => e.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  subjectFilter.innerHTML = '<option value="all">All subjects</option>';
  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    subjectFilter.appendChild(option);
  });
}

function renderError(message) {
  loadingState.classList.add("hidden");
  cardsGrid.classList.add("hidden");
  emptyState.classList.add("hidden");
  errorState.textContent = message;
  errorState.classList.remove("hidden");
}

function applyFilters() {
  const q = normalize(searchInput.value);
  const selectedSubject = subjectFilter.value;

  const filtered = allExams.filter((exam) => {
    const matchesSearch =
      normalize(exam.title).includes(q) ||
      normalize(exam.description).includes(q) ||
      normalize(exam.subject).includes(q);

    const matchesSubject = selectedSubject === "all" || exam.subject === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  renderCards(filtered);
}

function openRegisterModal(exam) {
  selectedExamForRegistration = exam;
  registerExamTitle.textContent = exam.title || "Untitled exam";
  registerFeedback.textContent = "";
  registerForm.reset();
  registerModal.classList.remove("hidden");
}

function closeRegister() {
  registerModal.classList.add("hidden");
  selectedExamForRegistration = null;
}

function renderExamQuestions(exam) {
  questionList.innerHTML = "";
  const questions = Array.isArray(exam.questions) ? exam.questions : [];

  questions.forEach((q, idx) => {
    const wrap = document.createElement("article");
    wrap.className = "question-item";

    const title = document.createElement("h3");
    title.textContent = `${idx + 1}. ${q.text || "Question"}`;
    wrap.appendChild(title);

    const options = Array.isArray(q.options) ? q.options : [];
    options.forEach((opt, optIdx) => {
      const label = document.createElement("label");
      label.className = "option-row";
      label.innerHTML = `<input type="radio" name="answer_${idx}" value="${optIdx}" required> <span>${opt}</span>`;
      wrap.appendChild(label);
    });

    questionList.appendChild(wrap);
  });
}

function openExamModal(exam) {
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  if (!questions.length) {
    alert("This exam has no online questions yet.");
    return;
  }

  selectedExamForTest = exam;
  examModalTitle.textContent = `${exam.title || "Exam"} - Online Test`;
  onlineExamForm.reset();
  examResult.classList.add("hidden");
  examResult.textContent = "";
  renderExamQuestions(exam);
  examModal.classList.remove("hidden");
}

function prefillCandidate(name, email) {
  const nameInput = document.getElementById("candidateName");
  const emailInput = document.getElementById("candidateEmail");
  if (nameInput) nameInput.value = name || "";
  if (emailInput) emailInput.value = email || "";
}

function closeExam() {
  examModal.classList.add("hidden");
  selectedExamForTest = null;
  questionList.innerHTML = "";
}

function calculateScore(exam, formData) {
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  let score = 0;
  let total = 0;
  const answers = [];

  questions.forEach((q, idx) => {
    const points = Number(q.points || 1);
    total += points;

    const raw = formData.get(`answer_${idx}`);
    const selectedIndex = raw === null ? -1 : Number(raw);
    const correctIndex = Number(q.correctIndex);
    const isCorrect = selectedIndex === correctIndex;

    if (isCorrect) score += points;

    answers.push({
      questionIndex: idx,
      selectedIndex,
      correctIndex,
      isCorrect,
      points
    });
  });

  return { score, total, answers };
}

function renderCards(exams) {
  cardsGrid.innerHTML = "";

  if (!exams.length) {
    cardsGrid.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  cardsGrid.classList.remove("hidden");

  exams.forEach((exam) => {
    const node = examCardTemplate.content.firstElementChild.cloneNode(true);

    node.querySelector('[data-role="subject"]').textContent = exam.subject || "General";
    node.querySelector('[data-role="date"]').textContent = formatDate(exam.date);
    node.querySelector('[data-role="title"]').textContent = exam.title || "Untitled exam";
    node.querySelector('[data-role="description"]').textContent = exam.description || "No description provided.";
    node.querySelector('[data-role="duration"]').textContent = `Duration: ${exam.duration || "N/A"}`;

    node.querySelector('[data-role="register"]').addEventListener("click", () => openRegisterModal(exam));
    node.querySelector('[data-role="startExam"]').addEventListener("click", () => openExamModal(exam));

    const hasQuestions = Array.isArray(exam.questions) && exam.questions.length > 0;
    if (!hasQuestions) {
      node.querySelector('[data-role="startExam"]').disabled = true;
      node.querySelector('[data-role="startExam"]').textContent = "No Online Questions";
    }

    const downloadBtn = node.querySelector('[data-role="download"]');
    if (exam.downloadLink) {
      downloadBtn.href = exam.downloadLink;
      downloadBtn.classList.remove("hidden");
    }

    cardsGrid.appendChild(node);
  });
}

function startRealtime() {
  const q = query(examsCollection, orderBy("date", "desc"));

  onSnapshot(
    q,
    (snapshot) => {
      loadingState.classList.add("hidden");
      errorState.classList.add("hidden");

      allExams = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      renderSubjects(allExams);
      applyFilters();
    },
    (error) => {
      console.error(error);
      renderError("Could not load exams. Check Firebase config and Firestore rules.");
    }
  );
}

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedExamForRegistration) return;

  const fullName = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const phone = document.getElementById("regPhone").value.trim();

  if (!fullName || !email) {
    registerFeedback.textContent = "Name and email are required.";
    return;
  }

  try {
    await addDoc(registrationsCollection, {
      examId: selectedExamForRegistration.id,
      examTitle: selectedExamForRegistration.title || "",
      fullName,
      email,
      phone,
      registeredAt: serverTimestamp()
    });

    registerFeedback.textContent = "Registration saved successfully.";
    const examToStart = selectedExamForRegistration;
    const hasQuestions = Array.isArray(examToStart.questions) && examToStart.questions.length > 0;
    closeRegister();

    if (hasQuestions) {
      openExamModal(examToStart);
      prefillCandidate(fullName, email);
    } else {
      alert("Registration completed. This exam has no online questions yet.");
    }
  } catch (error) {
    console.error(error);
    registerFeedback.textContent = "Failed to save registration.";
  }
});

onlineExamForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedExamForTest) return;

  const formData = new FormData(onlineExamForm);
  const candidateName = String(formData.get("candidateName") || "").trim();
  const candidateEmail = String(formData.get("candidateEmail") || "").trim();

  if (!candidateName || !candidateEmail) {
    examResult.textContent = "Name and email are required.";
    examResult.classList.remove("hidden");
    return;
  }

  const { score, total, answers } = calculateScore(selectedExamForTest, formData);

  try {
    await addDoc(attemptsCollection, {
      examId: selectedExamForTest.id,
      examTitle: selectedExamForTest.title || "",
      candidateName,
      candidateEmail,
      score,
      total,
      answers,
      submittedAt: serverTimestamp()
    });

    examResult.textContent = `Result: ${score} / ${total}`;
    examResult.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    examResult.textContent = "Could not submit attempt. Please try again.";
    examResult.classList.remove("hidden");
  }
});

closeRegisterModal.addEventListener("click", closeRegister);
closeExamModal.addEventListener("click", closeExam);

registerModal.addEventListener("click", (e) => {
  if (e.target === registerModal) closeRegister();
});

examModal.addEventListener("click", (e) => {
  if (e.target === examModal) closeExam();
});

searchInput.addEventListener("input", applyFilters);
subjectFilter.addEventListener("change", applyFilters);

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
});

bootTheme();
startRealtime();

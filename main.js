import {
  addDoc,
  examsCollection,
  registrationsCollection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "./js/firebase-client.js?v=20260218c";

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

let allExams = [];
let selectedExamForRegistration = null;

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

function buildExamUrl(examId, name = "", email = "") {
  const params = new URLSearchParams({ examId });
  if (name) params.set("name", name);
  if (email) params.set("email", email);
  return `./exam.html?${params.toString()}`;
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

    const questions = Array.isArray(exam.questions) ? exam.questions : [];
    const hasQuestions = questions.length > 0;

    node.querySelector('[data-role="subject"]').textContent = exam.subject || "General";
    node.querySelector('[data-role="date"]').textContent = formatDate(exam.date);
    node.querySelector('[data-role="title"]').textContent = exam.title || "Untitled exam";
    node.querySelector('[data-role="description"]').textContent = exam.description || "No description provided.";
    node.querySelector('[data-role="duration"]').textContent = `Duration: ${exam.duration || "N/A"}`;
    node.querySelector('[data-role="questionCount"]').textContent = `${questions.length} Questions`;

    node.querySelector('[data-role="register"]').addEventListener("click", () => openRegisterModal(exam));

    const startLink = node.querySelector('[data-role="startExam"]');
    startLink.href = buildExamUrl(exam.id);
    if (!hasQuestions) {
      startLink.classList.add("disabled-link");
      startLink.removeAttribute("href");
      startLink.textContent = "No Questions Yet";
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

    const examToStart = selectedExamForRegistration;
    const hasQuestions = Array.isArray(examToStart.questions) && examToStart.questions.length > 0;

    closeRegister();

    if (hasQuestions) {
      window.location.href = buildExamUrl(examToStart.id, fullName, email);
    } else {
      alert("Registration completed. This exam has no online questions yet.");
    }
  } catch (error) {
    console.error(error);
    registerFeedback.textContent = "Failed to save registration.";
  }
});

closeRegisterModal.addEventListener("click", closeRegister);
registerModal.addEventListener("click", (e) => {
  if (e.target === registerModal) closeRegister();
});

searchInput.addEventListener("input", applyFilters);
subjectFilter.addEventListener("change", applyFilters);

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
});

bootTheme();
startRealtime();

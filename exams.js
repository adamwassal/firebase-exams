import {
  auth,
  examsCollection,
  query,
  orderBy,
  onSnapshot,
  signOut
} from "./js/firebase-client.js?v=20260321a";
import { watchActiveStudent, redirectToStudentLogin } from "./js/student-session.js?v=20260321a";

const cardsGrid = document.getElementById("cardsGrid");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const examCardTemplate = document.getElementById("examCardTemplate");
const searchInput = document.getElementById("searchInput");
const subjectFilter = document.getElementById("subjectFilter");
const themeToggle = document.getElementById("themeToggle");
const studentLogoutBtn = document.getElementById("studentLogoutBtn");
const studentWelcome = document.getElementById("studentWelcome");

let allExams = [];

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
  if (!ts || typeof ts.toDate !== "function") return "بدون تاريخ";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(ts.toDate());
}

function normalize(str) {
  return String(str || "").toLowerCase().trim();
}

function buildExamUrl(examId) {
  return `./exam.html?examId=${encodeURIComponent(examId)}`;
}

function renderSubjects(exams) {
  const subjects = [...new Set(exams.map((item) => item.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  subjectFilter.innerHTML = '<option value="all">كل المواد</option>';

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

    node.querySelector('[data-role="subject"]').textContent = exam.subject || "عام";
    node.querySelector('[data-role="date"]').textContent = formatDate(exam.date);
    node.querySelector('[data-role="title"]').textContent = exam.title || "اختبار بدون عنوان";
    node.querySelector('[data-role="description"]').textContent = exam.description || "لا يوجد وصف متاح.";
    node.querySelector('[data-role="duration"]').textContent = `المدة: ${exam.duration || "غير محددة"}`;
    node.querySelector('[data-role="questionCount"]').textContent = `${questions.length} سؤال`;

    const startExam = node.querySelector('[data-role="startExam"]');
    startExam.href = buildExamUrl(exam.id);
    if (!questions.length) {
      startExam.classList.add("disabled-link");
      startExam.removeAttribute("href");
      startExam.textContent = "لا توجد أسئلة بعد";
    }

    const downloadBtn = node.querySelector('[data-role="download"]');
    if (exam.downloadLink) {
      downloadBtn.href = exam.downloadLink;
      downloadBtn.classList.remove("hidden");
    }

    cardsGrid.appendChild(node);
  });
}

function applyFilters() {
  const q = normalize(searchInput.value);
  const selectedSubject = subjectFilter.value;

  const filtered = allExams.filter((exam) => {
    if (!exam.isEnabled) return false;

    const matchesSearch =
      normalize(exam.title).includes(q) ||
      normalize(exam.description).includes(q) ||
      normalize(exam.subject).includes(q);

    const matchesSubject = selectedSubject === "all" || exam.subject === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  renderCards(filtered);
}

function startRealtime() {
  const examsQuery = query(examsCollection, orderBy("date", "desc"));

  onSnapshot(
    examsQuery,
    (snapshot) => {
      loadingState.classList.add("hidden");
      errorState.classList.add("hidden");
      allExams = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      renderSubjects(allExams.filter((exam) => exam.isEnabled));
      applyFilters();
    },
    (error) => {
      console.error(error);
      renderError("تعذر تحميل الاختبارات.");
    }
  );
}

searchInput.addEventListener("input", applyFilters);
subjectFilter.addEventListener("change", applyFilters);

studentLogoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  redirectToStudentLogin("./exams.html");
});

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "light" : "dark");
  });
}

bootTheme();
watchActiveStudent((user, profile) => {
  if (!user || !profile) return;
  studentWelcome.textContent = `مرحبًا ${profile.fullName || profile.email || "طالب"}، هذه الاختبارات المتاحة لك.`;
  startRealtime();
}, { nextPath: "./exams.html" });

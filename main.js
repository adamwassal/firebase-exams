import {
  examsCollection,
  query,
  orderBy,
  onSnapshot
} from "./js/firebase-client.js";

const cardsGrid = document.getElementById("cardsGrid");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const examCardTemplate = document.getElementById("examCardTemplate");
const searchInput = document.getElementById("searchInput");
const subjectFilter = document.getElementById("subjectFilter");
const themeToggle = document.getElementById("themeToggle");

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
  if (!ts || typeof ts.toDate !== "function") {
    return "No date";
  }

  const d = ts.toDate();
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(d);
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

function renderCards(exams) {
  cardsGrid.innerHTML = "";

  if (exams.length === 0) {
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

    const downloadBtn = node.querySelector('[data-role="download"]');
    if (exam.downloadLink) {
      downloadBtn.href = exam.downloadLink;
      downloadBtn.classList.remove("hidden");
    }

    cardsGrid.appendChild(node);
  });
}

function renderError(message) {
  loadingState.classList.add("hidden");
  cardsGrid.classList.add("hidden");
  emptyState.classList.add("hidden");
  errorState.textContent = message;
  errorState.classList.remove("hidden");
}

function startRealtime() {
  const q = query(examsCollection, orderBy("date", "desc"));

  onSnapshot(
    q,
    (snapshot) => {
      loadingState.classList.add("hidden");
      errorState.classList.add("hidden");

      allExams = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      renderSubjects(allExams);
      applyFilters();
    },
    (error) => {
      console.error(error);
      renderError("Could not load exams. Check Firebase config and Firestore indexes/rules.");
    }
  );
}

bootTheme();
startRealtime();

searchInput.addEventListener("input", applyFilters);
subjectFilter.addEventListener("change", applyFilters);

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
});

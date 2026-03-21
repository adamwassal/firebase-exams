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
  if (!ts || typeof ts.toDate !== "function") return "بدون تاريخ";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(ts.toDate());
}

function normalize(str) {
  return String(str || "").toLowerCase().trim();
}

function buildExamUrl(examId, name = "", phone = "") {
  const params = new URLSearchParams({ examId });
  if (name) params.set("name", name);
  if (phone) params.set("phone", phone);
  return `./exam.html?${params.toString()}`;
}

function renderSubjects(exams) {
  const subjects = [...new Set(exams.map((e) => e.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
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

function openRegisterModal(exam) {
  const hasQuestions = Array.isArray(exam?.questions) && exam.questions.length > 0;
  if (!hasQuestions || !exam?.isEnabled) return;

  selectedExamForRegistration = exam;
  registerExamTitle.textContent = exam.title || "اختبار بدون عنوان";
  registerFeedback.textContent = "";
  registerForm.reset();
  registerModal.setAttribute("aria-hidden", "false");
  registerModal.classList.remove("hidden");
}

function closeRegister() {
  registerModal.setAttribute("aria-hidden", "true");
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
    const isEnabled = Boolean(exam.isEnabled);

    node.querySelector('[data-role="subject"]').textContent = exam.subject || "عام";
    node.querySelector('[data-role="date"]').textContent = formatDate(exam.date);
    node.querySelector('[data-role="title"]').textContent = exam.title || "اختبار بدون عنوان";
    node.querySelector('[data-role="description"]').textContent = exam.description || "لا يوجد وصف متاح.";
    node.querySelector('[data-role="duration"]').textContent = `المدة: ${exam.duration || "غير محددة"}`;
    node.querySelector('[data-role="questionCount"]').textContent = `${questions.length} سؤال`;

    const registerBtn = node.querySelector('[data-role="register"]');
    registerBtn.addEventListener("click", () => openRegisterModal(exam));
    if (!isEnabled) {
      registerBtn.disabled = true;
      registerBtn.textContent = "غير مفعّل";
    } else if (!hasQuestions) {
      registerBtn.disabled = true;
      registerBtn.textContent = "لا توجد أسئلة بعد";
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
      renderError("تعذر تحميل الاختبارات. تحقق من إعدادات Firebase وقواعد Firestore.");
    }
  );
}

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedExamForRegistration) return;

  const fullName = document.getElementById("regName").value.trim();
  const phone = document.getElementById("regPhone").value.trim();

  if (!fullName || !phone) {
    registerFeedback.textContent = "الاسم ورقم الهاتف مطلوبان.";
    return;
  }

  try {
    await addDoc(registrationsCollection, {
      examId: selectedExamForRegistration.id,
      examTitle: selectedExamForRegistration.title || "",
      fullName,
      phone,
      registeredAt: serverTimestamp()
    });

    const examToStart = selectedExamForRegistration;
    const hasQuestions = Array.isArray(examToStart.questions) && examToStart.questions.length > 0;

    closeRegister();

    if (hasQuestions) {
      window.location.href = buildExamUrl(examToStart.id, fullName, phone);
    } else {
      alert("تم التسجيل بنجاح، لكن هذا الاختبار لا يحتوي على أسئلة إلكترونية حتى الآن.");
    }
  } catch (error) {
    console.error(error);
    registerFeedback.textContent = "تعذر حفظ بيانات التسجيل.";
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

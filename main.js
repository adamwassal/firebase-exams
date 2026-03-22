import {
  addDoc,
  doc,
  getDoc,
  examsCollection,
  ipHistoriesCollection,
  registrationsCollection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "./js/firebase-client.js?v=20260322a";

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
const ipHistorySection = document.getElementById("ipHistorySection");
const ipHistoryHint = document.getElementById("ipHistoryHint");
const ipHistoryList = document.getElementById("ipHistoryList");
const ipHistoryEmpty = document.getElementById("ipHistoryEmpty");
const regNameInput = document.getElementById("regName");
const regPhoneInput = document.getElementById("regPhone");
const regGuardianPhoneInput = document.getElementById("regGuardianPhone");

let allExams = [];
let selectedExamForRegistration = null;
let currentIpAddress = "";
let currentIpHash = "";
let historyByExamId = {};
let currentDeviceId = "";
let currentHistoryKey = "";
let currentIdentityMode = "ip";
const IP_CACHE_KEY = "firebase-exams:last-known-ip";
const IP_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const DEVICE_ID_KEY = "firebase-exams:device-id";
const STUDENT_PROFILE_KEY = "firebase-exams:student-profile";

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
  if (!ts) return "بدون تاريخ";
  const value = typeof ts.toDate === "function" ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!value) return "بدون تاريخ";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function normalize(str) {
  return String(str || "").toLowerCase().trim();
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

function buildExamUrl(examId, name = "", phone = "", guardianPhone = "") {
  const params = new URLSearchParams({ examId });
  if (name) params.set("name", name);
  if (phone) params.set("phone", normalizePhone(phone));
  if (guardianPhone) params.set("guardianPhone", normalizePhone(guardianPhone));
  return `./exam.html?${params.toString()}`;
}

function readStudentProfile() {
  try {
    const raw = localStorage.getItem(STUDENT_PROFILE_KEY);
    if (!raw) return { fullName: "", phone: "", guardianPhone: "" };

    const parsed = JSON.parse(raw);
    return {
      fullName: String(parsed?.fullName || "").trim(),
      phone: normalizePhone(parsed?.phone || ""),
      guardianPhone: normalizePhone(parsed?.guardianPhone || "")
    };
  } catch (error) {
    console.error("Student profile read failed", error);
    return { fullName: "", phone: "", guardianPhone: "" };
  }
}

function writeStudentProfile(profile) {
  try {
    localStorage.setItem(
      STUDENT_PROFILE_KEY,
      JSON.stringify({
        fullName: String(profile?.fullName || "").trim(),
        phone: normalizePhone(profile?.phone || ""),
        guardianPhone: normalizePhone(profile?.guardianPhone || "")
      })
    );
  } catch (error) {
    console.error("Student profile write failed", error);
  }
}

function prefillRegisterForm() {
  const profile = readStudentProfile();
  if (regNameInput) regNameInput.value = profile.fullName;
  if (regPhoneInput) regPhoneInput.value = profile.phone;
  if (regGuardianPhoneInput) regGuardianPhoneInput.value = profile.guardianPhone;
}

function persistRegisterForm() {
  writeStudentProfile({
    fullName: regNameInput?.value || "",
    phone: regPhoneInput?.value || "",
    guardianPhone: regGuardianPhoneInput?.value || ""
  });
}

async function sha256Hex(value) {
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createDeviceId() {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getOrCreateDeviceId() {
  try {
    const existing = String(localStorage.getItem(DEVICE_ID_KEY) || "").trim();
    if (existing) return existing;

    const created = createDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch (error) {
    console.error("Device ID access failed", error);
    return createDeviceId();
  }
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
    () => fetchJsonIp("https://api4.ipify.org?format=json"),
    () => fetchJsonIp("https://api.ipify.org/?format=json"),
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
      if (ip && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) {
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

  if (historyByExamId[exam.id]) {
    window.location.href = buildExamUrl(exam.id);
    return;
  }

  selectedExamForRegistration = exam;
  registerExamTitle.textContent = exam.title || "اختبار بدون عنوان";
  registerFeedback.textContent = "";
  prefillRegisterForm();
  registerModal.setAttribute("aria-hidden", "false");
  registerModal.classList.remove("hidden");
}

function closeRegister() {
  registerModal.setAttribute("aria-hidden", "true");
  registerModal.classList.add("hidden");
  selectedExamForRegistration = null;
}

function createHistoryNode(entry) {
  const item = document.createElement("article");
  item.className = "admin-item history-item";

  const title = document.createElement("h3");
  title.textContent = entry.examTitle || "اختبار بدون عنوان";
  item.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "muted";
  meta.textContent = `تم التسليم: ${formatDate(entry.submittedAt)} • الدرجة: ${entry.score || 0} / ${entry.total || 0}`;
  item.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "row-actions";

  const link = document.createElement("a");
  link.className = "btn btn-primary";
  link.href = buildExamUrl(entry.examId);
  link.textContent = "مراجعة الإجابات";
  actions.appendChild(link);

  item.appendChild(actions);
  return item;
}

function renderIpHistory() {
  ipHistoryList.innerHTML = "";
  ipHistorySection.classList.remove("hidden");

  const entries = Object.values(historyByExamId).sort((a, b) => {
    const aTime = Number(a?.submittedAtMs || a?.submittedAt?.seconds || 0);
    const bTime = Number(b?.submittedAtMs || b?.submittedAt?.seconds || 0);
    return bTime - aTime;
  });

  if (!entries.length) {
    ipHistoryEmpty.classList.remove("hidden");
    return;
  }

  ipHistoryEmpty.classList.add("hidden");
  entries.forEach((entry) => ipHistoryList.appendChild(createHistoryNode(entry)));
}

async function loadIpHistory() {
  ipHistoryHint.textContent = "جارٍ تحميل سجل الامتحانات من هذا الـ IP...";
  currentDeviceId = getOrCreateDeviceId();
  currentIdentityMode = "ip";

  try {
    const ipLookup = await fetchCurrentIp();
    currentIpAddress = ipLookup.ip;
    currentIpHash = await sha256Hex(currentIpAddress);
    currentHistoryKey = currentIpHash;
    const historySnap = await getDoc(doc(ipHistoriesCollection, currentHistoryKey));
    historyByExamId = historySnap.exists() ? historySnap.data().attemptsByExam || {} : {};
    ipHistoryHint.textContent =
      ipLookup.source === "cache"
        ? `تعذر التحقق المباشر من الـ IP الحالي. تم استخدام آخر IP معروف: ${currentIpAddress}`
        : `تم التعرف على الـ IP الحالي: ${currentIpAddress}`;
  } catch (error) {
    console.error(error);
    currentIpAddress = "";
    currentIpHash = "";
    currentHistoryKey = `device:${currentDeviceId}`;
    currentIdentityMode = "device";

    try {
      const historySnap = await getDoc(doc(ipHistoriesCollection, currentHistoryKey));
      historyByExamId = historySnap.exists() ? historySnap.data().attemptsByExam || {} : {};
      ipHistoryHint.textContent = "تعذر التحقق من الـ IP الحالي. تم عرض سجل هذا المتصفح باستخدام معرّف الجهاز المحلي.";
    } catch (historyError) {
      console.error(historyError);
      historyByExamId = {};
      ipHistoryHint.textContent = "تعذر التحقق من الـ IP الحالي، وتعذر أيضًا تحميل سجل هذا الجهاز.";
    }
  }

  renderIpHistory();
  applyFilters();
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
    const existingEntry = historyByExamId[exam.id];

    node.querySelector('[data-role="subject"]').textContent = exam.subject || "عام";
    node.querySelector('[data-role="date"]').textContent = formatDate(exam.date);
    node.querySelector('[data-role="title"]').textContent = exam.title || "اختبار بدون عنوان";
    node.querySelector('[data-role="description"]').textContent = exam.description || "لا يوجد وصف متاح.";
    node.querySelector('[data-role="duration"]').textContent = `المدة: ${exam.duration || "غير محددة"}`;
    node.querySelector('[data-role="questionCount"]').textContent = `${questions.length} سؤال`;

    const registerBtn = node.querySelector('[data-role="register"]');
    registerBtn.addEventListener("click", () => openRegisterModal(exam));

    if (existingEntry) {
      registerBtn.textContent = "تم إجراء الامتحان بالفعل";
    }

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
  if (!currentHistoryKey) {
    registerFeedback.textContent = "تعذر تحديد هذا الجهاز. أعد تحميل الصفحة ثم حاول مرة أخرى.";
    return;
  }

  const fullName = regNameInput.value.trim();
  const phone = normalizePhone(regPhoneInput.value);
  const guardianPhone = normalizePhone(regGuardianPhoneInput.value);

  if (!fullName || !phone || !guardianPhone) {
    registerFeedback.textContent = "الاسم ورقم الهاتف ورقم ولي الأمر مطلوبة.";
    return;
  }

  if (!isValidEgyptPhone(phone)) {
    registerFeedback.textContent = "أدخل رقم هاتف مصري صحيح مكوّن من 11 رقمًا ويبدأ بـ 010 أو 011 أو 012 أو 015.";
    regPhoneInput.focus();
    return;
  }

  if (!isValidEgyptPhone(guardianPhone)) {
    registerFeedback.textContent = "أدخل رقم هاتف ولي أمر صحيح مكوّن من 11 رقمًا ويبدأ بـ 010 أو 011 أو 012 أو 015.";
    regGuardianPhoneInput.focus();
    return;
  }

  try {
    persistRegisterForm();

    await addDoc(registrationsCollection, {
      examId: selectedExamForRegistration.id,
      examTitle: selectedExamForRegistration.title || "",
      fullName,
      phone,
      guardianPhone,
      ipAddress: currentIpAddress || "",
      ipHash: currentIpHash || "",
      deviceId: currentDeviceId || "",
      historyKey: currentHistoryKey || "",
      identityMode: currentIdentityMode,
      registeredAt: serverTimestamp()
    });

    const examToStart = selectedExamForRegistration;
    const hasQuestions = Array.isArray(examToStart.questions) && examToStart.questions.length > 0;

    closeRegister();

    if (hasQuestions) {
      window.location.href = buildExamUrl(examToStart.id, fullName, phone, guardianPhone);
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
regNameInput?.addEventListener("input", persistRegisterForm);
regPhoneInput?.addEventListener("input", persistRegisterForm);
regGuardianPhoneInput?.addEventListener("input", persistRegisterForm);

searchInput.addEventListener("input", applyFilters);
subjectFilter.addEventListener("change", applyFilters);

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
});

bootTheme();
startRealtime();
loadIpHistory();

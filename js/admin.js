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
} from "./firebase-client.js";

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

let examsCache = [];
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

function resetFormMode() {
  editingId.value = "";
  formTitle.textContent = "Create Exam";
  cancelEditBtn.classList.add("hidden");
  examForm.reset();
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
    node.querySelector('[data-role="meta"]').textContent = `${exam.subject || "General"} • ${dateText}`;

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
        setFeedback("Failed to delete exam.", true);
      }
    });

    adminList.appendChild(node);
  });
}

function watchExams() {
  if (unsubscribeExams) {
    unsubscribeExams();
  }

  const q = query(examsCollection, orderBy("date", "desc"));

  unsubscribeExams = onSnapshot(
    q,
    (snapshot) => {
      examsCache = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      renderAdminList(examsCache);
    },
    (error) => {
      console.error(error);
      setFeedback("Could not load exams list. Check Firestore rules/index.", true);
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
    showAuthError("Login failed. Check credentials.");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    showAuthError("Logout failed.");
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

  const payload = {
    title,
    subject,
    date,
    duration,
    description,
    downloadLink: downloadLink || ""
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
    setFeedback("Save failed. Check auth/rules.", true);
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

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
});

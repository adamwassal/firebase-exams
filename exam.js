import {
  doc,
  onSnapshot,
  addDoc,
  examsCollection,
  attemptsCollection,
  serverTimestamp
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

let currentExam = null;

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
    email: params.get("email") || ""
  };
}

function showError(message) {
  examLoading.classList.add("hidden");
  examPanel.classList.add("hidden");
  examError.textContent = message;
  examError.classList.remove("hidden");
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
    points.textContent = `${q.points} point(s)`;
    card.appendChild(points);

    q.options.forEach((option, optionIdx) => {
      const label = document.createElement("label");
      label.className = "option-row";
      label.innerHTML = `<input type=\"radio\" name=\"answer_${idx}\" value=\"${optionIdx}\" required><span>${option}</span>`;
      card.appendChild(label);
    });

    questionList.appendChild(card);
  });
}

function calculateResult(questions, formData) {
  let score = 0;
  let total = 0;
  const answers = [];

  questions.forEach((q, idx) => {
    const selectedIndex = Number(formData.get(`answer_${idx}`));
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

function prefillCandidate(name, email) {
  const nameInput = document.getElementById("candidateName");
  const emailInput = document.getElementById("candidateEmail");
  if (nameInput) nameInput.value = name;
  if (emailInput) emailInput.value = email;
}

function watchExam(examId) {
  const ref = doc(examsCollection, examId);

  onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        showError("Exam not found.");
        return;
      }

      currentExam = { id: snap.id, ...snap.data() };
      const questions = normalizeQuestions(currentExam);

      examLoading.classList.add("hidden");
      examError.classList.add("hidden");

      if (!questions.length) {
        showError("This exam has no online questions yet.");
        return;
      }

      examTitle.textContent = currentExam.title || "Online Exam";
      examSubtitle.textContent = `${currentExam.subject || "General"} • Duration: ${currentExam.duration || "N/A"}`;
      renderQuestions(questions);
      examPanel.classList.remove("hidden");
    },
    (error) => {
      console.error(error);
      showError("Could not load exam. Check Firebase configuration/rules.");
    }
  );
}

examForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentExam) return;

  const name = document.getElementById("candidateName").value.trim();
  const email = document.getElementById("candidateEmail").value.trim();
  if (!name || !email) {
    alert("Please enter your name and email.");
    return;
  }

  const questions = normalizeQuestions(currentExam);
  const formData = new FormData(examForm);
  const { score, total, answers } = calculateResult(questions, formData);

  try {
    await addDoc(attemptsCollection, {
      examId: currentExam.id,
      examTitle: currentExam.title || "",
      candidateName: name,
      candidateEmail: email,
      score,
      total,
      answers,
      submittedAt: serverTimestamp()
    });

    resultBox.innerHTML = `<h2>Result Submitted</h2><p class=\"muted\">Your score: <strong>${score}</strong> / ${total}</p>`;
    resultBox.classList.remove("hidden");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  } catch (error) {
    console.error(error);
    alert("Could not submit exam. Try again.");
  }
});

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
});

bootTheme();

const params = readParams();
if (!params.examId) {
  showError("Missing examId in URL.");
} else {
  prefillCandidate(params.name, params.email);
  watchExam(params.examId);
}

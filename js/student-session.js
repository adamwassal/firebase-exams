import {
  auth,
  studentsCollection,
  doc,
  getDoc,
  onAuthStateChanged,
  signOut
} from "./firebase-client.js?v=20260321a";

async function getStudentProfile(uid) {
  if (!uid) return null;
  const snapshot = await getDoc(doc(studentsCollection, uid));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

function redirectToStudentLogin(targetPath = "./exams.html") {
  const next = encodeURIComponent(targetPath);
  window.location.href = `./student-login.html?next=${next}`;
}

function watchActiveStudent(callback, options = {}) {
  const { redirectIfMissing = true, nextPath = window.location.pathname.replace(/.*\//, "./") } = options;

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (redirectIfMissing) redirectToStudentLogin(nextPath);
      callback(null, null);
      return;
    }

    const profile = await getStudentProfile(user.uid);
    if (!profile || !profile.isActive) {
      await signOut(auth);
      if (redirectIfMissing) redirectToStudentLogin(nextPath);
      callback(user, null);
      return;
    }

    callback(user, profile);
  });
}

export {
  getStudentProfile,
  redirectToStudentLogin,
  watchActiveStudent
};

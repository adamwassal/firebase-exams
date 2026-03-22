import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  getDocs,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { firebaseConfig } from "../config/firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const examsCollection = collection(db, "exams");
const registrationsCollection = collection(db, "examRegistrations");
const attemptsCollection = collection(db, "examAttempts");
const ipHistoriesCollection = collection(db, "ipHistories");

export {
  auth,
  db,
  examsCollection,
  registrationsCollection,
  attemptsCollection,
  ipHistoriesCollection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  getDocs,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
};

# Firebase Exams Display System

Production-ready static exam display + admin system using:
- HTML
- CSS
- Vanilla JavaScript
- Firebase Firestore + Firebase Auth

## Folder Structure

```text
firebase-exams/
  index.html
  admin.html
  style.css
  main.js
  firestore.rules
  config/
    firebase-config.js
    firebase-config.example.js
  js/
    firebase-client.js
    admin.js
```

## Features

- Real-time exam display (`onSnapshot`) on public site.
- Search + subject filter.
- Loading, empty, and error states.
- Responsive glass UI + dark mode toggle.
- Auth-protected admin CRUD (email/password).
- Exam registration from public website.
- Online exam taking with instant grading and score submission.
- Firestore rules: public read, authenticated exam writes.

## Firestore Data Model

Collection: `exams`

Each document includes:
- `title` (string)
- `subject` (string)
- `date` (timestamp)
- `duration` (string)
- `description` (string)
- `downloadLink` (optional string)
- `createdAt` (timestamp)
- `questions` (array, optional for online exam)
  - `text` (string)
  - `options` (string[])
  - `correctIndex` (number)
  - `points` (number)

Collection: `examRegistrations`
- `examId`, `examTitle`, `fullName`, `email`, `phone`, `registeredAt`

Collection: `examAttempts`
- `examId`, `examTitle`, `candidateName`, `candidateEmail`, `score`, `total`, `answers`, `submittedAt`

## Firebase Setup

1. Create a Firebase project.
2. Enable Firestore Database.
3. Enable Firebase Authentication -> Email/Password.
4. Create at least one admin user in Authentication.
5. Replace `config/firebase-config.js` values with your Firebase Web App config.

### Important Security Note About Firebase Config

Firebase web config is not a secret in frontend apps and will be visible in browser source.
Security must rely on:
- Firestore Rules
- Auth checks
- Firebase App Check (optional)
- API key restrictions in Google Cloud Console

## Firestore Security Rules

Use `firestore.rules` in this folder:

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /exams/{examId} {
      allow read: if true;
      allow create, update, delete: if request.auth != null;
    }

    match /examRegistrations/{registrationId} {
      allow create: if true;
      allow read, update, delete: if request.auth != null;
    }

    match /examAttempts/{attemptId} {
      allow create: if true;
      allow read, update, delete: if request.auth != null;
    }
  }
}
```

## Local Run

Any static server works. Example with Python:

```bash
cd firebase-exams
python3 -m http.server 5500
```

Open:
- `http://localhost:5500/index.html` (public)
- `http://localhost:5500/admin.html` (admin)

## GitHub Pages Deployment

### Option A (Recommended): GitHub Actions + Secrets

1. Commit everything including `.github/workflows/deploy-firebase-exams.yml`.
2. In GitHub repo settings -> Secrets and variables -> Actions, add:
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`
3. Push to `main`.
4. Workflow deploys `firebase-exams/` to `gh-pages` automatically.
5. In GitHub Settings -> Pages, set source to `gh-pages` branch.

### Option B: Direct Commit Config

Put real values in `config/firebase-config.js`, commit, and deploy.
This is simpler but exposes config in repo (still normal for Firebase web apps).

## Real-time Behavior

`index.html` uses Firestore `onSnapshot(query(orderBy('date', 'desc')))`.
Any exam change in Firestore updates the deployed website immediately, without redeploy.

## Production Hardening Checklist

- Restrict Firebase API key in Google Cloud Console.
- Keep strict Firestore rules.
- Optionally enable Firebase App Check.
- Set up Firebase Alerts/Monitoring.

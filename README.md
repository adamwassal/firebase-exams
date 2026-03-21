# نظام عرض الاختبارات باستخدام Firebase

نظام جاهز للإنتاج لعرض الاختبارات وإدارتها باستخدام:
- HTML
- CSS
- Vanilla JavaScript
- Firebase Firestore + Firebase Auth

## هيكل المجلدات

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

## المميزات

- عرض الاختبارات لحظيًا (`onSnapshot`) في الموقع العام.
- البحث والتصفية حسب المادة.
- حالات تحميل وفراغ وخطأ.
- واجهة زجاجية متجاوبة مع تبديل المظهر الداكن.
- لوحة إدارة محمية بتسجيل الدخول لإنشاء وتعديل وحذف الاختبارات.
- تسجيل المتقدمين من الموقع العام.
- أداء الاختبار إلكترونيًا مع التصحيح الفوري وحفظ النتيجة.
- قواعد Firestore تسمح بالقراءة العامة وتقيّد التعديل للمستخدمين المصرح لهم.

## نموذج البيانات في Firestore

المجموعة: `exams`

كل مستند يحتوي على:
- `title` (string)
- `subject` (string)
- `date` (timestamp)
- `duration` (string)
- `description` (string)
- `downloadLink` (نص اختياري)
- `createdAt` (timestamp)
- `questions` (مصفوفة، اختيارية للاختبار الإلكتروني)
  - `text` (نص)
  - `options` (مصفوفة نصوص)
  - `correctIndex` (رقم)
  - `points` (رقم)

المجموعة: `examRegistrations`
- `examId`, `examTitle`, `fullName`, `email`, `phone`, `registeredAt`

المجموعة: `examAttempts`
- `examId`, `examTitle`, `candidateName`, `candidateEmail`, `score`, `total`, `answers`, `submittedAt`

## إعداد Firebase

1. أنشئ مشروع Firebase جديدًا.
2. فعّل Firestore Database.
3. فعّل Firebase Authentication ثم Email/Password.
4. أنشئ مستخدم مشرف واحدًا على الأقل داخل Authentication.
5. استبدل القيم في `config/firebase-config.js` بإعدادات تطبيق الويب الخاص بك.

### ملاحظة أمنية مهمة حول إعدادات Firebase

إعدادات Firebase في تطبيقات الواجهة الأمامية ليست سرية، وستكون ظاهرة في مصدر الصفحة.
الحماية يجب أن تعتمد على:
- قواعد Firestore
- التحقق من تسجيل الدخول
- Firebase App Check بشكل اختياري
- تقييد مفتاح API من Google Cloud Console

## قواعد أمان Firestore

استخدم ملف `firestore.rules` الموجود في هذا المجلد:

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

## التشغيل المحلي

يمكنك استخدام أي خادم ملفات ثابتة. مثال باستخدام Python:

```bash
cd firebase-exams
python3 -m http.server 5500
```

افتح:
- `http://localhost:5500/index.html` (الواجهة العامة)
- `http://localhost:5500/admin.html` (لوحة الإدارة)

## النشر على GitHub Pages

### الخيار A (مستحسن): GitHub Actions مع Secrets

1. نفّذ `commit` لكل الملفات بما فيها `.github/workflows/deploy-firebase-exams.yml`.
2. من إعدادات المستودع في GitHub ثم `Secrets and variables` ثم `Actions` أضف:
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`
3. ادفع التغييرات إلى فرع `main`.
4. سيقوم الـ workflow بنشر `firebase-exams/` إلى `gh-pages` تلقائيًا.
5. من إعدادات GitHub ثم `Pages` اختر فرع `gh-pages` كمصدر للنشر.

### الخيار B: حفظ الإعدادات مباشرة في المستودع

ضع القيم الحقيقية في `config/firebase-config.js` ثم نفّذ `commit` وانشر المشروع.
هذا الخيار أبسط، لكنه يجعل الإعدادات ظاهرة في المستودع، وهو أمر معتاد في تطبيقات Firebase للويب.

## التحديث اللحظي

يستخدم `index.html` الاستعلام `onSnapshot(query(orderBy('date', 'desc')))`.
أي تعديل على الاختبارات داخل Firestore سيظهر مباشرة في الموقع المنشور دون الحاجة إلى إعادة نشر.

## قائمة تحسينات ما قبل الإنتاج

- قيّد مفتاح Firebase API من Google Cloud Console.
- حافظ على قواعد Firestore بشكل صارم.
- فعّل Firebase App Check إذا احتجت لذلك.
- أضف تنبيهات ومراقبة Firebase.

# MzansiCare — Setup & Deployment

Firebase-powered web app: patients, appointments, reminders, supplies, feedback, AI triage/med-check, OCR, and virtual queue with admin console.

## Quick start
- Open `index.html` with Live Server or host over http(s) to enable Google Auth popups.
- Register/login, edit your profile, and book appointments.
- To access Admin, sign in with `admin@mzansicare.co.za` (or add your UID under Firestore collection `admins/{uid}` with `{ role: 'admin' }`).

## Roles and dashboards
- Role is stored on the patient doc as `role: 'patient' | 'staff' | 'admin'`.
- Admin: `admin.html` (global clinic view; seed demo data; manage supplies/appointments; Queue Console).
- Staff: `staff.html` (read-only clinic view of patients/appointments; extend as needed).
- Patient: `profile.html` (dedicated profile page; Digital ID, appointments, reminders, feedback).

## Admin seeding
- Open `admin.html` while signed in as an admin.
- Click "Seed Demo Data" to populate patients, appointments, reminders, and supplies.

## Deploy to Firebase Hosting + Functions
1) Install Firebase CLI and log in:
	- npm i -g firebase-tools
	- firebase login
2) Initialize (once):
	- firebase init (select Hosting + Functions, use existing project or create one)
3) Functions: install and deploy
	- cd functions && npm install && firebase deploy --only functions
4) Hosting: deploy
	- cd .. && firebase deploy --only hosting

## Cloud Functions included
- `functions/index.js`
  - `aiTriage(data: {symptoms, profile}) -> {urgency, suggested_clinic, estimated_wait}`
  - `aiMedCheck(data: {currentMeds, newMed, patientConditions}) -> {safe, interactions[]}`

The web app prefers callables first; on error/unavailable, it falls back to client heuristics in `js/ai.js`.

## OCR & QR scanning (Scan Medical Card)
- OCR uses Tesseract.js (CDN). Choose a clear photo of the medical card; extracted fields are shown as JSON.
- QR decoding uses jsQR (CDN). If a QR is present, we decode it; if the payload is JSON (e.g. `{ name, clinicId, bloodType, conditions, medications, emergencyContact }`), those fields are merged into the extracted result.
- Click "Save to Profile" to merge fields into `patients/{uid}`.

## Voice-to-text triage
- Click the mic icon in the Triage modal and speak your symptoms; recognition runs in `en-ZA`.
- When it stops, press Analyze to get urgency, suggested clinic, and estimated wait.
- Works in Chromium-based browsers; others may not support the Web Speech API.

## Notes
- Firestore rules: restrict by role and user; secure callable functions; consider server-side slot uniqueness enforcement.
- Push notifications: integrate FCM beyond the in-app toasts if needed.
- Health Profile source of truth: user-managed; staff/admin dashboards reflect live Firestore data.

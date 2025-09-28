const functions = require('firebase-functions');
const admin = require('firebase-admin');
// Helper: compute ETA minutes based on current waiting count and avg service time
function computeEtaMinutes(waitingCount, avgServiceMinutes = 6) {
  return Math.max(0, waitingCount * avgServiceMinutes);
}

// Firestore trigger: when a ticket is created, assign position and etaMinutes
exports.onTicketCreate = functions.firestore
  .document('queues/{clinicId}/tickets/{ticketId}')
  .onCreate(async (snap, context) => {
    const { clinicId } = context.params;
    const ref = admin.firestore().collection('queues').doc(clinicId).collection('tickets');
    const all = await ref.orderBy('createdAt').get();
    // Count how many are waiting or called before this ticket
    let waitingBefore = 0;
    all.forEach(d => { const s = d.data().status || 'waiting'; if (['waiting','called'].includes(s)) waitingBefore++; });
    const avgServiceMinutes = 6; // TODO: make dynamic per clinic
    const etaMinutes = computeEtaMinutes(Math.max(0, waitingBefore - 1), avgServiceMinutes);
    await snap.ref.set({ position: waitingBefore, etaMinutes }, { merge: true });
  });

// Callable: join queue with optional geofence and priority flag
// Input: { clinicId: string, reason?: string, coords?: {lat, lng}, priority?: 'vip'|'elderly'|'emergency'|'normal' }
exports.joinQueue = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign-in required');
  const uid = context.auth.uid;
  const clinicId = String(data?.clinicId || '').trim();
  if (!clinicId) throw new functions.https.HttpsError('invalid-argument', 'clinicId required');
  const reason = data?.reason ? String(data.reason) : null;
  const priority = ['vip','elderly','emergency'].includes(String(data?.priority)) ? String(data.priority) : 'normal';

  // Optional: geofence check here (pseudo-code)
  // const withinRange = await verifyWithinRange(data?.coords, clinicId);
  // if (!withinRange) throw new functions.https.HttpsError('failed-precondition','Must be near clinic to join');

  const ref = admin.firestore().collection('queues').doc(clinicId).collection('tickets');
  const doc = await ref.add({
    userId: uid,
    reason,
    status: 'waiting',
    priority,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  const d = await doc.get();
  return { id: doc.id, ticket: d.data() };
});

// Optional: onUpdate trigger -> notify when called/next (requires FCM setup)
exports.onTicketUpdate = functions.firestore
  .document('queues/{clinicId}/tickets/{ticketId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {}; const after = change.after.data() || {};
    if (before.status !== 'called' && after.status === 'called') {
      try {
        const uid = after.userId;
        if (!uid) return;
        const p = await admin.firestore().collection('patients').doc(uid).get();
        const token = p.exists ? p.data().fcmToken : null;
        if (!token) return;
        const msg = {
          token,
          notification: {
            title: 'MzansiCare: You are being called',
            body: 'Please proceed to reception.'
          },
          data: {
            type: 'queue_called',
            clinicId: String(context.params.clinicId || '')
          }
        };
        await admin.messaging().send(msg);
      } catch (e) { console.warn('FCM send failed', e); }
    }
  });

// Initialize Admin SDK once
try { admin.initializeApp(); } catch {}

// Callable: AI Triage
// Input: { symptoms: string, profile?: { age?: number, conditions?: string } }
// Output: { urgency: 'low'|'medium'|'high', suggested_clinic: string, estimated_wait: string }
exports.aiTriage = functions.https.onCall(async (data, context) => {
  const symptoms = String(data?.symptoms || '').toLowerCase();
  const profile = data?.profile || {};

  // Basic auth gate (optional): require signed-in user
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign-in required');
  }

  // Simple heuristic service-side (replace with model call if desired)
  let score = 0;
  const weights = { 'chest pain': 3, breathless: 2, bleeding: 2, faint: 2, fever: 1, cough: 1, dehydration: 2 };
  Object.keys(weights).forEach(k => { if (symptoms.includes(k)) score += weights[k]; });
  if ((profile.age || 0) >= 65) score += 1;
  if (String(profile.conditions||'').toLowerCase().includes('pregnan')) score += 1;

  const urgency = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
  const suggested_clinic = symptoms.includes('chest') ? 'Emergency / GP' : symptoms.includes('cough') ? 'GP / Respiratory' : 'General';
  const estimated_wait = urgency === 'high' ? '10-20 min' : urgency === 'medium' ? '30-60 min' : '60-120 min';
  return { urgency, suggested_clinic, estimated_wait };
});

// Callable: Medication Checker
// Input: { currentMeds: string[], newMed: string, patientConditions?: string[] }
// Output: { safe: boolean, interactions: Array<{drugs: string[], risk: string, effect: string, suggestion: string}>, south_africa_specific: boolean }
exports.aiMedCheck = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign-in required');
  }
  const current = Array.isArray(data?.currentMeds) ? data.currentMeds.map(String) : [];
  const newMed = String(data?.newMed || '');
  const conditions = Array.isArray(data?.patientConditions) ? data.patientConditions.map(String) : [];

  const lowerMeds = current.map(m => m.toLowerCase().trim());
  const lowerNew = newMed.toLowerCase().trim();
  const interactions = [];

  if (lowerMeds.includes('warfarin') && ['ibuprofen', 'aspirin', 'naproxen'].includes(lowerNew)) {
    interactions.push({
      drugs: ['Warfarin', newMed],
      risk: 'high',
      effect: 'Increased bleeding risk',
      suggestion: 'Consider paracetamol (acetaminophen) and consult your clinician.'
    });
  }
  if (conditions.map(c => c.toLowerCase()).some(c => c.includes('asthma')) && lowerNew.includes('propranolol')) {
    interactions.push({
      drugs: [newMed],
      risk: 'medium',
      effect: 'May worsen bronchospasm in asthma',
      suggestion: 'Ask about cardioselective alternatives or non-pharmacological options.'
    });
  }

  return { safe: interactions.length === 0, interactions, south_africa_specific: true };
});

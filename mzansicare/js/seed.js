// Firestore seeding utilities for demo data
// Creates: patients, appointments, reminders, supplies collections with sample docs

(function () {
  const SEED_FLAG_DOC = 'seed_status/initial_seed';

  async function seedDemoData() {
    if (!auth || !db) {
      alert('Firebase not initialized');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      alert('Sign in as an admin to seed data.');
      return;
    }

    // Simple admin gate: allow if user email is in allowlist or has custom claim (if set by backend)
    const adminAllowlist = ['admin@mzansicare.co.za'];
    let isAdmin = adminAllowlist.includes(user.email);

    try {
      // Try to read custom claim via a marker in Firestore (client can't read custom claims directly)
      const adminDoc = await db.collection('admins').doc(user.uid).get();
      if (adminDoc.exists && adminDoc.data().role === 'admin') {
        isAdmin = true;
      }
    } catch (e) {
      console.warn('Admin check failed, falling back to allowlist:', e);
    }

    if (!isAdmin) {
      if (!confirm('You are not marked as admin. Proceed to seed demo data anyway?')) return;
    }

    const seedBtn = document.getElementById('seed-btn');
    setBtnLoading(seedBtn, true, 'Seeding...');

    try {
      // Idempotency: if already seeded, ask to proceed
      const seedDoc = await db.doc(SEED_FLAG_DOC).get();
      if (seedDoc.exists) {
        const proceed = confirm('Demo data appears to be already seeded. Seed again (may duplicate)?');
        if (!proceed) {
          setBtnLoading(seedBtn, false);
          return;
        }
      }

      // Sample patients
      const patients = [
        {
          name: 'Thabo Mokoena',
          email: 'thabo@example.com',
          clinicId: 'MC-THA-001',
          conditions: 'Hypertension',
          medications: 'Amlodipine 5mg daily',
          bloodType: 'O+',
          emergencyContact: 'Naledi Mokoena - 0821234567',
        },
        {
          name: 'Aisha Khan',
          email: 'aisha@example.com',
          clinicId: 'MC-AIS-002',
          conditions: 'Type 2 Diabetes',
          medications: 'Metformin 500mg twice daily',
          bloodType: 'A-',
          emergencyContact: 'Imran Khan - 0729876543',
        },
        {
          name: 'Sipho Dlamini',
          email: 'sipho@example.com',
          clinicId: 'MC-SIP-003',
          conditions: 'Asthma',
          medications: 'Salbutamol inhaler PRN',
          bloodType: 'B+',
          emergencyContact: 'Zanele Dlamini - 0834567890',
        },
      ];

      const patientRefs = [];
      for (const p of patients) {
        const ref = db.collection('patients').doc();
        await ref.set({
          ...p,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastLogin: null,
        });
        patientRefs.push({ id: ref.id, ...p });
      }

      // Clinics
      const clinics = [
        { id: 'jhb-central', name: 'Johannesburg Central Clinic' },
        { id: 'cpt-health', name: 'Cape Town Health Center' },
        { id: 'dbn-medical', name: 'Durban Medical Clinic' },
      ];

      const today = new Date();
      function datePlus(days) {
        const d = new Date(today);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
      }

      // Appointments per patient
      const apptPayloads = [];
      for (const pr of patientRefs) {
        apptPayloads.push(
          {
            userId: pr.id,
            clinic: clinics[0].id,
            date: datePlus(2),
            time: '10:00',
            reason: 'Routine checkup',
            status: 'confirmed',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            patientName: pr.name,
          },
          {
            userId: pr.id,
            clinic: clinics[1].id,
            date: datePlus(7),
            time: '14:30',
            reason: 'Medication review',
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            patientName: pr.name,
          }
        );
      }

      const apptRefs = [];
      for (const a of apptPayloads) {
        const ref = await db.collection('appointments').add(a);
        apptRefs.push({ id: ref.id, ...a });
      }

      // Reminders for each appointment (24h before)
      for (const a of apptRefs) {
        const reminderTime = new Date(`${a.date}T${a.time}`);
        reminderTime.setHours(reminderTime.getHours() - 24);
        await db.collection('reminders').add({
          userId: a.userId,
          appointmentId: a.id,
          type: 'appointment',
          title: 'Upcoming Appointment',
          message: `Remember your appointment at ${a.clinic} tomorrow at ${a.time}`,
          scheduledTime: reminderTime,
          status: 'pending',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Supplies inventory demo
      const supplies = [
        { item: 'Paracetamol 500mg', quantity: 1200, unit: 'tabs', status: 'ok' },
        { item: 'Amlodipine 5mg', quantity: 300, unit: 'tabs', status: 'low' },
        { item: 'Insulin (Rapid-Acting)', quantity: 45, unit: 'vials', status: 'critical' },
        { item: 'N95 Masks', quantity: 800, unit: 'pcs', status: 'ok' },
        { item: 'Gloves (Medium)', quantity: 150, unit: 'boxes', status: 'low' },
      ];
      for (const s of supplies) {
        await db.collection('supplies').add({
          ...s,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }

      await db.doc(SEED_FLAG_DOC).set({ seededAt: firebase.firestore.FieldValue.serverTimestamp(), by: user.uid });

      toast('Demo data seeded successfully ✅');
      // optional: refresh admin tables
      if (window.AdminPage && typeof window.AdminPage.refresh === 'function') {
        window.AdminPage.refresh();
      }
    } catch (e) {
      console.error('Seed error:', e);
      alert('Failed to seed demo data: ' + (e.message || e));
    } finally {
      setBtnLoading(seedBtn, false);
    }
  }

  function toast(message) {
    const n = document.createElement('div');
    n.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#333;color:#fff;padding:10px 14px;border-radius:8px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,.15)';
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3000);
  }

  function setBtnLoading(btn, loading, text) {
    if (!btn) return;
    if (loading) {
      btn.setAttribute('data-text', btn.innerHTML);
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (text || 'Working...');
      btn.disabled = true;
      btn.style.opacity = '0.8';
    } else {
      const t = btn.getAttribute('data-text');
      if (t) btn.innerHTML = t;
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const seedBtn = document.getElementById('seed-btn');
    if (seedBtn) seedBtn.addEventListener('click', seedDemoData);
  });
})();

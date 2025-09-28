// Virtual Queue management using Firestore
// Collections: queues/{clinicId}/tickets
// Ticket: { userId, createdAt, status: waiting|called|served|cancelled, position }

(async function(){
  const QUEUE_COLLECTION = 'queues';

  function makeToast(msg, color = '#2e7d32') {
    if (window.showSnackbar) return window.showSnackbar({ type: color==='#c62828'?'error':'success', text: msg, duration: 3500 });
    const n = document.createElement('div');
    n.style.cssText = `position:fixed;top:20px;right:20px;background:${color};color:#fff;padding:12px 16px;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.15)`;
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(()=>{ n.remove(); }, 3500);
  }

  function bindQueueModal() {
    const openBtn = document.getElementById('open-queue');
    const modal = document.getElementById('queue-modal');
    if (openBtn && modal) openBtn.addEventListener('click', ()=> modal.style.display = 'flex');
    document.querySelectorAll('[data-close="#queue-modal"]').forEach(x=>{
      x.addEventListener('click', ()=> modal.style.display='none');
    });
    window.addEventListener('click', (e)=>{ if(e.target===modal) modal.style.display='none'; });
  }

  // Haversine distance (km)
  function haversineKm(a, b) {
    const toRad = d => d * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    const d = 2 * R * Math.asin(Math.sqrt(x));
    return d;
  }

  const CLINIC_COORDS = {
    'jhb-central': { lat: -26.2041, lng: 28.0473 },
    'cpt-health': { lat: -33.9249, lng: 18.4241 },
    'dbn-medical': { lat: -29.8587, lng: 31.0218 },
    'pretoria-general': { lat: -25.7479, lng: 28.2293 },
    'soweto-clinic': { lat: -26.2678, lng: 27.8585 },
    // Hospitals
    'charlotte-maxeke': { lat: -26.1887, lng: 28.0473 },
    'baragwanath': { lat: -26.2637, lng: 27.9361 },
    'groote-schuur': { lat: -33.9495, lng: 18.4655 },
    'steve-biko': { lat: -25.7390, lng: 28.2053 },
    'king-edward': { lat: -29.8717, lng: 31.0006 },
  };

  async function getNextPosition(clinicId) {
    const snap = await db.collection(QUEUE_COLLECTION).doc(clinicId).collection('tickets').orderBy('createdAt').get();
    let pos = 1;
    snap.forEach(doc=>{ const d = doc.data(); if(['waiting','called'].includes(d.status)) pos++; });
    return pos;
  }

  async function joinQueue(e) {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      makeToast('Login to access', '#c62828');
      // try open auth modal if available
      const modal = document.getElementById('auth-modal');
      if (modal) modal.style.display = 'flex';
      return;
    }

    const clinicId = document.getElementById('queue-clinic').value;
    const reason = document.getElementById('queue-reason').value;
    if (!clinicId) { makeToast('Choose a clinic', '#c62828'); return; }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Joining…';

    try {
      // Dedupe: if user already has an active ticket anywhere, show it and return
      try {
        let active = null;
        try {
          const cg = await db.collectionGroup('tickets')
            .where('userId','==', user.uid)
            .orderBy('createdAt','desc')
            .limit(1)
            .get();
          const d0 = cg.docs[0];
          if (d0) {
            const data = d0.data();
            if (['waiting','called'].includes(data.status||'')) {
              const facilityId = d0.ref.parent.parent.id;
              active = { docId: d0.id, facilityId, data };
            }
          }
        } catch (cgErr) {
          // Fallback: check only the selected clinic
          const q = await db.collection(QUEUE_COLLECTION).doc(clinicId).collection('tickets')
            .where('userId','==', user.uid)
            .limit(1)
            .get();
          const d1 = q.docs[0];
          if (d1) {
            const data = d1.data();
            if (['waiting','called'].includes(data.status||'')) active = { docId: d1.id, facilityId: clinicId, data };
          }
        }
        if (active) {
          makeToast('You already have an active ticket. Opening it…', '#1565c0');
          const modal = document.getElementById('queue-modal'); if (modal) modal.style.display = 'flex';
          const sel = document.getElementById('queue-clinic');
          if (sel) {
            if (![...sel.options].some(o=>o.value===active.facilityId)) {
              const opt = document.createElement('option'); opt.value = active.facilityId; opt.textContent = active.facilityId; sel.appendChild(opt);
            }
            sel.value = active.facilityId;
          }
          const statusBox = document.getElementById('queue-status');
          const num = document.getElementById('ticket-number');
          const posEl = document.getElementById('ticket-position');
          const waitEl = document.getElementById('ticket-wait');
          if (statusBox && num && posEl && waitEl) {
            statusBox.style.display = 'block';
            num.textContent = String(active.docId).substring(0,6).toUpperCase();
            const pos = typeof active.data.position === 'number' ? active.data.position : '—';
            const eta = typeof active.data.etaMinutes === 'number' ? active.data.etaMinutes : (typeof active.data.position === 'number' ? Math.max(0,(active.data.position-1)*6) : null);
            posEl.textContent = 'Position: ' + pos;
            waitEl.textContent = 'Est. wait: ' + (eta!=null?eta+' min':'—');
          }
          // Listen for updates
          db.collection(QUEUE_COLLECTION).doc(active.facilityId).collection('tickets').doc(active.docId)
            .onSnapshot(doc=>{
              const d = doc.data(); if (!d) return;
              if (d.status === 'called') makeToast('You are being called. Please proceed to reception.', '#1565c0');
              if (d.status === 'served') makeToast('Your visit is completed. Thank you!', '#2e7d32');
              if (typeof d.position === 'number') {
                const posEl2 = document.getElementById('ticket-position');
                const waitEl2 = document.getElementById('ticket-wait');
                if (posEl2) posEl2.textContent = 'Position: ' + d.position;
                const eta2 = typeof d.etaMinutes === 'number' ? d.etaMinutes : Math.max(0,(d.position-1)*6);
                if (waitEl2) waitEl2.textContent = 'Est. wait: ' + eta2 + ' min';
              }
            });
          submitBtn.disabled = false; submitBtn.textContent = 'Get Ticket';
          return;
        }
      } catch (_e) { /* ignore dedupe errors */ }

      // Optional geofence: require within 25km of clinic
      const clinic = CLINIC_COORDS[clinicId];
      if (clinic && navigator.geolocation) {
        try {
          const coords = await new Promise((res, rej)=> navigator.geolocation.getCurrentPosition(p=>res(p.coords), rej, { enableHighAccuracy:true, timeout:5000 }));
          const dkm = haversineKm({lat:coords.latitude, lng:coords.longitude}, clinic);
          if (dkm > 25) { makeToast('You need to be near the clinic to join this queue.','\#c62828'); submitBtn.disabled=false; submitBtn.textContent='Get Ticket'; return; }
        } catch {
          // if geolocation fails, continue as best effort
        }
      }

      // If callable joinQueue is available, prefer server-side join (geo/priorities/position assigned in trigger)
      let callableJoined = false, serverId = null;
      try {
        if (window.firebase && firebase.functions) {
          const joinFn = firebase.functions().httpsCallable('joinQueue');
          const res = await joinFn({ clinicId, reason, priority: 'normal' });
          if (res && res.data && res.data.id) {
            callableJoined = true;
            serverId = res.data.id;
          }
        }
  } catch (fnErr) { /* fallback to client path below */ console.warn('Callable joinQueue failed, falling back:', fnErr?.message || fnErr); }

      if (callableJoined) {
        // UI will be updated by listener below
        const statusBox = document.getElementById('queue-status');
        const num = document.getElementById('ticket-number');
        const posEl = document.getElementById('ticket-position');
        const waitEl = document.getElementById('ticket-wait');
        if (statusBox && num && posEl && waitEl) {
          statusBox.style.display = 'block';
          num.textContent = String(serverId).substring(0,6).toUpperCase();
          posEl.textContent = 'Position: —';
          waitEl.textContent = 'Est. wait: calculating…';
        }
        // Listen for updates
        db.collection(QUEUE_COLLECTION).doc(clinicId).collection('tickets').doc(serverId)
          .onSnapshot(doc=>{
            const d = doc.data(); if (!d) return;
            if (d.status === 'called') {
              makeToast('You are being called. Please proceed to reception.', '#1565c0');
              const animHost = document.getElementById('queue-called-anim');
              if (animHost && window.lottie) {
                animHost.style.display='block';
                const anim = lottie.loadAnimation({ container: animHost, renderer:'svg', loop:false, autoplay:true, path:'https://assets9.lottiefiles.com/packages/lf20_Cc8Bpg.json' });
                anim.addEventListener('complete', ()=>{ anim.destroy(); animHost.style.display='none'; });
              }
            }
            if (d.status === 'served') makeToast('Your visit is completed. Thank you!', '#2e7d32');
            const posEl2 = document.getElementById('ticket-position');
            const waitEl2 = document.getElementById('ticket-wait');
            if (typeof d.position === 'number' && posEl2) posEl2.textContent = 'Position: ' + d.position;
            const eta = typeof d.etaMinutes === 'number' ? d.etaMinutes : (typeof d.position === 'number' ? Math.max(0, (d.position-1)*6) : null);
            if (eta != null && waitEl2) waitEl2.textContent = 'Est. wait: ' + eta + ' min';
          });
        makeToast('You joined the queue. We will notify you when it is your turn.');
        return;
      }

      // Fallback client-side join (no callable)
      const position = await getNextPosition(clinicId);
      const ticket = {
        userId: user.uid,
        reason: reason || null,
        status: 'waiting',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        position
      };
      const ref = await db.collection(QUEUE_COLLECTION).doc(clinicId).collection('tickets').add(ticket);

      // Estimate wait: 5-8 minutes per position baseline
  const estMin = Math.max(0, (position-1) * 6);
      // Update UI
      const statusBox = document.getElementById('queue-status');
      const num = document.getElementById('ticket-number');
      const posEl = document.getElementById('ticket-position');
      const waitEl = document.getElementById('ticket-wait');
      if (statusBox && num && posEl && waitEl) {
        statusBox.style.display = 'block';
        num.textContent = ref.id.substring(0,6).toUpperCase();
        posEl.textContent = 'Position: ' + position;
        waitEl.textContent = 'Est. wait: ' + estMin + ' min';
      }

      makeToast('You joined the queue. We will notify you when it is your turn.');

      // Optional: listen for updates to your ticket (called/served)
      db.collection(QUEUE_COLLECTION).doc(clinicId).collection('tickets').doc(ref.id)
        .onSnapshot(doc=>{
          const d = doc.data();
          if (!d) return;
          if (d.status === 'called') makeToast('You are being called. Please proceed to reception.', '#1565c0');
          if (d.status === 'served') makeToast('Your visit is completed. Thank you!', '#2e7d32');
          if (typeof d.position === 'number') {
            const waitEl2 = document.getElementById('ticket-wait');
            const posEl2 = document.getElementById('ticket-position');
            if (posEl2) posEl2.textContent = 'Position: ' + d.position;
            const eta = typeof d.etaMinutes === 'number' ? d.etaMinutes : Math.max(0, (d.position-1)*6);
            if (waitEl2) waitEl2.textContent = 'Est. wait: ' + eta + ' min';
          }
        });

    } catch (err) {
      console.error('Join queue error:', err);
      const msg = (err && err.message) ? String(err.message) : '';
      if (/permission|unauth|not authorized/i.test(msg)) {
        makeToast('Login to access', '#c62828');
        const modal = document.getElementById('auth-modal');
        if (modal) modal.style.display = 'flex';
      } else if (/location|geoloc|near the clinic/i.test(msg)) {
        makeToast('Join blocked: you must be near the clinic.', '#c62828');
      } else {
        makeToast('Failed to join queue.', '#c62828');
      }
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Get Ticket';
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    bindQueueModal();
    const form = document.getElementById('queue-form');
    if (form) form.addEventListener('submit', joinQueue);
  });
})();

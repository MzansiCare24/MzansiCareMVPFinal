// Admin page logic: loads patients, appointments, supplies and renders tables
(function () {
  async function loadPatients() {
    const tbody = document.querySelector('#patients-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
    const slowTimer = setTimeout(() => {
      try { tbody.innerHTML = '<tr><td colspan="5">Still loading… please check your connection.</td></tr>'; } catch {}
    }, 8000);
    try {
      const snap = await db.collection('patients').orderBy('name').get();
      const rows = [];
      snap.forEach(doc => {
        const d = doc.data();
        rows.push(`
          <tr>
            <td>${escapeHtml(d.name || '')}</td>
            <td>${escapeHtml(d.clinicId || '')}</td>
            <td>${escapeHtml(d.email || '')}</td>
            <td>${escapeHtml(d.conditions || '')}</td>
            <td>${escapeHtml(d.medications || '')}</td>
          </tr>
        `);
      });
      tbody.innerHTML = rows.join('') || '<tr><td colspan="5">No patients</td></tr>';
      const count = document.getElementById('patients-count');
      if (count) count.textContent = snap.size;
      clearTimeout(slowTimer);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5">Error loading patients: ${e.message}</td></tr>`;
      clearTimeout(slowTimer);
    }
  }

  async function loadAppointments() {
    const tbody = document.querySelector('#appointments-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    const slowTimer = setTimeout(() => {
      try { tbody.innerHTML = '<tr><td colspan="7">Still loading… please check your connection.</td></tr>'; } catch {}
    }, 8000);
    try {
      const snap = await db.collection('appointments').orderBy('createdAt', 'desc').limit(200).get();
      const rows = [];
      snap.forEach(doc => {
        const d = doc.data();
        const id = doc.id;
        rows.push(`
          <tr data-id="${id}">
            <td>${escapeHtml(d.patientName || d.userId || '')}</td>
            <td>${escapeHtml(d.clinic || '')}</td>
            <td>${escapeHtml(d.date || '')}</td>
            <td>${escapeHtml(d.time || '')}</td>
            <td>${escapeHtml(d.reason || '')}</td>
            <td><span class="appointment-status ${d.status || 'pending'}">${escapeHtml(d.status || 'pending')}</span></td>
            <td>
              <button class="btn-icon" data-action="confirm" title="Confirm"><i class="fas fa-check"></i></button>
              <button class="btn-icon" data-action="cancel" title="Cancel"><i class="fas fa-times"></i></button>
            </td>
          </tr>
        `);
      });
      tbody.innerHTML = rows.join('') || '<tr><td colspan="7">No appointments</td></tr>';
      clearTimeout(slowTimer);
      tbody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const tr = e.currentTarget.closest('tr');
          const id = tr.getAttribute('data-id');
          const action = e.currentTarget.getAttribute('data-action');
          const status = action === 'confirm' ? 'confirmed' : 'cancelled';
          await db.collection('appointments').doc(id).update({ status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
          loadAppointments();
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7">Error loading appointments: ${e.message}</td></tr>`;
      clearTimeout(slowTimer);
    }
  }

  async function loadSupplies() {
    const tbody = document.querySelector('#supplies-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
    const slowTimer = setTimeout(() => {
      try { tbody.innerHTML = '<tr><td colspan="5">Still loading… please check your connection.</td></tr>'; } catch {}
    }, 8000);
    try {
      const snap = await db.collection('supplies').orderBy('item').get();
      const rows = [];
      let criticalCount = 0;
      snap.forEach(doc => {
        const d = doc.data();
        if ((d.status||'') === 'critical') criticalCount++;
        const id = doc.id;
        rows.push(`
          <tr data-id="${id}">
            <td>${escapeHtml(d.item || '')}</td>
            <td><input type="number" min="0" value="${Number(d.quantity || 0)}" class="supply-qty" style="width:100px"></td>
            <td>${escapeHtml(d.unit || '')}</td>
            <td><span class="badge ${d.status || 'ok'}">${escapeHtml(d.status || 'ok')}</span></td>
            <td>
              <button class="btn-icon" data-action="save" title="Save"><i class="fas fa-save"></i></button>
              <button class="btn-icon" data-action="delete" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
          </tr>
        `);
      });
      tbody.innerHTML = rows.join('') || '<tr><td colspan="5">No supplies</td></tr>';
      clearTimeout(slowTimer);
      if (criticalCount > 0) {
        const n = document.createElement('div');
        n.style.cssText = 'position:fixed;top:20px;right:20px;background:#c62828;color:#fff;padding:12px 16px;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.15)';
        n.textContent = `Critical supplies: ${criticalCount}. Consider re-ordering.`;
        document.body.appendChild(n);
        setTimeout(()=>n.remove(), 4000);
      }
      tbody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const tr = e.currentTarget.closest('tr');
          const id = tr.getAttribute('data-id');
          const action = e.currentTarget.getAttribute('data-action');
          if (action === 'save') {
            const qty = Number(tr.querySelector('.supply-qty').value || 0);
            const status = qty <= 50 ? 'critical' : qty <= 300 ? 'low' : 'ok';
            await db.collection('supplies').doc(id).update({ quantity: qty, status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            loadSupplies();
          } else if (action === 'delete') {
            if (confirm('Delete this supply item?')) {
              await db.collection('supplies').doc(id).delete();
              loadSupplies();
            }
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5">Error loading supplies: ${e.message}</td></tr>`;
      clearTimeout(slowTimer);
    }
  }

  async function loadFeedback() {
    const tbody = document.querySelector('#feedback-table tbody');
    const stats = document.getElementById('feedback-stats');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    const slowTimer = setTimeout(() => {
      try { tbody.innerHTML = '<tr><td colspan="7">Still loading… please check your connection.</td></tr>'; } catch {}
    }, 8000);
    try {
      const snap = await db.collection('feedback').orderBy('createdAt','desc').limit(200).get();
      const rows = [];
      let sum = 0, count = 0, hygiene = 0, quality = 0, other = 0;
      snap.forEach(doc => {
        const d = doc.data();
        const dateStr = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleString() : '';
        rows.push(`
          <tr>
            <td>${escapeHtml(dateStr)}</td>
            <td>${escapeHtml(d.name || '')}</td>
            <td>${escapeHtml(d.email || '')}</td>
            <td>${escapeHtml(d.clinicId || '')}</td>
            <td>${escapeHtml(d.category || '')}</td>
            <td>${escapeHtml(d.rating || '')}</td>
            <td>${escapeHtml(d.comment || '')}</td>
          </tr>
        `);
        if (d.rating) { sum += Number(d.rating); count++; }
        const cat = (d.category || '').toLowerCase();
        if (cat === 'hygiene') hygiene++; else if (cat === 'quality') quality++; else other++;
      });
      tbody.innerHTML = rows.join('') || '<tr><td colspan="7">No feedback yet</td></tr>';
      if (stats) {
        const avg = count ? (sum / count).toFixed(1) : 'N/A';
        stats.textContent = `Average: ${avg}/5 • Hygiene: ${hygiene} • Quality: ${quality} • Other: ${other}`;
      }
      clearTimeout(slowTimer);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7">Error loading feedback: ${escapeHtml(e.message)}</td></tr>`;
      if (stats) stats.textContent = 'Error';
      clearTimeout(slowTimer);
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  async function ensureAdmin(user) {
    const allowlist = ['admin@mzansicare.co.za', 'nmsmaphanga@gmail.com'];
    let isAdmin = allowlist.includes(user.email);
    try {
      const adminDoc = await db.collection('admins').doc(user.uid).get();
      if (adminDoc.exists && adminDoc.data().role === 'admin') isAdmin = true;
    } catch (e) { console.warn('Admin check failed', e); }
    return isAdmin;
  }

  function injectQueueConsole() {
    const container = document.getElementById('queue-console');
    if (!container) return;
    container.innerHTML = `
      <div class="dashboard-card" style="margin-top:16px;">
        <div class="card-header">
          <h3>Queue Console</h3>
          <div style="display:flex;gap:8px;align-items:center;">
            <select id="qc-clinic">
              <option value="jhb-central">Johannesburg Central Clinic</option>
              <option value="cpt-health">Cape Town Health Center</option>
              <option value="dbn-medical">Durban Medical Clinic</option>
              <option value="pretoria-general">Pretoria General Hospital</option>
              <option value="soweto-clinic">Soweto Community Clinic</option>
            </select>
            <button id="qc-refresh" class="btn-secondary">Refresh</button>
            <button id="qc-call-next" class="btn-primary">Call Next</button>
          </div>
        </div>
        <div class="card-content">
          <div class="table-responsive">
            <table class="mc-table" id="qc-table">
              <thead><tr><th>Ticket</th><th>User</th><th>Status</th><th>Position</th><th>Actions</th></tr></thead>
              <tbody><tr><td colspan="5">Select a clinic and refresh…</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>`;

    const tbody = container.querySelector('#qc-table tbody');
    const clinicSel = container.querySelector('#qc-clinic');

    async function loadQueue() {
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="5">Loading queue…</td></tr>';
      try {
        const snap = await db.collection('queues').doc(clinicSel.value).collection('tickets').orderBy('createdAt').get();
        const rows = [];
        snap.forEach(doc=>{
          const d = doc.data();
          rows.push(`
            <tr data-id="${doc.id}">
              <td>${doc.id.substring(0,6).toUpperCase()}</td>
              <td>${escapeHtml(d.userId||'')}</td>
              <td>${escapeHtml(d.status||'waiting')}</td>
              <td>${Number(d.position||0)}</td>
              <td>
                <button class="btn-icon" data-action="call" title="Call"><i class="fas fa-bullhorn"></i></button>
                <button class="btn-icon" data-action="served" title="Mark Served"><i class="fas fa-check"></i></button>
                <button class="btn-icon" data-action="cancel" title="Cancel"><i class="fas fa-times"></i></button>
              </td>
            </tr>`);
        });
        tbody.innerHTML = rows.join('') || '<tr><td colspan="5">No tickets</td></tr>';
        tbody.querySelectorAll('button[data-action]').forEach(btn=>{
          btn.addEventListener('click', async (e)=>{
            const tr = e.currentTarget.closest('tr');
            const id = tr.getAttribute('data-id');
            const action = e.currentTarget.getAttribute('data-action');
            const ref = db.collection('queues').doc(clinicSel.value).collection('tickets').doc(id);
            if (action === 'call') await ref.update({ status: 'called' });
            if (action === 'served') await ref.update({ status: 'served' });
            if (action === 'cancel') await ref.update({ status: 'cancelled' });
            await loadQueue();
          });
        });
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(e.message)}</td></tr>`;
      }
    }

    container.querySelector('#qc-refresh')?.addEventListener('click', loadQueue);
    container.querySelector('#qc-call-next')?.addEventListener('click', async ()=>{
      // Call the next 'waiting' with smallest position
      const snap = await db.collection('queues').doc(clinicSel.value).collection('tickets').orderBy('position').get();
      const next = snap.docs.find(d => (d.data().status||'') === 'waiting');
      if (next) await next.ref.update({ status: 'called' });
      await loadQueue();
    });

    // initial
    loadQueue();
  }

  function injectClinicsPanel() {
    // Insert a simple Clinics manager with seed button
    const host = document.getElementById('clinics-console') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'dashboard-card';
    wrap.style.marginTop = '16px';
    wrap.innerHTML = `
      <div class="card-header">
        <h3>Clinics</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button id="clinics-seed" class="btn-secondary">Seed Demo Clinics</button>
          <button id="clinics-refresh" class="btn-primary">Refresh</button>
        </div>
      </div>
      <div class="card-content">
        <div class="table-responsive">
          <table class="mc-table" id="clinics-table">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Address</th><th>Phone</th><th>Services</th><th>Hours JSON</th><th>QueueLoad</th><th>Lat</th><th>Lng</th><th>Save</th>
              </tr>
            </thead>
            <tbody><tr><td colspan="10">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>
    `;
    host.appendChild(wrap);

    async function loadClinicsAdmin() {
      const tbody = wrap.querySelector('#clinics-table tbody');
      tbody.innerHTML = '<tr><td colspan="10">Loading…</td></tr>';
      const slowTimer = setTimeout(() => {
        try { tbody.innerHTML = '<tr><td colspan="10">Still loading… please check your connection.</td></tr>'; } catch {}
      }, 8000);
      try {
        const snap = await db.collection('clinics').get();
        const rows = [];
        snap.forEach(doc=>{
          const d = doc.data()||{};
          const hoursJson = JSON.stringify(d.hours || {}, null, 0);
          const servicesStr = Array.isArray(d.services) ? d.services.join(',') : '';
          rows.push(`
            <tr data-id="${doc.id}">
              <td>${doc.id}</td>
              <td><input value="${escapeHtml(d.name||'')}" class="c-name"/></td>
              <td><input value="${escapeHtml(d.address||'')}" class="c-address"/></td>
              <td><input value="${escapeHtml(d.phone||'')}" class="c-phone"/></td>
              <td><input value="${escapeHtml(servicesStr)}" class="c-services"/></td>
              <td><textarea class="c-hours" rows="2" style="width:220px">${escapeHtml(hoursJson)}</textarea></td>
              <td><input type="number" min="0" value="${Number(d.queueLoad||0)}" class="c-load" style="width:90px"/></td>
              <td><input type="number" step="any" value="${typeof d.lat==='number'?d.lat:(d.location?.lat??'')}" class="c-lat" style="width:110px"/></td>
              <td><input type="number" step="any" value="${typeof d.lng==='number'?d.lng:(d.location?.lng??'')}" class="c-lng" style="width:110px"/></td>
              <td><button class="btn-icon" data-action="save" title="Save"><i class="fas fa-save"></i></button></td>
            </tr>
          `);
        });
  tbody.innerHTML = rows.join('') || '<tr><td colspan="10">No clinics</td></tr>';
  clearTimeout(slowTimer);
        tbody.querySelectorAll('button[data-action="save"]').forEach(btn=>{
          btn.addEventListener('click', async (e)=>{
            const tr = e.currentTarget.closest('tr');
            const id = tr.getAttribute('data-id');
            try {
              const name = tr.querySelector('.c-name').value.trim();
              const address = tr.querySelector('.c-address').value.trim();
              const phone = tr.querySelector('.c-phone').value.trim();
              const services = tr.querySelector('.c-services').value.split(',').map(s=>s.trim()).filter(Boolean);
              const hoursText = tr.querySelector('.c-hours').value.trim();
              let hours = {};
              if (hoursText) { try { hours = JSON.parse(hoursText); } catch { alert('Invalid hours JSON'); return; } }
              const queueLoad = Number(tr.querySelector('.c-load').value||0);
              const lat = parseFloat(tr.querySelector('.c-lat').value);
              const lng = parseFloat(tr.querySelector('.c-lng').value);
              await db.collection('clinics').doc(id).set({ name, address, phone, services, hours, queueLoad, lat, lng }, { merge:true });
              alert('Saved');
            } catch (err) { alert('Save failed: ' + (err?.message||'')); }
          });
        });
      } catch (e) {
        wrap.querySelector('#clinics-table tbody').innerHTML = `<tr><td colspan="10">Error: ${escapeHtml(e.message)}</td></tr>`;
        clearTimeout(slowTimer);
      }
    }

    async function seedClinics() {
      const seed = [
        { id:'jhb-central', name:'Johannesburg Central Clinic', address:'Downtown Johannesburg', phone:'+27 11 123 4567', lat:-26.2041, lng:28.0473, services:['Primary Care','Pharmacy','Immunization'], hours:{ mon:[['08:00','17:00']], tue:[['08:00','17:00']], wed:[['08:00','17:00']], thu:[['08:00','17:00']], fri:[['08:00','17:00']], sat:[['08:00','12:00']], sun:[] }, queueLoad: Math.floor(Math.random()*15)+3 },
        { id:'cpt-health', name:'Cape Town Health Center', address:'Cape Town CBD', phone:'+27 21 456 7890', lat:-33.9249, lng:18.4241, services:['Primary Care','HIV Clinic','Maternity'], hours:{ mon:[['08:00','17:00']], tue:[['08:00','17:00']], wed:[['08:00','17:00']], thu:[['08:00','17:00']], fri:[['08:00','16:00']], sat:[['08:00','12:00']], sun:[] }, queueLoad: Math.floor(Math.random()*15)+3 },
        { id:'dbn-medical', name:'Durban Medical Clinic', address:'Durban Central', phone:'+27 31 321 6543', lat:-29.8587, lng:31.0218, services:['Primary Care','Dental','Immunization'], hours:{ mon:[['08:00','17:00']], tue:[['08:00','17:00']], wed:[['08:00','17:00']], thu:[['08:00','17:00']], fri:[['08:00','17:00']], sat:[], sun:[] }, queueLoad: Math.floor(Math.random()*15)+3 },
        { id:'pretoria-general', name:'Pretoria General Hospital', address:'Pretoria', phone:'+27 12 555 0000', lat:-25.7479, lng:28.2293, services:['Emergency','Primary Care','Pharmacy'], hours:{ mon:[['07:00','19:00']], tue:[['07:00','19:00']], wed:[['07:00','19:00']], thu:[['07:00','19:00']], fri:[['07:00','19:00']], sat:[['08:00','14:00']], sun:[['09:00','13:00']] }, queueLoad: Math.floor(Math.random()*15)+3 },
        { id:'soweto-clinic', name:'Soweto Community Clinic', address:'Soweto', phone:'+27 10 987 1234', lat:-26.2678, lng:27.8585, services:['Primary Care','Child Health','Family Planning'], hours:{ mon:[['08:00','17:00']], tue:[['08:00','17:00']], wed:[['08:00','17:00']], thu:[['08:00','17:00']], fri:[['08:00','17:00']], sat:[['08:00','12:00']], sun:[] }, queueLoad: Math.floor(Math.random()*15)+3 },
      ];
      const batch = db.batch();
      seed.forEach(c=>{
        const ref = db.collection('clinics').doc(c.id);
        batch.set(ref, c, { merge:true });
      });
      await batch.commit();
      alert('Clinics seeded.');
      loadClinicsAdmin();
    }

    wrap.querySelector('#clinics-refresh')?.addEventListener('click', loadClinicsAdmin);
    wrap.querySelector('#clinics-seed')?.addEventListener('click', seedClinics);
    loadClinicsAdmin();
  }

  function injectHospitalsPanel() {
    const host = document.getElementById('hospitals-console') || document.body;
    const wrap = document.createElement('div');
    wrap.className = 'dashboard-card';
    wrap.style.marginTop = '16px';
    wrap.innerHTML = `
      <div class="card-header">
        <h3>Hospitals</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <button id="hospitals-seed" class="btn-secondary">Seed Demo Hospitals</button>
          <button id="hospitals-refresh" class="btn-primary">Refresh</button>
        </div>
      </div>
      <div class="card-content">
        <div class="table-responsive">
          <table class="mc-table" id="hospitals-table">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Address</th><th>Phone</th><th>Services</th><th>Hours JSON</th><th>QueueLoad</th><th>Lat</th><th>Lng</th><th>Save</th>
              </tr>
            </thead>
            <tbody><tr><td colspan="10">Loading…</td></tr></tbody>
          </table>
        </div>
      </div>
    `;
    host.appendChild(wrap);

    async function loadHospitalsAdmin() {
      const tbody = wrap.querySelector('#hospitals-table tbody');
      tbody.innerHTML = '<tr><td colspan="10">Loading…</td></tr>';
      const slowTimer = setTimeout(() => {
        try { tbody.innerHTML = '<tr><td colspan="10">Still loading… please check your connection.</td></tr>'; } catch {}
      }, 8000);
      try {
        const snap = await db.collection('hospitals').get();
        const rows = [];
        snap.forEach(doc=>{
          const d = doc.data()||{};
          const hoursJson = JSON.stringify(d.hours || {}, null, 0);
          const servicesStr = Array.isArray(d.services) ? d.services.join(',') : '';
          rows.push(`
            <tr data-id="${doc.id}">
              <td>${doc.id}</td>
              <td><input value="${escapeHtml(d.name||'')}" class="h-name"/></td>
              <td><input value="${escapeHtml(d.address||'')}" class="h-address"/></td>
              <td><input value="${escapeHtml(d.phone||'')}" class="h-phone"/></td>
              <td><input value="${escapeHtml(servicesStr)}" class="h-services"/></td>
              <td><textarea class="h-hours" rows="2" style="width:220px">${escapeHtml(hoursJson)}</textarea></td>
              <td><input type="number" min="0" value="${Number(d.queueLoad||0)}" class="h-load" style="width:90px"/></td>
              <td><input type="number" step="any" value="${typeof d.lat==='number'?d.lat:(d.location?.lat??'')}" class="h-lat" style="width:110px"/></td>
              <td><input type="number" step="any" value="${typeof d.lng==='number'?d.lng:(d.location?.lng??'')}" class="h-lng" style="width:110px"/></td>
              <td><button class="btn-icon" data-action="save" title="Save"><i class="fas fa-save"></i></button></td>
            </tr>
          `);
        });
  tbody.innerHTML = rows.join('') || '<tr><td colspan="10">No hospitals</td></tr>';
  clearTimeout(slowTimer);
        tbody.querySelectorAll('button[data-action="save"]').forEach(btn=>{
          btn.addEventListener('click', async (e)=>{
            const tr = e.currentTarget.closest('tr');
            const id = tr.getAttribute('data-id');
            try {
              const name = tr.querySelector('.h-name').value.trim();
              const address = tr.querySelector('.h-address').value.trim();
              const phone = tr.querySelector('.h-phone').value.trim();
              const services = tr.querySelector('.h-services').value.split(',').map(s=>s.trim()).filter(Boolean);
              const hoursText = tr.querySelector('.h-hours').value.trim();
              let hours = {};
              if (hoursText) { try { hours = JSON.parse(hoursText); } catch { alert('Invalid hours JSON'); return; } }
              const queueLoad = Number(tr.querySelector('.h-load').value||0);
              const lat = parseFloat(tr.querySelector('.h-lat').value);
              const lng = parseFloat(tr.querySelector('.h-lng').value);
              await db.collection('hospitals').doc(id).set({ name, address, phone, services, hours, queueLoad, lat, lng }, { merge:true });
              alert('Saved');
            } catch (err) { alert('Save failed: ' + (err?.message||'')); }
          });
        });
      } catch (e) {
        wrap.querySelector('#hospitals-table tbody').innerHTML = `<tr><td colspan="10">Error: ${escapeHtml(e.message)}</td></tr>`;
        clearTimeout(slowTimer);
      }
    }

    async function seedHospitals() {
      const seed = [
        { id:'charlotte-maxeke', name:'Charlotte Maxeke Johannesburg Academic Hospital', address:'Parktown, Johannesburg', phone:'+27 11 488 4911', lat:-26.1887, lng:28.0473, services:['Emergency','Cardiology','Oncology'], hours:{ mon:[["00:00","23:59"]], tue:[["00:00","23:59"]], wed:[["00:00","23:59"]], thu:[["00:00","23:59"]], fri:[["00:00","23:59"]], sat:[["00:00","23:59"]], sun:[["00:00","23:59"]] }, queueLoad: Math.floor(Math.random()*30)+10 },
        { id:'baragwanath', name:'Chris Hani Baragwanath Hospital', address:'Soweto', phone:'+27 11 933 8000', lat:-26.2637, lng:27.9361, services:['Emergency','Surgery','Maternity'], hours:{ mon:[["00:00","23:59"]], tue:[["00:00","23:59"]], wed:[["00:00","23:59"]], thu:[["00:00","23:59"]], fri:[["00:00","23:59"]], sat:[["00:00","23:59"]], sun:[["00:00","23:59"]] }, queueLoad: Math.floor(Math.random()*30)+10 },
        { id:'groote-schuur', name:'Groote Schuur Hospital', address:'Observatory, Cape Town', phone:'+27 21 404 9111', lat:-33.9495, lng:18.4655, services:['Emergency','Trauma','Surgery'], hours:{ mon:[["00:00","23:59"]], tue:[["00:00","23:59"]], wed:[["00:00","23:59"]], thu:[["00:00","23:59"]], fri:[["00:00","23:59"]], sat:[["00:00","23:59"]], sun:[["00:00","23:59"]] }, queueLoad: Math.floor(Math.random()*30)+10 },
        { id:'steve-biko', name:'Steve Biko Academic Hospital', address:'Pretoria', phone:'+27 12 354 1000', lat:-25.7390, lng:28.2053, services:['Emergency','ICU','Surgery'], hours:{ mon:[["00:00","23:59"]], tue:[["00:00","23:59"]], wed:[["00:00","23:59"]], thu:[["00:00","23:59"]], fri:[["00:00","23:59"]], sat:[["00:00","23:59"]], sun:[["00:00","23:59"]] }, queueLoad: Math.floor(Math.random()*30)+10 },
        { id:'king-edward', name:'King Edward VIII Hospital', address:'Durban', phone:'+27 31 360 3111', lat:-29.8717, lng:31.0006, services:['Emergency','Maternity','Surgery'], hours:{ mon:[["00:00","23:59"]], tue:[["00:00","23:59"]], wed:[["00:00","23:59"]], thu:[["00:00","23:59"]], fri:[["00:00","23:59"]], sat:[["00:00","23:59"]], sun:[["00:00","23:59"]] }, queueLoad: Math.floor(Math.random()*30)+10 },
      ];
      const batch = db.batch();
      seed.forEach(h=> batch.set(db.collection('hospitals').doc(h.id), h, { merge:true }));
      await batch.commit();
      alert('Hospitals seeded.');
      loadHospitalsAdmin();
    }

    wrap.querySelector('#hospitals-refresh')?.addEventListener('click', loadHospitalsAdmin);
    wrap.querySelector('#hospitals-seed')?.addEventListener('click', seedHospitals);
    loadHospitalsAdmin();
  }

  function initAdmin() {
    // Run admin logic only on admin pages to avoid redirect loops on public pages
    const isAdminPage = ['#queue-console', '#patients-table', '#clinics-console', '#hospitals-console', '#appointments-table', '#supplies-table', '#feedback-table']
      .some(sel => document.querySelector(sel));
    if (!isAdminPage) {
      return; // Do nothing on non-admin pages
    }
    // Basic guard: redirect if not signed in
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = 'index.html';
        return;
      }
      const isAdmin = await ensureAdmin(user);
      if (!isAdmin) {
        alert('Admin access required.');
        window.location.href = 'index.html';
        return;
      }
      // Load data
      await Promise.all([loadPatients(), loadAppointments(), loadSupplies(), loadFeedback()]);
  // Inject queue console after loads
    injectQueueConsole();
  // Inject clinics panel
  injectClinicsPanel();
  // Inject hospitals panel
  injectHospitalsPanel();
    });

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      loadPatients();
      loadAppointments();
      loadSupplies();
      loadFeedback();
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      await auth.signOut();
      window.location.href = 'index.html';
    });
  }

  // Expose refresh hook for seeding
  window.AdminPage = { refresh: () => { loadPatients(); loadAppointments(); loadSupplies(); loadFeedback(); } };

  document.addEventListener('DOMContentLoaded', initAdmin);
})();

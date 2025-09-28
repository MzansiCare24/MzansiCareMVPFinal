// Admin Requests management for MzansiCare
(function () {
  function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
  }

  async function isApprover(user) {
    // Approver can be specific email or any admin
    if (!user) return false;
    if (user.email && user.email.toLowerCase() === 'nmsmaphanga@gmail.com') return true;
    try {
      const adminDoc = await db.collection('admins').doc(user.uid).get();
      return !!(adminDoc.exists && adminDoc.data().role === 'admin');
    } catch (e) {
      return false;
    }
  }

  async function loadAdminRequests() {
    const tbody = document.querySelector('#admin-requests-table tbody');
    const counter = document.getElementById('requests-count');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
    try {
  const snap = await db.collection('adminRequests').where('status', '==', 'pending').get();
      const rows = [];
      snap.forEach(doc => {
        const d = doc.data();
        rows.push(`
          <tr data-id="${doc.id}" data-uid="${escapeHtml(d.userId || '')}">
            <td>${escapeHtml(d.name || '')}</td>
            <td>${escapeHtml(d.email || '')}</td>
            <td>${escapeHtml(d.reason || '')}</td>
            <td>${d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleString() : ''}</td>
            <td>
              <button class="btn-icon" data-action="approve" title="Approve"><i class="fas fa-check"></i></button>
              <button class="btn-icon" data-action="reject" title="Reject"><i class="fas fa-times"></i></button>
            </td>
          </tr>
        `);
      });
      tbody.innerHTML = rows.join('') || '<tr><td colspan="5">No pending requests</td></tr>';
      if (counter) counter.textContent = snap.size;

      tbody.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const tr = e.currentTarget.closest('tr');
          const id = tr.getAttribute('data-id');
          const uid = tr.getAttribute('data-uid');
          const action = e.currentTarget.getAttribute('data-action');
          const approve = action === 'approve';
          try {
            if (approve) {
              await db.collection('patients').doc(uid).set({ role: 'admin' }, { merge: true });
              await db.collection('admins').doc(uid).set({ role: 'admin', approvedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            }
            await db.collection('adminRequests').doc(id).update({ status: approve ? 'approved' : 'rejected', reviewedAt: firebase.firestore.FieldValue.serverTimestamp() });
            loadAdminRequests();
          } catch (err) {
            alert('Error updating request: ' + err.message);
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5">Error loading requests: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function init() {
    auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      const canModerate = await isApprover(user);
      const section = document.getElementById('admin-requests');
      if (section) section.style.display = canModerate ? 'block' : 'none';
      if (canModerate) loadAdminRequests();
    });

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadAdminRequests);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

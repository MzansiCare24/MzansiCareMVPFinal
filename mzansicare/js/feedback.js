// Feedback system for MzansiCare
(function(){
  const formId = 'feedback-form';
  const listId = 'my-feedback-list';

  function el(id){ return document.getElementById(id); }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
  }

  async function submitFeedback(e){
    e.preventDefault();
    const user = auth.currentUser;
    if(!user) return alert('Please sign in to submit feedback');

    const rating = Number(el('feedback-rating').value);
    const category = el('feedback-category').value;
    const comment = el('feedback-comment').value.trim();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Submitting...'; }

    try {
      // get clinicId from patient doc
      const patientDoc = await db.collection('patients').doc(user.uid).get();
      const clinicId = patientDoc.exists ? (patientDoc.data().clinicId || '') : '';

      await db.collection('feedback').add({
        userId: user.uid,
        name: user.displayName || patientDoc.data()?.name || '',
        email: user.email || '',
        clinicId,
        rating,
        category,
        comment,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      el('feedback-comment').value = '';
      el('feedback-rating').value = '';
      el('feedback-category').value = 'hygiene';
      loadMyFeedback();

      toast('Thanks for your feedback!');
    } catch (err){
      console.error('Feedback submit error', err);
      toast('Failed to submit feedback');
    } finally {
      if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Submit Feedback'; }
    }
  }

  function renderMyFeedback(items){
    const container = el(listId);
    if(!container) return;
    if(items.length === 0){ container.innerHTML = '<p class="empty-state">No feedback yet.</p>'; return; }
    container.innerHTML = items.map(f => `
      <div class="appointment-item" style="border-left-color:#6c757d;">
        <div class="appointment-header">
          <div><strong>${escapeHtml((f.category||'').toUpperCase())}</strong> • Rating: ${Number(f.rating)||0}/5</div>
          <small>${f.createdAt && f.createdAt.toDate ? f.createdAt.toDate().toLocaleString() : ''}</small>
        </div>
        <div class="appointment-details">
          <p>${escapeHtml(f.comment || '')}</p>
        </div>
      </div>
    `).join('');
  }

  async function loadMyFeedback(){
    const user = auth.currentUser;
    if(!user) return;
    try {
      const snap = await db.collection('feedback').where('userId','==',user.uid).orderBy('createdAt','desc').limit(10).get();
      const items = [];
      snap.forEach(d => items.push({ id:d.id, ...d.data() }));
      renderMyFeedback(items);
    } catch (e){
      // fallback without orderBy if index missing
      try {
        const snap2 = await db.collection('feedback').where('userId','==',user.uid).get();
        const items = [];
        snap2.forEach(d => items.push({ id:d.id, ...d.data() }));
        renderMyFeedback(items);
      } catch {}
    }
  }

  function toast(msg){
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:20px;right:20px;background:#4caf50;color:#fff;padding:10px 14px;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.15)';
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(()=>{ div.remove(); }, 3000);
  }

  function init(){
    const form = el(formId);
    if(form) form.addEventListener('submit', submitFeedback);

    auth.onAuthStateChanged(u => { if(u) loadMyFeedback(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
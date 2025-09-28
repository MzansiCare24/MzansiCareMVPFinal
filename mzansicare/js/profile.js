// Enhanced Profile Management for MzansiCare

// DOM Elements
const editProfileBtn = document.getElementById('edit-profile-btn');
const downloadIdBtn = document.getElementById('download-id-btn');
let profileEditModal = null;

// Initialize profile functionality
function initProfile() {
    const profileSection = document.getElementById('profile');
    if (!profileSection) return;
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', openEditProfileModal);
    }
    
    if (downloadIdBtn) {
        downloadIdBtn.addEventListener('click', downloadDigitalID);
    }
    
    createEditProfileModal();

    // Inject a lightweight 'My Queue' status panel if container exists
    try {
        injectMyQueuePanel();
    } catch (e) { console.warn('MyQueue panel init skipped', e); }
}

// Create edit profile modal
function createEditProfileModal() {
    profileEditModal = document.createElement('div');
    profileEditModal.id = 'profile-edit-modal';
    profileEditModal.className = 'modal';
    profileEditModal.style.display = 'none';
    
    profileEditModal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <span class="close-modal" id="close-profile-modal">&times;</span>
            <h2>Edit Health Profile</h2>
            <form id="edit-profile-form">
                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-name">Full Name</label>
                        <input type="text" id="edit-name" required>
                    </div>
                    <div class="form-group">
                        <label for="edit-clinic-id">Clinic ID</label>
                        <input type="text" id="edit-clinic-id" required>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="edit-blood-type">Blood Type</label>
                        <select id="edit-blood-type">
                            <option value="">Select Blood Type</option>
                            <option value="A+">A+</option>
                            <option value="A-">A-</option>
                            <option value="B+">B+</option>
                            <option value="B-">B-</option>
                            <option value="AB+">AB+</option>
                            <option value="AB-">AB-</option>
                            <option value="O+">O+</option>
                            <option value="O-">O-</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="edit-emergency-contact">Emergency Contact</label>
                        <input type="text" id="edit-emergency-contact" placeholder="Name and Phone">
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="edit-conditions">Medical Conditions</label>
                    <textarea id="edit-conditions" rows="3" placeholder="List any chronic conditions, allergies, etc."></textarea>
                </div>
                
                <div class="form-group">
                    <label for="edit-medications">Current Medications</label>
                    <textarea id="edit-medications" rows="3" placeholder="List current medications and dosages"></textarea>
                </div>
                
                <div class="form-actions">
                    <button type="button" class="btn-secondary" id="cancel-edit">Cancel</button>
                    <button type="submit" class="btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(profileEditModal);
    
    // Add event listeners
    document.getElementById('close-profile-modal').addEventListener('click', closeEditProfileModal);
    document.getElementById('cancel-edit').addEventListener('click', closeEditProfileModal);
    document.getElementById('edit-profile-form').addEventListener('submit', saveProfileChanges);
    
    // Close modal when clicking outside
    profileEditModal.addEventListener('click', (e) => {
        if (e.target === profileEditModal) {
            closeEditProfileModal();
        }
    });
}

// Open edit profile modal
function openEditProfileModal() {
    // Load current data into form
    const user = auth.currentUser;
    if (user) {
        db.collection('patients').doc(user.uid).get().then((doc) => {
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('edit-name').value = data.name || '';
                document.getElementById('edit-clinic-id').value = data.clinicId || '';
                document.getElementById('edit-blood-type').value = data.bloodType || '';
                document.getElementById('edit-emergency-contact').value = data.emergencyContact || '';
                document.getElementById('edit-conditions').value = data.conditions || '';
                document.getElementById('edit-medications').value = data.medications || '';
            }
        });
    }
    
    profileEditModal.style.display = 'flex';
}

// Close edit profile modal
function closeEditProfileModal() {
    profileEditModal.style.display = 'none';
    document.getElementById('edit-profile-form').reset();
}

// Save profile changes
async function saveProfileChanges(e) {
    e.preventDefault();
    
    const user = auth.currentUser;
    if (!user) return;
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    submitBtn.disabled = true;
    
    try {
        const updates = {
            name: document.getElementById('edit-name').value,
            clinicId: document.getElementById('edit-clinic-id').value,
            bloodType: document.getElementById('edit-blood-type').value,
            emergencyContact: document.getElementById('edit-emergency-contact').value,
            conditions: document.getElementById('edit-conditions').value,
            medications: document.getElementById('edit-medications').value,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Update Firestore
        await db.collection('patients').doc(user.uid).update(updates);
        
        // Update user display name in auth
        await user.updateProfile({
            displayName: updates.name
        });
        
        // Update UI
        updateProfileDisplay(updates);
        
        // Close modal and show success
        closeEditProfileModal();
        showSuccess('Profile updated successfully!');
        
    } catch (error) {
        console.error('Error updating profile:', error);
        showError('Error updating profile. Please try again.');
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Download digital ID as PDF
function downloadDigitalID() {
    // For hackathon demo, we'll create a simple image-based ID card
    const idCard = document.querySelector('.id-card');
    
    html2canvas(idCard).then(canvas => {
        const link = document.createElement('a');
        link.download = 'mzansicare-digital-id.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}

// Show success message
function showSuccess(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4caf50;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Show error message
function showError(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f44336;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initProfile);

// Mini My Queue panel on profile page
async function injectMyQueuePanel() {
    const host = document.getElementById('my-queue-panel') || document.querySelector('#appointments .card-content');
    if (!host) return;
        const wrap = document.createElement('div');
        wrap.className = 'dashboard-card';
        wrap.innerHTML = `
            <div class="card-header"><h3>My Queue</h3></div>
            <div class="card-content" id="mq-content">Checking your current ticket…</div>
        `;
        host.appendChild(wrap);
        await refreshMyQueuePanel();
}

async function refreshMyQueuePanel() {
        const el = document.getElementById('mq-content'); if (!el) return;
        const user = window.auth && auth.currentUser; if (!user) { el.textContent = 'Login to see your queue status.'; return; }
        try {
                // Find the most recent ticket across all clinics
                const clinicsSnap = await db.collection('clinics').get();
                const clinicIds = clinicsSnap.empty ? ['jhb-central','cpt-health','dbn-medical','pretoria-general','soweto-clinic'] : clinicsSnap.docs.map(d=>d.id);
                let best = null;
                for (const cid of clinicIds) {
                        const q = await db.collection('queues').doc(cid).collection('tickets')
                                .where('userId','==', user.uid).orderBy('createdAt','desc').limit(1).get();
                        const doc = q.docs[0];
                        if (!doc) continue;
                        const d = doc.data();
                        const ts = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
                        if (!best || ts > best.ts) best = { cid, id: doc.id, d, ts };
                }
                if (!best) { el.textContent = 'No active or recent tickets.'; return; }
                const pos = typeof best.d.position === 'number' ? best.d.position : '—';
                const eta = typeof best.d.etaMinutes === 'number' ? `${best.d.etaMinutes} min` : (typeof best.d.position === 'number' ? `${Math.max(0,(best.d.position-1)*6)} min` : '—');
                el.innerHTML = `
                    <div><b>Ticket:</b> ${best.id.substring(0,6).toUpperCase()}</div>
                    <div><b>Clinic:</b> ${best.cid}</div>
                    <div><b>Status:</b> ${(best.d.status||'waiting').toUpperCase()}</div>
                    <div><b>Position:</b> ${pos}</div>
                    <div><b>ETA:</b> ${eta}</div>
                `;
                // live updates
                db.collection('queues').doc(best.cid).collection('tickets').doc(best.id)
                    .onSnapshot(s=>{
                        const x = s.data(); if (!x) return;
                        const pos2 = typeof x.position === 'number' ? x.position : '—';
                        const eta2 = typeof x.etaMinutes === 'number' ? `${x.etaMinutes} min` : (typeof x.position === 'number' ? `${Math.max(0,(x.position-1)*6)} min` : '—');
                        el.innerHTML = `
                            <div><b>Ticket:</b> ${best.id.substring(0,6).toUpperCase()}</div>
                            <div><b>Clinic:</b> ${best.cid}</div>
                            <div><b>Status:</b> ${(x.status||'waiting').toUpperCase()}</div>
                            <div><b>Position:</b> ${pos2}</div>
                            <div><b>ETA:</b> ${eta2}</div>
                        `;
                    });
        } catch (err) {
                console.warn('MyQueue panel error', err);
                el.textContent = 'Failed to load queue status.';
        }
}
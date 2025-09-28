// Enhanced Appointments Management for MzansiCare

// DOM Elements
const newAppointmentBtn = document.getElementById('new-appointment-btn');
const appointmentModal = document.getElementById('appointment-modal');
const appointmentForm = document.getElementById('appointment-form');
const appointmentsList = document.getElementById('appointments-list');

// Demo clinics data
const demoClinics = [
    { id: 'jhb-central', name: 'Johannesburg Central Clinic', address: '123 Main St, Johannesburg' },
    { id: 'cpt-health', name: 'Cape Town Health Center', address: '456 Beach Rd, Cape Town' },
    { id: 'dbn-medical', name: 'Durban Medical Clinic', address: '789 Coast Dr, Durban' },
    { id: 'pretoria-general', name: 'Pretoria General Hospital', address: '321 Church St, Pretoria' },
    { id: 'soweto-clinic', name: 'Soweto Community Clinic', address: '654 Vilakazi St, Soweto' }
];

// Demo appointments for testing
const demoAppointments = [
    {
        id: '1',
        clinic: 'jhb-central',
        date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days from now
        time: '10:00',
        reason: 'Regular checkup and blood pressure monitoring',
        status: 'confirmed',
        doctor: 'Dr. Sarah Johnson'
    },
    {
        id: '2', 
        clinic: 'cpt-health',
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
        time: '14:30',
        reason: 'Diabetes medication review',
        status: 'pending',
        doctor: 'Dr. Michael Brown'
    }
];

// Initialize appointments functionality
function initAppointments() {
    populateClinicsDropdown();
    setupEventListeners();
    loadDemoAppointments();
}

// Populate clinics dropdown
function populateClinicsDropdown() {
    const clinicSelect = document.getElementById('appointment-clinic');
    if (!clinicSelect) return;
    
    clinicSelect.innerHTML = '<option value="">Choose a clinic</option>';
    
    demoClinics.forEach(clinic => {
        const option = document.createElement('option');
        option.value = clinic.id;
        option.textContent = clinic.name;
        clinicSelect.appendChild(option);
    });
}

// Setup event listeners
function setupEventListeners() {
    if (newAppointmentBtn) {
        newAppointmentBtn.addEventListener('click', () => {
            appointmentModal.style.display = 'flex';
            setupDateRestrictions();
        });
    }

    const closeAppointmentModal = appointmentModal ? appointmentModal.querySelector('.close-modal') : null;
    if (closeAppointmentModal) {
        closeAppointmentModal.addEventListener('click', () => {
            appointmentModal.style.display = 'none';
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === appointmentModal) {
            appointmentModal.style.display = 'none';
        }
    });

    // Appointment form submission
    if (appointmentForm) {
        appointmentForm.addEventListener('submit', handleAppointmentSubmission);
    }

    // Clinic selection change
    const clinicSelect = document.getElementById('appointment-clinic');
    const dateInput = document.getElementById('appointment-date');
    if (clinicSelect) clinicSelect.addEventListener('change', () => { updateClinicDetails(); refreshTimeSlots(); });
    if (dateInput) dateInput.addEventListener('change', refreshTimeSlots);
}

// Set up date restrictions
function setupDateRestrictions() {
    const dateInput = document.getElementById('appointment-date');
    if (!dateInput) return;
    
    const today = new Date().toISOString().split('T')[0];
    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
    const maxDate = threeMonthsLater.toISOString().split('T')[0];
    
    dateInput.setAttribute('min', today);
    dateInput.setAttribute('max', maxDate);
    if (!dateInput.value) dateInput.value = today;
    // also refresh slots on open
    setTimeout(refreshTimeSlots, 0);
}

// Update clinic details when selected
function updateClinicDetails() {
    const clinicSelect = document.getElementById('appointment-clinic');
    const selectedClinic = demoClinics.find(c => c.id === clinicSelect.value);
    
    // You could show clinic details here
    if (selectedClinic) {
        console.log('Selected clinic:', selectedClinic);
    }
}

// Handle appointment submission
async function handleAppointmentSubmission(e) {
    e.preventDefault();
    
    const clinic = document.getElementById('appointment-clinic').value;
    const date = document.getElementById('appointment-date').value;
    const time = document.getElementById('appointment-time').value;
    const reason = document.getElementById('appointment-reason').value;
    const submitBtn = appointmentForm.querySelector('button[type="submit"]');
    
    setButtonLoading(submitBtn, true, 'Booking Appointment...');
    
    const user = auth.currentUser;
    
    if (user) {
        try {
            // Ensure slot still available before booking (last-second guard)
            const slotAvailable = await isSlotAvailable(clinic, date, time);
            if (!slotAvailable) {
                showError('That time was just booked. Please choose another time.');
                setButtonLoading(submitBtn, false);
                refreshTimeSlots();
                return;
            }

            // Save appointment to Firestore (basic optimistic write)
            const appointmentData = {
                userId: user.uid,
                clinic: clinic,
                date: date,
                time: time,
                reason: reason,
                status: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                patientName: user.displayName || 'Patient'
            };
            
            const docRef = await db.collection('appointments').add(appointmentData);
            
            // Create a reminder for this appointment
            await createAppointmentReminder({ ...appointmentData, id: docRef.id });
            
            appointmentModal.style.display = 'none';
            appointmentForm.reset();
            
            // Reload appointments
            await loadAppointments(user.uid);
            refreshTimeSlots();
            
            showSuccess('Appointment booked successfully! 📅 You will receive a reminder before your appointment.');
            
        } catch (error) {
            console.error('Error adding appointment: ', error);
            showError('Error booking appointment. Please try again.');
        } finally {
            setButtonLoading(submitBtn, false);
        }
    } else {
        showError('Please log in to book an appointment.');
        setButtonLoading(submitBtn, false);
    }
}

// Load demo appointments for hackathon
function loadDemoAppointments() {
    const user = auth.currentUser;
    if (user) {
        // For demo purposes, we'll show some sample appointments
        displayAppointments(demoAppointments);
        
        // Also load real appointments from Firestore
        loadAppointments(user.uid);
    }
}

// Load user appointments from Firestore
async function loadAppointments(userId) {
    if (!appointmentsList) return;
    
    try {
        const querySnapshot = await db.collection('appointments')
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .get();
        
        if (!querySnapshot.empty) {
            const firestoreAppointments = [];
            querySnapshot.forEach((doc) => {
                firestoreAppointments.push({ id: doc.id, ...doc.data() });
            });
            displayAppointments(firestoreAppointments);
        }
    } catch (error) {
        console.log('Error getting appointments: ', error);
    }
}

// Display appointments in the UI
function displayAppointments(appointments) {
    if (!appointmentsList) return;
    
    if (appointments.length === 0) {
        appointmentsList.innerHTML = '<p class="empty-state">No upcoming appointments</p>';
        return;
    }
    
    appointmentsList.innerHTML = '';
    
    appointments.forEach(appointment => {
        const appointmentElement = createAppointmentElement(appointment);
        appointmentsList.appendChild(appointmentElement);
    });
}

// Create appointment element
function createAppointmentElement(appointment) {
    const appointmentDiv = document.createElement('div');
    appointmentDiv.className = 'appointment-item';
    
    const clinic = demoClinics.find(c => c.id === appointment.clinic) || { name: 'Unknown Clinic' };
    const dateObj = new Date(appointment.date);
    const formattedDate = dateObj.toLocaleDateString('en-ZA', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    appointmentDiv.innerHTML = `
        <div class="appointment-header">
            <div class="clinic-info">
                <h4>${clinic.name}</h4>
                <p class="clinic-address">${clinic.address || ''}</p>
            </div>
            <span class="appointment-status ${appointment.status}">${appointment.status}</span>
        </div>
        <div class="appointment-details">
            <p><i class="fas fa-calendar"></i> <strong>${formattedDate}</strong> at <strong>${appointment.time}</strong></p>
            <p><i class="fas fa-user-md"></i> ${appointment.doctor || 'Doctor to be assigned'}</p>
            <p><i class="fas fa-stethoscope"></i> ${appointment.reason}</p>
        </div>
        <div class="appointment-actions">
            <button class="btn-icon reminder-btn" title="Set Reminder">
                <i class="fas fa-bell"></i>
            </button>
            <button class="btn-icon cancel-btn" title="Cancel Appointment">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // Add event listeners for actions
    const reminderBtn = appointmentDiv.querySelector('.reminder-btn');
    const cancelBtn = appointmentDiv.querySelector('.cancel-btn');
    
    reminderBtn.addEventListener('click', () => setAppointmentReminder(appointment));
    cancelBtn.addEventListener('click', () => cancelAppointment(appointment));
    
    return appointmentDiv;
}

// Set appointment reminder
function setAppointmentReminder(appointment) {
    showSuccess(`Reminder set for appointment on ${appointment.date} at ${appointment.time} ⏰`);
    
    // In a real app, this would integrate with Firebase Cloud Messaging
    console.log('Reminder set for:', appointment);
}

// Cancel appointment
async function cancelAppointment(appointment) {
    if (confirm('Are you sure you want to cancel this appointment?')) {
        try {
            if (appointment.id) {
                await db.collection('appointments').doc(appointment.id).update({
                    status: 'cancelled',
                    cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            showSuccess('Appointment cancelled successfully.');
            
            // Reload appointments
            const user = auth.currentUser;
            if (user) {
                await loadAppointments(user.uid);
            }
        } catch (error) {
            showError('Error cancelling appointment.');
        }
    }
}

// Create appointment reminder in Firestore
async function createAppointmentReminder(appointmentData) {
    try {
        const reminderTime = new Date(`${appointmentData.date}T${appointmentData.time}`);
        reminderTime.setHours(reminderTime.getHours() - 24); // 24 hours before
        
        await db.collection('reminders').add({
            userId: appointmentData.userId,
            appointmentId: appointmentData.id,
            type: 'appointment',
            title: 'Upcoming Appointment',
            message: `Remember your appointment at ${getClinicName(appointmentData.clinic)} tomorrow at ${appointmentData.time}`,
            scheduledTime: reminderTime,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error creating reminder:', error);
    }
}

// Get clinic name from ID
function getClinicName(clinicId) {
    const clinic = demoClinics.find(c => c.id === clinicId);
    return clinic ? clinic.name : 'Unknown Clinic';
}

// Set button loading state
function setButtonLoading(button, isLoading, loadingText = 'Loading...') {
    if (isLoading) {
        button.setAttribute('data-original-text', button.innerHTML);
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
        button.disabled = true;
    } else {
        const originalText = button.getAttribute('data-original-text');
        if (originalText) {
            button.innerHTML = originalText;
        }
        button.disabled = false;
    }
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
        animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
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
        animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Initialize appointments when DOM is loaded
document.addEventListener('DOMContentLoaded', initAppointments);

// Re-initialize when auth state changes
auth.onAuthStateChanged((user) => {
    if (user) {
        loadDemoAppointments();
    }
});

// ---------- Time slot availability UI ----------

const WORKING_HOURS = [
    '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
    '13:00','13:30','14:00','14:30','15:00','15:30'
];

async function refreshTimeSlots() {
    const clinic = document.getElementById('appointment-clinic')?.value;
    const date = document.getElementById('appointment-date')?.value;
    const select = document.getElementById('appointment-time');
    const grid = document.getElementById('time-slots');
    if (!clinic || !date || !select || !grid) return;

    // fetch booked slots for clinic+date
    const bookedSet = await getBookedSlots(clinic, date);

    // build select options
    select.innerHTML = '<option value="">Select time</option>';
    WORKING_HOURS.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        if (bookedSet.has(t)) opt.disabled = true;
        select.appendChild(opt);
    });

    // build slot grid
    grid.innerHTML = '';
    WORKING_HOURS.forEach(t => {
        const div = document.createElement('div');
        div.className = 'slot' + (bookedSet.has(t) ? ' booked' : '');
        div.textContent = formatTime(t);
        if (!bookedSet.has(t)) {
            div.addEventListener('click', () => {
                // toggle selection
                grid.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
                div.classList.add('selected');
                select.value = t;
            });
        }
        grid.appendChild(div);
    });
}

function formatTime(t) {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hh = ((h + 11) % 12) + 1;
    return `${String(hh).padStart(2,'0')}:${m.toString().padStart(2,'0')} ${ampm}`;
}

async function getBookedSlots(clinic, date) {
    try {
        const snap = await db.collection('appointments')
            .where('clinic', '==', clinic)
            .where('date', '==', date)
            .where('status', 'in', ['pending','confirmed'])
            .get();
        const set = new Set();
        snap.forEach(d => set.add((d.data().time)));
        return set;
    } catch (e) {
        console.warn('Failed to fetch booked slots', e);
        return new Set();
    }
}

async function isSlotAvailable(clinic, date, time) {
    try {
        const snap = await db.collection('appointments')
            .where('clinic', '==', clinic)
            .where('date', '==', date)
            .where('time', '==', time)
            .where('status', 'in', ['pending','confirmed'])
            .limit(1)
            .get();
        return snap.empty;
    } catch (e) {
        // If Firestore complains about 'in' on non-indexed, fallback to equality on status 'pending'
        try {
            const snap2 = await db.collection('appointments')
                .where('clinic', '==', clinic)
                .where('date', '==', date)
                .where('time', '==', time)
                .where('status', '==', 'pending')
                .limit(1)
                .get();
            if (!snap2.empty) return false;
            const snap3 = await db.collection('appointments')
                .where('clinic', '==', clinic)
                .where('date', '==', date)
                .where('time', '==', time)
                .where('status', '==', 'confirmed')
                .limit(1)
                .get();
            return snap3.empty;
        } catch {
            return true;
        }
    }
}
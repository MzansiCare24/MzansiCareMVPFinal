// Reminders and Notifications System for MzansiCare

// DOM Elements
let remindersNotification = null;
let remindersModal = null;

// Demo reminders data
const demoReminders = [
    {
        id: '1',
        type: 'appointment',
        title: 'Upcoming Appointment',
        message: 'Dental checkup at Johannesburg Central Clinic tomorrow at 10:00 AM',
        time: '2024-01-15T10:00:00',
        read: false
    },
    {
        id: '2',
        type: 'medication', 
        title: 'Medication Reminder',
        message: 'Time to take your blood pressure medication',
        time: '2024-01-15T08:00:00',
        read: false
    },
    {
        id: '3',
        type: 'health_tip',
        title: 'Health Tip',
        message: 'Remember to drink 8 glasses of water today! 💧',
        time: '2024-01-15T07:00:00',
        read: true
    }
];

// Initialize reminders system
function initReminders() {
    createRemindersNotification();
    createRemindersModal();
    loadReminders();
    startReminderChecker();
}

// Create reminders notification icon in navbar
function createRemindersNotification() {
    remindersNotification = document.createElement('div');
    remindersNotification.id = 'reminders-notification';
    remindersNotification.innerHTML = `
        <div class="notification-icon">
            <i class="fas fa-bell"></i>
            <span class="notification-badge">0</span>
        </div>
    `;
    
    remindersNotification.style.cssText = `
        position: relative;
        cursor: pointer;
        margin-left: 20px;
    `;
    
    // Add to navbar
    const navMenu = document.querySelector('.nav-menu');
    if (navMenu) {
        const listItem = document.createElement('li');
        listItem.className = 'nav-item';
        listItem.appendChild(remindersNotification);
        navMenu.appendChild(listItem);
    }
    
    remindersNotification.addEventListener('click', toggleRemindersModal);
}

// Create reminders modal
function createRemindersModal() {
    remindersModal = document.createElement('div');
    remindersModal.id = 'reminders-modal';
    remindersModal.className = 'modal';
    remindersModal.style.display = 'none';
    
    remindersModal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <span class="close-modal" id="close-reminders-modal">&times;</span>
            <h2>Notifications & Reminders</h2>
            <div class="reminders-list" id="reminders-list">
                <!-- Reminders will be loaded here -->
            </div>
            <div class="reminders-actions">
                <button id="mark-all-read" class="btn-secondary">Mark All as Read</button>
                <button id="clear-reminders" class="btn-secondary">Clear All</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(remindersModal);
    
    // Add event listeners
    document.getElementById('close-reminders-modal').addEventListener('click', closeRemindersModal);
    document.getElementById('mark-all-read').addEventListener('click', markAllAsRead);
    document.getElementById('clear-reminders').addEventListener('click', clearAllReminders);
    
    remindersModal.addEventListener('click', (e) => {
        if (e.target === remindersModal) {
            closeRemindersModal();
        }
    });
}

// Load reminders
function loadReminders() {
    const user = auth.currentUser;
    if (!user) return;
    
    // For demo, we'll use the demo data
    displayReminders(demoReminders);
    
    // Also load from Firestore
    loadFirestoreReminders(user.uid);
}

// Load reminders from Firestore
async function loadFirestoreReminders(userId) {
    try {
        const querySnapshot = await db.collection('reminders')
            .where('userId', '==', userId)
            .where('status', '==', 'pending')
            .orderBy('scheduledTime', 'asc')
            .get();
        
        const firestoreReminders = [];
        querySnapshot.forEach((doc) => {
            firestoreReminders.push({ id: doc.id, ...doc.data() });
        });
        
        // Combine with demo reminders
        const allReminders = [...demoReminders, ...firestoreReminders];
        displayReminders(allReminders);
        
    } catch (error) {
        console.error('Error loading reminders:', error);
    }
}

// Display reminders in the modal
function displayReminders(reminders) {
    const remindersList = document.getElementById('reminders-list');
    if (!remindersList) return;
    
    if (reminders.length === 0) {
        remindersList.innerHTML = '<p class="empty-state">No notifications</p>';
        updateNotificationBadge(0);
        return;
    }
    
    remindersList.innerHTML = '';
    
    const unreadCount = reminders.filter(r => !r.read).length;
    updateNotificationBadge(unreadCount);
    
    reminders.forEach(reminder => {
        const reminderElement = createReminderElement(reminder);
        remindersList.appendChild(reminderElement);
    });
}

// Create reminder element
function createReminderElement(reminder) {
    const reminderDiv = document.createElement('div');
    reminderDiv.className = `reminder-item ${reminder.read ? 'read' : 'unread'}`;
    
    const time = new Date(reminder.time).toLocaleTimeString('en-ZA', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    reminderDiv.innerHTML = `
        <div class="reminder-icon">
            <i class="fas ${getReminderIcon(reminder.type)}"></i>
        </div>
        <div class="reminder-content">
            <h4>${reminder.title}</h4>
            <p>${reminder.message}</p>
            <small>${time}</small>
        </div>
        <div class="reminder-actions">
            ${!reminder.read ? `<button class="mark-read-btn" data-id="${reminder.id}">Mark Read</button>` : ''}
        </div>
    `;
    
    // Add event listener for mark as read
    if (!reminder.read) {
        const markReadBtn = reminderDiv.querySelector('.mark-read-btn');
        markReadBtn.addEventListener('click', () => markAsRead(reminder.id));
    }
    
    return reminderDiv;
}

// Get icon for reminder type
function getReminderIcon(type) {
    const icons = {
        'appointment': 'fa-calendar-check',
        'medication': 'fa-pills',
        'health_tip': 'fa-heart',
        'general': 'fa-bell'
    };
    return icons[type] || 'fa-bell';
}

// Update notification badge
function updateNotificationBadge(count) {
    const badge = document.querySelector('.notification-badge');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'block' : 'none';
    }
}

// Mark reminder as read
function markAsRead(reminderId) {
    const reminder = demoReminders.find(r => r.id === reminderId);
    if (reminder) {
        reminder.read = true;
        displayReminders(demoReminders);
        showToast('Notification marked as read');
    }
}

// Mark all as read
function markAllAsRead() {
    demoReminders.forEach(reminder => {
        reminder.read = true;
    });
    displayReminders(demoReminders);
    showToast('All notifications marked as read');
}

// Clear all reminders
function clearAllReminders() {
    if (confirm('Clear all notifications?')) {
        demoReminders.length = 0; // Clear array
        displayReminders(demoReminders);
        showToast('All notifications cleared');
    }
}

// Toggle reminders modal
function toggleRemindersModal() {
    if (remindersModal.style.display === 'flex') {
        closeRemindersModal();
    } else {
        openRemindersModal();
    }
}

// Open reminders modal
function openRemindersModal() {
    remindersModal.style.display = 'flex';
    loadReminders(); // Refresh reminders when opening
}

// Close reminders modal
function closeRemindersModal() {
    remindersModal.style.display = 'none';
}

// Show toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #333;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Check for due reminders periodically
function startReminderChecker() {
    setInterval(() => {
        checkDueReminders();
    }, 60000); // Check every minute
}

// Check for due reminders
function checkDueReminders() {
    const now = new Date();
    demoReminders.forEach(reminder => {
        const reminderTime = new Date(reminder.time);
        if (!reminder.read && reminderTime <= now && reminderTime > new Date(now.getTime() - 60000)) {
            showReminderAlert(reminder);
        }
    });
}

// Show reminder alert
function showReminderAlert(reminder) {
    if (Notification.permission === 'granted') {
        new Notification(reminder.title, {
            body: reminder.message,
            icon: '/favicon.ico'
        });
    } else {
        showToast(`🔔 ${reminder.title}: ${reminder.message}`);
    }
}

// Request notification permission
function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('Notification permission granted');
            }
        });
    }
}

// Seed reminders in Firestore for a specific user if none exist
async function seedUserReminders(userId) {
    try {
        const existing = await db.collection('reminders')
            .where('userId', '==', userId)
            .limit(1)
            .get();
        if (!existing.empty) return; // already has reminders

        const now = new Date();
        const in15 = new Date(now.getTime() + 15 * 60000);
        const in60 = new Date(now.getTime() + 60 * 60000);

        await db.collection('reminders').add({
            userId,
            type: 'medication',
            title: 'Medication Reminder',
            message: 'Time to take your prescribed medication',
            scheduledTime: in15,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        await db.collection('reminders').add({
            userId,
            type: 'health_tip',
            title: 'Health Tip',
            message: 'Remember to stay hydrated today 💧',
            scheduledTime: in60,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (e) {
        console.warn('Failed to seed user reminders:', e);
    }
}

// expose globally
window.seedUserReminders = seedUserReminders;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initReminders();
    requestNotificationPermission();
});
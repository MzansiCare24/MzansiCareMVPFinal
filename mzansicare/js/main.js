// DOM Elements
const loadingScreen = document.getElementById('loading-screen');
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('nav-menu');
const chatbotToggle = document.getElementById('chatbot-toggle');
const chatbotWindow = document.getElementById('chatbot-window');
const closeChatbot = document.getElementById('close-chatbot');
const sendMessageBtn = document.getElementById('send-message');
const chatbotInput = document.getElementById('chatbot-input');
const chatbotMessages = document.getElementById('chatbot-messages');

// Demo clinics dataset for geolocation answers
const MC_CLINICS = [
    { id: 'jhb-central', name: 'Johannesburg Central Clinic', lat: -26.2041, lng: 28.0473, address: 'Downtown Johannesburg' },
    { id: 'cpt-health', name: 'Cape Town Health Center', lat: -33.9249, lng: 18.4241, address: 'Cape Town CBD' },
    { id: 'dbn-medical', name: 'Durban Medical Clinic', lat: -29.8587, lng: 31.0218, address: 'Durban Central' },
    { id: 'pretoria-general', name: 'Pretoria General Hospital', lat: -25.7479, lng: 28.2293, address: 'Pretoria' },
    { id: 'soweto-clinic', name: 'Soweto Community Clinic', lat: -26.2678, lng: 27.8585, address: 'Soweto' },
    { id: 'alexandra-clinic', name: 'Alexandra Community Health Centre', lat: -26.1036, lng: 28.0971, address: 'Alexandra, Johannesburg' },
    { id: 'tembisa-clinic', name: 'Tembisa Main Clinic', lat: -26.005, lng: 28.2126, address: 'Tembisa' },
];

// Demo hospitals dataset for geolocation answers
const MC_HOSPITALS = [
    { id: 'charlotte-maxeke', name: 'Charlotte Maxeke Johannesburg Academic Hospital', lat: -26.1887, lng: 28.0473, address: 'Parktown, Johannesburg' },
    { id: 'baragwanath', name: 'Chris Hani Baragwanath Hospital', lat: -26.2637, lng: 27.9361, address: 'Soweto' },
    { id: 'groote-schuur', name: 'Groote Schuur Hospital', lat: -33.9495, lng: 18.4655, address: 'Observatory, Cape Town' },
    { id: 'steve-biko', name: 'Steve Biko Academic Hospital', lat: -25.7390, lng: 28.2053, address: 'Pretoria' },
    { id: 'king-edward', name: 'King Edward VIII Hospital', lat: -29.8717, lng: 31.0006, address: 'Durban' },
    { id: 'leratong-hospital', name: 'Leratong Hospital', lat: -26.1718, lng: 27.8725, address: 'Chamdor, Krugersdorp' },
    { id: 'rahima-moosa', name: 'Rahima Moosa Mother and Child Hospital', lat: -26.1825, lng: 27.9897, address: 'Coronationville, Johannesburg' },
    { id: 'tambo-memorial', name: 'Tambo Memorial Hospital', lat: -26.1897, lng: 28.1121, address: 'Boksburg' },
];

let lastKnownUserLocation = null;
const FACILITY_KEYWORDS = ['clinic', 'hospital', 'centre', 'center', 'medical', 'health', 'facility', 'leratong'];
const facilityNameHints = new Set();

function seedFacilityHints(items = []) {
    items.forEach(item => {
        if (!item) return;
        if (item.id) facilityNameHints.add(String(item.id).toLowerCase());
        if (item.name) {
            const nameLower = item.name.toLowerCase();
            facilityNameHints.add(nameLower);
            nameLower.split(/\s+/).forEach(part => {
                if (part.length > 3 && !FACILITY_KEYWORDS.includes(part)) {
                    facilityNameHints.add(part);
                }
            });
        }
    });
}

function mentionsFacilityName(message = '') {
    const lower = String(message).toLowerCase();
    for (const hint of facilityNameHints) {
        if (hint && lower.includes(hint)) {
            return true;
        }
    }
    return false;
}

seedFacilityHints(MC_CLINICS);
seedFacilityHints(MC_HOSPITALS);

// Load clinics from Firestore if available, else fallback to MC_CLINICS
async function loadClinics() {
    if (window.__clinicsCache && Array.isArray(window.__clinicsCache) && window.__clinicsCache.length) return window.__clinicsCache;
    try {
        if (!window.db) return MC_CLINICS;
        const snap = await db.collection('clinics').get();
        const list = [];
        snap.forEach(doc => {
            const d = doc.data() || {};
            list.push({
                id: doc.id,
                name: d.name || doc.id,
                lat: d.location && typeof d.location.lat === 'number' ? d.location.lat : d.lat,
                lng: d.location && typeof d.location.lng === 'number' ? d.location.lng : d.lng,
                address: d.address || '',
                phone: d.phone || '',
                services: Array.isArray(d.services) ? d.services : [],
                hours: d.hours || null, // { mon:[['08:00','17:00']], ... }
                queueLoad: typeof d.queueLoad === 'number' ? d.queueLoad : null
            });
        });
        window.__clinicsCache = list.length ? list : MC_CLINICS;
        seedFacilityHints(window.__clinicsCache);
        return window.__clinicsCache;
    } catch (e) {
        console.warn('loadClinics fallback:', e);
        seedFacilityHints(MC_CLINICS);
        return MC_CLINICS;
    }
}

// Lightweight FAQ/intent dataset for smarter bot replies
const mcIntents = [
    {
        keywords: ['book', 'appointment', 'schedule', 'reserve', 'slot'],
        response: "Let's get you booked. Please sign in or register first, then I'll open the booking form.",
        action: chatBookAppointment
    },
    {
        keywords: ['near', 'nearby', 'around', 'closest', 'open', 'opened', 'now', 'clinic near me'],
        response: 'Let me find clinics near you that are open right now…',
        action: findNearbyOpenClinics
    },
    {
        keywords: ['hospital', 'hospitals', 'hospital near me', 'er', 'emergency'],
        response: 'Let me find hospitals near you that are open right now…',
        action: findNearbyOpenHospitals
    },
    {
        keywords: ['join queue','get ticket','queue'],
        response: 'Opening the queue so you can pick a clinic and get a ticket…',
        action: chatJoinQueue
    },
    {
        keywords: ['my ticket','queue status','my queue','position','where am i'],
        response: 'Let me check your current ticket status…',
        action: chatMyQueue
    },
    {
        keywords: ['cancel ticket','leave queue','drop queue','remove ticket'],
        response: 'Attempting to cancel your most recent ticket…',
        action: chatCancelMyQueue
    },
    {
        keywords: ['reminder', 'notify', 'notification', 'alert'],
        response: "MzansiCare sends an appointment reminder 24 hours before your booking. You'll also see reminders in your Profile ➜ Reminders."
    },
    {
        keywords: ['profile', 'my info', 'information', 'details', 'edit'],
        response: "Your health profile includes contact details, conditions, and medications. Go to Profile to edit. I'll take you there.",
        action: () => safeNavigate('profile.html')
    },
    {
        keywords: ['clinic', 'location', 'where', 'branch', 'address'],
        response: "We currently demo these clinics: Johannesburg Central, Cape Town Health Center, Durban Medical Clinic, Pretoria General, Soweto Community Clinic, Alexandra Community Health Centre, and Tembisa Main Clinic."
    },
    {
        keywords: ['hours', 'open', 'time', 'working'],
        response: "Typical clinic booking hours are 08:00–11:30 and 13:00–15:30, Monday to Friday. Availability depends on the clinic and current bookings."
    },
    {
        keywords: ['admin', 'approve', 'make me admin', 'role'],
        response: "To apply for admin, go to your Profile and click ‘Apply for Admin’. Your request will be reviewed by an approver."
    },
    {
        keywords: ['feedback', 'hygiene', 'clean', 'quality', 'report'],
        response: "Share your experience via Profile ➜ Feedback. Admins can review feedback and track hygiene and quality over time."
    },
    {
        keywords: ['digital id', 'id card', 'qr', 'barcode'],
        response: "Your Digital Clinic Card with QR is in Profile. You can download it and present it at the clinic for faster check-ins."
    },
    {
        keywords: ['about', 'mission', 'vision', 'privacy'],
        response: "MzansiCare’s mission is to make primary care fast, fair, and reliable. Read more on our About page.",
        action: () => safeNavigate('about.html')
    },
    {
        keywords: ['help', 'support', 'contact'],
        response: "I can help with bookings, reminders, and general info. For other issues, email info@mzansicare.co.za."
    }
];

// Loading screen handling with fail-safes
function hideLoaderSafely() {
    if (!loadingScreen) return;
    if (loadingScreen.style.display === 'none') return;
    try {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            const hero = document.querySelector('.hero');
            if (hero) hero.classList.add('loaded');
            if (typeof typeWriter === 'function') typeWriter();
        }, 500);
    } catch (_) {
        loadingScreen.style.display = 'none';
    }
}

// Primary: after window load, fade out after 2s for UX polish
window.addEventListener('load', () => {
    setTimeout(hideLoaderSafely, 2000);
});

// Backup: after DOMContentLoaded, ensure loader goes away after 4s
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(hideLoaderSafely, 4000);
});

// Hard safety: regardless of events, force-hide by 8s
setTimeout(hideLoaderSafely, 8000);

// If any runtime error or unhandled promise rejection happens early, don't keep users stuck behind the loader
window.addEventListener('error', () => setTimeout(hideLoaderSafely, 0));
window.addEventListener('unhandledrejection', () => setTimeout(hideLoaderSafely, 0));

// Mobile menu toggle
if (hamburger) {
    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('active');
    });
}

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        if (hamburger) hamburger.classList.remove('active');
        if (navMenu) navMenu.classList.remove('active');
    });
});

// Chatbot functionality
if (chatbotToggle) {
    chatbotToggle.addEventListener('click', () => {
        if (chatbotWindow) chatbotWindow.style.display = 'flex';
        chatbotToggle.style.display = 'none';
    });
}

if (closeChatbot) {
    closeChatbot.addEventListener('click', () => {
        if (chatbotWindow) chatbotWindow.style.display = 'none';
        if (chatbotToggle) chatbotToggle.style.display = 'flex';
    });
}

// Send message functionality
if (sendMessageBtn) {
    sendMessageBtn.addEventListener('click', sendMessage);
}

if (chatbotInput) {
    chatbotInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

function sendMessage() {
    const message = chatbotInput.value.trim();
    
    if (message) {
        // Add user message to chat
        addMessage(message, 'user');
        chatbotInput.value = '';
        
        // Simulate bot response
        setTimeout(() => {
            const botResponse = generateBotResponse(message);
            if (typeof botResponse === 'string') {
                addMessage(botResponse, 'bot');
            } else if (botResponse && typeof botResponse === 'object') {
                addMessage(botResponse.text, 'bot');
                if (typeof botResponse.action === 'function') {
                    // Give the user a moment to read the reply, then perform the action
                    setTimeout(() => botResponse.action(message), 400);
                }
            }
        }, 1000);
    }
}

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const messageP = document.createElement('p');
    messageP.textContent = text;
    
    messageDiv.appendChild(messageP);
    if (chatbotMessages) {
        chatbotMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }
}

function generateBotResponse(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    const specificFacilityMentioned = mentionsFacilityName(userMessage);

    // Greetings fast-path
    if (/\b(hi|hello|hey|morning|afternoon|evening)\b/.test(lowerMessage)) {
        return "Hello! I'm your MzansiCare assistant. I can help you book, manage reminders, and find info. What would you like to do?";
    }

    // Score intents by keyword overlap
    let best = null;
    let bestScore = 0;
    mcIntents.forEach(intent => {
        const score = intent.keywords.reduce((acc, kw) => acc + (lowerMessage.includes(kw) ? 1 : 0), 0);
        if (score > bestScore) {
            best = intent;
            bestScore = score;
        }
    });

    if (specificFacilityMentioned) {
        return {
            text: 'Let me search our facilities for that…',
            action: chatSearchFacility
        };
    }

    if (best && bestScore > 0) {
        return { text: best.response, action: best.action };
    }

    if (FACILITY_KEYWORDS.some(keyword => lowerMessage.includes(keyword)) && lowerMessage.replace(/[^a-z0-9]/g, '').length > 3) {
        return {
            text: 'Let me search our facilities for that…',
            action: chatSearchFacility
        };
    }

    // Fallback help
    return {
        text: "I can help you: 1) book an appointment, 2) set or understand reminders, 3) manage your profile, or 4) learn about MzansiCare. Try typing 'book appointment' or 'about'."
    };
}

// Helper to open the booking modal or route to Profile ➜ Appointments
function openBookingModal() {
    const btn = document.getElementById('new-appointment-btn');
    const modal = document.getElementById('appointment-modal');
    if (btn) {
        btn.click();
        return;
    }
    // If the button isn't present (e.g., on About page), navigate to Profile
    safeNavigate('profile.html#appointments');
}

function safeNavigate(href) {
    try {
        window.location.href = href;
    } catch (e) {
        console.warn('Navigation blocked:', e);
    }
}

function ensureAuthThen(onAuthed, onUnauthed = () => {}) {
    const run = (user) => {
        if (user) {
            Promise.resolve().then(() => onAuthed(user)).catch(err => console.warn('ensureAuthThen onAuthed failed', err));
        } else {
            Promise.resolve().then(() => onUnauthed()).catch(err => console.warn('ensureAuthThen onUnauthed failed', err));
        }
    };
    if (typeof window.whenAuthReady === 'function') {
        window.whenAuthReady().then(run).catch(() => run(null));
    } else {
        // Fallback: use captured last known user if present, else currentUser
        const u = (typeof window.__authUser !== 'undefined') ? window.__authUser : ((window.auth && auth.currentUser) || null);
        run(u);
    }
}

// Chatbot entry: enforce login/registration before booking
function chatBookAppointment() {
    ensureAuthThen(
        () => openBookingModal(),
        () => {
            addMessage('Please log in or register to continue with booking.', 'bot');
            const modal = document.getElementById('auth-modal');
            if (modal) {
                modal.style.display = 'flex';
                const regBtn = document.querySelector('.auth-tabs .tab-button[data-tab="register"]');
                regBtn?.click?.();
            }
        }
    );
}

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            window.scrollTo({
                top: targetElement.offsetTop - 70,
                behavior: 'smooth'
            });
        }
    });
});

// Navbar background on scroll
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(255, 255, 255, 0.98)';
            navbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        } else {
            navbar.style.background = 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = 'none';
        }
    }
});

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('MzansiCare application initialized successfully!');
    // Init snackbar container
    if (!document.getElementById('snackbar-container')) {
        const c = document.createElement('div');
        c.id = 'snackbar-container';
        c.style.cssText = 'position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:10000;';
        document.body.appendChild(c);
    }

    // Auth/Role click guards for restricted navigation and actions
    function openAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('login-email')?.focus();
        } else {
            alert('Login to access');
        }
    }

    function notifyLoginRequired() {
        const promptNow = () => {
            if (window.showSnackbar) window.showSnackbar({ type: 'error', text: 'Login to access', duration: 3000 });
            else alert('Login to access');
            openAuthModal();
        };
        if (typeof window.whenAuthReady === 'function' && !window.__authReady) {
            window.whenAuthReady().then(user => { if (!user) promptNow(); });
            return;
        }
        const u = (typeof window.__authUser !== 'undefined') ? window.__authUser : ((window.auth && auth.currentUser) || null);
        if (!u) promptNow();
    }

    async function waitForAdminFlag(timeout = 4000) {
        if (typeof window.__isAdmin === 'boolean') return window.__isAdmin;
        if (!window.__authReady && typeof window.whenAuthReady === 'function') {
            await window.whenAuthReady();
        }
        const start = Date.now();
        while (typeof window.__isAdmin === 'undefined' && (Date.now() - start) < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return window.__isAdmin;
    }

    // Global event delegation to guard links/buttons
    document.addEventListener('click', (e) => {
        const el = e.target.closest('a,button,[role="button"]');
        if (!el) return;

        if (el.dataset && el.dataset.skipAuthGuard === 'true') {
            delete el.dataset.skipAuthGuard;
            return;
        }

        const href = (el.getAttribute('href') || '').trim();
        const requiresAuth = (el.dataset && el.dataset.requiresAuth === 'true')
            || /profile\.html/i.test(href)
            || /#myprofile|#appointments|#reminders/i.test(href)
            || ['profile-link','nav-profile','go-profile','edit-profile-btn','new-appointment-btn','open-queue']
                .some(id => el.id === id);
        const isAdminNav = /admin\.html/i.test(href) || el.id === 'admin-link';

        if (!(requiresAuth || isAdminNav)) return;
        e.preventDefault();

        const showAdminDenied = () => {
            if (window.showSnackbar) window.showSnackbar({ type: 'error', text: 'Admin access required', duration: 3000 });
            else alert('Admin access required');
        };

        ensureAuthThen(async () => {
            if (isAdminNav) {
                const adminAllowed = await waitForAdminFlag();
                if (adminAllowed !== true) {
                    showAdminDenied();
                    return;
                }
            }
            if (el.dataset) el.dataset.skipAuthGuard = 'true';
            if (el.tagName === 'A' && el.href) {
                if (el.target && el.target !== '_self') {
                    window.open(el.href, el.target);
                } else {
                    window.location.assign(el.href);
                }
            } else if (typeof el.click === 'function') {
                setTimeout(() => el.click(), 0);
            }
        }, () => {
            notifyLoginRequired();
        });
    });

    // Optional: toggle visibility of elements marked as data-requires-auth based on current state
    if (window.auth && auth.onAuthStateChanged) {
        auth.onAuthStateChanged(() => {
            document.querySelectorAll('[data-requires-auth]')
                .forEach(el => {
                    const need = String(el.getAttribute('data-requires-auth')).toLowerCase() === 'true';
                    const authed = !!auth.currentUser;
                    if (need && !authed) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
                });
        });
    }

    // Make the navbar logo act as Home button
    try {
        const navLogo = document.querySelector('.navbar .logo');
        if (navLogo) {
            navLogo.style.cursor = 'pointer';
            navLogo.addEventListener('click', () => {
                const home = document.getElementById('home');
                if (home) window.scrollTo({ top: home.offsetTop - 70, behavior: 'smooth' });
                else safeNavigate('index.html#home');
            });
        }
    } catch (_) {}
});

// Typewriter effect for hero subtitle
const subtitle = document.querySelector('.hero-subtitle');
const fullText = "MzansiCare is transforming healthcare access with digital solutions that reduce wait times, improve care quality, and empower patients.";

function typeWriter() {
    if (!subtitle) return;
    subtitle.textContent = '';
    let i = 0;
    const interval = setInterval(() => {
        if (i < fullText.length) {
            subtitle.textContent += fullText.charAt(i);
            i++;
        } else {
            clearInterval(interval);
        }
    }, 50);
}

// Snackbar utility with icons & optional progress
window.showSnackbar = function({ type = 'info', text = '', duration = 3000 }) {
    const container = document.getElementById('snackbar-container');
    if (!container) return;
    const map = {
        success: { bg: '#2e7d32', icon: 'fa-check-circle' },
        error:   { bg: '#c62828', icon: 'fa-times-circle' },
        info:    { bg: '#1565c0', icon: 'fa-info-circle' },
        warn:    { bg: '#ef6c00', icon: 'fa-exclamation-triangle' },
    };
    const cfg = map[type] || map.info;
    const el = document.createElement('div');
    el.style.cssText = `background:${cfg.bg};color:#fff;padding:12px 16px;border-radius:10px;min-width:240px;box-shadow:0 6px 18px rgba(0,0,0,.2);display:flex;align-items:center;gap:10px;`;
    el.innerHTML = `<i class="fas ${cfg.icon}"></i><div style="flex:1">${text}</div><div class="snack-progress" style="height:3px;background:rgba(255,255,255,.6);position:absolute;bottom:0;left:0;width:100%;transform-origin:left;"></div>`;
    el.style.position = 'relative';
    container.appendChild(el);
    // Animate progress bar
    const prog = el.querySelector('.snack-progress');
    if (prog) {
        prog.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration, easing: 'linear' });
    }
    setTimeout(()=>{ el.remove(); }, duration);
}

// Render a rich DOM node as a chat bubble
function addRichMessage(node, sender = 'bot') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    messageDiv.appendChild(node);
    if (chatbotMessages) {
        chatbotMessages.appendChild(messageDiv);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }
}

// Nearby/open clinics intent action with geolocation and rich cards
async function findNearbyOpenClinics() {
    if (!navigator.geolocation) {
        addMessage('Location services are not available on this device.', 'bot');
        return;
    }
    addMessage('Requesting your location…', 'bot');
    const clinics = await loadClinics();
    navigator.geolocation.getCurrentPosition((pos) => {
        const userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        lastKnownUserLocation = userLoc;
        const enriched = (clinics || []).filter(c=>c.lat!=null && c.lng!=null).map(c => {
            const distanceKm = haversineKm(userLoc, { lat: c.lat, lng: c.lng });
            const openNow = isOpenAt(c.hours, new Date());
            return { ...c, distanceKm, openNow };
        });
        const sorted = enriched.sort((a,b) => a.distanceKm - b.distanceKm);
        const open = sorted.filter(s => s.openNow);
        if (open.length) {
            addMessage('Here are all nearby clinics sorted by distance. Ones marked “Open” are available right now:', 'bot');
        } else {
            addMessage('No clinics seem open right now. Here are all nearby clinics sorted by distance:', 'bot');
        }
        renderClinicCards(sorted);
    }, (err) => {
        console.warn('Geolocation error', err);
        addMessage('I couldn’t access your location. Showing all clinics instead:', 'bot');
        const fallbackList = (clinics || []).map(c => ({
            ...c,
            distanceKm: null,
            openNow: isOpenAt(c.hours, new Date())
        }));
        renderClinicCards(fallbackList);
    }, { enableHighAccuracy: true, timeout: 8000 });
}

// Nearby/open hospitals intent action with geolocation and rich cards
async function findNearbyOpenHospitals() {
    if (!navigator.geolocation) {
        addMessage('Location services are not available on this device.', 'bot');
        return;
    }
    addMessage('Requesting your location…', 'bot');
    const hospitals = await loadHospitals();
    navigator.geolocation.getCurrentPosition((pos) => {
        const userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        lastKnownUserLocation = userLoc;
        const enriched = (hospitals || []).filter(h=>h.lat!=null && h.lng!=null).map(h => {
            const distanceKm = haversineKm(userLoc, { lat: h.lat, lng: h.lng });
            const openNow = isOpenAt(h.hours, new Date());
            return { ...h, distanceKm, openNow };
        });
        const sorted = enriched.sort((a,b) => a.distanceKm - b.distanceKm);
        const open = sorted.filter(s => s.openNow);
        if (open.length) {
            addMessage('Here are all nearby hospitals sorted by distance. Ones marked “Open” are available right now:', 'bot');
        } else {
            addMessage('No hospitals seem open right now. Here are all nearby hospitals sorted by distance:', 'bot');
        }
        renderHospitalCards(sorted);
    }, (err) => {
        console.warn('Geolocation error', err);
        addMessage('I couldn’t access your location. Showing all hospitals instead:', 'bot');
        const fallbackList = (hospitals || []).map(h => ({
            ...h,
            distanceKm: null,
            openNow: isOpenAt(h.hours, new Date())
        }));
        renderHospitalCards(fallbackList);
    }, { enableHighAccuracy: true, timeout: 8000 });
}

// Haversine distance helper (km)
function haversineKm(a, b) {
    const toRad = d => d * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

// Hours helpers (use clinic.hours from Firestore when available)
function isOpenAt(hours, d = new Date()) {
    if (!hours) return isOpenFallback(d);
    try {
        const dayMap = ['sun','mon','tue','wed','thu','fri','sat'];
        const key = dayMap[d.getDay()];
        const spans = hours[key]; // e.g., [['08:00','17:00']]
        if (!Array.isArray(spans) || spans.length === 0) return false;
        const mins = d.getHours()*60 + d.getMinutes();
        return spans.some(([start,end]) => toMin(start) <= mins && mins < toMin(end));
    } catch { return isOpenFallback(d); }
}
function toMin(hhmm) { const [h,m] = String(hhmm||'').split(':').map(Number); return (h||0)*60 + (m||0); }
function isOpenFallback(d = new Date()) {
    const day = d.getDay();
    const h = d.getHours();
    if (day === 0) return false; // Sunday
    if (day === 6) return h >= 8 && h < 12; // Saturday
    return h >= 8 && h < 17; // Weekdays
}

function renderClinicCards(list) {
    const wrap = document.createElement('div');
    wrap.className = 'clinic-list';
    list.forEach(c => {
        const card = document.createElement('div');
        card.className = 'clinic-card';
        const distanceMarkup = (typeof c.distanceKm === 'number')
            ? `<p class="clinic-distance"><i class="fas fa-location-arrow"></i> ${c.distanceKm.toFixed(1)} km away</p>`
            : '';
        card.innerHTML = `
            <div class="clinic-card-header">
                <h4>${c.name}</h4>
                <span class="clinic-badge ${c.openNow ? 'open' : 'closed'}">${c.openNow ? 'Open' : 'Closed'}</span>
            </div>
            <p class="clinic-address"><i class="fas fa-map-marker-alt"></i> ${c.address || 'Nearby'}</p>
            ${distanceMarkup}
            <div class="clinic-actions">
                <button class="btn-secondary btn-sm" data-act="details">Details</button>
                <button class="btn-secondary btn-sm" data-act="map">Map</button>
                <button class="btn-primary btn-sm" data-act="queue">Join Queue</button>
            </div>
        `;
        card.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const act = btn.getAttribute('data-act');
            if (act === 'map') {
                window.open(`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`, '_blank');
            }
            if (act === 'queue') {
                const modal = document.getElementById('queue-modal');
                if (modal) modal.style.display = 'flex';
                const sel = document.getElementById('queue-clinic');
                if (sel) {
                    if (![...sel.options].some(o=>o.value===c.id)) {
                        const opt = document.createElement('option');
                        opt.value = c.id; opt.textContent = c.name || c.id;
                        sel.appendChild(opt);
                    }
                    sel.value = c.id;
                }
            }
            if (act === 'details') {
                showClinicDetails(c);
            }
        });
        wrap.appendChild(card);
    });
    addRichMessage(wrap, 'bot');
}

function showClinicDetails(c) {
    const node = document.createElement('div');
    const hoursStr = formatHours(c.hours) || 'Mon–Fri 08:00–17:00, Sat 08:00–12:00, Sun closed';
    const servicesStr = (c.services && c.services.length) ? c.services.join(', ') : 'General Primary Care';
    const loadStr = (typeof c.queueLoad === 'number') ? `${c.queueLoad} waiting` : 'N/A';
    node.className = 'clinic-card';
    node.innerHTML = `
        <div class="clinic-card-header">
            <h4>${c.name}</h4>
            <span class="clinic-badge ${c.openNow ? 'open' : 'closed'}">${c.openNow ? 'Open' : 'Closed'}</span>
        </div>
        <p class="clinic-address"><i class="fas fa-map-marker-alt"></i> ${c.address || ''}</p>
        <p><i class="fas fa-phone"></i> ${c.phone || '—'}</p>
        <p><i class="fas fa-stethoscope"></i> ${servicesStr}</p>
        <p><i class="fas fa-clock"></i> ${hoursStr}</p>
        <p><i class="fas fa-users"></i> Queue load: ${loadStr}</p>
        <div class="clinic-actions">
            <button class="btn-secondary btn-sm" data-act="map">Map</button>
            <button class="btn-primary btn-sm" data-act="queue">Join Queue</button>
        </div>
    `;
    node.addEventListener('click', (e)=>{
        const btn = e.target.closest('button');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        if (act === 'map') window.open(`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`, '_blank');
        if (act === 'queue') {
            const modal = document.getElementById('queue-modal');
            if (modal) modal.style.display = 'flex';
            const sel = document.getElementById('queue-clinic');
            if (sel) {
                if (![...sel.options].some(o=>o.value===c.id)) {
                    const opt = document.createElement('option');
                    opt.value = c.id; opt.textContent = c.name || c.id;
                    sel.appendChild(opt);
                }
                sel.value = c.id;
            }
        }
    });
    addRichMessage(node, 'bot');
}

function formatHours(hours) {
    if (!hours) return '';
    const order = ['mon','tue','wed','thu','fri','sat','sun'];
    const label = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };
    return order.map(k => {
        const spans = hours[k];
        if (!Array.isArray(spans) || !spans.length) return `${label[k]}: Closed`;
        const s = spans.map(([a,b])=>`${a}-${b}`).join(', ');
        return `${label[k]}: ${s}`;
    }).join(' • ');
}

function chatJoinQueue() {
    ensureAuthThen(async (user) => {
        try {
            const clinics = await loadClinics();
            const results = await Promise.all((clinics || []).map(async c => {
                try {
                    const q = await db.collection('queues').doc(c.id).collection('tickets')
                        .where('userId', '==', user.uid)
                        .orderBy('createdAt', 'desc')
                        .limit(1)
                        .get();
                    const doc = q.docs[0];
                    if (!doc) return null;
                    const d = doc.data();
                    if (['waiting', 'called'].includes(d.status)) return { clinic: c, id: doc.id, data: d };
                    return null;
                } catch {
                    return null;
                }
            }));
            const active = results.filter(Boolean)[0];
            if (active) {
                addMessage(`You're already in the queue at ${active.clinic.name}. Here's your status:`, 'bot');
                const node = document.createElement('div');
                node.className = 'clinic-card';
                const pos = (typeof active.data.position === 'number') ? active.data.position : '—';
                const eta = (typeof active.data.etaMinutes === 'number') ? `${active.data.etaMinutes} min` : (typeof active.data.position === 'number' ? `${Math.max(0, (active.data.position - 1) * 6)} min` : '—');
                node.innerHTML = `
                    <div class="clinic-card-header">
                        <h4>My Ticket @ ${active.clinic.name}</h4>
                        <span class="clinic-badge">${(active.data.status || 'waiting').toUpperCase()}</span>
                    </div>
                    <p><i class="fas fa-ticket-alt"></i> Ticket: <b>${active.id.substring(0,6).toUpperCase()}</b></p>
                    <p><i class="fas fa-list-ol"></i> Position: <b>${pos}</b></p>
                    <p><i class="fas fa-hourglass-half"></i> ETA: <b>${eta}</b></p>
                    <div class="clinic-actions">
                        <button class="btn-secondary btn-sm" data-act="open-modal">Open Queue</button>
                        <button class="btn-secondary btn-sm" data-act="map">Map</button>
                        <button class="btn-secondary btn-sm" data-act="cancel">Cancel Ticket</button>
                    </div>
                `;
                node.addEventListener('click', async (e) => {
                    const btn = e.target.closest('button'); if (!btn) return;
                    const act = btn.getAttribute('data-act');
                    if (act === 'open-modal') {
                        const modal = document.getElementById('queue-modal'); if (modal) modal.style.display = 'flex';
                        const sel = document.getElementById('queue-clinic'); if (sel) sel.value = active.clinic.id;
                    }
                    if (act === 'map') window.open(`https://www.google.com/maps/search/?api=1&query=${active.clinic.lat},${active.clinic.lng}`, '_blank');
                    if (act === 'cancel') {
                        try {
                            await db.collection('queues').doc(active.clinic.id).collection('tickets').doc(active.id).update({ status: 'cancelled' });
                            addMessage('Your ticket was cancelled.', 'bot');
                        } catch (err) {
                            addMessage('Failed to cancel: ' + (err?.message || ''), 'bot');
                        }
                    }
                });
                addRichMessage(node, 'bot');
                return;
            }
        } catch (err) {
            console.warn('chatJoinQueue error', err);
        }

        const modal = document.getElementById('queue-modal');
        if (modal) modal.style.display = 'flex';
    }, () => {
        addMessage('Please log in or register to join a queue.', 'bot');
        const modalAuth = document.getElementById('auth-modal');
        if (modalAuth) modalAuth.style.display = 'flex';
    });
}

function chatMyQueue() {
    ensureAuthThen(async (user) => {
        const clinics = await loadClinics();
        const results = await Promise.all((clinics || []).map(async c => {
            try {
                const q = await db.collection('queues').doc(c.id).collection('tickets')
                    .where('userId', '==', user.uid)
                    .orderBy('createdAt', 'desc')
                    .limit(1)
                    .get();
                const doc = q.docs[0];
                if (!doc) return null;
                const d = doc.data();
                return { clinic: c, id: doc.id, data: d };
            } catch {
                return null;
            }
        }));
        const found = results.filter(Boolean).sort((a, b) => {
            const ta = a.data.createdAt?.toMillis?.() || 0;
            const tb = b.data.createdAt?.toMillis?.() || 0;
            return tb - ta;
        })[0];
        if (!found) {
            addMessage('No active or recent tickets found for your account.', 'bot');
            return;
        }

        const node = document.createElement('div');
        node.className = 'clinic-card';
        const pos = (typeof found.data.position === 'number') ? found.data.position : '—';
        const eta = (typeof found.data.etaMinutes === 'number') ? `${found.data.etaMinutes} min` : (typeof found.data.position === 'number' ? `${Math.max(0, (found.data.position - 1) * 6)} min` : '—');
        node.innerHTML = `
            <div class="clinic-card-header">
                <h4>My Ticket @ ${found.clinic.name}</h4>
                <span class="clinic-badge">${(found.data.status || 'waiting').toUpperCase()}</span>
            </div>
            <p><i class="fas fa-ticket-alt"></i> Ticket: <b>${found.id.substring(0,6).toUpperCase()}</b></p>
            <p><i class="fas fa-list-ol"></i> Position: <b id="chat-pos-${found.id}">${pos}</b></p>
            <p><i class="fas fa-hourglass-half"></i> ETA: <b id="chat-eta-${found.id}">${eta}</b></p>
            <div class="clinic-actions">
                <button class="btn-secondary btn-sm" data-act="open-modal">Open Queue</button>
                <button class="btn-secondary btn-sm" data-act="map">Map</button>
                <button class="btn-secondary btn-sm" data-act="cancel">Cancel Ticket</button>
            </div>
        `;
        node.addEventListener('click', async (e) => {
            const btn = e.target.closest('button'); if (!btn) return;
            const act = btn.getAttribute('data-act');
            if (act === 'open-modal') {
                const modal = document.getElementById('queue-modal'); if (modal) modal.style.display = 'flex';
                const sel = document.getElementById('queue-clinic'); if (sel) sel.value = found.clinic.id;
            }
            if (act === 'map') window.open(`https://www.google.com/maps/search/?api=1&query=${found.clinic.lat},${found.clinic.lng}`, '_blank');
            if (act === 'cancel') {
                try {
                    await db.collection('queues').doc(found.clinic.id).collection('tickets').doc(found.id).update({ status: 'cancelled' });
                    addMessage('Your ticket was cancelled.', 'bot');
                } catch (err) {
                    addMessage('Failed to cancel: ' + (err?.message || ''), 'bot');
                }
            }
        });
        addRichMessage(node, 'bot');

        db.collection('queues').doc(found.clinic.id).collection('tickets').doc(found.id)
            .onSnapshot(snap => {
                const d = snap.data(); if (!d) return;
                const posEl = document.getElementById(`chat-pos-${found.id}`);
                const etaEl = document.getElementById(`chat-eta-${found.id}`);
                if (posEl && typeof d.position === 'number') posEl.textContent = String(d.position);
                const eta2 = (typeof d.etaMinutes === 'number') ? `${d.etaMinutes} min` : (typeof d.position === 'number' ? `${Math.max(0, (d.position - 1) * 6)} min` : '—');
                if (etaEl) etaEl.textContent = eta2;
            });
    }, () => {
        addMessage('Login to access your queue status.', 'bot');
    });
}

function chatCancelMyQueue() {
    ensureAuthThen(async (user) => {
        try {
            const clinics = await loadClinics();
            const results = await Promise.all((clinics || []).map(async c => {
                try {
                    const q = await db.collection('queues').doc(c.id).collection('tickets')
                        .where('userId', '==', user.uid)
                        .orderBy('createdAt', 'desc')
                        .limit(1)
                        .get();
                    const doc = q.docs[0];
                    if (!doc) return null;
                    const d = doc.data();
                    return { clinicId: c.id, id: doc.id, data: d };
                } catch {
                    return null;
                }
            }));
            const found = results.filter(Boolean).sort((a, b) => {
                const ta = a.data.createdAt?.toMillis?.() || 0;
                const tb = b.data.createdAt?.toMillis?.() || 0;
                return tb - ta;
            })[0];
            if (!found) {
                addMessage('No ticket found to cancel.', 'bot');
                return;
            }
            await db.collection('queues').doc(found.clinicId).collection('tickets').doc(found.id).update({ status: 'cancelled' });
            addMessage('Your latest ticket was cancelled.', 'bot');
        } catch (err) {
            addMessage('Failed to cancel ticket: ' + (err?.message || ''), 'bot');
        }
    }, () => {
        addMessage('Login to cancel your ticket.', 'bot');
    });
}

// Load hospitals from Firestore if available, else fallback to MC_HOSPITALS
async function loadHospitals() {
    if (window.__hospitalsCache && Array.isArray(window.__hospitalsCache) && window.__hospitalsCache.length) return window.__hospitalsCache;
    try {
        if (!window.db) return MC_HOSPITALS;
        const snap = await db.collection('hospitals').get();
        const list = [];
        snap.forEach(doc => {
            const d = doc.data() || {};
            list.push({
                id: doc.id,
                name: d.name || doc.id,
                lat: d.location && typeof d.location.lat === 'number' ? d.location.lat : d.lat,
                lng: d.location && typeof d.location.lng === 'number' ? d.location.lng : d.lng,
                address: d.address || '',
                phone: d.phone || '',
                services: Array.isArray(d.services) ? d.services : [],
                hours: d.hours || null, // { mon:[['08:00','17:00']], ... }
                queueLoad: typeof d.queueLoad === 'number' ? d.queueLoad : null
            });
        });
        window.__hospitalsCache = list.length ? list : MC_HOSPITALS;
        seedFacilityHints(window.__hospitalsCache);
        return window.__hospitalsCache;
    } catch (e) {
        console.warn('loadHospitals fallback:', e);
        seedFacilityHints(MC_HOSPITALS);
        return MC_HOSPITALS;
    }
}

function renderHospitalCards(list) {
    const wrap = document.createElement('div');
    wrap.className = 'clinic-list';
    list.forEach(h => {
        const card = document.createElement('div');
        card.className = 'clinic-card';
        const distanceMarkup = (typeof h.distanceKm === 'number')
            ? `<p class="clinic-distance"><i class="fas fa-location-arrow"></i> ${h.distanceKm.toFixed(1)} km away</p>`
            : '';
        card.innerHTML = `
            <div class="clinic-card-header">
                <h4>${h.name}</h4>
                <span class="clinic-badge ${h.openNow ? 'open' : 'closed'}">${h.openNow ? 'Open' : 'Closed'}</span>
            </div>
            <p class="clinic-address"><i class="fas fa-map-marker-alt"></i> ${h.address || 'Nearby'}</p>
            ${distanceMarkup}
            <div class="clinic-actions">
                <button class="btn-secondary btn-sm" data-act="details">Details</button>
                <button class="btn-secondary btn-sm" data-act="map">Map</button>
                <button class="btn-primary btn-sm" data-act="queue">Join Queue</button>
            </div>
        `;
        card.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const act = btn.getAttribute('data-act');
            if (act === 'map') {
                window.open(`https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lng}`, '_blank');
            }
            if (act === 'queue') {
                const modal = document.getElementById('queue-modal');
                if (modal) modal.style.display = 'flex';
                const sel = document.getElementById('queue-clinic');
                if (sel) {
                    if (![...sel.options].some(o=>o.value===h.id)) {
                        const opt = document.createElement('option');
                        opt.value = h.id; opt.textContent = h.name || h.id;
                        sel.appendChild(opt);
                    }
                    sel.value = h.id;
                }
            }
            if (act === 'details') {
                showClinicDetails(h);
            }
        });
        wrap.appendChild(card);
    });
    addRichMessage(wrap, 'bot');
}

function sanitizeSearchTokens(query) {
    const stopWords = new Set(['the', 'a', 'an', 'to', 'for', 'near', 'me', 'please', 'find', 'search', 'lookup', 'locate', 'show', 'open', 'status', 'tell', 'if', 'is', 'are', 'was', 'were', 'clinic', 'hospital', 'centre', 'center', 'medical', 'health', 'facility']);
    const tokens = String(query || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const filtered = tokens.filter(token => !stopWords.has(token));
    return (filtered.length ? filtered : tokens).filter(Boolean);
}

async function chatSearchFacility(rawQuery) {
    const query = (rawQuery || '').trim();
    if (!query) {
        addMessage('Please tell me which clinic or hospital you want to search for.', 'bot');
        return;
    }

    const searchTokens = sanitizeSearchTokens(query);
    if (!searchTokens.length) {
        addMessage('Please include part of the clinic or hospital name so I can search for it.', 'bot');
        return;
    }

    const [clinics, hospitals] = await Promise.all([loadClinics(), loadHospitals()]);
    const now = new Date();
    const facilities = [
        ...(clinics || []).map(c => ({ ...c, type: 'clinic' })),
        ...(hospitals || []).map(h => ({ ...h, type: 'hospital' }))
    ];

    const matches = facilities.map(facility => {
        const name = (facility.name || '').toLowerCase();
        const address = (facility.address || '').toLowerCase();
        let score = 0;
        searchTokens.forEach(token => {
            if (!token) return;
            if (name.includes(token)) score += 3;
            else if (address.includes(token)) score += 1;
        });
        if (score === 0 && searchTokens.length) return null;
        const hasCoords = typeof facility.lat === 'number' && typeof facility.lng === 'number';
        const distanceKm = (lastKnownUserLocation && hasCoords)
            ? haversineKm(lastKnownUserLocation, { lat: facility.lat, lng: facility.lng })
            : null;
        const openNow = isOpenAt(facility.hours, now);
        return { facility, score, distanceKm, openNow };
    }).filter(Boolean);

    if (!matches.length) {
        addMessage(`I couldn't find any clinics or hospitals matching "${query}".`, 'bot');
        return;
    }

    matches.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
        if (a.distanceKm != null) return -1;
        if (b.distanceKm != null) return 1;
        return (a.facility.name || '').localeCompare(b.facility.name || '');
    });

    const results = matches.map(match => ({
        ...match.facility,
        type: match.facility.type,
        openNow: match.openNow,
        distanceKm: match.distanceKm
    }));

    addMessage(`Here’s what I found for "${query}":`, 'bot');
    renderFacilitySearchResults(results);
}

function renderFacilitySearchResults(list) {
    const wrap = document.createElement('div');
    wrap.className = 'clinic-list';
    list.forEach(f => {
        const card = document.createElement('div');
        card.className = 'clinic-card';
        const badgeClass = f.openNow ? 'open' : 'closed';
        const typeLabel = f.type === 'hospital' ? 'Hospital' : f.type === 'clinic' ? 'Clinic' : 'Facility';
        const distanceMarkup = (typeof f.distanceKm === 'number')
            ? `<p class="clinic-distance"><i class="fas fa-location-arrow"></i> ${f.distanceKm.toFixed(1)} km away</p>`
            : '';
        card.innerHTML = `
            <div class="clinic-card-header">
                <h4>${f.name}</h4>
                <span class="clinic-badge ${badgeClass}">${f.openNow ? 'Open' : 'Closed'}</span>
            </div>
            <p class="clinic-address"><i class="fas fa-map-marker-alt"></i> ${f.address || '—'}</p>
            ${distanceMarkup}
            <p><i class="fas fa-building"></i> ${typeLabel}</p>
            <div class="clinic-actions">
                <button class="btn-secondary btn-sm" data-act="map">Map</button>
                <button class="btn-primary btn-sm" data-act="queue">Join Queue</button>
            </div>
        `;
        card.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const act = btn.getAttribute('data-act');
            if (act === 'map' && typeof f.lat === 'number' && typeof f.lng === 'number') {
                window.open(`https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}`, '_blank');
            }
            if (act === 'queue') {
                const modal = document.getElementById('queue-modal');
                if (modal) modal.style.display = 'flex';
                const sel = document.getElementById('queue-clinic');
                if (sel && f.id) {
                    if (![...sel.options].some(o => o.value === f.id)) {
                        const opt = document.createElement('option');
                        opt.value = f.id;
                        opt.textContent = f.name || f.id;
                        sel.appendChild(opt);
                    }
                    sel.value = f.id;
                }
            }
        });
        wrap.appendChild(card);
    });
    addRichMessage(wrap, 'bot');
}
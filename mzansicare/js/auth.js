// Enhanced Authentication for MzansiCare with Google Auth

// DOM Elements
const authModal = document.getElementById('auth-modal');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authLink = document.getElementById('auth-link');
const userMenu = document.getElementById('user-menu');
const userName = document.getElementById('user-name');
const logoutBtn = document.getElementById('logout-btn');
const closeModal = document.querySelector('.close-modal');
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const switchTabs = document.querySelectorAll('.switch-tab');
const getStartedBtn = document.getElementById('get-started-btn');
const googleLoginBtn = document.getElementById('google-login-btn');
const googleRegisterBtn = document.getElementById('google-register-btn');

// Global auth readiness flag so other scripts can wait for auth state
// Also keep the last known user to avoid races with auth.currentUser
window.__authReady = false;
window.__authUser = null;
window.__authReadyResolvers = [];
window.whenAuthReady = function() {
    return new Promise(resolve => {
        if (window.__authReady) {
            // Resolve with the last known user instead of reading auth.currentUser to avoid timing races
            resolve(window.__authUser || null);
        } else {
            window.__authReadyResolvers.push(resolve);
        }
    });
};

// Enhanced error messages mapping
const errorMessages = {
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again.',
    'auth/popup-blocked': 'Popup was blocked by your browser. Please allow popups for this site.',
    'auth/operation-not-allowed': 'Google sign-in is not enabled. Please contact support.',
    'auth/unauthorized-domain': 'This domain is not authorized for Google sign-in. Please try from localhost or the deployed version.',
    'auth/internal-error': 'Internal error. Please try again later.',
    'auth/cancelled-popup-request': 'Sign-in process was cancelled. Please try again.'
};

// Show error message function
function showError(message) {
    // Remove existing error messages
    document.querySelectorAll('.error-message').forEach(el => el.remove());
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        background: #ffebee;
        color: #c62828;
        padding: 12px;
        border-radius: 8px;
        margin: 15px 0;
        border-left: 4px solid #c62828;
        font-size: 0.9rem;
        font-weight: 500;
    `;
    errorDiv.textContent = message;
    
    const activeTab = document.querySelector('.tab-content.active');
    const form = activeTab.querySelector('form');
    if (form) {
        activeTab.insertBefore(errorDiv, form);
    } else {
        // If no form, insert after the first h2
        const h2 = activeTab.querySelector('h2');
        if (h2) {
            h2.parentNode.insertBefore(errorDiv, h2.nextSibling);
        } else {
            activeTab.appendChild(errorDiv);
        }
    }
    
    // Auto-remove error after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.remove();
        }
    }, 5000);
}

// Show success message function
function showSuccess(message) {
    // Remove existing messages
    document.querySelectorAll('.success-message').forEach(el => el.remove());
    
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.style.cssText = `
        background: #e8f5e8;
        color: #2e7d32;
        padding: 12px;
        border-radius: 8px;
        margin: 15px 0;
        border-left: 4px solid #2e7d32;
        font-size: 0.9rem;
        font-weight: 500;
    `;
    successDiv.textContent = message;
    
    const activeTab = document.querySelector('.tab-content.active');
    const form = activeTab.querySelector('form');
    if (form) {
        activeTab.insertBefore(successDiv, form);
    } else {
        activeTab.appendChild(successDiv);
    }
    
    // Remove success message after 3 seconds
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.remove();
        }
    }, 3000);
}

// Show global notification (for auth state changes)
function showGlobalNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease;
    `;
    
    if (type === 'success') {
        notification.style.background = '#4caf50';
    } else {
        notification.style.background = '#f44336';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove after 4 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 4000);
}

// Set button loading state
function setButtonLoading(button, isLoading, loadingText = 'Loading...') {
    if (isLoading) {
        button.setAttribute('data-original-text', button.innerHTML);
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
        button.disabled = true;
        button.style.opacity = '0.7';
    } else {
        const originalText = button.getAttribute('data-original-text');
        if (originalText) {
            button.innerHTML = originalText;
        }
        button.disabled = false;
        button.style.opacity = '1';
    }
}

// Enhanced Google Authentication with detailed error handling
async function signInWithGoogle() {
    console.log('🔐 Starting Google Sign-In process...');
    
    const googleBtn = event?.target || document.getElementById('google-login-btn') || 
                     document.getElementById('google-register-btn');
    
    if (googleBtn) {
        setButtonLoading(googleBtn, true, 'Connecting to Google...');
    }
    
    try {
        console.log('1. Checking Firebase auth object:', auth ? '✅ Available' : '❌ Missing');
        console.log('2. Checking Google provider:', googleProvider ? '✅ Available' : '❌ Missing');
        
        // Check if we're in a secure context (required for OAuth)
        if (!window.isSecureContext && !window.location.hostname.includes('localhost')) {
            throw new Error('Page must be served over HTTPS or from localhost for Google Sign-In');
        }
        
        console.log('3. Current domain:', window.location.hostname);
        console.log('4. Secure context:', window.isSecureContext);
        
        // Test if popups are allowed
        const popupTest = window.open('', '_blank', 'width=100,height=100');
        if (!popupTest) {
            console.warn('⚠️ Popups might be blocked by browser');
        } else {
            popupTest.close();
        }
        
        console.log('5. Attempting sign-in with popup...');
        const result = await auth.signInWithPopup(googleProvider);
        const user = result.user;
        
        console.log('6. Google sign-in successful:', user.email);
        
        // Check if user exists in Firestore
        const userDoc = await db.collection('patients').doc(user.uid).get();
        
        if (!userDoc.exists) {
            console.log('7. Creating new user profile for Google user...');
            await createUserProfile(user);
        } else {
            console.log('7. Updating existing user profile...');
            await db.collection('patients').doc(user.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        console.log('8. Authentication flow completed successfully');
        authModal.style.display = 'none';
        showGlobalNotification('Welcome to MzansiCare! 🎉', 'success');
        
    } catch (error) {
        console.error('❌ Google sign-in error details:', {
            code: error.code,
            message: error.message,
            email: error.email,
            credential: error.credential
        });
        
        // Detailed error analysis and user-friendly messages
        let errorMessage = 'Google sign-in failed. Please try again.';
        let showPopupHelp = false;
        
        switch (error.code) {
            case 'auth/popup-closed-by-user':
                errorMessage = 'Sign-in was cancelled. Please try again.';
                break;
            case 'auth/popup-blocked':
                errorMessage = 'Popup was blocked. Please allow popups for this site and try again.';
                showPopupHelp = true;
                break;
            case 'auth/operation-not-allowed':
                errorMessage = 'Google sign-in is not enabled. Please try email sign-in or contact support.';
                break;
            case 'auth/unauthorized-domain':
                errorMessage = 'This domain is not authorized. Please try accessing from http://localhost or the deployed version.';
                showPopupHelp = true;
                break;
            case 'auth/network-request-failed':
                errorMessage = 'Network error. Please check your internet connection and try again.';
                break;
            case 'auth/internal-error':
                errorMessage = 'Temporary error. Please try again in a moment.';
                break;
            default:
                errorMessage = errorMessages[error.code] || error.message;
        }
        
        showError(errorMessage);
        
        // Show additional help for popup issues
        if (showPopupHelp) {
            setTimeout(() => {
                const helpDiv = document.createElement('div');
                helpDiv.style.cssText = `
                    background: #e3f2fd;
                    color: #1565c0;
                    padding: 10px;
                    border-radius: 5px;
                    margin: 10px 0;
                    font-size: 0.8rem;
                    border-left: 3px solid #2196f3;
                `;
                helpDiv.innerHTML = `
                    <strong>💡 Quick fix:</strong> 
                    <br>• Allow popups for this site
                    <br>• Try using http://localhost instead of file://
                    <br>• Disable popup blockers temporarily
                `;
                
                const errorElement = document.querySelector('.error-message');
                if (errorElement && errorElement.parentNode) {
                    errorElement.parentNode.insertBefore(helpDiv, errorElement.nextSibling);
                }
            }, 100);
        }
        
        // Additional troubleshooting tips in console
        if (error.code === 'auth/unauthorized-domain') {
            console.warn('💡 Troubleshooting tip: Add your domain to Firebase Authorized Domains');
            console.warn('💡 Current domain:', window.location.hostname);
            console.warn('💡 Try accessing via: http://localhost');
        }
        
    } finally {
        if (googleBtn) {
            setButtonLoading(googleBtn, false);
        }
    }
}

// Alternative Google Sign-In using redirect (if popup fails)
async function signInWithGoogleRedirect() {
    try {
        console.log('🔄 Attempting Google sign-in with redirect...');
        showGlobalNotification('Redirecting to Google...', 'success');
        await auth.signInWithRedirect(googleProvider);
    } catch (error) {
        console.error('Redirect sign-in error:', error);
        showError('Redirect sign-in failed: ' + error.message);
    }
}

// Check for redirect result when page loads
function checkRedirectResult() {
    auth.getRedirectResult().then((result) => {
        if (result.user) {
            console.log('✅ Redirect sign-in successful:', result.user.email);
            showGlobalNotification('Welcome back to MzansiCare!', 'success');
            authModal.style.display = 'none';
        }
    }).catch((error) => {
        console.error('❌ Redirect result error:', error);
    });
}

// Create user profile for Google sign-in users
async function createUserProfile(user) {
    try {
        // Generate a random clinic ID for Google sign-in users
        const clinicId = 'GC-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        
        await db.collection('patients').doc(user.uid).set({
            name: user.displayName || 'Google User',
            email: user.email,
            clinicId: clinicId,
            conditions: '',
            medications: '',
            bloodType: '',
            emergencyContact: '',
            isGoogleUser: true,
            role: 'patient',
            photoURL: user.photoURL || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Google user profile created successfully');
    } catch (error) {
        console.error('❌ Error creating Google user profile:', error);
        throw error;
    }
}

// Tab switching functionality
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');
        
        // Remove active class from all buttons and contents
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked button and corresponding content
        button.classList.add('active');
        document.getElementById(`${tabId}-tab`).classList.add('active');
        
        // Clear errors when switching tabs
        document.querySelectorAll('.error-message').forEach(el => el.remove());
    });
});

// Switch tab links
switchTabs.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = link.getAttribute('data-tab');
        
        // Remove active class from all buttons and contents
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to target button and content
        document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');
        document.getElementById(`${tabId}-tab`).classList.add('active');
        
        // Clear errors when switching tabs
        document.querySelectorAll('.error-message').forEach(el => el.remove());
    });
});

// Google Auth Button Event Listeners
if (googleLoginBtn) {
    googleLoginBtn.setAttribute('data-original-text', googleLoginBtn.innerHTML);
    googleLoginBtn.addEventListener('click', signInWithGoogle);
}

if (googleRegisterBtn) {
    googleRegisterBtn.setAttribute('data-original-text', googleRegisterBtn.innerHTML);
    googleRegisterBtn.addEventListener('click', signInWithGoogle);
}

// Add redirect fallback button (hidden by default)
function addRedirectFallback() {
    const redirectBtn = document.createElement('button');
    redirectBtn.innerHTML = '<i class="fab fa-google"></i> Sign in with Redirect (if popup fails)';
    redirectBtn.style.cssText = `
        width: 100%;
        background: #f8f9fa;
        color: #666;
        border: 1px dashed #ccc;
        padding: 10px;
        border-radius: 5px;
        margin: 10px 0;
        cursor: pointer;
        font-size: 0.8rem;
    `;
    redirectBtn.onclick = signInWithGoogleRedirect;
    
    // Add to both tabs
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    
    if (loginTab) {
        const clone = redirectBtn.cloneNode(true);
        loginTab.querySelector('form')?.insertAdjacentElement('beforebegin', clone);
    }
    if (registerTab) {
        const clone = redirectBtn.cloneNode(true);
        registerTab.querySelector('form')?.insertAdjacentElement('beforebegin', clone);
    }
}

// Open modal when auth link or get started button is clicked
if (authLink) {
    authLink.addEventListener('click', (e) => {
        e.preventDefault();
        authModal.style.display = 'flex';
        document.getElementById('login-email')?.focus();
    });
}

if (getStartedBtn) {
    getStartedBtn.addEventListener('click', () => {
        authModal.style.display = 'flex';
        document.getElementById('login-email')?.focus();
    });
}

// Close modal when X is clicked
if (closeModal) {
    closeModal.addEventListener('click', () => {
        authModal.style.display = 'none';
        // Clear forms and errors
        if (loginForm) loginForm.reset();
        if (registerForm) registerForm.reset();
        document.querySelectorAll('.error-message').forEach(el => el.remove());
    });
}

// Close modal when clicking outside the modal content
window.addEventListener('click', (e) => {
    if (e.target === authModal) {
        authModal.style.display = 'none';
        // Clear forms and errors
        if (loginForm) loginForm.reset();
        if (registerForm) registerForm.reset();
        document.querySelectorAll('.error-message').forEach(el => el.remove());
    }
});

// Email/Password Login
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        
        submitBtn.setAttribute('data-original-text', submitBtn.textContent);
        setButtonLoading(submitBtn, true, 'Signing in...');
        
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            console.log('✅ User logged in:', user.email);
            authModal.style.display = 'none';
            loginForm.reset();
            showGlobalNotification('Welcome back to MzansiCare!', 'success');
            
        } catch (error) {
            console.error('❌ Login error:', error);
            const errorMessage = errorMessages[error.code] || error.message;
            showError(errorMessage);
        } finally {
            setButtonLoading(submitBtn, false);
        }
    });
}

// Email/Password Registration
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const clinicId = document.getElementById('register-clinic-id').value;
        const submitBtn = registerForm.querySelector('button[type="submit"]');
        
        submitBtn.setAttribute('data-original-text', submitBtn.textContent);
        setButtonLoading(submitBtn, true, 'Creating account...');
        
        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Update user profile with display name
            await user.updateProfile({
                displayName: name
            });
            
            // Create user profile in Firestore
            await db.collection('patients').doc(user.uid).set({
                name: name,
                email: email,
                clinicId: clinicId,
                conditions: '',
                medications: '',
                bloodType: '',
                emergencyContact: '',
                isGoogleUser: false,
                role: 'patient',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('✅ User profile created');
            authModal.style.display = 'none';
            registerForm.reset();
            showGlobalNotification('Account created successfully! Welcome to MzansiCare!', 'success');
            
        } catch (error) {
            console.error('❌ Registration error:', error);
            const errorMessage = errorMessages[error.code] || error.message;
            showError(errorMessage);
        } finally {
            setButtonLoading(submitBtn, false);
        }
    });
}

// Logout functionality
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            // Update last login time before signing out
            const user = auth.currentUser;
            if (user) {
                await db.collection('patients').doc(user.uid).update({
                    lastLogout: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            await auth.signOut();
            console.log('✅ User signed out');
            showGlobalNotification('Logged out successfully', 'success');
        } catch (error) {
            console.error('❌ Logout error:', error);
            showGlobalNotification('Error during logout', 'error');
        }
    });
}

// Enhanced Auth state observer
auth.onAuthStateChanged(async (user) => {
    // Mark auth as initialized so other scripts can act accurately
    window.__authUser = user || null;
    window.__authReady = true;
    try { window.dispatchEvent(new CustomEvent('auth-ready', { detail: { user } })); } catch(_) {}
    if (Array.isArray(window.__authReadyResolvers) && window.__authReadyResolvers.length) {
        const pending = window.__authReadyResolvers.splice(0);
        pending.forEach(resolver => {
            try { resolver(user || null); } catch (_) {}
        });
    }
    if (user) {
        // User is signed in
        console.log('✅ User is signed in:', user.email);
        // expose simple global flags for other scripts
        window.__isAuthed = true;
        if (authLink) authLink.style.display = 'none';
        if (userMenu) userMenu.style.display = 'block';
        if (userName) {
            userName.textContent = user.displayName || user.email.split('@')[0];
            // Add user avatar if available from Google
            if (user.photoURL) {
                userName.innerHTML = `<img src="${user.photoURL}" alt="Profile" style="width: 24px; height: 24px; border-radius: 50%; margin-right: 8px; vertical-align: middle;">${userName.textContent}`;
            }
        }
        
        // Admin link toggle
        try {
            const adminLink = document.getElementById('admin-link');
            const allowlist = ['admin@mzansicare.co.za', 'nmsmaphanga@gmail.com'];
            let isAdmin = allowlist.includes(user.email);
            const [adminDoc, patientDoc] = await Promise.all([
                db.collection('admins').doc(user.uid).get(),
                db.collection('patients').doc(user.uid).get()
            ]);
            const role = patientDoc.exists ? (patientDoc.data().role || 'patient') : 'patient';
            if (adminDoc.exists && adminDoc.data().role === 'admin') isAdmin = true;
            if (role === 'admin') isAdmin = true;
            if (adminLink) adminLink.style.display = isAdmin ? 'list-item' : 'none';
            // Expose admin flag globally for click guards
            window.__isAdmin = !!isAdmin;

            // Add small role badge next to username in navbar
            try {
                const existing = document.getElementById('nav-role-badge');
                if (existing) existing.remove();
                const badge = document.createElement('span');
                badge.id = 'nav-role-badge';
                badge.className = `role-badge ${role === 'admin' ? 'role-admin' : role === 'staff' ? 'role-staff' : 'role-patient'}`;
                badge.style.marginLeft = '6px';
                badge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
                userName?.insertAdjacentElement('afterend', badge);
            } catch (_) {}

            const makeAdminBtn = document.getElementById('make-admin-btn');
            if (makeAdminBtn) {
                makeAdminBtn.style.display = isAdmin ? 'none' : 'inline-block';
                makeAdminBtn.onclick = async () => {
                    await db.collection('patients').doc(user.uid).set({ role: 'admin' }, { merge: true });
                    await db.collection('admins').doc(user.uid).set({ role: 'admin', updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                    showGlobalNotification('You are now an admin (dev toggle).', 'success');
                    window.location.reload();
                };
            }

            // Toggle role (dev): flips between admin and patient
            const toggleRoleBtn = document.getElementById('toggle-role-btn');
            if (toggleRoleBtn) {
                toggleRoleBtn.style.display = 'inline-block';
                toggleRoleBtn.onclick = async () => {
                    try {
                        const newRole = (role === 'admin') ? 'patient' : 'admin';
                        await db.collection('patients').doc(user.uid).set({ role: newRole }, { merge: true });
                        if (newRole === 'admin') {
                            await db.collection('admins').doc(user.uid).set({ role: 'admin', updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                        } else {
                            await db.collection('admins').doc(user.uid).delete().catch(()=>{});
                        }
                        showGlobalNotification(`Role switched to ${newRole}.`, 'success');
                        setTimeout(()=>window.location.reload(), 400);
                    } catch (err) {
                        showGlobalNotification('Failed to toggle role: ' + err.message, 'error');
                    }
                };
            }

            // Apply for Admin button
            const applyAdminBtn = document.getElementById('apply-admin-btn');
            if (applyAdminBtn) {
                applyAdminBtn.style.display = isAdmin ? 'none' : 'inline-block';
                applyAdminBtn.onclick = async () => {
                    try {
                        const reason = prompt('Why do you need admin access?');
                        if (reason === null) return; // cancelled
                        const reqRef = db.collection('adminRequests').doc(user.uid);
                        await reqRef.set({
                            userId: user.uid,
                            name: user.displayName || patientDoc.data()?.name || '',
                            email: user.email,
                            reason: reason || '',
                            status: 'pending',
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                        showGlobalNotification('Admin request submitted. You will be notified once reviewed.', 'success');
                    } catch (err) {
                        showGlobalNotification('Failed to submit admin request: ' + err.message, 'error');
                    }
                };
            }
        } catch (e) { console.warn('Admin check failed', e); }

    // Show profile/dashboard
    const profileSection = document.getElementById('profile');
    if (profileSection) profileSection.style.display = 'block';
        
        // Update last login time
        try {
            await db.collection('patients').doc(user.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.log('⚠️ Error updating last login:', error);
        }
        
        // Load user data
        await loadUserData(user.uid);

        // Ensure sample reminders exist in Firestore for this user (demo)
        if (window.seedUserReminders) {
            window.seedUserReminders(user.uid);
        }

        // Initialize FCM token and foreground handling
        if (window.initMessagingForUser) {
            window.initMessagingForUser(user);
        }
        
    } else {
    // User is signed out
        console.log('🔒 User is signed out');
        window.__isAuthed = false;
        window.__isAdmin = false;
        if (authLink) authLink.style.display = 'block';
        if (userMenu) userMenu.style.display = 'none';
        
    // Hide profile/dashboard
    const profileSection = document.getElementById('profile');
    if (profileSection) profileSection.style.display = 'none';
        
        // Check for redirect results
        checkRedirectResult();
    }
});

// Enhanced function to load user data from Firestore
async function loadUserData(userId) {
    try {
        const doc = await db.collection('patients').doc(userId).get();
        
        if (doc.exists) {
            const userData = doc.data();
            updateProfileDisplay(userData);
        } else {
            console.log('⚠️ No user document found, creating one...');
            // Create a basic user document if it doesn't exist
            const user = auth.currentUser;
            if (user) {
                const clinicId = user.displayName ? 'GC-' + Math.random().toString(36).substr(2, 9).toUpperCase() : 'Not set';
                
                await db.collection('patients').doc(userId).set({
                    name: user.displayName || 'User',
                    email: user.email,
                    clinicId: clinicId,
                    conditions: '',
                    medications: '',
                    bloodType: '',
                    emergencyContact: '',
                    isGoogleUser: !!user.displayName,
                    photoURL: user.photoURL || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
    } catch (error) {
        console.error('❌ Error loading user data:', error);
        showGlobalNotification('Error loading profile data', 'error');
    }
}

// Function to update profile display with user data
function updateProfileDisplay(userData) {
    const profileName = document.getElementById('profile-name');
    const profileClinicId = document.getElementById('profile-clinic-id');
    const profileConditions = document.getElementById('profile-conditions');
    const profileMedications = document.getElementById('profile-medications');
    const profileContact = document.getElementById('profile-contact');
    const idName = document.getElementById('id-name');
    const idClinic = document.getElementById('id-clinic');
    const idBlood = document.getElementById('id-blood');
    const idEmergency = document.getElementById('id-emergency');
    const roleBadge = document.getElementById('role-badge');
    
    if (profileName) profileName.textContent = userData.name;
    if (profileClinicId) profileClinicId.textContent = `Clinic ID: ${userData.clinicId}`;
    if (profileConditions) profileConditions.textContent = `Conditions: ${userData.conditions || 'None listed'}`;
    if (profileMedications) profileMedications.textContent = `Medications: ${userData.medications || 'None listed'}`;
    if (profileContact) profileContact.textContent = `Contact: ${userData.email || 'Not provided'}`;
    
    // Update digital ID card
    if (idName) idName.textContent = userData.name;
    if (idClinic) idClinic.textContent = `Clinic ID: ${userData.clinicId}`;
    if (idBlood) idBlood.textContent = `Blood Type: ${userData.bloodType || 'Not specified'}`;
    if (idEmergency) idEmergency.textContent = `Emergency Contact: ${userData.emergencyContact || 'Not specified'}`;
    
    // Generate QR for digital ID
    try {
        const qrEl = document.getElementById('id-qrcode');
        if (qrEl && window.QRCode && auth.currentUser) {
            qrEl.innerHTML = '';
            const payload = JSON.stringify({ uid: auth.currentUser.uid, clinicId: userData.clinicId || '', name: userData.name || '' });
            new QRCode(qrEl, { text: payload, width: 96, height: 96 });
        }
    } catch (e) { console.warn('QR generation failed', e); }

    // Update profile avatar if available
    if (userData.photoURL) {
        const profileAvatar = document.querySelector('.profile-avatar');
        if (profileAvatar) {
            profileAvatar.innerHTML = `<img src="${userData.photoURL}" alt="Profile" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        }
    }

    // Show role badge
    if (roleBadge) {
        const role = (userData.role || 'patient').toLowerCase();
        roleBadge.style.display = 'inline-block';
        roleBadge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        roleBadge.classList.remove('role-admin', 'role-staff', 'role-patient');
        roleBadge.classList.add(role === 'admin' ? 'role-admin' : role === 'staff' ? 'role-staff' : 'role-patient');
    }
}

// Password reset functionality
function initPasswordReset() {
    const resetLink = document.createElement('a');
    resetLink.href = '#';
    resetLink.textContent = 'Forgot password?';
    resetLink.style.cssText = 'color: var(--primary); text-decoration: none; font-size: 0.9rem; margin-top: 10px; display: inline-block;';
    
    resetLink.addEventListener('click', (e) => {
        e.preventDefault();
        const email = prompt('Enter your email address to reset password:');
        if (email) {
            auth.sendPasswordResetEmail(email)
                .then(() => {
                    alert('Password reset email sent! Check your inbox.');
                })
                .catch((error) => {
                    const errorMessage = errorMessages[error.code] || error.message;
                    alert('Error: ' + errorMessage);
                });
        }
    });
    
    // Add to login form
    const loginFooter = document.querySelector('#login-tab .auth-footer');
    if (loginFooter) {
        const breakElement = document.createElement('br');
        loginFooter.appendChild(breakElement);
        loginFooter.appendChild(resetLink);
    }
}

// Test Firebase connection
function testFirebaseConnection() {
    console.log('🧪 Testing Firebase connection...');
    console.log('Firebase App:', firebase.apps.length > 0 ? '✅ Loaded' : '❌ Failed');
    console.log('Auth Service:', auth ? '✅ Loaded' : '❌ Failed');
    console.log('Firestore Service:', db ? '✅ Loaded' : '❌ Failed');
    console.log('Google Provider:', googleProvider ? '✅ Loaded' : '❌ Failed');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 MzansiCare authentication system initialized');
    testFirebaseConnection();
    initPasswordReset();
    addRedirectFallback(); // Add redirect fallback option
    checkRedirectResult(); // Check for redirect results
    
    // Add CSS animations for notifications
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
});
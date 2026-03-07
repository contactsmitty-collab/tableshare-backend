// Main App Controller
let resetTokenFromUrl = null;
let sessionTimeoutWarningShown = false;
let sessionWarningTimer = null;
let sessionLogoutTimer = null;
const SESSION_WARNING_MINUTES = 25;
const SESSION_LOGOUT_MINUTES = 30;

function resetSessionTimer() {
    sessionTimeoutWarningShown = false;
    if (sessionWarningTimer) { clearTimeout(sessionWarningTimer); sessionWarningTimer = null; }
    if (sessionLogoutTimer) { clearTimeout(sessionLogoutTimer); sessionLogoutTimer = null; }
    if (!api.getToken()) return;
    sessionWarningTimer = setTimeout(() => {
        if (!api.getToken()) return;
        if (!sessionTimeoutWarningShown) {
            sessionTimeoutWarningShown = true;
            showSessionWarningModal();
        }
        sessionLogoutTimer = setTimeout(() => {
            if (api.getToken()) {
                api.clearToken();
                showScreen('login-screen');
                if (typeof showToast === 'function') showToast('Session expired. Please sign in again.', 'info');
            }
        }, (SESSION_LOGOUT_MINUTES - SESSION_WARNING_MINUTES) * 60 * 1000);
    }, SESSION_WARNING_MINUTES * 60 * 1000);
}

function showSessionWarningModal() {
    const overlay = document.createElement('div');
    overlay.id = 'session-warning-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    overlay.innerHTML = `
        <div style="background:var(--card);border-radius:12px;padding:24px;max-width:360px;box-shadow:0 20px 48px rgba(0,0,0,0.2);">
            <h3 style="margin-bottom:12px;font-size:18px;">Session expiring soon</h3>
            <p style="color:var(--text-secondary);font-size:14px;margin-bottom:20px;">You've been inactive for a while. Click below to stay logged in.</p>
            <button id="session-stay-btn" style="width:100%;padding:12px;background:var(--accent);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-family:inherit;">Stay logged in</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#session-stay-btn').addEventListener('click', () => {
        overlay.remove();
        resetSessionTimer();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    resetTokenFromUrl = params.get('token');
    if (resetTokenFromUrl) {
        showScreen('login-screen');
        showLoginView('reset');
        // Clean URL without reload
        if (window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } else {
        checkAuth();
    }
    bindLoginViewHandlers();
    document.addEventListener('click', resetSessionTimer);
    document.addEventListener('keydown', resetSessionTimer);
});

function checkAuth() {
    const token = api.getToken();
    
    if (!token) {
        showScreen('login-screen');
        return;
    }

    // Load user and determine which dashboard to show
    api.getCurrentUser()
        .then(user => {
            resetSessionTimer();
            if (user.role === 'admin') {
                showScreen('admin-screen');
                document.getElementById('admin-user-name').textContent = `${user.first_name} ${user.last_name}`;
                if (typeof AdminDashboard !== 'undefined') {
                    AdminDashboard.init();
                }
            } else if (user.restaurant_id || user.role === 'restaurant') {
                showScreen('restaurant-screen');
                document.getElementById('restaurant-user-name').textContent = `${user.first_name} ${user.last_name}`;
                if (typeof RestaurantDashboard !== 'undefined') {
                    RestaurantDashboard.init();
                }
            } else {
                alert('This portal is for administrators and restaurant managers only.');
                api.logout();
            }
        })
        .catch(error => {
            console.error('Auth error:', error);
            api.clearToken();
            showScreen('login-screen');
            showLoginView('login');
        });
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Login form handler
document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    
    errorDiv.classList.remove('show');

    // Clear any stale session before new login
    api.clearToken();
    
    try {
        await api.login(email, password);
        checkAuth();
    } catch (error) {
        errorDiv.textContent = error.message || 'Invalid credentials';
        errorDiv.classList.add('show');
    }
});

// Logout handlers
document.getElementById('admin-logout')?.addEventListener('click', () => {
    api.clearToken();
    showScreen('login-screen');
});

document.getElementById('restaurant-logout')?.addEventListener('click', () => {
    api.clearToken();
    showScreen('login-screen');
});

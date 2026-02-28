// Main App Controller
let resetTokenFromUrl = null;

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

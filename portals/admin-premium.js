const AdminDashboard = {
    currentSection: 'overview',

    init() {
        document.querySelectorAll('#admin-screen .nav-menu a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = e.target.closest('a').dataset.section;
                if (section) this.loadSection(section);
            });
        });

        const user = api.user;
        if (user) {
            const initials = (user.first_name || '')[0] + (user.last_name || '')[0];
            const avatarEl = document.getElementById('admin-avatar');
            if (avatarEl) avatarEl.textContent = initials.toUpperCase();
        }

        this.loadSection('overview');
    },

    loadSection(section) {
        this.currentSection = section;

        document.querySelectorAll('#admin-screen .nav-menu a').forEach(link => {
            link.classList.toggle('active', link.dataset.section === section);
        });

        const titles = {
            overview: 'Dashboard',
            users: 'Users',
            restaurants: 'Restaurants',
            analytics: 'Analytics',
            reports: 'Safety Reports',
            blocks: 'Blocked Users',
            settings: 'Settings'
        };

        const subtitles = {
            overview: 'Platform performance at a glance',
            users: 'Manage all users',
            restaurants: 'Manage partner restaurants',
            analytics: 'Platform-wide analytics',
            reports: 'Review and manage safety reports',
            blocks: 'Platform-wide block list for support'
        };

        document.getElementById('admin-section-title').textContent = titles[section] || section;
        document.getElementById('admin-subtitle').textContent = subtitles[section] || '';

        const contentDiv = document.getElementById('admin-content');
        contentDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';

        switch (section) {
            case 'overview': this.loadOverview(); break;
            case 'restaurants': this.loadRestaurants(); break;
            case 'users': this.loadUsers(); break;
            case 'analytics': this.loadAnalytics(); break;
            case 'reports': this.loadReports(); break;
            case 'blocks': this.loadBlockedUsers(); break;
            case 'settings': this.loadSettings(); break;
            default:
                contentDiv.innerHTML = `
                    <div class="card" style="text-align: center; padding: 60px 24px;">
                        <div style="font-size: 40px; margin-bottom: 16px; opacity: 0.5;">🚧</div>
                        <h3>Coming Soon</h3>
                        <p style="color: var(--text-secondary); margin-top: 8px; font-size: 13px;">This section is under development.</p>
                    </div>
                `;
        }
    },

    async loadOverview() {
        try {
            const [stats, restaurants, users] = await Promise.all([
                api.getStats(),
                api.getRestaurants(),
                api.getUsers()
            ]);

            const contentDiv = document.getElementById('admin-content');
            const totalUsers = stats.total_users || users.length;
            const activeUsers = stats.active_users || 0;
            const totalRestaurants = stats.total_restaurants || restaurants.length;
            const totalCheckins = stats.total_check_ins || 0;
            const totalMatches = stats.total_matches || 0;

            contentDiv.innerHTML = `
                <!-- KPI Cards -->
                <div class="kpi-grid">
                    <div class="kpi-card">
                        <div class="kpi-card-inner">
                            <div class="kpi-card-left">
                                <div class="kpi-label">Active Users</div>
                                <div class="kpi-value" style="font-family:var(--mono);">${formatNumber(activeUsers)}</div>
                                <div class="kpi-change">
                                    <span class="kpi-change-value ${(stats.active_users_delta_pct || 0) >= 0 ? 'positive' : 'negative'}">${(stats.active_users_delta_pct || 0) >= 0 ? '↑' : '↓'} ${Math.abs(stats.active_users_delta_pct || 0)}%</span>
                                    <span class="kpi-change-label">vs last month</span>
                                </div>
                            </div>
                            <div class="kpi-card-right">
                                <div class="kpi-icon" style="background:var(--blue-light);">
                                    <svg width="18" height="18" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-8 6v-1c0-2.21 3.58-4 8-4s8 1.79 8 4v1" transform="scale(0.75)"/></svg>
                                </div>
                                <div id="kpi-sparkline-users" style="width:64px;height:28px;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-card-inner">
                            <div class="kpi-card-left">
                                <div class="kpi-label">Matches Today</div>
                                <div class="kpi-value" style="font-family:var(--mono);">${formatNumber(totalMatches)}</div>
                                <div class="kpi-change">
                                    <span class="kpi-change-value ${(stats.matches_delta_pct || 0) >= 0 ? 'positive' : 'negative'}">${(stats.matches_delta_pct || 0) >= 0 ? '↑' : '↓'} ${Math.abs(stats.matches_delta_pct || 0)}%</span>
                                    <span class="kpi-change-label">vs last week</span>
                                </div>
                            </div>
                            <div class="kpi-card-right">
                                <div class="kpi-icon" style="background:var(--green-light);">
                                    <svg width="18" height="18" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.75 9l4.5 4.5 7.5-7.5" transform="scale(0.75)"/></svg>
                                </div>
                                <div id="kpi-sparkline-matches" style="width:64px;height:28px;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-card-inner">
                            <div class="kpi-card-left">
                                <div class="kpi-label">Restaurants Live</div>
                                <div class="kpi-value" style="font-family:var(--mono);">${formatNumber(totalRestaurants)}</div>
                                <div class="kpi-change">
                                    <span class="kpi-change-value positive">+${stats.restaurants_delta_this_week ?? 0}</span>
                                    <span class="kpi-change-label">this week</span>
                                </div>
                            </div>
                            <div class="kpi-card-right">
                                <div class="kpi-icon" style="background:var(--accent-light);">
                                    <svg width="18" height="18" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.25 15.75V6.75a2.25 2.25 0 00-2.25-2.25h-6a2.25 2.25 0 00-2.25 2.25v9m10.5 0h1.5m-1.5 0h-3.75m-6.75 0H2.25m1.5 0h3.75M6.75 8.25h.75m-.75 3h.75m3-3h.75m-.75 3h.75" transform="scale(0.75)"/></svg>
                                </div>
                                <div id="kpi-sparkline-restaurants" style="width:64px;height:28px;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-card-inner">
                            <div class="kpi-card-left">
                                <div class="kpi-label">Check-ins Today</div>
                                <div class="kpi-value" style="font-family:var(--mono);">${formatNumber(totalCheckins)}</div>
                                <div class="kpi-change">
                                    <span class="kpi-change-value ${(stats.check_ins_delta_pct || 0) >= 0 ? 'positive' : 'negative'}">${(stats.check_ins_delta_pct || 0) >= 0 ? '↑' : '↓'} ${Math.abs(stats.check_ins_delta_pct || 0)}%</span>
                                    <span class="kpi-change-label">vs last week</span>
                                </div>
                            </div>
                            <div class="kpi-card-right">
                                <div class="kpi-icon" style="background:var(--purple-light);">
                                    <svg width="18" height="18" fill="none" stroke="var(--purple)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M13.5 17.25l-1.5-1.5 1.5-1.5m-3 0L9 15.75l1.5-1.5" transform="scale(0.75)"/></svg>
                                </div>
                                <div id="kpi-sparkline-checkins" style="width:64px;height:28px;"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Two-column: Recent Matches + Weekly Check-ins -->
                <div style="display:grid;grid-template-columns:3fr 2fr;gap:16px;margin-bottom:20px;">
                    <!-- Recent Users Table -->
                    <div class="data-panel">
                        <div class="data-panel-header">
                            <span class="data-panel-title">Recent Users</span>
                            <a href="#" class="data-panel-action" onclick="AdminDashboard.loadSection('users'); return false;">View all →</a>
                        </div>
                        <div class="data-row data-row-header" style="grid-template-columns:2fr 2fr 1fr;">
                            <div class="data-cell">Name</div>
                            <div class="data-cell">Email</div>
                            <div class="data-cell">Joined</div>
                        </div>
                        ${users.slice(0, 6).map(u => `
                            <div class="data-row" style="grid-template-columns:2fr 2fr 1fr;">
                                <div class="data-cell bold">${u.first_name} ${u.last_name}</div>
                                <div class="data-cell" style="color:var(--text-secondary);">${u.email}</div>
                                <div class="data-cell mono" style="font-size:12px;color:var(--text-secondary);">${formatDate(u.created_at)}</div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Weekly Check-ins Mini Chart -->
                    <div class="data-panel">
                        <div class="data-panel-header">
                            <span class="data-panel-title">Weekly Check-ins</span>
                            <div class="filter-pills">
                                <span class="filter-pill active">Week</span>
                                <span class="filter-pill">Month</span>
                            </div>
                        </div>
                        <div style="padding:20px;height:200px;" id="admin-weekly-checkins"></div>
                    </div>
                </div>

                <!-- Restaurant Partners Table -->
                <div class="data-panel">
                    <div class="data-panel-header">
                        <span class="data-panel-title">Restaurant Partners</span>
                        <a href="#" class="data-panel-action" onclick="AdminDashboard.loadSection('restaurants'); return false;">View all →</a>
                    </div>
                    <div class="data-row data-row-header" style="grid-template-columns:2fr 1fr 1fr 1fr 100px;">
                        <div class="data-cell">Restaurant</div>
                        <div class="data-cell">City</div>
                        <div class="data-cell">Cuisine</div>
                        <div class="data-cell">Check-ins</div>
                        <div class="data-cell">Status</div>
                    </div>
                    ${restaurants.slice(0, 5).map(r => `
                        <div class="data-row" style="grid-template-columns:2fr 1fr 1fr 1fr 100px;">
                            <div class="data-cell bold">${r.name}</div>
                            <div class="data-cell" style="color:var(--text-secondary);">${r.city || '—'}</div>
                            <div class="data-cell" style="color:var(--text-secondary);">${r.cuisine_type || '—'}</div>
                            <div class="data-cell mono">${r.check_in_count || 0}</div>
                            <div class="data-cell"><span class="badge badge-active">Active</span></div>
                        </div>
                    `).join('')}
                </div>
            `;

            setTimeout(async () => {
                if (typeof ChartUtils !== 'undefined' && ChartUtils.createSparkline) {
                    try {
                        const [usersTrend, checkinsTrend, dowTrend] = await Promise.all([
                            api.getStatsTrends('users', 14),
                            api.getStatsTrends('checkins', 7),
                            api.getStatsTrends('checkins_by_dow', 30)
                        ]);
                        const usersData = (usersTrend.data || []).slice(-12);
                        const checkinsData = (checkinsTrend.data || []).slice(-7);
                        ChartUtils.createSparkline('kpi-sparkline-users', usersData.length ? usersData : [0], 'var(--blue)');
                        ChartUtils.createSparkline('kpi-sparkline-checkins', checkinsData.length ? checkinsData : [0], 'var(--purple)');
                        ChartUtils.createSparkline('kpi-sparkline-matches', checkinsData.length ? checkinsData : [0], 'var(--green)');
                        ChartUtils.createSparkline('kpi-sparkline-restaurants', checkinsData.length ? checkinsData : [0], 'var(--accent)');
                        const dowData = dowTrend.data || [0, 0, 0, 0, 0, 0, 0];
                        ChartUtils.createMiniBarChart('admin-weekly-checkins', dowData, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 'var(--accent)');
                    } catch (e) {
                        ChartUtils.createSparkline('kpi-sparkline-users', [0], 'var(--blue)');
                        ChartUtils.createSparkline('kpi-sparkline-matches', [0], 'var(--green)');
                        ChartUtils.createSparkline('kpi-sparkline-restaurants', [0], 'var(--accent)');
                        ChartUtils.createSparkline('kpi-sparkline-checkins', [0], 'var(--purple)');
                        ChartUtils.createMiniBarChart('admin-weekly-checkins', [0, 0, 0, 0, 0, 0, 0], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], 'var(--accent)');
                    }
                }
            }, 50);

        } catch (error) {
            this.showError(error.message);
        }
    },

    async loadRestaurants() {
        try {
            const restaurants = await api.getRestaurants();
            const contentDiv = document.getElementById('admin-content');

            contentDiv.innerHTML = `
                <div class="data-panel">
                    <div class="data-panel-header">
                        <span class="data-panel-title">All Restaurants (${restaurants.length})</span>
                        <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddRestaurantModal()">+ Add Restaurant</button>
                    </div>
                    <div style="padding:12px 20px;">
                        <input type="text" id="restaurant-search" placeholder="Search by name or city..."
                            style="width:100%;padding:8px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:var(--font);background:var(--bg);"
                            oninput="AdminDashboard.searchRestaurants(this.value)">
                    </div>
                    <div class="data-row data-row-header" style="grid-template-columns:2fr 1fr 1fr 80px 80px 80px 120px;">
                        <div class="data-cell">Name</div>
                        <div class="data-cell">City</div>
                        <div class="data-cell">Cuisine</div>
                        <div class="data-cell">Price</div>
                        <div class="data-cell">Rating</div>
                        <div class="data-cell">Check-ins</div>
                        <div class="data-cell" style="text-align:right;">Actions</div>
                    </div>
                    <div id="restaurants-table-body">
                        ${this._renderRestaurantRows(restaurants)}
                    </div>
                </div>
            `;
        } catch (error) {
            this.showError(error.message);
        }
    },

    _renderRestaurantRows(restaurants) {
        return restaurants.map(r => `
            <div class="data-row" style="grid-template-columns:2fr 1fr 1fr 80px 80px 80px 120px;">
                <div class="data-cell bold">${r.name}</div>
                <div class="data-cell" style="color:var(--text-secondary);">${r.city || '—'}</div>
                <div class="data-cell" style="color:var(--text-secondary);">${r.cuisine_type || '—'}</div>
                <div class="data-cell mono">${r.price_range || '—'}</div>
                <div class="data-cell mono">${r.rating || '—'}</div>
                <div class="data-cell mono">${r.check_in_count || 0}</div>
                <div class="data-cell" style="text-align:right;display:flex;gap:6px;justify-content:flex-end;">
                    <button class="btn btn-secondary btn-sm" onclick="AdminDashboard.showEditRestaurantModal('${r.restaurant_id}', ${JSON.stringify(r).replace(/'/g, '&#39;').replace(/"/g, '&quot;')})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="AdminDashboard.confirmDeleteRestaurant('${r.restaurant_id}', '${r.name.replace(/'/g, "\\'")}')">Delete</button>
                </div>
            </div>
        `).join('');
    },

    _restSearchTimeout: null,
    searchRestaurants(value) {
        clearTimeout(this._restSearchTimeout);
        this._restSearchTimeout = setTimeout(async () => {
            try {
                const restaurants = await api.getRestaurants(value);
                const body = document.getElementById('restaurants-table-body');
                if (body) body.innerHTML = this._renderRestaurantRows(restaurants);
            } catch (e) { console.error('Search error:', e); }
        }, 300);
    },

    _restaurantFormFields() {
        return `
            <div class="form-group">
                <label>Restaurant Name *</label>
                <input type="text" id="rest-name" required>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label>City</label><input type="text" id="rest-city"></div>
                <div class="form-group"><label>Cuisine Type</label><input type="text" id="rest-cuisine" placeholder="e.g. Italian, Mexican"></div>
            </div>
            <div class="form-group"><label>Address</label><input type="text" id="rest-address"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label>Price Range</label>
                    <select id="rest-price"><option value="">Select</option><option value="$">$ Budget</option><option value="$$">$$ Moderate</option><option value="$$$">$$$ Upscale</option><option value="$$$$">$$$$ Fine Dining</option></select>
                </div>
                <div class="form-group"><label>Phone</label><input type="tel" id="rest-phone"></div>
                <div class="form-group"><label>Website</label><input type="url" id="rest-website" placeholder="https://"></div>
            </div>
            <div class="form-group"><label>Description</label><textarea id="rest-description" rows="3"></textarea></div>
            <div class="form-group">
                <label>Noise Level</label>
                <select id="rest-noise"><option value="">Select</option><option value="quiet">Quiet</option><option value="moderate">Moderate</option><option value="lively">Lively</option></select>
            </div>
            <div class="form-group"><label>TableShare Offer</label><textarea id="rest-tableshare-offer" rows="2" placeholder="e.g. Free appetizer for TableShare diners"></textarea></div>
            <div class="form-group"><label>Menu URL</label><input type="url" id="rest-menu-url" placeholder="https://"></div>
            <div class="form-group"><label>Specials</label><textarea id="rest-specials" rows="2" placeholder="Current specials or promotions"></textarea></div>
            <div class="form-group"><label>Hours of Operation</label><input type="text" id="rest-hours" placeholder="e.g. Mon-Sun: 9am-10pm"></div>
        `;
    },

    showAddRestaurantModal() {
        showModal('Add New Restaurant', `
            <form id="add-restaurant-form">
                ${this._restaurantFormFields()}
                <div style="display:flex;gap:12px;margin-top:20px;">
                    <button type="submit" class="btn btn-primary" style="flex:1;">Create Restaurant</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
                <div id="add-rest-error" class="error-message" style="margin-top:12px;"></div>
            </form>
        `);

        document.getElementById('add-restaurant-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorDiv = document.getElementById('add-rest-error');
            errorDiv.classList.remove('show');
            try {
                await api.createRestaurant({
                    name: document.getElementById('rest-name').value,
                    city: document.getElementById('rest-city').value || null,
                    cuisine_type: document.getElementById('rest-cuisine').value || null,
                    address: document.getElementById('rest-address').value || null,
                    price_range: document.getElementById('rest-price').value || null,
                    phone: document.getElementById('rest-phone').value || null,
                    website: document.getElementById('rest-website').value || null,
                    description: document.getElementById('rest-description').value || null,
                    hours: document.getElementById('rest-hours').value || null,
                    noise_level: document.getElementById('rest-noise').value || null,
                    tableshare_offer: document.getElementById('rest-tableshare-offer').value || null,
                    menu_url: document.getElementById('rest-menu-url').value || null,
                    specials: document.getElementById('rest-specials').value || null,
                });
                closeModal();
                showToast('Restaurant created successfully!', 'success');
                this.loadRestaurants();
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.classList.add('show');
            }
        });
    },

    showEditRestaurantModal(restaurantId, r) {
        showModal('Edit Restaurant', `
            <form id="edit-restaurant-form">
                ${this._restaurantFormFields()}
                <div style="display:flex;gap:12px;margin-top:20px;">
                    <button type="submit" class="btn btn-primary" style="flex:1;">Save Changes</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
                <div id="edit-rest-error" class="error-message" style="margin-top:12px;"></div>
            </form>
        `);

        document.getElementById('rest-name').value = r.name || '';
        document.getElementById('rest-city').value = r.city || '';
        document.getElementById('rest-cuisine').value = r.cuisine_type || '';
        document.getElementById('rest-address').value = r.address || '';
        document.getElementById('rest-price').value = r.price_range || '';
        document.getElementById('rest-phone').value = r.phone || '';
        document.getElementById('rest-website').value = r.website || '';
        document.getElementById('rest-description').value = r.description || '';
        document.getElementById('rest-noise').value = r.noise_level || '';
        document.getElementById('rest-tableshare-offer').value = r.tableshare_offer || '';
        document.getElementById('rest-menu-url').value = r.menu_url || '';
        document.getElementById('rest-specials').value = r.specials || '';
        document.getElementById('rest-hours').value = r.hours || '';

        document.getElementById('edit-restaurant-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorDiv = document.getElementById('edit-rest-error');
            errorDiv.classList.remove('show');
            try {
                await api.updateRestaurant(restaurantId, {
                    name: document.getElementById('rest-name').value,
                    city: document.getElementById('rest-city').value || null,
                    cuisine_type: document.getElementById('rest-cuisine').value || null,
                    address: document.getElementById('rest-address').value || null,
                    price_range: document.getElementById('rest-price').value || null,
                    phone: document.getElementById('rest-phone').value || null,
                    website: document.getElementById('rest-website').value || null,
                    description: document.getElementById('rest-description').value || null,
                    hours: document.getElementById('rest-hours').value || null,
                    noise_level: document.getElementById('rest-noise').value || null,
                    tableshare_offer: document.getElementById('rest-tableshare-offer').value || null,
                    menu_url: document.getElementById('rest-menu-url').value || null,
                    specials: document.getElementById('rest-specials').value || null,
                });
                closeModal();
                showToast('Restaurant updated successfully!', 'success');
                this.loadRestaurants();
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.classList.add('show');
            }
        });
    },

    confirmDeleteRestaurant(restaurantId, name) {
        showModal('Confirm Delete', `
            <p style="margin-bottom:12px;">Are you sure you want to delete <strong>${name}</strong>?</p>
            <p style="color:var(--text-secondary);margin-bottom:20px;font-size:13px;">This will also remove any users assigned to this restaurant.</p>
            <div style="display:flex;gap:12px;">
                <button class="btn btn-danger" style="flex:1;" onclick="AdminDashboard.deleteRestaurant('${restaurantId}')">Yes, Delete</button>
                <button class="btn btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
            </div>
        `);
    },

    async deleteRestaurant(restaurantId) {
        try {
            await api.deleteRestaurant(restaurantId);
            closeModal();
            showToast('Restaurant deleted successfully!', 'success');
            this.loadRestaurants();
        } catch (error) { showToast('Error: ' + error.message, 'error'); }
    },

    async loadUsers() {
        try {
            const users = await api.getUsers();
            const restaurants = await api.getRestaurants();
            const contentDiv = document.getElementById('admin-content');

            const roleBadge = (role) => {
                if (role === 'admin') return '<span class="badge badge-info">Admin</span>';
                if (role === 'restaurant') return '<span class="badge badge-accent">Restaurant</span>';
                return '<span class="badge badge-active">User</span>';
            };

            contentDiv.innerHTML = `
                <div class="data-panel">
                    <div class="data-panel-header">
                        <span class="data-panel-title">All Users (${users.length})</span>
                        <button class="btn btn-primary btn-sm" onclick="AdminDashboard.showAddUserModal()">+ Add User</button>
                    </div>
                    <div style="padding:12px 20px;">
                        <input type="text" id="user-search" placeholder="Search by name or email..."
                            style="width:100%;padding:8px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:var(--font);background:var(--bg);"
                            oninput="AdminDashboard.searchUsers(this.value)">
                    </div>
                    <div class="data-row data-row-header" style="grid-template-columns:2fr 2fr 100px 1fr 120px;">
                        <div class="data-cell">Name</div>
                        <div class="data-cell">Email</div>
                        <div class="data-cell">Role</div>
                        <div class="data-cell">Created</div>
                        <div class="data-cell" style="text-align:right;">Actions</div>
                    </div>
                    <div id="users-table-body">
                        ${this._renderUserRows(users, roleBadge)}
                    </div>
                </div>
            `;

            this._restaurants = restaurants;
        } catch (error) { this.showError(error.message); }
    },

    _renderUserRows(users, roleBadge) {
        if (!roleBadge) {
            roleBadge = (role) => {
                if (role === 'admin') return '<span class="badge badge-info">Admin</span>';
                if (role === 'restaurant') return '<span class="badge badge-accent">Restaurant</span>';
                return '<span class="badge badge-active">User</span>';
            };
        }
        return users.map(u => `
            <div class="data-row" style="grid-template-columns:2fr 2fr 100px 1fr 120px;">
                <div class="data-cell bold">${u.first_name} ${u.last_name}</div>
                <div class="data-cell" style="color:var(--text-secondary);">${u.email}</div>
                <div class="data-cell">${roleBadge(u.role)}</div>
                <div class="data-cell mono" style="font-size:12px;color:var(--text-secondary);">${formatDate(u.created_at)}</div>
                <div class="data-cell" style="text-align:right;display:flex;gap:6px;justify-content:flex-end;">
                    <button class="btn btn-secondary btn-sm" onclick="AdminDashboard.showEditUserModal('${u.user_id}', ${JSON.stringify(u).replace(/'/g, '&#39;').replace(/"/g, '&quot;')})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="AdminDashboard.confirmDeleteUser('${u.user_id}', '${u.first_name} ${u.last_name}')">Delete</button>
                </div>
            </div>
        `).join('');
    },

    _searchTimeout: null,
    searchUsers(value) {
        clearTimeout(this._searchTimeout);
        this._searchTimeout = setTimeout(async () => {
            try {
                const users = await api.getUsers(value);
                const body = document.getElementById('users-table-body');
                if (body) body.innerHTML = this._renderUserRows(users);
            } catch (e) { console.error('Search error:', e); }
        }, 300);
    },

    showAddUserModal() {
        const restaurantOptions = (this._restaurants || []).map(r =>
            `<option value="${r.restaurant_id}">${r.name}</option>`
        ).join('');

        showModal('Add New User', `
            <form id="add-user-form">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>First Name *</label><input type="text" id="new-first-name" required></div>
                    <div class="form-group"><label>Last Name *</label><input type="text" id="new-last-name" required></div>
                </div>
                <div class="form-group"><label>Email *</label><input type="email" id="new-email" required></div>
                <div class="form-group"><label>Password *</label><input type="password" id="new-password" required minlength="6"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group">
                        <label>Role</label>
                        <select id="new-role"><option value="user">User</option><option value="restaurant">Restaurant Manager</option><option value="admin">Admin</option></select>
                    </div>
                    <div class="form-group">
                        <label>Restaurant (optional)</label>
                        <select id="new-restaurant"><option value="">None</option>${restaurantOptions}</select>
                    </div>
                </div>
                <div style="display:flex;gap:12px;margin-top:20px;">
                    <button type="submit" class="btn btn-primary" style="flex:1;">Create User</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
                <div id="add-user-error" class="error-message" style="margin-top:12px;"></div>
            </form>
        `);

        document.getElementById('add-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorDiv = document.getElementById('add-user-error');
            errorDiv.classList.remove('show');
            try {
                await api.createUser({
                    email: document.getElementById('new-email').value,
                    password: document.getElementById('new-password').value,
                    first_name: document.getElementById('new-first-name').value,
                    last_name: document.getElementById('new-last-name').value,
                    role: document.getElementById('new-role').value,
                    restaurant_id: document.getElementById('new-restaurant').value || null,
                });
                closeModal();
                showToast('User created successfully!', 'success');
                this.loadUsers();
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.classList.add('show');
            }
        });
    },

    showEditUserModal(userId, user) {
        const restaurantOptions = (this._restaurants || []).map(r =>
            `<option value="${r.restaurant_id}" ${r.restaurant_id === user.restaurant_id ? 'selected' : ''}>${r.name}</option>`
        ).join('');

        showModal('Edit User', `
            <form id="edit-user-form">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>First Name</label><input type="text" id="edit-first-name" value="${user.first_name}"></div>
                    <div class="form-group"><label>Last Name</label><input type="text" id="edit-last-name" value="${user.last_name}"></div>
                </div>
                <div class="form-group"><label>Email</label><input type="email" id="edit-email" value="${user.email}"></div>
                <div class="form-group"><label>New Password (leave blank to keep current)</label><input type="password" id="edit-password" placeholder="Leave blank to keep current"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group">
                        <label>Role</label>
                        <select id="edit-role">
                            <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                            <option value="restaurant" ${user.role === 'restaurant' ? 'selected' : ''}>Restaurant Manager</option>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Restaurant</label>
                        <select id="edit-restaurant"><option value="">None</option>${restaurantOptions}</select>
                    </div>
                </div>
                <div style="display:flex;gap:12px;margin-top:20px;">
                    <button type="submit" class="btn btn-primary" style="flex:1;">Save Changes</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
                <div id="edit-user-error" class="error-message" style="margin-top:12px;"></div>
            </form>
        `);

        document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorDiv = document.getElementById('edit-user-error');
            errorDiv.classList.remove('show');
            const updates = {
                email: document.getElementById('edit-email').value,
                first_name: document.getElementById('edit-first-name').value,
                last_name: document.getElementById('edit-last-name').value,
                role: document.getElementById('edit-role').value,
                restaurant_id: document.getElementById('edit-restaurant').value || null,
            };
            const newPassword = document.getElementById('edit-password').value;
            if (newPassword) updates.password = newPassword;

            try {
                await api.updateUser(userId, updates);
                closeModal();
                showToast('User updated successfully!', 'success');
                this.loadUsers();
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.classList.add('show');
            }
        });
    },

    confirmDeleteUser(userId, name) {
        showModal('Confirm Delete', `
            <p style="margin-bottom:20px;">Are you sure you want to delete <strong>${name}</strong>? This action cannot be undone.</p>
            <div style="display:flex;gap:12px;">
                <button class="btn btn-danger" style="flex:1;" onclick="AdminDashboard.deleteUser('${userId}')">Yes, Delete</button>
                <button class="btn btn-secondary" style="flex:1;" onclick="closeModal()">Cancel</button>
            </div>
        `);
    },

    async deleteUser(userId) {
        try {
            await api.deleteUser(userId);
            closeModal();
            showToast('User deleted successfully!', 'success');
            this.loadUsers();
        } catch (error) { showToast('Error: ' + error.message, 'error'); }
    },

    async loadAnalytics() {
        try {
            const [stats, checkins, ratings, checkinsTrend, usersTrend] = await Promise.all([
                api.getStats(),
                api.getCheckins(),
                api.getRatings(),
                api.getStatsTrends('checkins', 30),
                api.getStatsTrends('users', 30)
            ]);

            const contentDiv = document.getElementById('admin-content');

            contentDiv.innerHTML = `
                <div class="kpi-grid">
                    <div class="kpi-card">
                        <div class="kpi-label">Total Check-ins</div>
                        <div class="kpi-value" style="font-family:var(--mono);">${formatNumber(stats.total_check_ins || checkins.length)}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Total Matches</div>
                        <div class="kpi-value" style="font-family:var(--mono);">${formatNumber(stats.total_matches || 0)}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Total Messages</div>
                        <div class="kpi-value" style="font-family:var(--mono);">${formatNumber(stats.total_messages || 0)}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Total Ratings</div>
                        <div class="kpi-value" style="font-family:var(--mono);">${formatNumber(stats.total_ratings || ratings.length)}</div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">Check-in Trend (30 Days)</h3></div>
                        <div class="chart-container"><canvas id="admin-checkins-chart"></canvas></div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">User Growth (30 Days)</h3></div>
                        <div class="chart-container"><canvas id="admin-users-chart"></canvas></div>
                    </div>
                </div>

                <div class="data-panel">
                    <div class="data-panel-header"><span class="data-panel-title">Recent Check-ins</span></div>
                    <div class="data-row data-row-header" style="grid-template-columns:2fr 2fr 80px 1fr 100px;">
                        <div class="data-cell">Customer</div>
                        <div class="data-cell">Restaurant</div>
                        <div class="data-cell">Party</div>
                        <div class="data-cell">Time</div>
                        <div class="data-cell">Status</div>
                    </div>
                    ${checkins.slice(0, 10).map(c => `
                        <div class="data-row" style="grid-template-columns:2fr 2fr 80px 1fr 100px;">
                            <div class="data-cell bold">${c.first_name} ${c.last_name}</div>
                            <div class="data-cell" style="color:var(--text-secondary);">${c.restaurant_name}</div>
                            <div class="data-cell mono">${c.party_size || 1}</div>
                            <div class="data-cell" style="font-size:12px;color:var(--text-secondary);">${formatDateTime(c.check_in_time)}</div>
                            <div class="data-cell"><span class="badge ${c.is_active ? 'badge-active' : 'badge-completed'}">${c.is_active ? 'Active' : 'Done'}</span></div>
                        </div>
                    `).join('')}
                </div>
            `;

            setTimeout(() => {
                const checkLabels = checkinsTrend.labels || ChartUtils.getDateLabels(30);
                const checkData = checkinsTrend.data || [];
                const userLabels = usersTrend.labels || ChartUtils.getDateLabels(30);
                const userData = usersTrend.data || [];
                ChartUtils.createLineChart('admin-checkins-chart', {
                    labels: checkLabels,
                    datasets: [{
                        label: 'Check-ins',
                        data: checkData.length ? checkData : [0],
                        borderColor: '#E8553D',
                        backgroundColor: 'rgba(232,85,61,0.08)',
                        tension: 0.4,
                        fill: true
                    }]
                });
                ChartUtils.createLineChart('admin-users-chart', {
                    labels: userLabels,
                    datasets: [{
                        label: 'New Users',
                        data: userData.length ? userData : [0],
                        borderColor: '#0D9F6E',
                        backgroundColor: 'rgba(13,159,110,0.08)',
                        tension: 0.4,
                        fill: true
                    }]
                });
            }, 100);

        } catch (error) { this.showError(error.message); }
    },

    _reportsFilterStatus: '',
    _reportsFilterTargetType: '',
    async loadReports() {
        try {
            const params = {};
            if (this._reportsFilterStatus) params.status = this._reportsFilterStatus;
            if (this._reportsFilterTargetType) params.target_type = this._reportsFilterTargetType;
            const data = await api.getReports(params);
            const reports = data.reports || [];
            this._reports = reports;
            const total = data.total ?? reports.length;

            const contentDiv = document.getElementById('admin-content');
            contentDiv.innerHTML = `
                <div class="data-panel">
                    <div class="data-panel-header" style="flex-wrap:wrap;gap:12px;">
                        <span class="data-panel-title">Safety Reports (${total})</span>
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <button class="btn btn-secondary btn-sm" onclick="AdminDashboard._exportReportsToCSV()">Export CSV</button>
                            <select id="reports-filter-status" style="padding:6px 10px;border-radius:var(--radius-sm);font-size:13px;border:1px solid var(--border);background:var(--bg);">
                                <option value="">All statuses</option>
                                <option value="pending" ${this._reportsFilterStatus === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="reviewed" ${this._reportsFilterStatus === 'reviewed' ? 'selected' : ''}>Reviewed</option>
                                <option value="dismissed" ${this._reportsFilterStatus === 'dismissed' ? 'selected' : ''}>Dismissed</option>
                                <option value="action_taken" ${this._reportsFilterStatus === 'action_taken' ? 'selected' : ''}>Action taken</option>
                            </select>
                            <select id="reports-filter-target" style="padding:6px 10px;border-radius:var(--radius-sm);font-size:13px;border:1px solid var(--border);background:var(--bg);">
                                <option value="">All types</option>
                                <option value="user" ${this._reportsFilterTargetType === 'user' ? 'selected' : ''}>User</option>
                                <option value="restaurant" ${this._reportsFilterTargetType === 'restaurant' ? 'selected' : ''}>Restaurant</option>
                                <option value="message" ${this._reportsFilterTargetType === 'message' ? 'selected' : ''}>Message</option>
                            </select>
                            <button class="btn btn-primary btn-sm" onclick="AdminDashboard._applyReportsFilters()">Apply</button>
                        </div>
                    </div>
                    <div class="data-row data-row-header" style="grid-template-columns:1fr 1fr 80px 2fr 100px 120px;">
                        <div class="data-cell">Reporter</div>
                        <div class="data-cell">Target</div>
                        <div class="data-cell">Reason</div>
                        <div class="data-cell">Details</div>
                        <div class="data-cell">Status</div>
                        <div class="data-cell" style="text-align:right;">Actions</div>
                    </div>
                    <div id="reports-table-body">
                        ${this._renderReportRows(reports)}
                    </div>
                </div>
            `;

            document.getElementById('reports-filter-status').addEventListener('change', (e) => {
                this._reportsFilterStatus = e.target.value || '';
            });
            document.getElementById('reports-filter-target').addEventListener('change', (e) => {
                this._reportsFilterTargetType = e.target.value || '';
            });
        } catch (error) {
            this.showError(error.message);
        }
    },

    _applyReportsFilters() {
        this.loadReports();
    },

    _renderReportRows(reports) {
        if (!reports.length) {
            return `<div class="data-row" style="grid-template-columns:1fr;padding:24px;text-align:center;color:var(--text-secondary);">No reports found.</div>`;
        }
        return reports.map(r => {
            const reporter = [r.reporter_first_name, r.reporter_last_name].filter(Boolean).join(' ') || r.reporter_email || '—';
            const target = `${r.target_type || '—'} #${r.target_id || '—'}`;
            const statusBadge = r.status === 'pending' ? 'badge-warning' : (r.status === 'reviewed' || r.status === 'action_taken' ? 'badge-active' : 'badge-completed');
            const reviewedAt = r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString() : '';
            return `
                <div class="data-row" style="grid-template-columns:1fr 1fr 80px 2fr 100px 120px;">
                    <div class="data-cell">${reporter}</div>
                    <div class="data-cell mono" style="font-size:12px;">${target}</div>
                    <div class="data-cell" style="font-size:12px;">${(r.reason || '—').slice(0, 20)}</div>
                    <div class="data-cell" style="font-size:12px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;">${(r.details || '—').replace(/</g, '&lt;').slice(0, 80)}</div>
                    <div class="data-cell"><span class="badge ${statusBadge}">${(r.status || 'pending')}</span>${reviewedAt ? '<br><small style="font-size:10px;color:var(--text-secondary);">' + reviewedAt + '</small>' : ''}</div>
                    <div class="data-cell" style="text-align:right;">
                        ${r.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="AdminDashboard._markReportReviewed('${r.id}')">Mark reviewed</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    async _markReportReviewed(reportId) {
        try {
            await api.updateReport(reportId, { status: 'reviewed' });
            showToast('Report marked as reviewed', 'success');
            this.loadReports();
        } catch (error) {
            showToast('Error: ' + error.message, 'error');
        }
    },

    _exportReportsToCSV() {
        const reports = this._reports || [];
        const headers = ['ID', 'Reporter', 'Reporter Email', 'Target Type', 'Target ID', 'Reason', 'Details', 'Status', 'Reviewed At', 'Created At'];
        const rows = reports.map(r => {
            const reporter = [r.reporter_first_name, r.reporter_last_name].filter(Boolean).join(' ') || r.reporter_email || '';
            return [
                r.id,
                `"${(reporter || '').replace(/"/g, '""')}"`,
                `"${(r.reporter_email || '').replace(/"/g, '""')}"`,
                r.target_type || '',
                r.target_id || '',
                `"${(r.reason || '').replace(/"/g, '""')}"`,
                `"${(r.details || '').replace(/"/g, '""')}"`,
                r.status || '',
                r.reviewed_at ? new Date(r.reviewed_at).toISOString() : '',
                r.created_at ? new Date(r.created_at).toISOString() : ''
            ];
        });
        const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tableshare-reports-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        window.URL.revokeObjectURL(url);
        showToast('Reports exported', 'success');
    },

    async loadBlockedUsers() {
        try {
            const data = await api.getBlocks();
            const blocks = data.blocks || [];
            const total = data.total ?? blocks.length;
            const contentDiv = document.getElementById('admin-content');
            contentDiv.innerHTML = `
                <div class="data-panel">
                    <div class="data-panel-header">
                        <span class="data-panel-title">Blocked Users (${total})</span>
                    </div>
                    <div class="data-row data-row-header" style="grid-template-columns:2fr 2fr 1fr;">
                        <div class="data-cell">Blocker</div>
                        <div class="data-cell">Blocked User</div>
                        <div class="data-cell">Date</div>
                    </div>
                    ${blocks.length > 0 ? blocks.map(b => {
                        const blocker = [b.blocker_first_name, b.blocker_last_name].filter(Boolean).join(' ') || b.blocker_email || '—';
                        const blocked = [b.blocked_first_name, b.blocked_last_name].filter(Boolean).join(' ') || b.blocked_email || '—';
                        return `
                            <div class="data-row" style="grid-template-columns:2fr 2fr 1fr;">
                                <div class="data-cell">${blocker}<br><small style="color:var(--text-secondary);font-size:11px;">${(b.blocker_email || '').replace(/</g, '&lt;')}</small></div>
                                <div class="data-cell">${blocked}<br><small style="color:var(--text-secondary);font-size:11px;">${(b.blocked_email || '').replace(/</g, '&lt;')}</small></div>
                                <div class="data-cell" style="font-size:12px;color:var(--text-secondary);">${formatDate(b.created_at)}</div>
                            </div>
                        `;
                    }).join('') : `
                        <div class="data-row" style="grid-template-columns:1fr;padding:24px;text-align:center;color:var(--text-secondary);">No blocks found.</div>
                    `}
                </div>
            `;
        } catch (error) {
            this.showError(error.message);
        }
    },

    loadSettings() {
        const contentDiv = document.getElementById('admin-content');
        const user = api.user || {};
        contentDiv.innerHTML = `
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header"><h3 class="card-title">Admin Profile</h3></div>
                <div style="padding:20px;">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" value="${(user.first_name || '')} ${(user.last_name || '').trim()}" readonly style="background:var(--bg-secondary);cursor:not-allowed;">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" value="${(user.email || '').replace(/"/g, '&quot;')}" readonly style="background:var(--bg-secondary);cursor:not-allowed;">
                    </div>
                    <p style="font-size:12px;color:var(--text-secondary);margin-top:12px;">Change password and 2FA are managed via your account settings.</p>
                </div>
            </div>
            <div class="card">
                <div class="card-header"><h3 class="card-title">Platform Settings</h3></div>
                <div style="padding:20px;">
                    <p style="font-size:13px;color:var(--text-secondary);">Platform name, support email, and feature flags can be configured in your deployment environment.</p>
                </div>
            </div>
        `;
    },

    showError(message) {
        const contentDiv = document.getElementById('admin-content');
        contentDiv.innerHTML = `
            <div class="card" style="border-left:3px solid var(--accent);">
                <h3 style="margin-bottom:8px;">Error</h3>
                <p style="font-size:13px;color:var(--text-secondary);">${message}</p>
                <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="AdminDashboard.loadSection('${this.currentSection}')">Try Again</button>
            </div>
        `;
    }
};

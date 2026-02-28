const RestaurantDashboard = {
    currentSection: 'dashboard',
    restaurantId: null,
    charts: {},
    subscription: {
        tier: 'basic',
        status: 'active',
        billing_period: 'monthly',
        amount: 0,
        next_billing_date: null,
        trial_ends: null
    },

    availability: {
        enabled: true,
        windows: [
            { day: 'sunday', start: '17:00', end: '21:00', enabled: true },
            { day: 'monday', start: '17:00', end: '21:00', enabled: true },
            { day: 'tuesday', start: '17:00', end: '21:00', enabled: true },
            { day: 'wednesday', start: '17:00', end: '21:00', enabled: true },
            { day: 'thursday', start: '17:00', end: '21:00', enabled: false },
            { day: 'friday', start: '17:00', end: '21:00', enabled: false },
            { day: 'saturday', start: '17:00', end: '21:00', enabled: false }
        ],
        tableSizes: { '2-top': true, '4-top': true, '6-top': false, 'bar': true },
        maxCovers: 20,
        autoAccept: true
    },

    promotions: [],

    init() {
        if (api.user && api.user.restaurant_id) {
            this.restaurantId = api.user.restaurant_id;
        }

        const saved = localStorage.getItem('ts_availability');
        if (saved) { try { this.availability = JSON.parse(saved); } catch(e) {} }
        const savedPromos = localStorage.getItem('ts_promotions');
        if (savedPromos) { try { this.promotions = JSON.parse(savedPromos); } catch(e) {} }
        const savedTier = localStorage.getItem('ts_subscription_tier');
        if (savedTier) { this.subscription.tier = savedTier; }

        this._updateTierBadge();

        document.querySelectorAll('#restaurant-screen .nav-menu a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = e.target.closest('a').dataset.section;
                if (section) this.loadSection(section);
            });
        });

        this.loadSection('dashboard');
    },

    _updateTierBadge() {
        const badge = document.getElementById('restaurant-tier-badge');
        if (!badge) return;
        const labels = { basic: 'Basic', preferred: 'Preferred', premium: 'Premium' };
        badge.textContent = labels[this.subscription.tier] || 'Partner';
    },

    loadSection(section) {
        this.currentSection = section;

        document.querySelectorAll('#restaurant-screen .nav-menu a').forEach(link => {
            link.classList.toggle('active', link.dataset.section === section);
        });

        const titles = {
            dashboard: 'Overview',
            profile: 'Restaurant Profile',
            availability: 'Availability',
            analytics: 'Revenue',
            checkins: 'Check-ins',
            reviews: 'Reviews',
            promotions: 'Promotions',
            rewards: 'Seat at the Table',
            subscription: 'Plans & Billing'
        };

        const subtitles = {
            dashboard: 'Your TableShare performance at a glance',
            availability: 'Set when you want TableShare to send diners',
            analytics: 'Track incremental revenue from TableShare guests',
            promotions: 'Create offers to attract more diners',
            rewards: 'Rewards program and dining credits at your venue',
            subscription: 'Manage your partnership tier'
        };

        document.getElementById('restaurant-section-title').textContent = titles[section] || section;
        document.getElementById('restaurant-subtitle').textContent = subtitles[section] || '';

        const contentDiv = document.getElementById('restaurant-content');
        contentDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';

        switch (section) {
            case 'dashboard': this.loadDashboard(); break;
            case 'profile': this.loadProfile(); break;
            case 'availability': this.loadAvailability(); break;
            case 'analytics': this.loadAnalytics(); break;
            case 'checkins': this.loadCheckins(); break;
            case 'reviews': this.loadReviews(); break;
            case 'promotions': this.loadPromotions(); break;
            case 'rewards': this.loadRewards(); break;
            case 'subscription': this.loadSubscription(); break;
        }
    },

    async loadDashboard() {
        try {
            if (!this.restaurantId) { this.showError('No restaurant associated with this account'); return; }

            const [restaurant, checkins, ratings] = await Promise.all([
                api.getRestaurant(this.restaurantId),
                api.getCheckins(this.restaurantId),
                api.getRatings(this.restaurantId)
            ]);

            const contentDiv = document.getElementById('restaurant-content');

            const thisMonthCheckins = checkins.filter(c => new Date(c.check_in_time) > new Date(Date.now() - 30 * 86400000)).length;
            const lastMonthCheckins = checkins.filter(c => {
                const d = new Date(c.check_in_time);
                return d > new Date(Date.now() - 60 * 86400000) && d <= new Date(Date.now() - 30 * 86400000);
            }).length;

            const avgRating = ratings.length > 0
                ? (ratings.reduce((sum, r) => sum + (r.rating_value || r.rating || 0), 0) / ratings.length).toFixed(1) : 0;

            const avgSpend = 42;
            const estMonthlyRevenue = thisMonthCheckins * avgSpend;
            const lastMonthRev = lastMonthCheckins * avgSpend;
            const revChange = lastMonthRev > 0 ? (((estMonthlyRevenue - lastMonthRev) / lastMonthRev) * 100).toFixed(0) : '+0';

            const enabledDays = this.availability.windows.filter(w => w.enabled).length;

            contentDiv.innerHTML = `
                <!-- Toggle Bar -->
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                    <div class="toggle-switch" onclick="RestaurantDashboard._toggleAccepting()">
                        <div class="toggle-track ${this.availability.enabled ? 'active' : ''}" id="accepting-toggle">
                            <div class="toggle-thumb"></div>
                        </div>
                        <span class="toggle-label">${this.availability.enabled ? 'Accepting diners' : 'Paused'}</span>
                    </div>
                    <div style="font-size:12px;color:var(--text-secondary);">
                        Active ${enabledDays} day${enabledDays !== 1 ? 's' : ''}/week
                    </div>
                </div>

                <!-- Hero Revenue Card -->
                <div class="hero-card">
                    <div>
                        <div class="hero-card-label">Est. Monthly Revenue</div>
                        <div class="hero-card-value">$${formatNumber(estMonthlyRevenue)}</div>
                        <div class="hero-card-sub">${thisMonthCheckins} TableShare covers this month</div>
                    </div>
                    <div class="hero-card-right">
                        <div class="hero-card-change">${parseInt(revChange) >= 0 ? '↑' : '↓'} ${Math.abs(revChange)}% vs last month</div>
                        <div id="hero-sparkline" style="width:100px;height:32px;margin-top:8px;"></div>
                        <div class="hero-card-note">from incremental guests</div>
                    </div>
                </div>

                <!-- 3 KPI Cards -->
                <div class="kpi-grid" style="margin-bottom:24px;">
                    <div class="kpi-card">
                        <div class="kpi-card-inner">
                            <div class="kpi-card-left">
                                <div class="kpi-label">TableShare Diners</div>
                                <div class="kpi-value" style="font-family:var(--mono);">${thisMonthCheckins}</div>
                                <div class="kpi-change">
                                    <span class="kpi-change-value positive">↑ 18%</span>
                                    <span class="kpi-change-label">vs last month</span>
                                </div>
                            </div>
                            <div class="kpi-card-right">
                                <div class="kpi-icon" style="background:var(--blue-light);">
                                    <svg width="18" height="18" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-8 6v-1c0-2.21 3.58-4 8-4s8 1.79 8 4v1" transform="scale(0.75)"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-card-inner">
                            <div class="kpi-card-left">
                                <div class="kpi-label">Avg Spend</div>
                                <div class="kpi-value" style="font-family:var(--mono);">$${avgSpend}</div>
                                <div class="kpi-change">
                                    <span class="kpi-change-label">per cover estimate</span>
                                </div>
                            </div>
                            <div class="kpi-card-right">
                                <div class="kpi-icon" style="background:var(--green-light);">
                                    <svg width="18" height="18" fill="none" stroke="var(--green)" stroke-width="2"><path d="M9 6.75V5.25m0 13.5V17.25m0-12c1.657 0 3 .895 3 2s-1.343 2-3 2-3 .895-3 2 1.343 2 3 2" transform="scale(0.75)"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-card-inner">
                            <div class="kpi-card-left">
                                <div class="kpi-label">Avg Rating</div>
                                <div class="kpi-value" style="font-family:var(--mono);">${avgRating}</div>
                                <div class="kpi-change">
                                    <span class="kpi-change-label">${ratings.length} reviews</span>
                                </div>
                            </div>
                            <div class="kpi-card-right">
                                <div class="kpi-icon" style="background:var(--yellow-light);">
                                    <svg width="18" height="18" fill="none" stroke="var(--yellow)" stroke-width="2"><path d="M9 1.5l2.47 5.01L17 7.28l-4 3.89.94 5.51L9 14.11l-4.94 2.57.94-5.51-4-3.89 5.53-.77L9 1.5z" transform="scale(0.75)"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Two columns: Recent Diners + Monthly Volume -->
                <div style="display:grid;grid-template-columns:3fr 2fr;gap:16px;margin-bottom:20px;">
                    <!-- Recent Diners -->
                    <div class="data-panel">
                        <div class="data-panel-header">
                            <span class="data-panel-title">Recent Diners</span>
                            <a href="#" class="data-panel-action" onclick="RestaurantDashboard.loadSection('checkins'); return false;">View all →</a>
                        </div>
                        <div class="data-row data-row-header" style="grid-template-columns:2fr 80px 1fr 100px;">
                            <div class="data-cell">Customer</div>
                            <div class="data-cell">Party</div>
                            <div class="data-cell">Time</div>
                            <div class="data-cell">Status</div>
                        </div>
                        ${checkins.length > 0 ? checkins.slice(0, 6).map(c => `
                            <div class="data-row" style="grid-template-columns:2fr 80px 1fr 100px;">
                                <div class="data-cell bold">${c.first_name} ${c.last_name}</div>
                                <div class="data-cell mono">${c.party_size || 1}</div>
                                <div class="data-cell" style="font-size:12px;color:var(--text-secondary);">${formatDateTime(c.check_in_time)}</div>
                                <div class="data-cell"><span class="badge ${c.is_active ? 'badge-active' : 'badge-completed'}">${c.is_active ? 'Active' : 'Done'}</span></div>
                            </div>
                        `).join('') : '<div style="padding:40px;text-align:center;color:var(--text-secondary);font-size:13px;">No diners yet</div>'}
                    </div>

                    <!-- Monthly Volume -->
                    <div class="data-panel">
                        <div class="data-panel-header">
                            <span class="data-panel-title">Monthly Volume</span>
                            <div class="filter-pills">
                                <span class="filter-pill active">Month</span>
                                <span class="filter-pill">Quarter</span>
                            </div>
                        </div>
                        <div style="padding:20px;height:220px;" id="rest-monthly-volume"></div>
                        <div class="callout" style="margin:0 20px 20px;">
                            <strong style="color:var(--green);">+${thisMonthCheckins} covers</strong> — guests who wouldn't have come otherwise
                        </div>
                    </div>
                </div>

                <!-- Tonight's Queue -->
                <div class="data-panel">
                    <div class="data-panel-header">
                        <span class="data-panel-title">Tonight's Queue</span>
                        <span style="font-size:12px;color:var(--text-secondary);">
                            ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </span>
                    </div>
                    <div style="padding:16px 20px;">
                        <div class="slot-grid">
                            <div class="slot-card" style="border-color:var(--green);background:var(--green-light);">
                                <div class="slot-time">5:00 PM</div>
                                <div class="slot-info">2 covers confirmed</div>
                            </div>
                            <div class="slot-card" style="border-color:var(--blue);background:var(--blue-light);">
                                <div class="slot-time">6:30 PM</div>
                                <div class="slot-info">Matching in progress</div>
                            </div>
                            <div class="slot-card">
                                <div class="slot-time">7:00 PM</div>
                                <div class="slot-info">Open</div>
                            </div>
                            <div class="slot-card">
                                <div class="slot-time">8:00 PM</div>
                                <div class="slot-info">Open</div>
                            </div>
                            <div class="slot-card">
                                <div class="slot-time">9:00 PM</div>
                                <div class="slot-info">Open</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            setTimeout(() => {
                if (typeof ChartUtils !== 'undefined' && ChartUtils.createSparkline) {
                    ChartUtils.createSparkline('hero-sparkline', ChartUtils.generateTrendData(14, 100, 500), '#6EE7B7');
                    ChartUtils.createMiniBarChart('rest-monthly-volume',
                        ChartUtils.generateTrendData(7, 1, 12),
                        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                        'var(--accent)'
                    );
                }
            }, 50);

        } catch (error) { this.showError(error.message); }
    },

    _toggleAccepting() {
        this.availability.enabled = !this.availability.enabled;
        localStorage.setItem('ts_availability', JSON.stringify(this.availability));
        this.loadDashboard();
    },

    async loadProfile() {
        try {
            if (!this.restaurantId) { this.showError('No restaurant associated'); return; }
            const restaurant = await api.getRestaurant(this.restaurantId);
            const contentDiv = document.getElementById('restaurant-content');

            contentDiv.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Restaurant Profile</h3>
                        <span class="badge badge-active">Active</span>
                    </div>
                    <form id="profile-form">
                        <div class="form-group"><label>Restaurant Name</label><input type="text" id="prof-name" value="${restaurant.name || ''}"></div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                            <div class="form-group"><label>City</label><input type="text" id="prof-city" value="${restaurant.city || ''}"></div>
                            <div class="form-group"><label>Cuisine Type</label><input type="text" id="prof-cuisine" value="${restaurant.cuisine_type || ''}"></div>
                        </div>
                        <div class="form-group"><label>Address</label><input type="text" id="prof-address" value="${restaurant.address || ''}"></div>
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                            <div class="form-group">
                                <label>Price Range</label>
                                <select id="prof-price">
                                    <option value="">Select</option>
                                    <option value="$" ${restaurant.price_range === '$' ? 'selected' : ''}>$ Budget</option>
                                    <option value="$$" ${restaurant.price_range === '$$' ? 'selected' : ''}>$$ Moderate</option>
                                    <option value="$$$" ${restaurant.price_range === '$$$' ? 'selected' : ''}>$$$ Upscale</option>
                                    <option value="$$$$" ${restaurant.price_range === '$$$$' ? 'selected' : ''}>$$$$ Fine Dining</option>
                                </select>
                            </div>
                            <div class="form-group"><label>Phone</label><input type="tel" id="prof-phone" value="${restaurant.phone || ''}"></div>
                            <div class="form-group"><label>Website</label><input type="url" id="prof-website" value="${restaurant.website || ''}" placeholder="https://"></div>
                        </div>
                        <div class="form-group"><label>Description</label><textarea id="prof-description" rows="3">${restaurant.description || ''}</textarea></div>
                        <div class="form-group"><label>Hours of Operation</label><input type="text" id="prof-hours" value="${restaurant.hours || ''}" placeholder="e.g. Mon-Sun: 11am-10pm"></div>
                        <button type="submit" class="btn btn-primary" style="margin-top:12px;">Save Changes</button>
                    </form>
                </div>
            `;

            document.getElementById('profile-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    await api.updateRestaurant(this.restaurantId, {
                        name: document.getElementById('prof-name').value,
                        cuisine: document.getElementById('prof-cuisine').value || null,
                        address: document.getElementById('prof-address').value || null,
                        price_range: document.getElementById('prof-price').value || null,
                        phone: document.getElementById('prof-phone').value || null,
                        website: document.getElementById('prof-website').value || null,
                        description: document.getElementById('prof-description').value || null,
                        hours: document.getElementById('prof-hours').value || null,
                    });
                    showToast('Profile updated!', 'success');
                } catch (error) { showToast('Error: ' + error.message, 'error'); }
            });
        } catch (error) { this.showError(error.message); }
    },

    loadAvailability() {
        const contentDiv = document.getElementById('restaurant-content');
        const a = this.availability;

        const dayNames = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' };

        const timeOptions = [];
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 30) {
                const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const label = new Date(2026, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                timeOptions.push(`<option value="${val}">${label}</option>`);
            }
        }
        const timeOptionsHtml = timeOptions.join('');

        contentDiv.innerHTML = `
            <div class="callout" style="background:var(--blue-light);margin-bottom:20px;padding:16px 20px;">
                <strong style="color:var(--blue);">Set It Once, Forget It</strong>
                <span style="margin-left:8px;">Tell us your slow windows and preferred table sizes. We'll only send diners during these times.</span>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">TableShare Availability</h3>
                    <div class="toggle-switch" onclick="document.getElementById('avail-master-toggle').click()">
                        <div class="toggle-track ${a.enabled ? 'active' : ''}">
                            <div class="toggle-thumb"></div>
                        </div>
                        <span class="toggle-label">${a.enabled ? 'Active' : 'Paused'}</span>
                        <input type="checkbox" id="avail-master-toggle" ${a.enabled ? 'checked' : ''} style="display:none;">
                    </div>
                </div>

                <div id="avail-days">
                    ${a.windows.map((w, i) => `
                        <div class="data-row" style="grid-template-columns:40px 120px 1fr 60px;padding:12px 0;">
                            <div class="data-cell"><input type="checkbox" class="avail-day-toggle" data-index="${i}" ${w.enabled ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent);"></div>
                            <div class="data-cell bold" style="color:${w.enabled ? 'var(--text)' : 'var(--text-tertiary)'};">${dayNames[w.day]}</div>
                            <div class="data-cell" style="display:flex;align-items:center;gap:8px;opacity:${w.enabled ? '1' : '0.4'};">
                                <select class="avail-start" data-index="${i}" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-family:var(--font);font-size:12px;" ${w.enabled ? '' : 'disabled'}>
                                    ${timeOptionsHtml.replace(`value="${w.start}"`, `value="${w.start}" selected`)}
                                </select>
                                <span style="color:var(--text-secondary);font-size:12px;">to</span>
                                <select class="avail-end" data-index="${i}" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-family:var(--font);font-size:12px;" ${w.enabled ? '' : 'disabled'}>
                                    ${timeOptionsHtml.replace(`value="${w.end}"`, `value="${w.end}" selected`)}
                                </select>
                            </div>
                            <div class="data-cell" style="text-align:right;"><span class="badge ${w.enabled ? 'badge-active' : 'badge-inactive'}">${w.enabled ? 'ON' : 'OFF'}</span></div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
                <div class="card">
                    <div class="card-header"><h3 class="card-title">Table Sizes</h3></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        ${Object.entries(a.tableSizes).map(([size, on]) => `
                            <label style="display:flex;align-items:center;gap:10px;padding:12px;border:1px solid ${on ? 'var(--accent)' : 'var(--border)'};border-radius:10px;cursor:pointer;background:${on ? 'var(--accent-light)' : 'transparent'};">
                                <input type="checkbox" class="avail-table-size" data-size="${size}" ${on ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent);">
                                <div>
                                    <div style="font-weight:600;font-size:13px;">${size}</div>
                                    <div style="font-size:11px;color:var(--text-secondary);">${size === '2-top' ? '2 guests' : size === '4-top' ? '3-4 guests' : size === '6-top' ? '5-6 guests' : 'Bar seating'}</div>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><h3 class="card-title">Capacity</h3></div>
                    <div class="form-group">
                        <label>Max covers per night</label>
                        <input type="number" id="avail-max-covers" value="${a.maxCovers}" min="1" max="100">
                        <p style="font-size:11px;color:var(--text-secondary);margin-top:4px;">We stop sending diners at this limit</p>
                    </div>
                    <label style="display:flex;align-items:center;gap:10px;margin-top:16px;cursor:pointer;">
                        <input type="checkbox" id="avail-auto-accept" ${a.autoAccept ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent);">
                        <div>
                            <div style="font-weight:600;font-size:13px;">Auto-accept walk-ins</div>
                            <div style="font-size:11px;color:var(--text-secondary);">Guests arrive like regular walk-ins</div>
                        </div>
                    </label>
                </div>
            </div>

            <div style="display:flex;gap:12px;margin-top:12px;">
                <button class="btn btn-primary" onclick="RestaurantDashboard.saveAvailability()">Save Settings</button>
                <button class="btn btn-secondary" onclick="RestaurantDashboard.loadSection('availability')">Reset</button>
            </div>
        `;

        document.querySelectorAll('.avail-day-toggle').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const i = parseInt(e.target.dataset.index);
                this.availability.windows[i].enabled = e.target.checked;
                this.loadAvailability();
            });
        });
    },

    saveAvailability() {
        document.querySelectorAll('.avail-start').forEach(sel => {
            const i = parseInt(sel.dataset.index);
            this.availability.windows[i].start = sel.value;
        });
        document.querySelectorAll('.avail-end').forEach(sel => {
            const i = parseInt(sel.dataset.index);
            this.availability.windows[i].end = sel.value;
        });
        document.querySelectorAll('.avail-table-size').forEach(cb => {
            this.availability.tableSizes[cb.dataset.size] = cb.checked;
        });

        const maxEl = document.getElementById('avail-max-covers');
        if (maxEl) this.availability.maxCovers = parseInt(maxEl.value) || 20;
        const autoEl = document.getElementById('avail-auto-accept');
        if (autoEl) this.availability.autoAccept = autoEl.checked;
        const masterEl = document.getElementById('avail-master-toggle');
        if (masterEl) this.availability.enabled = masterEl.checked;

        localStorage.setItem('ts_availability', JSON.stringify(this.availability));
        showToast('Availability settings saved!', 'success');
    },

    async loadAnalytics() {
        try {
            if (!this.restaurantId) { this.showError('No restaurant associated'); return; }

            const [checkins, ratings] = await Promise.all([
                api.getCheckins(this.restaurantId),
                api.getRatings(this.restaurantId)
            ]);

            const contentDiv = document.getElementById('restaurant-content');

            const thisMonth = checkins.filter(c => new Date(c.check_in_time) > new Date(Date.now() - 30 * 86400000));
            const lastMonth = checkins.filter(c => {
                const d = new Date(c.check_in_time);
                return d > new Date(Date.now() - 60 * 86400000) && d <= new Date(Date.now() - 30 * 86400000);
            });

            const avgSpend = 42;
            const thisMonthRev = thisMonth.length * avgSpend;
            const lastMonthRev = lastMonth.length * avgSpend;
            const revChange = lastMonthRev > 0 ? (((thisMonthRev - lastMonthRev) / lastMonthRev) * 100).toFixed(0) : 0;

            contentDiv.innerHTML = `
                <div class="hero-card" style="margin-bottom:24px;">
                    <div>
                        <div class="hero-card-label">Incremental Revenue This Month</div>
                        <div class="hero-card-value">$${formatNumber(thisMonthRev)}</div>
                        <div class="hero-card-sub">From ${thisMonth.length} TableShare covers</div>
                    </div>
                    <div class="hero-card-right">
                        <div class="hero-card-change">${parseInt(revChange) >= 0 ? '↑' : '↓'} ${Math.abs(revChange)}% vs last month</div>
                        <div class="hero-card-note">guests who wouldn't have come otherwise</div>
                    </div>
                </div>

                <div class="kpi-grid" style="margin-bottom:24px;">
                    <div class="kpi-card">
                        <div class="kpi-label">Monthly Revenue</div>
                        <div class="kpi-value" style="font-family:var(--mono);color:var(--green);">$${formatNumber(thisMonthRev)}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Monthly Covers</div>
                        <div class="kpi-value" style="font-family:var(--mono);">${thisMonth.length}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Avg Spend/Cover</div>
                        <div class="kpi-value" style="font-family:var(--mono);">$${avgSpend}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">All-Time Covers</div>
                        <div class="kpi-value" style="font-family:var(--mono);">${checkins.length}</div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">Revenue Trend (30 Days)</h3></div>
                        <div class="chart-container"><canvas id="revenue-chart"></canvas></div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3 class="card-title">Covers by Day of Week</h3></div>
                        <div class="chart-container"><canvas id="dow-chart"></canvas></div>
                    </div>
                </div>

                <div class="callout">
                    <strong>Revenue Projection:</strong> Based on your current pace, you're on track for <strong style="color:var(--green);">$${formatNumber(Math.round(thisMonthRev * 1.15))}</strong> next month.
                    ${this.subscription.tier === 'basic' ? ' <a href="#" onclick="RestaurantDashboard.loadSection(\'subscription\'); return false;" style="color:var(--accent);font-weight:600;">Upgrade to Preferred</a> for priority placement.' : ''}
                </div>
            `;

            setTimeout(() => {
                const labels = ChartUtils.getDateLabels(30);
                ChartUtils.createLineChart('revenue-chart', {
                    labels,
                    datasets: [{
                        label: 'Revenue ($)',
                        data: ChartUtils.generateTrendData(30, 0, avgSpend * 3),
                        borderColor: '#0D9F6E',
                        backgroundColor: 'rgba(13,159,110,0.08)',
                        tension: 0.4,
                        fill: true
                    }]
                });

                const dowData = [0, 0, 0, 0, 0, 0, 0];
                checkins.forEach(c => { dowData[new Date(c.check_in_time).getDay()]++; });
                ChartUtils.createBarChart('dow-chart', {
                    labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
                    datasets: [{
                        label: 'Covers',
                        data: dowData.every(v => v === 0) ? [5, 8, 7, 9, 3, 2, 1] : dowData,
                        backgroundColor: '#E8553D',
                        borderRadius: 6
                    }]
                });
            }, 100);

        } catch (error) { this.showError(error.message); }
    },

    async loadCheckins() {
        try {
            if (!this.restaurantId) { this.showError('No restaurant associated'); return; }
            const checkins = await api.getCheckins(this.restaurantId);
            const contentDiv = document.getElementById('restaurant-content');

            const todayCount = checkins.filter(c => new Date(c.check_in_time).toDateString() === new Date().toDateString()).length;
            const weekCount = checkins.filter(c => new Date(c.check_in_time) > new Date(Date.now() - 7 * 86400000)).length;

            contentDiv.innerHTML = `
                <div class="kpi-grid" style="margin-bottom:24px;">
                    <div class="kpi-card">
                        <div class="kpi-label">Today</div>
                        <div class="kpi-value" style="font-family:var(--mono);">${todayCount}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">This Week</div>
                        <div class="kpi-value" style="font-family:var(--mono);">${weekCount}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">All Time</div>
                        <div class="kpi-value" style="font-family:var(--mono);">${checkins.length}</div>
                    </div>
                </div>

                <div class="data-panel">
                    <div class="data-panel-header">
                        <span class="data-panel-title">Recent Check-ins</span>
                        <button class="btn btn-secondary btn-sm" onclick="exportTableToCSV('checkins-export', 'tableshare-checkins.csv')">Export</button>
                    </div>
                    ${checkins.length > 0 ? `
                        <div class="data-row data-row-header" style="grid-template-columns:2fr 80px 1fr 100px;">
                            <div class="data-cell">Customer</div>
                            <div class="data-cell">Party</div>
                            <div class="data-cell">Time</div>
                            <div class="data-cell">Status</div>
                        </div>
                        <div id="checkins-export">
                        ${checkins.map(c => `
                            <div class="data-row" style="grid-template-columns:2fr 80px 1fr 100px;">
                                <div class="data-cell bold">${c.first_name} ${c.last_name}</div>
                                <div class="data-cell mono">${c.party_size || 1}</div>
                                <div class="data-cell" style="font-size:12px;color:var(--text-secondary);">${formatDateTime(c.check_in_time)}</div>
                                <div class="data-cell"><span class="badge ${c.is_active ? 'badge-active' : 'badge-completed'}">${c.is_active ? 'Active' : 'Done'}</span></div>
                            </div>
                        `).join('')}
                        </div>
                    ` : '<div class="empty-state"><div class="empty-state-icon">📍</div><h3>No Check-ins Yet</h3><p style="font-size:13px;">TableShare guests will appear here.</p></div>'}
                </div>
            `;
        } catch (error) { this.showError(error.message); }
    },

    async loadReviews() {
        try {
            if (!this.restaurantId) { this.showError('No restaurant associated'); return; }
            const ratings = await api.getRatings(this.restaurantId);
            const contentDiv = document.getElementById('restaurant-content');

            const getRating = (r) => r.rating_value || r.rating || 0;
            const avgRating = ratings.length > 0
                ? (ratings.reduce((sum, r) => sum + getRating(r), 0) / ratings.length).toFixed(1)
                : 'N/A';

            contentDiv.innerHTML = `
                <div class="kpi-grid" style="margin-bottom:24px;">
                    <div class="kpi-card">
                        <div class="kpi-label">Average Rating</div>
                        <div class="kpi-value" style="font-family:var(--mono);">${avgRating}</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-label">Total Reviews</div>
                        <div class="kpi-value" style="font-family:var(--mono);">${ratings.length}</div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><h3 class="card-title">All Reviews</h3></div>
                    ${ratings.length > 0 ? ratings.map(r => `
                        <div style="padding:16px 0;border-bottom:1px solid var(--border);">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                <span style="font-weight:600;font-size:13px;">${r.rater_name || 'Anonymous'}</span>
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <span style="font-size:12px;">${'★'.repeat(getRating(r))}<span style="color:var(--border);">${'★'.repeat(5 - getRating(r))}</span></span>
                                    ${r.would_dine_again ? '<span class="badge badge-active">Would Return</span>' : ''}
                                </div>
                            </div>
                            <p style="color:var(--text-secondary);font-size:13px;margin-bottom:4px;">${r.feedback || 'No feedback provided'}</p>
                            <small style="color:var(--text-tertiary);font-size:11px;">${getTimeAgo(r.created_at)}</small>
                        </div>
                    `).join('') : '<div class="empty-state"><div class="empty-state-icon">⭐</div><h3>No Reviews Yet</h3><p style="font-size:13px;">Customer reviews will appear here.</p></div>'}
                </div>
            `;
        } catch (error) { this.showError(error.message); }
    },

    loadRewards() {
        const contentDiv = document.getElementById('restaurant-content');
        contentDiv.innerHTML = `
            <div class="callout" style="background:var(--accent-light);margin-bottom:24px;padding:20px 24px;border-left:4px solid var(--accent);">
                <strong style="color:var(--accent);font-size:14px;">Seat at the Table</strong>
                <p style="margin:8px 0 0;color:var(--text-secondary);font-size:13px;line-height:1.5;">
                    TableShare diners earn points when they share tables and can redeem them for rewards — including <strong>Dining Credits</strong> to use at partner restaurants like yours. You get incremental traffic; they get a discount. Everyone wins.
                </p>
            </div>

            <div class="card" style="margin-bottom:20px;">
                <div class="card-header"><h3 class="card-title">How it works for you</h3></div>
                <ul style="list-style:none;padding:0;margin:0;">
                    <li style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
                        <span style="font-size:18px;">1.</span>
                        <div>
                            <strong style="font-size:13px;">Diners earn points</strong> — for shared tables, check-ins, and referrals in the TableShare app.
                        </div>
                    </li>
                    <li style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
                        <span style="font-size:18px;">2.</span>
                        <div>
                            <strong style="font-size:13px;">They redeem Dining Credit</strong> — e.g. $10 or $25 off at partner restaurants (you're one of them).
                        </div>
                    </li>
                    <li style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;">
                        <span style="font-size:18px;">3.</span>
                        <div>
                            <strong style="font-size:13px;">You accept the credit</strong> — TableShare covers the discount; you get the guest and full support from our team on redemption details.
                        </div>
                    </li>
                </ul>
            </div>

            <div class="card">
                <div class="card-header"><h3 class="card-title">Dining credits redeemed at your venue</h3></div>
                <div class="empty-state">
                    <div class="empty-state-icon">🍽️</div>
                    <h3>No redemptions yet</h3>
                    <p style="font-size:13px;">When diners redeem Dining Credit at your restaurant, they'll appear here. You'll see code, amount, and date for each redemption.</p>
                </div>
            </div>
        `;
    },

    loadPromotions() {
        const contentDiv = document.getElementById('restaurant-content');
        const tier = this.subscription.tier;
        const canCreate = tier === 'preferred' || tier === 'premium';

        contentDiv.innerHTML = `
            ${!canCreate ? `
                <div class="callout" style="background:var(--yellow-light);margin-bottom:20px;">
                    <strong style="color:var(--yellow);">Unlock Promotions</strong>
                    <span style="margin-left:8px;">Upgrade to Preferred ($49/mo) to create targeted offers.</span>
                    <a href="#" onclick="RestaurantDashboard.loadSection('subscription'); return false;" style="color:var(--accent);font-weight:600;margin-left:8px;">View Plans →</a>
                </div>
            ` : ''}

            <div class="data-panel">
                <div class="data-panel-header">
                    <span class="data-panel-title">Promotions (${this.promotions.filter(p => p.active).length} active)</span>
                    <button class="btn btn-primary btn-sm" onclick="RestaurantDashboard.showCreatePromoModal()" ${canCreate ? '' : 'disabled'}>+ Create</button>
                </div>
                ${this.promotions.length > 0 ? this.promotions.map((p, i) => `
                    <div class="data-row" style="grid-template-columns:1fr 100px 120px;">
                        <div class="data-cell">
                            <div style="font-weight:600;font-size:13px;">${p.title}</div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${p.description}</div>
                            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${p.days} · ${p.timeRange}</div>
                        </div>
                        <div class="data-cell"><span class="badge ${p.active ? 'badge-active' : 'badge-inactive'}">${p.active ? 'Active' : 'Paused'}</span></div>
                        <div class="data-cell" style="display:flex;gap:6px;justify-content:flex-end;">
                            <button class="btn btn-sm ${p.active ? 'btn-secondary' : 'btn-success'}" onclick="RestaurantDashboard.togglePromo(${i})">${p.active ? 'Pause' : 'Activate'}</button>
                            <button class="btn btn-sm btn-danger" onclick="RestaurantDashboard.deletePromo(${i})">Delete</button>
                        </div>
                    </div>
                `).join('') : `
                    <div class="empty-state">
                        <div class="empty-state-icon">🎯</div>
                        <h3>No Promotions Yet</h3>
                        <p style="font-size:13px;max-width:360px;margin:8px auto 0;">Create offers like "10% off Tuesdays" to drive traffic on slow nights.</p>
                        ${canCreate ? '<button class="btn btn-primary" style="margin-top:16px;" onclick="RestaurantDashboard.showCreatePromoModal()">Create Promotion</button>' : ''}
                    </div>
                `}
            </div>

            <div class="card" style="margin-top:16px;">
                <div class="card-header"><h3 class="card-title">Ideas</h3></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    ${[
                        { icon: '🍸', title: 'Happy Hour Special', desc: 'Discounted drinks during slow hours' },
                        { icon: '🍽️', title: 'Free Appetizer', desc: 'Complimentary app for weeknight guests' },
                        { icon: '💰', title: 'Weekday Discount', desc: '10% off Sun-Wed for TableShare guests' },
                        { icon: '🎂', title: 'Birthday Special', desc: 'Free dessert for celebrations' }
                    ].map(idea => `
                        <div style="padding:14px;border:1px solid var(--border);border-radius:10px;cursor:${canCreate ? 'pointer' : 'default'};" ${canCreate ? `onclick="RestaurantDashboard.showCreatePromoModal('${idea.title}', '${idea.desc}')"` : ''}>
                            <span style="font-size:18px;">${idea.icon}</span>
                            <div style="font-weight:600;font-size:13px;margin-top:6px;">${idea.title}</div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${idea.desc}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    showCreatePromoModal(prefillTitle, prefillDesc) {
        showModal('Create Promotion', `
            <form id="create-promo-form">
                <div class="form-group"><label>Title *</label><input type="text" id="promo-title" required value="${prefillTitle || ''}" placeholder="e.g. 10% Off Tuesdays"></div>
                <div class="form-group"><label>Description *</label><textarea id="promo-desc" rows="2" required placeholder="What's the offer?">${prefillDesc || ''}</textarea></div>
                <div class="form-group">
                    <label>Days</label>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;" id="promo-days">
                        ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `
                            <label style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-weight:500;font-size:12px;">
                                <input type="checkbox" value="${d}" style="margin-right:4px;accent-color:var(--accent);" ${['Sun', 'Mon', 'Tue', 'Wed'].includes(d) ? 'checked' : ''}>${d}
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>Start</label><input type="time" id="promo-start" value="17:00"></div>
                    <div class="form-group"><label>End</label><input type="time" id="promo-end" value="21:00"></div>
                </div>
                <div style="display:flex;gap:12px;margin-top:20px;">
                    <button type="submit" class="btn btn-primary" style="flex:1;">Create</button>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                </div>
            </form>
        `);

        document.getElementById('create-promo-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const title = document.getElementById('promo-title').value;
            const description = document.getElementById('promo-desc').value;
            const checkedDays = Array.from(document.querySelectorAll('#promo-days input:checked')).map(cb => cb.value);
            const start = document.getElementById('promo-start').value;
            const end = document.getElementById('promo-end').value;

            this.promotions.push({
                id: generateId(),
                title,
                description,
                days: checkedDays.join(', '),
                timeRange: `${start} - ${end}`,
                active: true,
                created: new Date().toISOString()
            });

            localStorage.setItem('ts_promotions', JSON.stringify(this.promotions));
            closeModal();
            showToast('Promotion created!', 'success');
            this.loadPromotions();
        });
    },

    togglePromo(index) {
        this.promotions[index].active = !this.promotions[index].active;
        localStorage.setItem('ts_promotions', JSON.stringify(this.promotions));
        this.loadPromotions();
        showToast(this.promotions[index].active ? 'Promotion activated!' : 'Promotion paused', 'info');
    },

    deletePromo(index) {
        this.promotions.splice(index, 1);
        localStorage.setItem('ts_promotions', JSON.stringify(this.promotions));
        this.loadPromotions();
        showToast('Promotion deleted', 'success');
    },

    loadSubscription() {
        const contentDiv = document.getElementById('restaurant-content');
        const tier = this.subscription.tier;

        contentDiv.innerHTML = `
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h3 class="card-title">Current Plan</h3>
                    <span class="badge badge-active">${this.subscription.status}</span>
                </div>
                <div style="display:flex;align-items:center;gap:20px;">
                    <div>
                        <h2 style="text-transform:capitalize;font-size:20px;">${tier}</h2>
                        <p style="color:var(--text-secondary);font-size:13px;">
                            ${tier === 'basic' ? 'Free — no commitment' : tier === 'preferred' ? '$49/month' : '$99/month'}
                        </p>
                    </div>
                    ${tier === 'basic' ? '<span class="badge badge-info" style="padding:6px 12px;">Free trial of Preferred available</span>' : ''}
                </div>
            </div>

            <div class="subscription-tiers">
                <div class="tier-card ${tier === 'basic' ? 'current' : ''}">
                    <div class="tier-name">Basic</div>
                    <div class="tier-price">$0<small>/mo</small></div>
                    <ul class="tier-features">
                        <li>✅ Listed in TableShare</li>
                        <li>✅ Standard matching</li>
                        <li>✅ View check-ins</li>
                        <li>✅ Basic analytics</li>
                        <li style="color:var(--text-tertiary);">✕ Priority placement</li>
                        <li style="color:var(--text-tertiary);">✕ Promotions</li>
                    </ul>
                    <button class="btn ${tier === 'basic' ? 'btn-secondary' : 'btn-primary'}" style="width:100%;" ${tier === 'basic' ? 'disabled' : `onclick="RestaurantDashboard.changeTier('basic')"`}>
                        ${tier === 'basic' ? 'Current' : 'Downgrade'}
                    </button>
                </div>

                <div class="tier-card ${tier === 'preferred' ? 'current' : ''}" style="${tier !== 'preferred' ? 'border-color:var(--accent);position:relative;' : ''}">
                    ${tier !== 'preferred' ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:var(--accent);color:white;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap;">MOST POPULAR</div>' : ''}
                    <div class="tier-name">Preferred</div>
                    <div class="tier-price">$49<small>/mo</small></div>
                    <ul class="tier-features">
                        <li>✅ Everything in Basic</li>
                        <li>✅ Priority placement</li>
                        <li>✅ Boosted matching</li>
                        <li>✅ Full analytics</li>
                        <li>✅ Promotions</li>
                        <li style="color:var(--text-tertiary);">✕ Featured</li>
                    </ul>
                    <button class="btn ${tier === 'preferred' ? 'btn-secondary' : 'btn-primary'}" style="width:100%;" ${tier === 'preferred' ? 'disabled' : `onclick="RestaurantDashboard.changeTier('preferred')"`}>
                        ${tier === 'preferred' ? 'Current' : tier === 'premium' ? 'Downgrade' : 'Start Free Trial'}
                    </button>
                </div>

                <div class="tier-card ${tier === 'premium' ? 'current' : ''}">
                    <div class="tier-name">Premium</div>
                    <div class="tier-price">$99<small>/mo</small></div>
                    <ul class="tier-features">
                        <li>✅ Everything in Preferred</li>
                        <li>✅ Featured placement</li>
                        <li>✅ Priority matching</li>
                        <li>✅ Co-marketing</li>
                        <li>✅ Dedicated support</li>
                        <li>✅ Full insights</li>
                    </ul>
                    <button class="btn ${tier === 'premium' ? 'btn-secondary' : 'btn-primary'}" style="width:100%;" ${tier === 'premium' ? 'disabled' : `onclick="RestaurantDashboard.changeTier('premium')"`}>
                        ${tier === 'premium' ? 'Current' : 'Upgrade'}
                    </button>
                </div>
            </div>

            <div class="card" style="margin-top:20px;">
                <div class="card-header"><h3 class="card-title">Revenue Opportunity</h3></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;text-align:center;">
                    <div style="padding:20px;background:var(--green-light);border-radius:10px;">
                        <div style="font-size:28px;font-weight:700;color:var(--green);font-family:var(--mono);">20–40</div>
                        <div style="color:var(--text-secondary);margin-top:4px;font-size:12px;font-weight:500;">Additional covers/month</div>
                    </div>
                    <div style="padding:20px;background:var(--accent-light);border-radius:10px;">
                        <div style="font-size:28px;font-weight:700;color:var(--accent);font-family:var(--mono);">$800–$2.4k</div>
                        <div style="color:var(--text-secondary);margin-top:4px;font-size:12px;font-weight:500;">Est. monthly revenue</div>
                    </div>
                </div>
                <p style="text-align:center;color:var(--text-secondary);margin-top:16px;font-size:12px;">
                    Pure incremental revenue — guests filling seats that would have been empty.
                </p>
            </div>
        `;
    },

    changeTier(newTier) {
        this.subscription.tier = newTier;
        localStorage.setItem('ts_subscription_tier', newTier);
        this._updateTierBadge();
        showToast(`Plan changed to ${newTier}!`, 'success');
        this.loadSubscription();
    },

    exportData() {
        showToast('Preparing export...', 'info');
        setTimeout(() => { showToast('Data exported!', 'success'); }, 1500);
    },

    showError(message) {
        const contentDiv = document.getElementById('restaurant-content');
        contentDiv.innerHTML = `
            <div class="card" style="border-left:3px solid var(--accent);">
                <h3 style="margin-bottom:8px;">Error</h3>
                <p style="font-size:13px;color:var(--text-secondary);">${message}</p>
                <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="RestaurantDashboard.loadSection('${this.currentSection}')">Try Again</button>
            </div>
        `;
    }
};

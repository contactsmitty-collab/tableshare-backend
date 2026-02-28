const ChartUtils = {
    defaultOptions: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                backgroundColor: 'rgba(26, 26, 46, 0.95)',
                titleFont: { family: 'DM Sans', size: 13, weight: '600' },
                bodyFont: { family: 'DM Sans', size: 12 },
                padding: 10,
                cornerRadius: 8,
                displayColors: false,
                boxPadding: 4
            }
        }
    },

    colors: {
        primary: '#E8553D',
        secondary: '#1A1A2E',
        accent: '#E8553D',
        success: '#0D9F6E',
        danger: '#EF4444',
        info: '#3B6BF5',
        warning: '#F59E0B',
        green: '#0D9F6E',
        blue: '#3B6BF5',
        purple: '#7C3AED'
    },

    createLineChart(canvasId, data, options = {}) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'line',
            data: data,
            options: {
                ...this.defaultOptions,
                ...options,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#E8E8EC', drawBorder: false },
                        ticks: { font: { family: 'DM Sans', size: 11 }, color: '#9CA3AF' }
                    },
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { font: { family: 'DM Sans', size: 10 }, color: '#9CA3AF', maxTicksLimit: 8 }
                    }
                }
            }
        });
    },

    createBarChart(canvasId, data, options = {}) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'bar',
            data: data,
            options: {
                ...this.defaultOptions,
                ...options,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#E8E8EC', drawBorder: false },
                        ticks: { font: { family: 'DM Sans', size: 11 }, color: '#9CA3AF' }
                    },
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { font: { family: 'DM Sans', size: 10 }, color: '#9CA3AF' }
                    }
                }
            }
        });
    },

    createDoughnutChart(canvasId, data, options = {}) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'doughnut',
            data: data,
            options: { ...this.defaultOptions, ...options, cutout: '70%' }
        });
    },

    /**
     * Render an inline SVG sparkline into a container element.
     */
    createSparkline(containerId, data, color) {
        const container = document.getElementById(containerId);
        if (!container || !data || data.length < 2) return;

        const w = container.offsetWidth || 64;
        const h = container.offsetHeight || 28;
        const pad = 2;

        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min || 1;

        const points = data.map((v, i) => {
            const x = pad + (i / (data.length - 1)) * (w - pad * 2);
            const y = h - pad - ((v - min) / range) * (h - pad * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });

        const fillPoints = [...points, `${(w - pad).toFixed(1)},${h}`, `${pad},${h}`];

        container.innerHTML = `
            <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
                <defs>
                    <linearGradient id="sg-${containerId}" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
                        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                <polygon points="${fillPoints.join(' ')}" fill="url(#sg-${containerId})"/>
                <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="2.5" fill="${color}"/>
            </svg>
        `;
    },

    /**
     * Render a vertical mini bar chart into a container element.
     */
    createMiniBarChart(containerId, data, labels, color) {
        const container = document.getElementById(containerId);
        if (!container || !data || data.length === 0) return;

        const maxVal = Math.max(...data) || 1;
        const containerH = container.offsetHeight || 200;
        const barAreaH = containerH - 40;

        const resolvedColor = color.startsWith('var(')
            ? getComputedStyle(document.documentElement).getPropertyValue(color.replace('var(', '').replace(')', '')).trim()
            : color;

        container.innerHTML = `
            <div class="mini-bar-chart" style="height:${barAreaH}px;">
                ${data.map((v, i) => {
                    const barH = Math.max(4, (v / maxVal) * (barAreaH - 30));
                    const isMax = v === maxVal;
                    return `
                        <div class="mini-bar-col">
                            <div class="mini-bar-value">${v}</div>
                            <div class="mini-bar-bar" style="height:${barH}px;background:${isMax ? resolvedColor : resolvedColor + '40'};"></div>
                            <div class="mini-bar-label">${labels[i] || ''}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    generateTrendData(days = 30, min = 0, max = 100) {
        const data = [];
        let value = min + (max - min) / 2;
        for (let i = 0; i < days; i++) {
            value += (Math.random() - 0.4) * (max - min) / 10;
            value = Math.max(min, Math.min(max, value));
            data.push(Math.round(value));
        }
        return data;
    },

    getDateLabels(days = 30) {
        const labels = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }
        return labels;
    },

    getHourLabels() {
        const labels = [];
        for (let i = 0; i < 24; i++) {
            const hour = i % 12 || 12;
            const period = i < 12 ? 'AM' : 'PM';
            labels.push(`${hour}${period}`);
        }
        return labels;
    }
};

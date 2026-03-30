
/* ============================================================
   RISE Analytics Dashboard – script.js
   Modern Business Analytics Dashboard
   ============================================================ */

'use strict';

/* ── Global state ──────────────────────────────────────────── */
let dashboardData = null;          // loaded from data.json
let charts        = {};            // Chart.js instances
let tableState    = {
  page:     1,
  perPage:  5,
  sortCol:  'date',
  sortDir:  'desc',
  search:   '',
  status:   'all',
};
let currentFilters = {
  date:     'week',
  category: 'All Categories',
  region:   'All States',
};
let realtimeTimer  = null;
let notifsList     = [];

/* ── Colour palette (shared between light/dark) ────────────── */
const PALETTE = {
  primary:  '#6366F1',
  accent:   '#22C55E',
  blue:     '#3B82F6',
  orange:   '#F59E0B',
  rose:     '#F43F5E',
  purple:   '#A855F7',
  teal:     '#14B8A6',
  barColors:['#6366F1','#3B82F6','#22C55E','#F59E0B','#F43F5E'],
  pie:      ['#6366F1','#22C55E','#F59E0B','#3B82F6','#A855F7'],
};

/* ============================================================
   1. BOOTSTRAP – fetch data then initialise everything
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initTheme();
  initSidebar();
  initDropdowns();
  initCounters();
  buildNotifications();
  initCharts();
  renderTable();
  initFilters();
  initSearch();
  initButtons();
  startRealtime();
  animateBars();
});

/* ── Load data.json ─────────────────────────────────────────── */
async function loadData() {
  try {
    const res  = await fetch('data.json');
    dashboardData = await res.json();
    notifsList = [...dashboardData.notifications];
  } catch (e) {
    console.warn('Could not load data.json, using fallback data.', e);
    dashboardData = getFallbackData();
    notifsList = [...dashboardData.notifications];
  }
}

/* ============================================================
   2. THEME (dark / light)
   ============================================================ */
function initTheme() {
  const html    = document.documentElement;
  const btn     = document.getElementById('theme-toggle');
  const icon    = document.getElementById('theme-icon');
  const saved   = localStorage.getItem('rise-theme') || 'light';

  applyTheme(saved);

  btn.addEventListener('click', () => {
    const next = html.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('rise-theme', next);
    // Redraw charts with new grid colour
    Object.values(charts).forEach(c => {
      if (c) { updateChartTheme(c); c.update(); }
    });
  });

  function applyTheme(t) {
    if (t === 'dark') {
      html.classList.add('dark');
      icon.className = 'fa-solid fa-sun text-lg';
    } else {
      html.classList.remove('dark');
      icon.className = 'fa-solid fa-moon text-lg';
    }
  }
}

function updateChartTheme(chart) {
  const dark   = document.documentElement.classList.contains('dark');
  const gridC  = dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
  const tickC  = dark ? '#9CA3AF' : '#6B7280';
  if (!chart.options.scales) return;
  Object.values(chart.options.scales).forEach(scale => {
    if (scale.grid)  scale.grid.color  = gridC;
    if (scale.ticks) scale.ticks.color = tickC;
  });
}

/* ============================================================
   3. SIDEBAR
   ============================================================ */
function initSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const wrapper  = document.getElementById('main-wrapper');
  const toggle   = document.getElementById('sidebar-toggle');
  const overlay  = document.getElementById('sidebar-overlay');
  const isMobile = () => window.innerWidth < 768;

  toggle.addEventListener('click', () => {
    if (isMobile()) {
      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('hidden');
    } else {
      sidebar.classList.toggle('collapsed');
      wrapper.classList.toggle('sidebar-collapsed');
    }
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('mobile-open');
    overlay.classList.add('hidden');
  });

  // Nav active state + section switching
  const sectionInits = {};

  document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      link.classList.add('active');
      const section = link.dataset.section || 'dashboard';
      document.getElementById('page-title').textContent =
        link.querySelector('.sidebar-text')?.textContent.trim() || 'Dashboard';

      // Show the clicked section, hide the rest
      document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
      document.getElementById(`section-${section}`)?.classList.remove('hidden');

      // Lazy-init section-specific content on first visit
      if (!sectionInits[section]) {
        sectionInits[section] = true;
        if (section === 'sales')     initSalesSection();
        if (section === 'customers') initCustomersSection();
        if (section === 'products')  initProductsSection();
        if (section === 'reports')   initReportsSection();
        if (section === 'settings')  initSettingsSection();
      }

      if (isMobile()) {
        sidebar.classList.remove('mobile-open');
        overlay.classList.add('hidden');
      }
    });
  });

  // Collapse on small screen on resize
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      overlay.classList.add('hidden');
      sidebar.classList.remove('mobile-open');
    }
  });
}

/* ============================================================
   4. DROPDOWN MENUS (notifications + profile)
   ============================================================ */
function initDropdowns() {
  setupDropdown('notif-btn',   'notif-dropdown');
  setupDropdown('profile-btn', 'profile-dropdown');

  // Mark all read
  document.getElementById('mark-all-read')?.addEventListener('click', e => {
    e.preventDefault();
    notifsList.forEach(n => n.read = true);
    buildNotifications();
    document.getElementById('notif-badge').textContent = '0';
    document.getElementById('notif-badge').classList.add('hidden');
  });
}

function setupDropdown(btnId, dropId) {
  const btn  = document.getElementById(btnId);
  const drop = document.getElementById(dropId);
  if (!btn || !drop) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    // Close other dropdowns
    document.querySelectorAll('[id$="-dropdown"]').forEach(d => {
      if (d !== drop) d.classList.add('hidden');
    });
    drop.classList.toggle('hidden');
  });
  document.addEventListener('click', () => drop.classList.add('hidden'));
  drop.addEventListener('click', e => e.stopPropagation());
}

function buildNotifications() {
  const list  = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');
  if (!list) return;

  list.innerHTML = '';
  const unread = notifsList.filter(n => !n.read).length;

  notifsList.forEach(n => {
    const li = document.createElement('li');
    li.className = `notif-item ${n.read ? '' : 'unread'}`;
    li.innerHTML = `
      ${!n.read ? '<span class="notif-dot"></span>' : '<span class="w-2 flex-shrink-0"></span>'}
      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">${n.message}</p>
        <p class="text-[11px] text-gray-400 mt-0.5">${n.time}</p>
      </div>`;

    li.addEventListener('click', () => {
      n.read = true;
      buildNotifications();
    });
    list.appendChild(li);
  });

  badge.textContent = unread;
  badge.classList.toggle('hidden', unread === 0);
}

/* ============================================================
   5. COUNTER ANIMATIONS
   ============================================================ */
function initCounters() {
  const counters = [
    { el: 'metric-revenue',   target: 45890, prefix: '$',  suffix: '',  decimals: 0 },
    { el: 'metric-sales',     target: 3240,  prefix: '',   suffix: '',  decimals: 0 },
    { el: 'metric-customers', target: 1280,  prefix: '',   suffix: '',  decimals: 0 },
    { el: 'metric-conversion',target: 4.6,   prefix: '',   suffix: '%', decimals: 1 },
  ];

  counters.forEach(({ el, target, prefix, suffix, decimals }) => {
    animateCounter(document.getElementById(el), 0, target, 1600, prefix, suffix, decimals);
  });
}

function animateCounter(el, from, to, duration, prefix, suffix, decimals) {
  if (!el) return;
  const startTime = performance.now();
  const step = (now) => {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = easeOutCubic(progress);
    const value    = from + (to - from) * eased;
    const formatted = decimals > 0
      ? value.toFixed(decimals)
      : Math.floor(value).toLocaleString();
    el.textContent = `${prefix}${formatted}${suffix}`;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function animateBars() {
  setTimeout(() => {
    document.querySelectorAll('.metric-bar-fill').forEach(bar => {
      bar.classList.add('animated');
    });
  }, 400);
}

/* ============================================================
   6. CHARTS
   ============================================================ */
function initCharts() {
  buildSalesOverviewChart();
  buildCategoryChart();
  buildTrafficChart();
  buildWeeklySalesChart();
}

/* ── Chart.js global defaults ──────────────────────────────── */
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#6B7280';
Chart.defaults.plugins.tooltip.padding     = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.boxPadding  = 4;

/* 6a. Sales Overview – Line Chart */
function buildSalesOverviewChart() {
  const ctx  = document.getElementById('salesOverviewChart');
  if (!ctx) return;
  const d    = dashboardData.salesOverview;
  const dark = document.documentElement.classList.contains('dark');
  const gridC = dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
  const tickC = dark ? '#9CA3AF' : '#6B7280';

  charts.salesOverview = new Chart(ctx, {
    type: 'line',
    data: {
      labels: d.labels,
      datasets: [
        {
          label: 'Revenue ($)',
          data: d.revenue,
          borderColor: PALETTE.primary,
          backgroundColor: hexToRgba(PALETTE.primary, .1),
          fill: true,
          tension: .45,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#fff',
          pointBorderColor: PALETTE.primary,
          pointBorderWidth: 2,
          borderWidth: 2.5,
          yAxisID: 'y',
        },
        {
          label: 'Sales',
          data: d.sales,
          borderColor: PALETTE.blue,
          backgroundColor: hexToRgba(PALETTE.blue, .08),
          fill: true,
          tension: .45,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#fff',
          pointBorderColor: PALETTE.blue,
          pointBorderWidth: 2,
          borderWidth: 2.5,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 900, easing: 'easeInOutQuart' },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, pointStyleWidth: 8, padding: 16, color: tickC },
        },
      },
      scales: {
        x: { grid: { color: gridC }, ticks: { color: tickC } },
        y: {
          position: 'left',
          grid: { color: gridC },
          ticks: {
            color: tickC,
            callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v),
          },
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: tickC },
        },
      },
    },
  });

  // Tab buttons
  document.querySelectorAll('[data-chart="salesOverview"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-chart="salesOverview"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      const ds   = charts.salesOverview.data.datasets;
      ds[0].hidden = (mode === 'sales');
      ds[1].hidden = (mode === 'revenue');
      charts.salesOverview.update();
    });
  });
}

/* 6b. Category Bar Chart */
function buildCategoryChart() {
  const ctx  = document.getElementById('categoryChart');
  if (!ctx) return;
  const d    = dashboardData.categoryPerformance;
  const dark = document.documentElement.classList.contains('dark');
  const gridC = dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
  const tickC = dark ? '#9CA3AF' : '#6B7280';

  charts.category = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: d.labels,
      datasets: [{
        label: 'Revenue ($)',
        data: d.revenue,
        backgroundColor: PALETTE.barColors,
        borderRadius: 6,
        borderSkipped: false,
        hoverBackgroundColor: PALETTE.barColors.map(c => hexToRgba(c, .75)),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 900, easing: 'easeOutBounce' },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' $' + ctx.parsed.y.toLocaleString(),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tickC, maxRotation: 25 } },
        y: {
          grid: { color: gridC },
          ticks: {
            color: tickC,
            callback: v => '$' + (v/1000).toFixed(0)+'k',
          },
        },
      },
    },
  });
}

/* 6c. Traffic Sources – Doughnut / Pie */
function buildTrafficChart() {
  const ctx = document.getElementById('trafficChart');
  if (!ctx) return;
  const d   = dashboardData.trafficSources;

  charts.traffic = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: d.labels,
      datasets: [{
        data: d.values,
        backgroundColor: PALETTE.pie,
        hoverBackgroundColor: PALETTE.pie.map(c => hexToRgba(c, .85)),
        borderWidth: 2,
        borderColor: document.documentElement.classList.contains('dark') ? '#111827' : '#fff',
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      animation: { duration: 1000, animateRotate: true, animateScale: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` },
        },
      },
    },
  });

  // Build custom HTML legend
  const legendEl = document.getElementById('traffic-legend');
  if (legendEl) {
    legendEl.innerHTML = d.labels.map((label, i) => `
      <li>
        <span><span class="legend-dot" style="background:${PALETTE.pie[i]}"></span>${label}</span>
        <span class="font-semibold">${d.values[i]}%</span>
      </li>`).join('');
  }
}

/* 6d. Weekly Sales – Area Chart */
function buildWeeklySalesChart() {
  const ctx  = document.getElementById('weeklySalesChart');
  if (!ctx) return;
  const d    = dashboardData.weeklySales;
  const dark = document.documentElement.classList.contains('dark');
  const gridC = dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
  const tickC = dark ? '#9CA3AF' : '#6B7280';

  const grad = ctx.getContext('2d').createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0,   hexToRgba(PALETTE.accent, .35));
  grad.addColorStop(1,   hexToRgba(PALETTE.accent, .0));

  charts.weeklySales = new Chart(ctx, {
    type: 'line',
    data: {
      labels: d.labels,
      datasets: [{
        label: 'Daily Sales',
        data: d.sales,
        borderColor: PALETTE.accent,
        backgroundColor: grad,
        fill: true,
        tension: .5,
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: PALETTE.accent,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        borderWidth: 2.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ' ' + ctx.parsed.y.toLocaleString() + ' orders' },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tickC } },
        y: {
          grid: { color: gridC },
          ticks: { color: tickC, callback: v => v.toLocaleString() },
        },
      },
    },
  });
}

/* ── Update charts when filters change ──────────────────────── */
function refreshCharts() {
  if (!dashboardData) return;
  const multiplier = getFilterMultiplier();

  // Sales Overview
  if (charts.salesOverview) {
    const base = dashboardData.salesOverview;
    charts.salesOverview.data.datasets[0].data = base.revenue.map(v => Math.round(v * multiplier));
    charts.salesOverview.data.datasets[1].data = base.sales.map(v => Math.round(v * multiplier));
    charts.salesOverview.update('active');
  }
  // Category
  if (charts.category) {
    const base = dashboardData.categoryPerformance;
    charts.category.data.datasets[0].data = base.revenue.map(v => Math.round(v * multiplier));
    charts.category.update('active');
  }
  // Weekly
  if (charts.weeklySales) {
    const base = dashboardData.weeklySales;
    charts.weeklySales.data.datasets[0].data = base.sales.map(v => Math.round(v * multiplier));
    charts.weeklySales.update('active');
  }
}

function getFilterMultiplier() {
  const factors = { today:.04, week:.25, month:1, quarter:3, year:12, all:14 };
  return factors[currentFilters.date] ?? 1;
}

/* ============================================================
   7. DATA TABLE
   ============================================================ */
function renderTable() {
  if (!dashboardData) return;

  let rows = [...dashboardData.recentOrders];

  // Search filter
  if (tableState.search) {
    const q = tableState.search.toLowerCase();
    rows = rows.filter(r =>
      r.id.toLowerCase().includes(q) ||
      r.customer.toLowerCase().includes(q) ||
      r.product.toLowerCase().includes(q)
    );
  }

  // Status filter
  if (tableState.status !== 'all') {
    rows = rows.filter(r => r.status === tableState.status);
  }

  // Category filter (from global filters)
  if (currentFilters.category !== 'All Categories') {
    rows = rows.filter(r => r.category === currentFilters.category);
  }

  // Sort
  rows.sort((a, b) => {
    let va = a[tableState.sortCol], vb = b[tableState.sortCol];
    if (tableState.sortCol === 'amount') { va = +va; vb = +vb; }
    if (va < vb) return tableState.sortDir === 'asc' ? -1 :  1;
    if (va > vb) return tableState.sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  // Update sort direction icons on all sortable headers
  ['id','customer','amount','date'].forEach(col => {
    const icon = document.getElementById(`sort-icon-${col}`);
    if (!icon) return;
    if (col === tableState.sortCol) {
      icon.className = `fa-solid ${tableState.sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down'} ml-1 text-primary`;
    } else {
      icon.className = 'fa-solid fa-sort ml-1 opacity-40';
    }
  });

  const total    = rows.length;
  const pages    = Math.max(1, Math.ceil(total / tableState.perPage));
  tableState.page = Math.min(tableState.page, pages);
  const from     = (tableState.page - 1) * tableState.perPage;
  const slice    = rows.slice(from, from + tableState.perPage);

  // Category badge colors
  const catColor = {
    'Electronics':    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    'Clothing':       'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
    'Accessories':    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    'Home Appliances':'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    'Furniture':      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  };

  // Render rows
  const tbody = document.getElementById('orders-tbody');
  tbody.innerHTML = slice.map(r => `
    <tr>
      <td class="px-5 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">${r.id}</td>
      <td class="px-5 py-3">
        <div class="flex items-center gap-2">
          <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(r.customer)}&size=28&background=6366F1&color=fff&bold=true"
               alt="" class="w-7 h-7 rounded-full flex-shrink-0"/>
          <span class="font-medium text-gray-800 dark:text-gray-200 text-sm">${escHtml(r.customer)}</span>
        </div>
      </td>
      <td class="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">${escHtml(r.product)}</td>
      <td class="px-5 py-3">
        <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${catColor[r.category] || 'bg-gray-100 text-gray-600'}">${escHtml(r.category || '—')}</span>
      </td>
      <td class="px-5 py-3 text-right font-semibold text-gray-800 dark:text-gray-200">$${r.amount.toLocaleString()}</td>
      <td class="px-5 py-3 text-center">
        <span class="badge ${badgeClass(r.status)}">${escHtml(r.status)}</span>
      </td>
      <td class="px-5 py-3 text-sm text-gray-500 dark:text-gray-400">${formatDate(r.date)}</td>
    </tr>`).join('');

  // Update counts
  document.getElementById('orders-count').textContent = total;
  document.getElementById('page-from').textContent    = total === 0 ? 0 : from + 1;
  document.getElementById('page-to').textContent      = Math.min(from + tableState.perPage, total);
  document.getElementById('page-total').textContent   = total;

  // Update last-updated timestamp
  const lu = document.getElementById('last-updated');
  if (lu) lu.textContent = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  // Pagination buttons
  const pgEl = document.getElementById('pagination-btns');
  pgEl.innerHTML = '';
  const prevBtn = makePageBtn('‹', tableState.page > 1, () => { tableState.page--; renderTable(); });
  pgEl.appendChild(prevBtn);

  const range = getPaginationRange(tableState.page, pages);
  range.forEach(p => {
    if (p === '…') {
      const dot = document.createElement('span');
      dot.className = 'px-1 text-gray-400 text-sm self-center';
      dot.textContent = '…';
      pgEl.appendChild(dot);
    } else {
      const btn = makePageBtn(p, true, () => { tableState.page = p; renderTable(); }, p === tableState.page);
      pgEl.appendChild(btn);
    }
  });

  const nextBtn = makePageBtn('›', tableState.page < pages, () => { tableState.page++; renderTable(); });
  pgEl.appendChild(nextBtn);
}

function makePageBtn(label, enabled, onClick, active = false) {
  const btn = document.createElement('button');
  btn.className = `page-btn${active ? ' active' : ''}`;
  btn.textContent = label;
  btn.disabled = !enabled;
  if (!enabled) btn.style.opacity = '.4';
  btn.addEventListener('click', onClick);
  return btn;
}

function getPaginationRange(current, total) {
  if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total-4, total-3, total-2, total-1, total];
  return [1, '…', current-1, current, current+1, '…', total];
}

function badgeClass(status) {
  return { Completed:'badge-completed', Pending:'badge-pending', Cancelled:'badge-cancelled' }[status] ?? '';
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ── Sortable columns ──────────────────────────────────────── */
document.addEventListener('click', e => {
  const th = e.target.closest('.sortable');
  if (!th) return;
  const col = th.dataset.col;
  if (tableState.sortCol === col) {
    tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    tableState.sortCol = col;
    tableState.sortDir = 'asc';
  }
  tableState.page = 1;
  renderTable();
});

/* ============================================================
   8. FILTERS & SEARCH
   ============================================================ */
function initFilters() {
  document.getElementById('filter-date')?.addEventListener('change', e => {
    currentFilters.date = e.target.value;
    applyFilters();
  });
  document.getElementById('filter-category')?.addEventListener('change', e => {
    currentFilters.category = e.target.value;
    applyFilters();
  });
  document.getElementById('filter-region')?.addEventListener('change', e => {
    currentFilters.region = e.target.value;
    applyFilters();
  });
  document.getElementById('status-filter')?.addEventListener('change', e => {
    tableState.status = e.target.value;
    tableState.page   = 1;
    renderTable();
  });
}

function applyFilters() {
  refreshCharts();
  refreshMetricCards();
  renderTable();
  showToast('Filters applied', `Showing data for: ${currentFilters.date} · ${currentFilters.category} · ${currentFilters.region}`, 'info');
}

function refreshMetricCards() {
  const m = getFilterMultiplier();
  const base = dashboardData.metrics;

  animateCounter(document.getElementById('metric-revenue'),    0, +(base.totalRevenue.value * m).toFixed(0), 900, '$', '', 0);
  animateCounter(document.getElementById('metric-sales'),      0, +(base.totalSales.value * m).toFixed(0), 900, '', '', 0);
  animateCounter(document.getElementById('metric-customers'),  0, +(base.newCustomers.value * m).toFixed(0), 900, '', '', 0);
  animateCounter(document.getElementById('metric-conversion'), 0, base.conversionRate.value, 900, '', '%', 1);
}

function initSearch() {
  const globalSearch = document.getElementById('global-search');
  const tableSearch  = document.getElementById('table-search');

  globalSearch?.addEventListener('input', debounce(e => {
    tableState.search = e.target.value;
    tableState.page   = 1;
    renderTable();
  }, 300));

  tableSearch?.addEventListener('input', debounce(e => {
    tableState.search = e.target.value;
    tableState.page   = 1;
    renderTable();
  }, 300));

  // Per-page selector
  document.getElementById('per-page-select')?.addEventListener('change', e => {
    tableState.perPage = parseInt(e.target.value, 10);
    tableState.page    = 1;
    renderTable();
  });

  // Table CSV export
  document.getElementById('btn-table-csv')?.addEventListener('click', exportCSV);
}

/* ============================================================
   9. BUTTONS (export / refresh)
   ============================================================ */
function initButtons() {
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    showToast('Dashboard refreshed', 'All metrics and charts have been updated.', 'success');
    refreshMetricCards();
    refreshCharts();
    renderTable();
  });

  document.getElementById('btn-print')?.addEventListener('click', () => window.print());
  document.getElementById('btn-export-report')?.addEventListener('click', exportReport);
}

function exportCSV() {
  const headers  = ['Order ID','Customer','Product','Category','Amount','Status','Date'];
  const rows     = dashboardData.recentOrders.map(r =>
    [r.id, `"${r.customer}"`, `"${r.product}"`, r.category, r.amount, r.status, r.date]
  );
  const csv      = [headers, ...rows].map(r => r.join(',')).join('\n');
  downloadFile('orders_export.csv', 'text/csv', csv);
  showToast('Export complete', 'orders_export.csv downloaded successfully.', 'success');
}

function exportReport() {
  const report = `RISE Analytics – Dashboard Report
Generated: ${new Date().toLocaleString()}
Filters: ${currentFilters.date} | ${currentFilters.category} | ${currentFilters.region}

METRICS
-------
Total Revenue : $${dashboardData.metrics.totalRevenue.value.toLocaleString()} (${dashboardData.metrics.totalRevenue.growth > 0 ? '+' : ''}${dashboardData.metrics.totalRevenue.growth}%)
Total Sales   : ${dashboardData.metrics.totalSales.value.toLocaleString()} (${dashboardData.metrics.totalSales.growth > 0 ? '+' : ''}${dashboardData.metrics.totalSales.growth}%)
New Customers : ${dashboardData.metrics.newCustomers.value.toLocaleString()} (${dashboardData.metrics.newCustomers.growth}%)
Conv. Rate    : ${dashboardData.metrics.conversionRate.value}% (+${dashboardData.metrics.conversionRate.growth}%)

RECENT ORDERS
-------------
${dashboardData.recentOrders.map(r =>
  `${r.id} | ${r.customer} | ${r.product} | $${r.amount} | ${r.status} | ${r.date}`
).join('\n')}
`;
  downloadFile('dashboard_report.txt', 'text/plain', report);
  showToast('Report ready', 'dashboard_report.txt downloaded.', 'success');
}

function downloadFile(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   10. REAL-TIME SIMULATION
   ============================================================ */
function startRealtime() {
  const realtimeMessages = [
    { title: 'New Order',      msg: 'Order ORD-013 received from Neha Kapoor.',   type: 'success' },
    { title: 'Payment',        msg: 'Payment of $1,299 confirmed for ORD-005.',   type: 'success' },
    { title: 'Low Stock Alert',msg: 'MacBook Pro stock below 10 units.',           type: 'warning' },
    { title: 'New Customer',   msg: 'Ravi Shankar registered as a new customer.', type: 'info'    },
    { title: 'Target Reached', msg: 'Weekly sales target exceeded by 12%.',        type: 'success' },
    { title: 'Refund Request', msg: 'Customer requested refund for ORD-008.',      type: 'warning' },
  ];

  // Live metric state (tracks current displayed values)
  const liveMetrics = {
    revenue:    dashboardData.metrics.totalRevenue.value,
    sales:      dashboardData.metrics.totalSales.value,
    customers:  dashboardData.metrics.newCustomers.value,
  };

  let idx = 0;
  realtimeTimer = setInterval(() => {
    // ── Bump weekly chart last data point slightly ──
    if (charts.weeklySales) {
      const ds   = charts.weeklySales.data.datasets[0];
      const last = ds.data.length - 1;
      ds.data[last] = Math.max(0, ds.data[last] + Math.floor(Math.random() * 40 - 10));
      charts.weeklySales.update('none');
    }

    // ── Increment metric card numbers live ──
    liveMetrics.revenue   += Math.floor(Math.random() * 800 + 200);
    liveMetrics.sales     += Math.floor(Math.random() * 4 + 1);
    liveMetrics.customers += Math.random() > 0.5 ? 1 : 0;

    animateCounter(document.getElementById('metric-revenue'),   liveMetrics.revenue - 500, liveMetrics.revenue,   700, '$', '',  0);
    animateCounter(document.getElementById('metric-sales'),     liveMetrics.sales   - 3,   liveMetrics.sales,     500, '',  '',  0);
    animateCounter(document.getElementById('metric-customers'), liveMetrics.customers,      liveMetrics.customers, 400, '',  '',  0);

    // Update last-updated timestamp in table
    const lu = document.getElementById('last-updated');
    if (lu) lu.textContent = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

    // ── Push toast notification ──
    const m = realtimeMessages[idx % realtimeMessages.length];
    showToast(m.title, m.msg, m.type);
    idx++;

    // ── Add notification to the bell ──
    const newNotif = {
      id: Date.now(),
      message: m.msg,
      time: 'just now',
      read: false
    };
    notifsList.unshift(newNotif);
    if (notifsList.length > 8) notifsList.pop();
    buildNotifications();

  }, 8000); // every 8 seconds
}

/* ============================================================
   11. TOAST SYSTEM
   ============================================================ */
function showToast(title, message, type = 'info') {
  const iconMap = {
    success: '<i class="fa-solid fa-check"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
    error:   '<i class="fa-solid fa-xmark"></i>',
    info:    '<i class="fa-solid fa-bell"></i>',
  };
  const container = document.getElementById('toast-container');
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${iconMap[type] || iconMap.info}</div>
    <div class="flex-1">
      <p class="toast-title">${escHtml(title)}</p>
      <p class="toast-msg">${escHtml(message)}</p>
    </div>
    <button class="toast-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>`;

  container.appendChild(toast);

  const close = () => {
    toast.classList.add('toast-fade-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };
  toast.querySelector('.toast-close').addEventListener('click', close);
  setTimeout(close, 5500);
}

/* ============================================================
   12. UTILITIES
   ============================================================ */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

/* ============================================================
   13. FALLBACK DATA (when data.json cannot be fetched)
   ============================================================ */
function getFallbackData() {
  return {
    metrics: {
      totalRevenue:   { value:45890,  growth:12,   trend:'up'   },
      totalSales:     { value:3240,   growth:8.5,  trend:'up'   },
      newCustomers:   { value:1280,   growth:-3.2, trend:'down' },
      conversionRate: { value:4.6,    growth:1.8,  trend:'up'   },
    },
    salesOverview: {
      labels:  ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      revenue: [32000,27500,41000,38000,44500,39000,52000,48000,55000,49000,61000,58000],
      sales:   [210,185,270,245,310,260,355,320,385,340,420,395],
    },
    categoryPerformance: {
      labels:  ['Electronics','Clothing','Accessories','Home Appliances','Furniture'],
      revenue: [128000,74000,52000,91000,43000],
    },
    trafficSources: {
      labels: ['Organic Search','Social Media','Direct Traffic','Paid Ads','Email Marketing'],
      values: [38,24,18,13,7],
    },
    weeklySales: {
      labels: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
      sales:  [1250,1480,1320,1690,2100,2450,1870],
    },
    recentOrders: [
      { id:'ORD-001', customer:'Priya Sharma',   product:'MacBook Pro',       amount:2499, status:'Completed', date:'2026-03-01', category:'Electronics'     },
      { id:'ORD-002', customer:'Rahul Verma',    product:'Running Shoes',     amount:149,  status:'Pending',   date:'2026-03-02', category:'Clothing'        },
      { id:'ORD-003', customer:'Anjali Singh',   product:'Smart Watch',       amount:399,  status:'Completed', date:'2026-03-03', category:'Accessories'     },
      { id:'ORD-004', customer:'Vikram Patel',   product:'Coffee Table',      amount:289,  status:'Cancelled', date:'2026-03-03', category:'Furniture'       },
      { id:'ORD-005', customer:'Kavitha Reddy',  product:'iPhone 15 Pro',     amount:1199, status:'Completed', date:'2026-03-04', category:'Electronics'     },
      { id:'ORD-006', customer:'Arjun Nair',     product:'Headphones',        amount:249,  status:'Pending',   date:'2026-03-04', category:'Electronics'     },
      { id:'ORD-007', customer:'Sneha Iyer',     product:'Air Purifier',      amount:329,  status:'Completed', date:'2026-03-05', category:'Home Appliances' },
      { id:'ORD-008', customer:'Amit Gupta',     product:'Yoga Mat',          amount:59,   status:'Cancelled', date:'2026-03-05', category:'Accessories'     },
      { id:'ORD-009', customer:'Pooja Mehta',    product:'Laptop Stand',      amount:89,   status:'Pending',   date:'2026-03-06', category:'Accessories'     },
      { id:'ORD-010', customer:'Rohan Joshi',    product:'4K Monitor',        amount:749,  status:'Completed', date:'2026-03-07', category:'Electronics'     },
      { id:'ORD-011', customer:'Deepa Pillai',   product:'Desk Chair',        amount:459,  status:'Completed', date:'2026-03-07', category:'Furniture'       },
      { id:'ORD-012', customer:'Suresh Kumar',   product:'Bluetooth Speaker', amount:179,  status:'Pending',   date:'2026-03-08', category:'Electronics'     },
    ],
    notifications: [
      { id:1, message:'New order received from Priya Sharma',  time:'2 min ago', read:false },
      { id:2, message:'Revenue target 80% achieved',            time:'15 min ago',read:false },
      { id:3, message:'New customer registered: Rahul Verma',   time:'1 hr ago',  read:true  },
      { id:4, message:'Monthly report is ready to download',   time:'3 hrs ago', read:true  },
    ],
  };
}

/* ============================================================
   14. SECTION DATA
   ============================================================ */
const topProducts = [
  { name: 'Samsung Galaxy S24',    category: 'Electronics',     units: 284, revenue: 284000, growth: 18.4 },
  { name: 'Apple iPhone 15',       category: 'Electronics',     units: 241, revenue: 253050, growth: 12.1 },
  { name: 'Boat Airdopes 141',     category: 'Accessories',     units: 612, revenue: 30600,  growth: 43.2 },
  { name: 'Lenovo IdeaPad 3',      category: 'Electronics',     units: 95,  revenue: 94050,  growth: 7.8  },
  { name: 'Titan Edge Watch',      category: 'Accessories',     units: 178, revenue: 62300,  growth: 22.5 },
  { name: 'Whirlpool W. Machine',  category: 'Home Appliances', units: 54,  revenue: 75600,  growth: -2.3 },
  { name: "Levi's 511 Slim Jeans", category: 'Clothing',        units: 340, revenue: 27200,  growth: 31.6 },
  { name: 'IKEA Kallax Shelf',     category: 'Furniture',       units: 67,  revenue: 20100,  growth: 5.4  },
  { name: 'Sony WH-1000XM5',       category: 'Electronics',     units: 112, revenue: 44800,  growth: 15.9 },
  { name: 'Peter England Shirt',   category: 'Clothing',        units: 425, revenue: 21250,  growth: 9.7  },
];

const customersList = [
  { name: 'Priya Sharma',  email: 'priya.sharma@email.in',   region: 'Maharashtra',    orders: 14, spend: 28450, joined: '15 Feb 2023', status: 'Active'   },
  { name: 'Rahul Verma',   email: 'rahul.verma@email.in',    region: 'Delhi',          orders: 8,  spend: 15200, joined: '20 May 2023', status: 'Active'   },
  { name: 'Anjali Singh',  email: 'anjali.singh@email.in',   region: 'Karnataka',      orders: 22, spend: 41800, joined: '10 Nov 2022', status: 'Active'   },
  { name: 'Vikram Patel',  email: 'vikram.patel@email.in',   region: 'Gujarat',        orders: 5,  spend: 9650,  joined: '02 Aug 2023', status: 'Inactive' },
  { name: 'Kavitha Reddy', email: 'kavitha.reddy@email.in',  region: 'Telangana',      orders: 17, spend: 32100, joined: '28 Jan 2023', status: 'Active'   },
  { name: 'Arjun Nair',    email: 'arjun.nair@email.in',     region: 'Kerala',         orders: 11, spend: 21750, joined: '14 Apr 2023', status: 'Active'   },
  { name: 'Sneha Iyer',    email: 'sneha.iyer@email.in',     region: 'Tamil Nadu',     orders: 3,  spend: 5900,  joined: '05 Jan 2024', status: 'New'      },
  { name: 'Amit Gupta',    email: 'amit.gupta@email.in',     region: 'Uttar Pradesh',  orders: 9,  spend: 17300, joined: '19 Jul 2023', status: 'Active'   },
  { name: 'Pooja Mehta',   email: 'pooja.mehta@email.in',    region: 'Madhya Pradesh', orders: 6,  spend: 11480, joined: '30 Sep 2023', status: 'Active'   },
  { name: 'Rohan Joshi',   email: 'rohan.joshi@email.in',    region: 'Maharashtra',    orders: 19, spend: 37600, joined: '08 Dec 2022', status: 'Active'   },
  { name: 'Deepa Pillai',  email: 'deepa.pillai@email.in',   region: 'Kerala',         orders: 2,  spend: 3200,  joined: '14 Feb 2024', status: 'New'      },
  { name: 'Suresh Kumar',  email: 'suresh.kumar@email.in',   region: 'Tamil Nadu',     orders: 26, spend: 52900, joined: '22 Jun 2022', status: 'VIP'      },
];

const productsList = [
  { name: 'Samsung Galaxy S24',    category: 'Electronics',     sku: 'ELE-001', stock: 45,  price: 74999, revenue: 284000, status: 'In Stock'     },
  { name: 'Apple iPhone 15',       category: 'Electronics',     sku: 'ELE-002', stock: 12,  price: 79999, revenue: 253050, status: 'Low Stock'    },
  { name: 'Boat Airdopes 141',     category: 'Accessories',     sku: 'ACC-001', stock: 230, price: 1299,  revenue: 30600,  status: 'In Stock'     },
  { name: 'Lenovo IdeaPad 3',      category: 'Electronics',     sku: 'ELE-003', stock: 8,   price: 52999, revenue: 94050,  status: 'Low Stock'    },
  { name: 'Titan Edge Watch',      category: 'Accessories',     sku: 'ACC-002', stock: 64,  price: 8999,  revenue: 62300,  status: 'In Stock'     },
  { name: 'Whirlpool W. Machine',  category: 'Home Appliances', sku: 'HOM-001', stock: 18,  price: 28000, revenue: 75600,  status: 'In Stock'     },
  { name: "Levi's 511 Slim Jeans", category: 'Clothing',        sku: 'CLO-001', stock: 0,   price: 2999,  revenue: 27200,  status: 'Out of Stock' },
  { name: 'IKEA Kallax Shelf',     category: 'Furniture',       sku: 'FUR-001', stock: 31,  price: 5999,  revenue: 20100,  status: 'In Stock'     },
  { name: 'Sony WH-1000XM5',       category: 'Electronics',     sku: 'ELE-004', stock: 5,   price: 26990, revenue: 44800,  status: 'Low Stock'    },
  { name: 'Peter England Shirt',   category: 'Clothing',        sku: 'CLO-002', stock: 120, price: 1299,  revenue: 21250,  status: 'In Stock'     },
];

const salesFunnelData = [
  { stage: 'Website Visitors', count: 48200, color: '#6366F1' },
  { stage: 'Product Views',    count: 21900, color: '#3B82F6' },
  { stage: 'Add to Cart',      count: 8640,  color: '#22C55E' },
  { stage: 'Checkout Started', count: 5120,  color: '#F59E0B' },
  { stage: 'Orders Placed',    count: 3240,  color: '#F43F5E' },
];

const CAT_COLORS = {
  Electronics:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Clothing:         'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Accessories:      'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'Home Appliances':'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Furniture:        'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

/* ============================================================
   15. SALES ANALYTICS SECTION
   ============================================================ */
function initSalesSection() {
  animateCounter(document.getElementById('sales-avg-order'),  0, 141.6, 1000, '$', '',  2);
  animateCounter(document.getElementById('sales-growth-val'), 0, 12,    900,  '',  '%', 1);
  animateCounter(document.getElementById('sales-refund-val'), 0, 2.8,   900,  '',  '%', 1);
  animateCounter(document.getElementById('sales-repeat-val'), 0, 54,    900,  '',  '%', 0);
  renderSalesFunnel();
  if (!charts.salesComparison) buildSalesComparisonChart();
  renderTopProducts();
}

function renderSalesFunnel() {
  const el  = document.getElementById('sales-funnel');
  if (!el) return;
  const max = salesFunnelData[0].count;
  el.innerHTML = salesFunnelData.map(item => {
    const pct = Math.round((item.count / max) * 100);
    return `<div>
      <div class="flex justify-between text-xs mb-1">
        <span class="text-gray-600 dark:text-gray-400 font-medium">${escHtml(item.stage)}</span>
        <span class="text-gray-900 dark:text-white font-semibold">${item.count.toLocaleString('en-IN')}</span>
      </div>
      <div class="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:${item.color}"></div>
      </div>
      <p class="text-xs text-gray-400 mt-0.5">${pct}% of total visitors</p>
    </div>`;
  }).join('');
}

function buildSalesComparisonChart() {
  const ctx = document.getElementById('salesComparisonChart');
  if (!ctx) return;
  charts.salesComparison = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      datasets: [
        { label: 'This Year', data: [32000,35000,31000,38000,34000,41000,43000,45000,44000,46000,48000,45890], backgroundColor: PALETTE.primary + 'CC', borderRadius: 5, borderSkipped: false },
        { label: 'Last Year', data: [28000,31000,27500,33000,29000,34000,36000,38000,35000,37000,40000,39000], backgroundColor: PALETTE.blue + '77',    borderRadius: 5, borderSkipped: false },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#9CA3AF', font: { size: 11 } } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9CA3AF', font: { size: 11 } } },
        y: { grid: { color: 'rgba(156,163,175,0.15)' }, ticks: { color: '#9CA3AF', font: { size: 11 }, callback: v => '$' + (v / 1000).toFixed(0) + 'k' } },
      }
    }
  });
}

function renderTopProducts() {
  const tbody = document.getElementById('top-products-tbody');
  if (!tbody) return;
  tbody.innerHTML = topProducts.map((p, i) => {
    const up = p.growth >= 0;
    return `<tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
      <td class="px-5 py-3 text-gray-400 font-medium">${i + 1}</td>
      <td class="px-5 py-3 font-medium text-gray-900 dark:text-white">${escHtml(p.name)}</td>
      <td class="px-5 py-3"><span class="badge text-xs px-2 py-0.5 rounded-full ${CAT_COLORS[p.category] || ''}">${escHtml(p.category)}</span></td>
      <td class="px-5 py-3 text-right text-gray-700 dark:text-gray-300">${p.units.toLocaleString('en-IN')}</td>
      <td class="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white">$${p.revenue.toLocaleString()}</td>
      <td class="px-5 py-3 text-right ${up ? 'text-emerald-500' : 'text-rose-500'} font-medium">
        <i class="fa-solid ${up ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} mr-1"></i>${Math.abs(p.growth)}%
      </td>
    </tr>`;
  }).join('');
}

/* ============================================================
   16. CUSTOMERS SECTION
   ============================================================ */
function initCustomersSection() {
  animateCounter(document.getElementById('cust-total'),  0, 8420, 1000, '', '',  0);
  animateCounter(document.getElementById('cust-active'), 0, 6230, 900,  '', '',  0);
  animateCounter(document.getElementById('cust-new'),    0, 1280, 900,  '', '',  0);
  animateCounter(document.getElementById('cust-churn'),  0, 1.2,  700,  '', '%', 1);
  if (!charts.customerAcquisition) buildCustomerAcquisitionChart();
  renderTopCustomersList();
  renderCustomersTable(customersList);
  document.getElementById('cust-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderCustomersTable(customersList.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.region.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    ));
  });
}

function buildCustomerAcquisitionChart() {
  const ctx = document.getElementById('customerAcquisitionChart');
  if (!ctx) return;
  charts.customerAcquisition = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      datasets: [{
        label: 'New Customers',
        data: [620,740,680,890,970,850,1050,1120,980,1200,1350,1280],
        borderColor: PALETTE.accent,
        backgroundColor: hexToRgba(PALETTE.accent, 0.12),
        fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 6,
        pointBackgroundColor: PALETTE.accent,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9CA3AF', font: { size: 11 } } },
        y: { grid: { color: 'rgba(156,163,175,0.15)' }, ticks: { color: '#9CA3AF', font: { size: 11 } } },
      }
    }
  });
}

function renderTopCustomersList() {
  const el = document.getElementById('top-customers-list');
  if (!el) return;
  const top5 = [...customersList].sort((a, b) => b.spend - a.spend).slice(0, 5);
  el.innerHTML = top5.map((c, i) => `
    <li class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
      <span class="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">${i + 1}</span>
      <div class="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">${escHtml(c.name[0])}</div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-900 dark:text-white truncate">${escHtml(c.name)}</p>
        <p class="text-xs text-gray-400">${c.orders} orders</p>
      </div>
      <p class="text-sm font-semibold text-gray-900 dark:text-white shrink-0">$${c.spend.toLocaleString()}</p>
    </li>`).join('');
}

function renderCustomersTable(list) {
  const tbody = document.getElementById('customers-tbody');
  if (!tbody) return;
  const statusC = {
    Active:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    Inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    New:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    VIP:      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  };
  tbody.innerHTML = list.map(c => `
    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
      <td class="px-5 py-3">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">${escHtml(c.name[0])}</div>
          <div>
            <p class="font-medium text-gray-900 dark:text-white">${escHtml(c.name)}</p>
            <p class="text-xs text-gray-400">${escHtml(c.email)}</p>
          </div>
        </div>
      </td>
      <td class="px-5 py-3 text-gray-600 dark:text-gray-400">${escHtml(c.region)}</td>
      <td class="px-5 py-3 text-right text-gray-700 dark:text-gray-300">${c.orders}</td>
      <td class="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white">$${c.spend.toLocaleString()}</td>
      <td class="px-5 py-3 text-gray-400">${escHtml(c.joined)}</td>
      <td class="px-5 py-3 text-center"><span class="badge text-xs px-2 py-0.5 rounded-full ${statusC[c.status] || ''}">${escHtml(c.status)}</span></td>
    </tr>`).join('');
}

/* ============================================================
   17. PRODUCTS SECTION
   ============================================================ */
function initProductsSection() {
  const inStock    = productsList.filter(p => p.status === 'In Stock').length;
  const lowStock   = productsList.filter(p => p.status === 'Low Stock').length;
  const outOfStock = productsList.filter(p => p.status === 'Out of Stock').length;
  animateCounter(document.getElementById('prod-total'),      0, productsList.length, 500, '', '', 0);
  animateCounter(document.getElementById('prod-instock'),    0, inStock,             500, '', '', 0);
  animateCounter(document.getElementById('prod-lowstock'),   0, lowStock,            500, '', '', 0);
  animateCounter(document.getElementById('prod-outofstock'), 0, outOfStock,          500, '', '', 0);
  if (!charts.productCategory) buildProductCategoryChart();
  renderProductsTable();
  document.getElementById('btn-restock')?.addEventListener('click', () => {
    const names = productsList.filter(p => p.status !== 'In Stock').map(p => p.name).join(', ');
    showToast('Restock Alert Sent', `Reorder triggered for: ${names}`, 'warning');
  });
}

function buildProductCategoryChart() {
  const ctx = document.getElementById('productCategoryChart');
  if (!ctx) return;
  const catRevenue = {};
  productsList.forEach(p => { catRevenue[p.category] = (catRevenue[p.category] || 0) + p.revenue; });
  const labels = Object.keys(catRevenue);
  const data   = labels.map(k => catRevenue[k]);
  charts.productCategory = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Revenue', data, backgroundColor: PALETTE.barColors, borderRadius: 5, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(156,163,175,0.15)' }, ticks: { color: '#9CA3AF', font: { size: 11 }, callback: v => '$' + (v / 1000).toFixed(0) + 'k' } },
        y: { grid: { display: false }, ticks: { color: '#9CA3AF', font: { size: 11 } } },
      }
    }
  });
}

function renderProductsTable() {
  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;
  const stockStatusC = {
    'In Stock':     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    'Low Stock':    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    'Out of Stock': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  };
  tbody.innerHTML = productsList.map(p => `
    <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
      <td class="px-5 py-3 font-medium text-gray-900 dark:text-white">${escHtml(p.name)}</td>
      <td class="px-5 py-3"><span class="badge text-xs px-2 py-0.5 rounded-full ${CAT_COLORS[p.category] || ''}">${escHtml(p.category)}</span></td>
      <td class="px-5 py-3 font-mono text-xs text-gray-500">${escHtml(p.sku)}</td>
      <td class="px-5 py-3 text-right font-medium ${p.stock === 0 ? 'text-rose-500' : p.stock <= 12 ? 'text-orange-500' : 'text-gray-700 dark:text-gray-300'}">${p.stock}</td>
      <td class="px-5 py-3 text-right text-gray-700 dark:text-gray-300">$${p.price.toLocaleString()}</td>
      <td class="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white">$${p.revenue.toLocaleString()}</td>
      <td class="px-5 py-3 text-center"><span class="badge text-xs px-2 py-0.5 rounded-full ${stockStatusC[p.status] || ''}">${escHtml(p.status)}</span></td>
    </tr>`).join('');
}

/* ============================================================
   18. REPORTS SECTION
   ============================================================ */
function initReportsSection() {
  renderReportCategoryPerf();
  document.getElementById('report-form')?.addEventListener('submit', e => {
    e.preventDefault();
    generateCustomReport();
  });
}

function renderReportCategoryPerf() {
  const el = document.getElementById('report-category-perf');
  if (!el) return;
  const cats = [
    { name: 'Electronics',     revenue: 128000, color: PALETTE.blue   },
    { name: 'Home Appliances', revenue: 91000,  color: PALETTE.orange },
    { name: 'Clothing',        revenue: 74000,  color: PALETTE.purple },
    { name: 'Accessories',     revenue: 52000,  color: PALETTE.rose   },
    { name: 'Furniture',       revenue: 43000,  color: PALETTE.teal   },
  ];
  const total = cats.reduce((s, c) => s + c.revenue, 0);
  el.innerHTML = cats.map(c => {
    const pct = Math.round((c.revenue / total) * 100);
    return `<div>
      <div class="flex justify-between text-xs mb-1">
        <span class="font-medium text-gray-700 dark:text-gray-300">${escHtml(c.name)}</span>
        <span class="font-semibold text-gray-900 dark:text-white">$${c.revenue.toLocaleString()} <span class="text-gray-400">(${pct}%)</span></span>
      </div>
      <div class="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div class="h-full rounded-full" style="width:${pct}%;background:${c.color};transition:width 0.7s ease"></div>
      </div>
    </div>`;
  }).join('');
}

function generateCustomReport() {
  const type   = document.getElementById('rpt-type')?.value   || 'full';
  const range  = document.getElementById('rpt-range')?.value  || 'month';
  const format = document.getElementById('rpt-format')?.value || 'txt';
  if (format === 'csv') {
    const headers = ['Product', 'Category', 'Units Sold', 'Revenue', 'Growth %'];
    const rows    = topProducts.map(p => [`"${p.name}"`, p.category, p.units, p.revenue, p.growth]);
    const csv     = [headers, ...rows].map(r => r.join(',')).join('\n');
    downloadFile(`${type}_report_${range}.csv`, 'text/csv', csv);
  } else {
    const body = `RISE Analytics – ${type.toUpperCase()} REPORT
Period   : ${range}
Generated: ${new Date().toLocaleString('en-IN')}

SUMMARY
-------
Total Revenue  : $45,890  (+12%)
Total Orders   : 3,240    (+8.5%)
Total Customers: 8,420    (-3.2%)
Conv. Rate     : 4.6%     (+1.8%)
Avg Order Value: $141.60  (+5.2%)

TOP PRODUCTS
------------
${topProducts.slice(0, 5).map((p, i) => `${i + 1}. ${p.name} — $${p.revenue.toLocaleString()} (${p.growth > 0 ? '+' : ''}${p.growth}%)`).join('\n')}
`;
    downloadFile(`${type}_report_${range}.txt`, 'text/plain', body);
  }
  showToast('Report Generated', `${type}_report_${range}.${format} is ready.`, 'success');
}

/* ============================================================
   19. SETTINGS SECTION
   ============================================================ */
function initSettingsSection() {
  document.getElementById('settings-profile-form')?.addEventListener('submit', e => {
    e.preventDefault();
    showToast('Profile Updated', 'Your profile changes have been saved.', 'success');
  });
  document.getElementById('btn-change-password')?.addEventListener('click', () => {
    showToast('Password Updated', 'Your password has been changed successfully.', 'success');
  });
  document.getElementById('btn-save-prefs')?.addEventListener('click', () => {
    showToast('Preferences Saved', 'Your preferences have been updated.', 'success');
  });
}

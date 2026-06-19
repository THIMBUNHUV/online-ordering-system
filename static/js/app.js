// ══════════════════════════════════════════════════════
// Global State
// ══════════════════════════════════════════════════════
const API = '';
let map = null;
let mapMarker = null;
let searchTimeout = null;
const state = {
    user: JSON.parse(localStorage.getItem('ventro_user') || 'null'),
    token: localStorage.getItem('ventro_token') || null,
    cart: JSON.parse(localStorage.getItem('ventro_cart') || '[]'),
    currentView: 'menu',
    categories: [],
    menuItems: [],
    filteredItems: [],
    selectedCategory: null,
    searchQuery: '',
    orders: [],
    selectedOrder: null,
    adminDashboard: null,
    adminOrders: [],
    adminItems: [],
    adminCategories: [],
    adminOrderStatusFilter: 'all',
    authMode: 'login',
    pendingOrderId: null,
    notifications: JSON.parse(localStorage.getItem('ventro_notifs') || '[]'),
    unreadNotifCount: parseInt(localStorage.getItem('ventro_notif_count') || '0'),
    notifPollInterval: null,
    pendingCart: [], // រក្សាទុក Cart មុននឹងលុប
};

// ══════════════════════════════════════════════════════
// Utilities
// ══════════════════════════════════════════════════════
function authHeaders() {
    return state.token ? { 'Authorization': `Bearer ${state.token}` } : {};
}

async function api(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json', ...authHeaders() };
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, opts);
    const text = await res.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch (e) {
        console.error("JSON Parse Error:", text);
        throw new Error("Invalid response from server");
    }
    if (!res.ok) throw new Error(data.detail || data.message || 'Request failed');
    return data;
}

function saveCart() {
    localStorage.setItem('ventro_cart', JSON.stringify(state.cart));
    updateCartBadge();
}
function saveAuth() {
    if (state.user && state.token) {
        localStorage.setItem('ventro_user', JSON.stringify(state.user));
        localStorage.setItem('ventro_token', state.token);
    } else {
        localStorage.removeItem('ventro_user');
        localStorage.removeItem('ventro_token');
    }
}

function formatPrice(n) { return '$' + Number(n).toFixed(2); }

function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function statusLabel(s) {
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ══════════════════════════════════════════════════════
// Toast Notifications
// ══════════════════════════════════════════════════════
function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const colors = { success: 'var(--success)', error: 'var(--danger)', warning: 'var(--warning)', info: 'var(--accent)' };
    const icons = { success: 'fa-check-circle', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<i class="fa-solid ${icons[type]}" style="color:${colors[type]}"></i>${message}`;
    container.appendChild(el);
    setTimeout(() => { el.classList.add('removing'); setTimeout(() => el.remove(), 300); }, 3000);
}

// ══════════════════════════════════════════════════════
// Modal Helpers
// ══════════════════════════════════════════════════════
function openModal(id) {
    document.getElementById(id).classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    // Only restore scroll if no other modals are open
    const anyOpen = document.querySelector('.modal-backdrop.open');
    if (!anyOpen && !document.querySelector('.cart-panel.open')) {
        document.body.style.overflow = '';
    }
}

function navigate(view, data = {}) {
    state.currentView = view;
    Object.assign(state, data);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
    renderNav();
    const main = document.getElementById('main-content');
    const views = {
        menu: renderMenu,
        about: renderAbout,
        orders: renderOrders,
        'order-detail': renderOrderDetail,
        admin: renderAdminDashboard,
        'admin-menu': renderAdminMenu,
        'admin-orders': renderAdminOrders,
        profile: renderProfile,
    };
    main.innerHTML = (views[state.currentView] || renderMenu)();

    // Footer visibility
    const footer = document.getElementById('site-footer');
    if (footer) {
        footer.style.display = ['admin', 'admin-menu', 'admin-orders'].includes(state.currentView) ? 'none' : 'block';
    }

    // Mobile admin nav
    const mobileNav = document.getElementById('mobile-admin-nav');
    if (mobileNav) {
        mobileNav.style.display = (state.user && state.user.role === 'admin' &&
            ['admin', 'admin-menu', 'admin-orders'].includes(state.currentView)) ? 'flex' : 'none';
    }

    attachListeners();
    manageNotifPolling();
}


function renderNav() {
    const linksEl = document.getElementById('nav-links');
    const isAdmin = state.user && state.user.role === 'admin';

    if (isAdmin) {
        linksEl.innerHTML = `
            <button onclick="navigate('admin')" class="btn-ghost text-sm px-3 py-2 rounded-lg ${state.currentView === 'admin' ? 'text-white' : ''}">Dashboard</button>
            <button onclick="navigate('admin-menu')" class="btn-ghost text-sm px-3 py-2 rounded-lg ${state.currentView === 'admin-menu' ? 'text-white' : ''}">Menu</button>
            <button onclick="navigate('admin-orders')" class="btn-ghost text-sm px-3 py-2 rounded-lg ${state.currentView === 'admin-orders' ? 'text-white' : ''}">Orders</button>
            <button onclick="navigate('menu')" class="btn-ghost text-sm px-3 py-2 rounded-lg">Store</button>
        `;
    } else {
        linksEl.innerHTML = `
            <button onclick="navigate('menu')" class="btn-ghost text-sm px-3 py-2 rounded-lg">Menu</button>
            <button onclick="state.user ? navigate('orders') : openAuthModal()" class="btn-ghost text-sm px-3 py-2 rounded-lg">My Orders</button>
            <button onclick="navigate('about')" class="btn-ghost text-sm px-3 py-2 rounded-lg ${state.currentView === 'about' ? 'text-white' : ''}">About Us</button>
            
        `;
    }

    // Show/hide notification bell (hide for admin)
    const bellBtn = document.getElementById('notif-bell-btn');
    if (bellBtn) {
        bellBtn.classList.toggle('hidden', !state.user || isAdmin);
    }

  
    // HIDE CART ICON FOR ADMIN
    const cartBtn = document.getElementById('cart-icon-btn');
    if (cartBtn) {
        cartBtn.style.display = isAdmin ? 'none' : '';
    }

    // Update notification badge
    updateNotifBadge();

    const userEl = document.getElementById('nav-user');
    if (state.user) {
        userEl.innerHTML = `
            <div class="flex items-center gap-3">
                <button onclick="navigate('profile')" class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all hover:ring-2 hover:ring-offset-2" style="background:var(--accent);color:#fff;ring-offset-color:var(--bg);ring-color:var(--accent);" title="View Profile">
                    ${state.user.name.charAt(0).toUpperCase()}
                </button>
                <span class="text-sm font-medium hidden sm:inline cursor-pointer hover:underline" onclick="navigate('profile')">${state.user.name}</span>
                <button onclick="logout()" class="btn-ghost text-sm" title="Sign out"><i class="fa-solid fa-right-from-bracket"></i></button>
            </div>
        `;
    } else {
        userEl.innerHTML = `<button onclick="openAuthModal()" class="btn-outline text-sm px-4 py-2 rounded-lg">Sign In</button>`;
    }
}

// ══════════════════════════════════════════════════════
// Profile Page
// ══════════════════════════════════════════════════════
function renderProfile() {
    if (!state.user) {
        return `
        <div class="max-w-2xl mx-auto px-6 py-20 text-center">
            <i class="fa-solid fa-lock text-4xl mb-4" style="color:var(--muted)"></i>
            <h2 class="text-2xl font-bold mb-2">Sign in to view profile</h2>
            <p class="mb-6" style="color:var(--fg-secondary)">Access your account settings</p>
            <button onclick="openAuthModal()" class="btn-accent px-6 py-3 rounded-xl">Sign In</button>
        </div>`;
    }

    const u = state.user;
    const isAdmin = u.role === 'admin';

    return `
    <section class="max-w-3xl mx-auto px-6 py-12 fade-in">
        <h2 class="text-3xl font-bold mb-8" style="font-family:'Outfit'">My Profile</h2>
        
        <!-- Profile Header Card -->
        <div class="rounded-2xl p-8 mb-6" style="background:var(--card);border:1px solid var(--border)">
            <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <div class="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-bold flex-shrink-0" style="background:var(--accent);color:#fff;">
                    ${u.name.charAt(0).toUpperCase()}
                </div>
                <div class="flex-1 text-center sm:text-left">
                    <h3 class="text-2xl font-bold mb-1">${u.name}</h3>
                    <p class="text-sm mb-3" style="color:var(--muted)">${u.email}</p>
                    <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium" style="background:${isAdmin ? 'rgba(232,119,46,0.15)' : 'rgba(52,211,153,0.15)'};color:${isAdmin ? 'var(--accent)' : 'var(--success)'}">
                        <i class="fa-solid fa-${isAdmin ? 'crown' : 'user'}"></i>
                        ${isAdmin ? 'Administrator' : 'Customer'}
                    </span>
                </div>
            </div>
        </div>

        <!-- Profile Details -->
        <div class="rounded-2xl overflow-hidden mb-6" style="background:var(--card);border:1px solid var(--border)">
            <div class="p-5 flex justify-between items-center" style="border-bottom:1px solid var(--border)">
                <h3 class="font-bold"><i class="fa-solid fa-id-card mr-2" style="color:var(--accent)"></i>Account Information</h3>
                <button onclick="openEditProfileModal()" class="btn-outline text-sm px-4 py-2 rounded-lg">
                    <i class="fa-solid fa-pen mr-2"></i>Edit
                </button>
            </div>
            <div class="p-5 space-y-4">
                <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 pb-4" style="border-bottom:1px solid var(--border)">
                    <span class="text-sm font-medium sm:w-32" style="color:var(--muted)">Full Name</span>
                    <span class="text-sm">${u.name || '-'}</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 pb-4" style="border-bottom:1px solid var(--border)">
                    <span class="text-sm font-medium sm:w-32" style="color:var(--muted)">Email</span>
                    <span class="text-sm">${u.email || '-'}</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 pb-4" style="border-bottom:1px solid var(--border)">
                    <span class="text-sm font-medium sm:w-32" style="color:var(--muted)">Phone</span>
                    <span class="text-sm">${u.phone ? '+855 ' + u.phone : 'Not set'}</span>
                </div>
                <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <span class="text-sm font-medium sm:w-32" style="color:var(--muted)">Role</span>
                    <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium w-fit" style="background:${isAdmin ? 'rgba(232,119,46,0.15)' : 'rgba(52,211,153,0.15)'};color:${isAdmin ? 'var(--accent)' : 'var(--success)'}">
                        <i class="fa-solid fa-${isAdmin ? 'crown' : 'user'}"></i>
                        ${isAdmin ? 'Administrator' : 'Customer'}
                    </span>
                </div>
            </div>
        </div>

        <!-- Quick Stats (for customers) -->
        ${!isAdmin ? `
        <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="p-5 rounded-2xl text-center" style="background:var(--card);border:1px solid var(--border)">
                <div class="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style="background:rgba(232,119,46,0.15)">
                    <i class="fa-solid fa-receipt text-xl" style="color:var(--accent)"></i>
                </div>
                <p class="text-2xl font-bold">${state.orders.length}</p>
                <p class="text-xs mt-1" style="color:var(--muted)">Total Orders</p>
            </div>
            <div class="p-5 rounded-2xl text-center cursor-pointer" style="background:var(--card);border:1px solid var(--border)" onclick="navigate('orders')">
                <div class="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style="background:rgba(52,211,153,0.15)">
                    <i class="fa-solid fa-clock text-xl" style="color:var(--success)"></i>
                </div>
                <p class="text-2xl font-bold">${state.orders.filter(o => ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)).length}</p>
                <p class="text-xs mt-1" style="color:var(--muted)">Active Orders</p>
            </div>
        </div>
        ` : ''}

                <!-- Security Section -->
        <div class="rounded-2xl overflow-hidden mb-6" style="background:var(--card);border:1px solid var(--border)">
            <div class="p-5" style="border-bottom:1px solid var(--border)">
                <h3 class="font-bold"><i class="fa-solid fa-shield-halved mr-2" style="color:var(--accent)"></i>Security & Integrations</h3>
            </div>
            <div class="p-5 space-y-4">
                <!-- Telegram Link -->
                <div class="flex items-center justify-between p-3 rounded-lg" style="background:var(--bg)">
                    <div class="flex items-center gap-3">
                        <i class="fa-brands fa-telegram text-2xl" style="color:#229ED9"></i>
                        <div>
                            <p class="font-medium text-sm">Telegram Notifications</p>
                            <p class="text-xs" style="color:var(--muted)">ទទួលបានការជូនដំណឹងតាម Telegram</p>
                        </div>
                    </div>
                    <button onclick="linkTelegram()" class="btn-outline text-sm px-4 py-2 rounded-lg">
                        <i class="fa-solid fa-link mr-2"></i>ភ្ជាប់
                    </button>
                </div>
                
                <!-- Password -->
                <div class="flex items-center justify-between">
                    <div>
                        <p class="font-medium text-sm">Password</p>
                        <p class="text-xs mt-1" style="color:var(--muted)">Last changed: Unknown</p>
                    </div>
                    <button onclick="openChangePasswordModal()" class="btn-outline text-sm px-4 py-2 rounded-lg">
                        <i class="fa-solid fa-key mr-2"></i>Change
                    </button>
                </div>
            </div>
        </div>

        <!-- Danger Zone -->
        <div class="rounded-2xl overflow-hidden" style="background:var(--card);border:1px solid var(--danger);border-color:rgba(239,68,68,0.3)">
            <div class="p-5" style="border-bottom:1px solid rgba(239,68,68,0.2)">
                <h3 class="font-bold" style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation mr-2"></i>Danger Zone</h3>
            </div>
            <div class="p-5">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="font-medium text-sm">Sign Out</p>
                        <p class="text-xs mt-1" style="color:var(--muted)">Sign out of your account on this device</p>
                    </div>
                    <button onclick="logout()" class="px-4 py-2 rounded-lg text-sm font-medium" style="background:rgba(239,68,68,0.1);color:var(--danger);border:1px solid rgba(239,68,68,0.3)">
                        <i class="fa-solid fa-right-from-bracket mr-2"></i>Sign Out
                    </button>
                </div>
            </div>
        </div>
    </section>
    `;
}

// ══════════════════════════════════════════════════════
// Profile Edit Functions
// ══════════════════════════════════════════════════════

async function handleUpdateProfile(e) {
    e.preventDefault();
    const name = document.getElementById('profile-edit-name').value.trim();
    const phone = document.getElementById('profile-edit-phone').value.trim();

    if (!name) {
        toast('Name is required', 'warning');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner mx-auto" style="width:18px;height:18px;border-width:2px;"></div>';

    try {
        const res = await api('PUT', '/api/auth/profile', {
            name: name,
            phone: phone || null
        });
        state.user = res.user;
        saveAuth();
        closeModal('edit-profile-modal');
        toast('Profile updated successfully', 'success');
        render();
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function openChangePasswordModal() {
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-new-password').value = '';
    openModal('change-password-modal');
}

async function handleChangePassword(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;

    if (newPassword.length < 6) {
        toast('New password must be at least 6 characters', 'warning');
        return;
    }

    if (newPassword !== confirmPassword) {
        toast('New passwords do not match', 'error');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner mx-auto" style="width:18px;height:18px;border-width:2px;"></div>';

    try {
        await api('PUT', '/api/auth/change-password', {
            current_password: currentPassword,
            new_password: newPassword,
            confirm_password: confirmPassword
        });
        closeModal('change-password-modal');
        toast('Password changed successfully', 'success');
        document.getElementById('change-password-form').reset();
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
function openEditProfileModal() {
    document.getElementById('profile-edit-name').value = state.user.name || '';
    document.getElementById('profile-edit-email').value = state.user.email || '';
    document.getElementById('profile-edit-phone').value = state.user.phone || '';
    openModal('edit-profile-modal');
}


// ══════════════════════════════════════════════════════
// About Us Page
// ══════════════════════════════════════════════════════
function renderAbout() {
    return `
    <section class="relative" style="min-height:350px;">
        <img src="https://picsum.photos/seed/vee_zee-about-hero/1600/600" alt="" class="absolute inset-0 w-full h-full object-cover">
        <div class="hero-gradient absolute inset-0"></div>
        <div class="relative max-w-7xl mx-auto px-6 py-24 flex flex-col justify-center">
            <h1 class="text-5xl md:text-6xl font-black mb-4" style="font-family:'Outfit'">About <span style="color:var(--accent)">Vee_Zee</span></h1>
            <p class="text-lg max-w-lg" style="color:var(--fg-secondary)">Bringing the authentic taste of Cambodia directly to your doorstep, fast and secure.</p>
        </div>
    </section>

    <section class="max-w-6xl mx-auto px-6 py-16">
        <div class="grid md:grid-cols-2 gap-12 items-center mb-20">
            <div>
                <h2 class="text-3xl font-bold mb-6" style="font-family:'Outfit'">Our Mission</h2>
                <p class="leading-relaxed mb-4" style="color:var(--fg-secondary)">Founded in Phnom Penh, vee_zee was created with a simple goal: to connect hungry customers with the best local restaurants seamlessly.</p>
                <p class="leading-relaxed" style="color:var(--fg-secondary)">We believe that ordering food should be as enjoyable as eating it. That's why we've built a platform that is fast, reliable, and supports local businesses.</p>
            </div>
            <div class="rounded-2xl overflow-hidden" style="border:1px solid var(--border)">
                <img src="https://picsum.photos/seed/vee_zee-mission/600/400" class="w-full h-full object-cover" alt="Our Mission">
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-20">
            <div class="p-6 rounded-2xl text-center" style="background:var(--card);border:1px solid var(--border)">
                <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl" style="background:rgba(232,119,46,0.15);color:var(--accent)"><i class="fa-solid fa-bolt"></i></div>
                <h3 class="font-bold text-lg mb-2">Fast Delivery</h3>
                <p class="text-sm" style="color:var(--muted)">Average delivery time under 30 minutes within Phnom Penh.</p>
            </div>
            <div class="p-6 rounded-2xl text-center" style="background:var(--card);border:1px solid var(--border)">
                <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl" style="background:rgba(52,211,153,0.15);color:var(--success)"><i class="fa-solid fa-leaf"></i></div>
                <h3 class="font-bold text-lg mb-2">Fresh Ingredients</h3>
                <p class="text-sm" style="color:var(--muted)">We partner with restaurants that prioritize quality and freshness.</p>
            </div>
            <div class="p-6 rounded-2xl text-center" style="background:var(--card);border:1px solid var(--border)">
                <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl" style="background:rgba(96,165,250,0.15);color:var(--info)"><i class="fa-solid fa-shield-halved"></i></div>
                <h3 class="font-bold text-lg mb-2">Secure Payments</h3>
                <p class="text-sm" style="color:var(--muted)">Pay safely with Bakong QR or other secure banking methods.</p>
            </div>
        </div>

        <div class="text-center py-16 rounded-2xl" style="background:var(--card);border:1px solid var(--border)">
            <h2 class="text-3xl font-bold mb-4" style="font-family:'Outfit'">Want to partner with us?</h2>
            <p class="mb-8 max-w-lg mx-auto" style="color:var(--fg-secondary)">Join our growing network of restaurants and reach thousands of hungry customers across Phnom Penh.</p>
            <a href="mailto:hello@vee_zee.com" class="btn-accent px-8 py-3 rounded-xl text-base inline-block" style="text-decoration:none;">
                <i class="fa-solid fa-envelope mr-2"></i>Contact Us
            </a>
        </div>
    </section>
    `;
}

// ══════════════════════════════════════════════════════
// Menu Page
// ══════════════════════════════════════════════════════
function renderMenu() {
    const items = state.filteredItems.length ? state.filteredItems : state.menuItems;
    const catPills = state.categories.map(c => `
        <button class="cat-pill ${state.selectedCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
            <i class="fa-solid fa-${c.icon || 'utensils'} mr-2"></i>${c.name}
        </button>
    `).join('');

    const foodCards = items.length ? items.map((item, i) => `
        <div class="food-card fade-in" style="animation-delay:${i * 0.05}s">
            <div class="relative overflow-hidden">
                <img src="${item.image_url || 'https://picsum.photos/seed/food-default/400/300'}" alt="${item.name}" class="food-card-img" loading="lazy"
                     onerror="this.src='https://picsum.photos/seed/fallback${item.id}/400/300'">
                <div class="absolute top-3 left-3">
                    <span class="text-xs font-medium px-2.5 py-1 rounded-full" style="background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);color:var(--fg-secondary)">${item.category_name || ''}</span>
                </div>
            </div>
            <div class="p-5">
                <h4 class="font-bold text-base mb-1">${item.name}</h4>
                <p class="text-sm mb-4" style="color:var(--muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${item.description || 'Delicious dish'}</p>
                <div class="flex items-center justify-between">
                    <span class="text-lg font-bold" style="color:var(--accent)">${formatPrice(item.price)}</span>
                    <button class="btn-accent px-4 py-2 rounded-lg text-sm add-cart-btn" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
                        <i class="fa-solid fa-plus mr-1"></i> Add
                    </button>
                </div>
            </div>
        </div>
    `).join('') : `
        <div class="col-span-full text-center py-20">
            <i class="fa-solid fa-utensils text-4xl mb-4" style="color:var(--muted)"></i>
            <p class="text-lg" style="color:var(--muted)">No items found</p>
        </div>
    `;

    return `
    <section class="relative" style="min-height:380px;">
        <img src="https://picsum.photos/seed/food-hero-vee_zee/1600/600" alt="" class="absolute inset-0 w-full h-full object-cover">
        <div class="hero-gradient absolute inset-0"></div>
        <div class="relative max-w-7xl mx-auto px-6 py-20 flex flex-col justify-center">
            <h1 class="text-5xl md:text-6xl font-black mb-4 leading-tight" style="font-family:'Outfit'">
                Fresh Food,<br><span style="color:var(--accent)">Delivered Fast</span>
            </h1>
            <p class="text-lg max-w-lg mb-8" style="color:var(--fg-secondary)">Order from our curated menu and track your delivery in real-time.</p>
            <div class="relative max-w-md">
                <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2" style="color:var(--muted)"></i>
                <input type="text" id="search-input" class="input-field pl-11 py-3.5" placeholder="Search dishes, cuisines..." value="${state.searchQuery}">
            </div>
        </div>
    </section>

    <section class="max-w-7xl mx-auto px-6 py-12">
        <div class="flex gap-3 overflow-x-auto pb-4 mb-8" style="-ms-overflow-style:none;scrollbar-width:none;">
            <button class="cat-pill ${!state.selectedCategory ? 'active' : ''}" data-cat="all">All Items</button>
            ${catPills}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            ${foodCards}
        </div>
    </section>
    `;
}

// ══════════════════════════════════════════════════════
// Orders Page
// ══════════════════════════════════════════════════════
function renderOrders() {
    if (!state.user) {
        return `
        <div class="max-w-7xl mx-auto px-6 py-20 text-center">
            <i class="fa-solid fa-lock text-4xl mb-4" style="color:var(--muted)"></i>
            <h2 class="text-2xl font-bold mb-2">Sign in to view orders</h2>
            <p class="mb-6" style="color:var(--fg-secondary)">Track your orders and delivery status</p>
            <button onclick="openAuthModal()" class="btn-accent px-6 py-3 rounded-xl">Sign In</button>
        </div>`;
    }

    const cards = state.orders.length ? state.orders.map(o => `
        <div class="fade-in p-5 rounded-2xl cursor-pointer" style="background:var(--card);border:1px solid var(--border);transition:all 0.2s ease;"
             onmouseover="this.style.borderColor='var(--border-light)'" onmouseout="this.style.borderColor='var(--border)'"
             onclick="viewOrderDetail(${o.id})">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <span class="text-sm font-mono" style="color:var(--muted)">#${o.id}</span>
                    <h4 class="font-bold mt-1">${o.item_count} item${o.item_count > 1 ? 's' : ''}</h4>
                </div>
                <span class="badge badge-${o.status}">${statusLabel(o.status)}</span>
            </div>
            <div class="flex justify-between items-center mt-4 pt-3" style="border-top:1px solid var(--border)">
                <span class="text-sm" style="color:var(--muted)">${formatDate(o.created_at)}</span>
                <span class="font-bold" style="color:var(--accent)">${formatPrice(o.total_amount)}</span>
            </div>
        </div>
    `).join('') : `
        <div class="col-span-full text-center py-20">
            <i class="fa-solid fa-receipt text-4xl mb-4" style="color:var(--muted)"></i>
            <p class="text-lg mb-2" style="color:var(--muted)">No orders yet</p>
            <p class="text-sm mb-6" style="color:var(--muted)">Your order history will appear here</p>
            <button onclick="navigate('menu')" class="btn-accent px-6 py-3 rounded-xl">Browse Menu</button>
        </div>
    `;

    return `
    <section class="max-w-4xl mx-auto px-6 py-12">
        <h2 class="text-3xl font-bold mb-8" style="font-family:'Outfit'">My Orders</h2>
        <div class="grid gap-4">${cards}</div>
    </section>
    `;
}

// ══════════════════════════════════════════════════════
// Order Detail Page
// ══════════════════════════════════════════════════════
function renderOrderDetail() {
    const o = state.selectedOrder;
    if (!o) return '<div class="max-w-4xl mx-auto px-6 py-20 text-center" style="color:var(--muted)">Order not found</div>';

    const statusSteps = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
    const currentIdx = statusSteps.indexOf(o.status);

    const timeline = o.tracking ? o.tracking.map((t, idx) => {
        const tIdx = statusSteps.indexOf(t.status);
        const dotClass = tIdx < currentIdx ? 'completed' : (tIdx === currentIdx ? 'current' : 'pending');
        const iconMap = {
            pending: 'fa-clock', confirmed: 'fa-check', preparing: 'fa-fire-burner',
            ready: 'fa-box', out_for_delivery: 'fa-motorcycle', delivered: 'fa-circle-check',
            cancelled: 'fa-xmark'
        };
        return `
            <div class="flex gap-4 relative pb-8">
                ${idx < o.tracking.length - 1 ? '<div class="timeline-line"></div>' : ''}
                <div class="timeline-dot ${dotClass}"><i class="fa-solid ${iconMap[t.status] || 'fa-circle'}"></i></div>
                <div class="pt-1">
                    <p class="font-semibold text-sm">${statusLabel(t.status)}</p>
                    <p class="text-sm mt-0.5" style="color:var(--muted)">${t.note || ''}</p>
                    <p class="text-xs mt-1" style="color:var(--muted)">${formatDate(t.timestamp)}</p>
                </div>
            </div>
        `;
    }).join('') : '<p style="color:var(--muted)">No tracking info yet</p>';

    const itemsList = o.items ? o.items.map(i => `
        <div class="flex items-center gap-4 py-3" style="border-bottom:1px solid var(--border)">
            <img src="${i.image_url || 'https://picsum.photos/seed/item' + i.food_item_id + '/80/80'}" class="w-14 h-14 rounded-lg object-cover" onerror="this.src='https://picsum.photos/seed/fb${i.food_item_id}/80/80'">
            <div class="flex-1">
                <p class="font-medium text-sm">${i.name}</p>
                <p class="text-sm" style="color:var(--muted)">x${i.quantity}</p>
            </div>
            <span class="font-semibold text-sm">${formatPrice(i.price * i.quantity)}</span>
        </div>
    `).join('') : '';

    const payBtn = (o.payment && o.payment.status === 'pending' && (o.status === 'pending' || o.status === 'confirmed'))
        ? `<button class="btn-accent px-6 py-3 rounded-xl" onclick="generateQR(${o.id})"><i class="fa-solid fa-qrcode mr-2"></i>Pay with QR</button>` : '';

    return `
    <section class="max-w-4xl mx-auto px-6 py-12 fade-in">
        <button onclick="navigate('orders')" class="btn-ghost text-sm mb-6 flex items-center gap-2">
            <i class="fa-solid fa-arrow-left"></i> Back to Orders
        </button>
        <div class="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
                <span class="text-sm font-mono" style="color:var(--muted)">Order #${o.id}</span>
                <h2 class="text-3xl font-bold mt-1" style="font-family:'Outfit'">Order Details</h2>
            </div>
            <div class="flex items-center gap-3">
                <span class="badge badge-${o.status} text-sm">${statusLabel(o.status)}</span>
                ${payBtn}
            </div>
        </div>

        <div class="grid md:grid-cols-2 gap-8">
            <div class="p-6 rounded-2xl" style="background:var(--card);border:1px solid var(--border)">
                <h3 class="font-bold mb-6"><i class="fa-solid fa-route mr-2" style="color:var(--accent)"></i>Delivery Tracking</h3>
                ${timeline}
            </div>
            <div>
                <div class="p-6 rounded-2xl mb-6" style="background:var(--card);border:1px solid var(--border)">
                    <h3 class="font-bold mb-4"><i class="fa-solid fa-receipt mr-2" style="color:var(--accent)"></i>Items</h3>
                    ${itemsList}
                    <div class="flex justify-between pt-4 mt-2">
                        <span class="font-bold">Total</span>
                        <span class="font-bold text-lg" style="color:var(--accent)">${formatPrice(o.total_amount)}</span>
                    </div>
                </div>
                <div class="p-6 rounded-2xl" style="background:var(--card);border:1px solid var(--border)">
                    <h3 class="font-bold mb-4"><i class="fa-solid fa-circle-info mr-2" style="color:var(--accent)"></i>Info</h3>
                    <div class="space-y-3 text-sm">
                        <div class="flex justify-between"><span style="color:var(--muted)">Address</span><span class="text-right max-w-[200px]">${o.delivery_address}</span></div>
                        <div class="flex justify-between"><span style="color:var(--muted)">Phone</span><span>${o.phone}</span></div>
                        <div class="flex justify-between"><span style="color:var(--muted)">Ordered</span><span>${formatDate(o.created_at)}</span></div>
                        ${o.notes ? `<div class="flex justify-between"><span style="color:var(--muted)">Notes</span><span class="text-right max-w-[200px]">${o.notes}</span></div>` : ''}
                        ${o.payment ? `<div class="flex justify-between"><span style="color:var(--muted)">Payment</span><span class="badge badge-${o.payment.status === 'completed' ? 'delivered' : 'pending'} text-xs">${o.payment.status}</span></div>` : ''}
                    </div>
                </div>
            </div>
        </div>
    </section>
    `;
}

// ══════════════════════════════════════════════════════
// Admin Dashboard
// ══════════════════════════════════════════════════════
function adminLayout(active) {
    return `
    <div class="flex" style="min-height:calc(100vh - 64px);">
        <aside class="admin-sidebar">
            <p class="text-xs font-semibold uppercase tracking-wider mb-4 px-4" style="color:var(--muted)">Admin Panel</p>
            <nav class="flex flex-col gap-1">
                <button class="admin-nav-item ${active === 'dashboard' ? 'active' : ''}" onclick="navigate('admin')">
                    <i class="fa-solid fa-chart-line w-5 text-center"></i> Dashboard
                </button>
                <button class="admin-nav-item ${active === 'menu' ? 'active' : ''}" onclick="navigate('admin-menu')">
                    <i class="fa-solid fa-utensils w-5 text-center"></i> Menu Items
                </button>
                <button class="admin-nav-item ${active === 'orders' ? 'active' : ''}" onclick="navigate('admin-orders')">
                    <i class="fa-solid fa-clipboard-list w-5 text-center"></i> Orders
                </button>
                <div class="my-4 mx-4" style="border-top:1px solid var(--border)"></div>
                <button class="admin-nav-item" onclick="navigate('profile')">
                    <i class="fa-solid fa-user w-5 text-center"></i> Profile
                </button>
                <button class="admin-nav-item" onclick="navigate('menu')">
                    <i class="fa-solid fa-store w-5 text-center"></i> View Store
                </button>
            </nav>
        </aside>
        <div class="flex-1 p-6 md:p-8 overflow-x-hidden pb-24 md:pb-8">
    `;
}

function adminLayoutEnd() { return `</div></div>`; }

function renderAdminDashboard() {
    const d = state.adminDashboard || { total_orders: 0, total_revenue: 0, pending_orders: 0, total_menu_items: 0, recent_orders: [] };
    const recentRows = d.recent_orders.map(o => `
        <tr style="cursor:pointer" onclick="viewAdminOrderDetail(${o.id})">
            <td class="font-mono text-sm">#${o.id}</td>
            <td>${o.user_name}</td>
            <td>${o.item_count || '-'} items</td>
            <td class="font-semibold">${formatPrice(o.total_amount)}</td>
            <td><span class="badge badge-${o.status}">${statusLabel(o.status)}</span></td>
            <td class="text-sm" style="color:var(--muted)">${formatDate(o.created_at)}</td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-center py-8" style="color:var(--muted)">No orders yet</td></tr>';

    return `
    ${adminLayout('dashboard')}
    <div class="fade-in">
        <h2 class="text-2xl font-bold mb-6" style="font-family:'Outfit'">Dashboard</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <div class="stat-card">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:rgba(232,119,46,0.15)"><i class="fa-solid fa-receipt" style="color:var(--accent)"></i></div>
                    <span class="text-sm" style="color:var(--fg-secondary)">Total Orders</span>
                </div>
                <p class="text-3xl font-bold">${d.total_orders}</p>
            </div>
            <div class="stat-card">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:rgba(52,211,153,0.15)"><i class="fa-solid fa-dollar-sign" style="color:var(--success)"></i></div>
                    <span class="text-sm" style="color:var(--fg-secondary)">Revenue</span>
                </div>
                <p class="text-3xl font-bold">${formatPrice(d.total_revenue)}</p>
            </div>
            <div class="stat-card">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:rgba(251,191,36,0.15)"><i class="fa-solid fa-clock" style="color:var(--warning)"></i></div>
                    <span class="text-sm" style="color:var(--fg-secondary)">Active Orders</span>
                </div>
                <p class="text-3xl font-bold">${d.pending_orders}</p>
            </div>
            <div class="stat-card">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:rgba(96,165,250,0.15)"><i class="fa-solid fa-utensils" style="color:var(--info)"></i></div>
                    <span class="text-sm" style="color:var(--fg-secondary)">Menu Items</span>
                </div>
                <p class="text-3xl font-bold">${d.total_menu_items}</p>
            </div>
        </div>
        <div class="rounded-2xl overflow-hidden" style="background:var(--card);border:1px solid var(--border)">
            <div class="p-5 flex justify-between items-center" style="border-bottom:1px solid var(--border)">
                <h3 class="font-bold">Recent Orders</h3>
                <button onclick="navigate('admin-orders')" class="btn-ghost text-sm" style="color:var(--accent)">View All <i class="fa-solid fa-arrow-right ml-1"></i></button>
            </div>
            <div class="overflow-x-auto">
                <table class="data-table">
                    <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>${recentRows}</tbody>
                </table>
            </div>
        </div>
    </div>
    ${adminLayoutEnd()}
    `;
}

// ══════════════════════════════════════════════════════
// Admin Menu Management
// ══════════════════════════════════════════════════════
function renderAdminMenu() {
    const rows = state.adminItems.map(i => `
        <tr>
            <td>
                <div class="flex items-center gap-3">
                    <img src="${i.image_url || ''}" class="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                         onerror="this.src='https://picsum.photos/seed/placeholder${i.id}/80/80'">
                    <div class="min-w-0">
                        <p class="font-medium text-sm truncate" style="color:var(--fg)">${i.name}</p>
                        <p class="text-xs truncate" style="color:var(--muted)">${i.category_name || ''}</p>
                    </div>
                </div>
            </td>
            <td>
                <p class="text-xs truncate max-w-[200px]" style="color:var(--muted)">${i.description || '-'}</p>
            </td>
            <td class="font-semibold" style="color:var(--accent)">${formatPrice(i.price)}</td>
            <td><span class="badge ${i.is_available ? 'badge-delivered' : 'badge-cancelled'}">${i.is_available ? 'Available' : 'Hidden'}</span></td>
            <td>
                <div class="flex gap-1">
                    <button class="btn-ghost text-sm p-2 rounded-lg hover:bg-white/5" onclick="openEditItemModal(${i.id})" title="Edit">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-ghost text-sm p-2 rounded-lg hover:bg-white/5" onclick="toggleItemAvailability(${i.id}, ${!i.is_available})" title="${i.is_available ? 'Hide' : 'Show'}">
                        <i class="fa-solid fa-${i.is_available ? 'eye-slash' : 'eye'}"></i>
                    </button>
                    <button class="btn-ghost text-sm p-2 rounded-lg hover:bg-white/5" style="color:var(--danger)" onclick="confirmDeleteItem(${i.id}, '${i.name.replace(/'/g, "\\'")}')" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="text-center py-8" style="color:var(--muted)">No items</td></tr>';

    return `
    ${adminLayout('menu')}
    <div class="fade-in">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h2 class="text-2xl font-bold" style="font-family:'Outfit'">Menu Management</h2>
            <button class="btn-accent px-4 py-2.5 rounded-xl text-sm" onclick="openAddItemModal()">
                <i class="fa-solid fa-plus mr-2"></i>Add Item
            </button>
        </div>
        <div class="rounded-2xl overflow-hidden" style="background:var(--card);border:1px solid var(--border)">
            <div class="overflow-x-auto">
                <table class="data-table">
                    <thead><tr><th>Item</th><th>Description</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    </div>
    ${adminLayoutEnd()}
    `;
}

// ══════════════════════════════════════════════════════
// Admin Orders Management
// ══════════════════════════════════════════════════════
function renderAdminOrders() {
    const filteredOrders = state.adminOrderStatusFilter === 'all'
        ? state.adminOrders
        : state.adminOrders.filter(o => o.status === state.adminOrderStatusFilter);

    const statusFilters = [
        { value: 'all', label: 'All' },
        { value: 'pending', label: 'Pending' },
        { value: 'confirmed', label: 'Confirmed' },
        { value: 'preparing', label: 'Preparing' },
        { value: 'ready', label: 'Ready' },
        { value: 'out_for_delivery', label: 'Delivering' },
        { value: 'delivered', label: 'Delivered' },
        { value: 'cancelled', label: 'Cancelled' },
    ];

    const filterBtns = statusFilters.map(f => `
        <button class="status-filter-btn ${state.adminOrderStatusFilter === f.value ? 'active' : ''}"
                onclick="filterAdminOrders('${f.value}')">${f.label}</button>
    `).join('');

    const statusOptions = ['pending','confirmed','preparing','ready','out_for_delivery','delivered','cancelled']
        .map(s => `<option value="${s}">${statusLabel(s)}</option>`).join('');

    const rows = filteredOrders.map(o => `
        <tr>
            <td class="font-mono text-sm" style="cursor:pointer;color:var(--accent)" onclick="viewAdminOrderDetail(${o.id})">
                #${o.id} <i class="fa-solid fa-arrow-up-right-from-square text-xs ml-1" style="color:var(--muted)"></i>
            </td>
            <td>
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style="background:var(--card);color:var(--fg-secondary)">
                        ${(o.user_name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p class="font-medium text-sm" style="color:var(--fg)">${o.user_name}</p>
                        <p class="text-xs" style="color:var(--muted)">${o.phone}</p>
                    </div>
                </div>
            </td>
            <td>
                <div class="flex flex-col gap-1">
                    ${o.items ? o.items.slice(0, 2).map(i => `<span class="text-xs" style="color:var(--fg-secondary)">${i.name} x${i.quantity}</span>`).join('') : ''}
                    ${o.items && o.items.length > 2 ? `<span class="text-xs" style="color:var(--muted)">+${o.items.length - 2} more</span>` : ''}
                </div>
            </td>
            <td class="font-semibold">${formatPrice(o.total_amount)}</td>
            <td>
                <select class="input-field py-1.5 px-2 text-xs" style="width:auto;min-width:130px;"
                        onchange="updateOrderStatus(${o.id}, this.value)">
                    ${statusOptions.replace(`value="${o.status}"`, `value="${o.status}" selected`)}
                </select>
            </td>
            <td class="text-sm" style="color:var(--muted)">${formatDate(o.created_at)}</td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-center py-12" style="color:var(--muted)"><i class="fa-solid fa-inbox text-3xl mb-3 block"></i>No orders found</td></tr>';

    return `
    ${adminLayout('orders')}
    <div class="fade-in">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h2 class="text-2xl font-bold" style="font-family:'Outfit'">Order Management</h2>
            <div class="text-sm" style="color:var(--muted)"><span class="font-semibold" style="color:var(--fg)">${filteredOrders.length}</span> orders</div>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-4 mb-6" style="-ms-overflow-style:none;scrollbar-width:none;">
            ${filterBtns}
        </div>
        <div class="rounded-2xl overflow-hidden" style="background:var(--card);border:1px solid var(--border)">
            <div class="overflow-x-auto">
                <table class="data-table">
                    <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>
    </div>
    ${adminLayoutEnd()}
    `;
}

// ══════════════════════════════════════════════════════
// Admin Order Detail Modal Content
// ══════════════════════════════════════════════════════
function renderAdminOrderDetailContent(o) {
    if (!o) return '<p style="color:var(--muted)">Order not found</p>';

    const statusSteps = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
    const currentIdx = statusSteps.indexOf(o.status);

    const timeline = o.tracking ? o.tracking.map((t, idx) => {
        const tIdx = statusSteps.indexOf(t.status);
        const dotClass = tIdx < currentIdx ? 'completed' : (tIdx === currentIdx ? 'current' : 'pending');
        const iconMap = { pending: 'fa-clock', confirmed: 'fa-check', preparing: 'fa-fire-burner', ready: 'fa-box', out_for_delivery: 'fa-motorcycle', delivered: 'fa-circle-check', cancelled: 'fa-xmark' };
        return `
            <div class="flex gap-4 relative pb-6">
                ${idx < o.tracking.length - 1 ? '<div class="timeline-line"></div>' : ''}
                <div class="timeline-dot ${dotClass}"><i class="fa-solid ${iconMap[t.status] || 'fa-circle'}"></i></div>
                <div class="pt-1">
                    <p class="font-semibold text-sm">${statusLabel(t.status)}</p>
                    <p class="text-xs mt-0.5" style="color:var(--muted)">${t.note || ''}</p>
                    <p class="text-xs" style="color:var(--muted)">${formatDate(t.timestamp)}</p>
                </div>
            </div>
        `;
    }).join('') : '<p style="color:var(--muted)">No tracking info</p>';

    const itemsList = o.items ? o.items.map(i => `
        <div class="order-item-card flex items-center gap-4">
            <img src="${i.image_url || 'https://picsum.photos/seed/item' + i.food_item_id + '/80/80'}" class="w-16 h-16 rounded-lg object-cover flex-shrink-0" onerror="this.src='https://picsum.photos/seed/fb${i.food_item_id}/80/80'">
            <div class="flex-1 min-w-0"><p class="font-medium text-sm truncate">${i.name}</p><p class="text-sm" style="color:var(--muted)">${formatPrice(i.price)} each</p></div>
            <div class="text-right flex-shrink-0"><p class="text-xs mb-1" style="color:var(--muted)">x${i.quantity}</p><p class="font-semibold text-sm">${formatPrice(i.price * i.quantity)}</p></div>
        </div>
    `).join('') : '';

    const statusOptions = ['pending','confirmed','preparing','ready','out_for_delivery','delivered','cancelled']
        .map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('');

    return `
        <div class="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4" style="border-bottom:1px solid var(--border)">
            <div>
                <span class="text-sm font-mono" style="color:var(--muted)">Order #${o.id}</span>
                <div class="flex items-center gap-3 mt-2">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold" style="background:var(--accent);color:#fff">${(o.user_name || 'U').charAt(0).toUpperCase()}</div>
                    <div><p class="font-bold">${o.user_name || 'Unknown'}</p><p class="text-sm" style="color:var(--muted)">${o.user_email || ''}</p></div>
                </div>
            </div>
            <div class="text-right">
                <p class="text-2xl font-bold" style="color:var(--accent)">${formatPrice(o.total_amount)}</p>
                <p class="text-sm" style="color:var(--muted)">${formatDate(o.created_at)}</p>
            </div>
        </div>
        <div class="grid md:grid-cols-2 gap-6 mb-6">
            <div>
                                <div>
                    <h4 class="font-bold text-sm mb-3" style="color:var(--fg-secondary)">Payment</h4>
                    ${o.payment ? `
                        <div class="flex items-center justify-between p-3 rounded-lg mb-3" style="background:var(--card)">
                            <span class="badge badge-${o.payment.status === 'completed' ? 'delivered' : 'pending'}">${o.payment.status}</span>
                            <span class="text-sm">${formatPrice(o.payment.amount)}</span>
                        </div>
                        ${o.payment.status === 'pending' ? `
                            <button onclick="adminVerifyPayment(${o.id})" class="btn-accent w-full py-2.5 rounded-xl text-sm">
                                <i class="fa-solid fa-check-circle mr-2"></i>Verify Payment Received
                            </button>
                        ` : ''}
                    ` : '<p style="color:var(--muted)">No payment info</p>'}
                </div>
                <select class="input-field" onchange="updateOrderStatusFromModal(${o.id}, this.value)">${statusOptions}</select>
            </div>
            <div>
                <h4 class="font-bold text-sm mb-3" style="color:var(--fg-secondary)">Payment</h4>
                ${o.payment ? `<div class="flex items-center justify-between p-3 rounded-lg" style="background:var(--card)"><span class="badge badge-${o.payment.status === 'completed' ? 'delivered' : 'pending'}">${o.payment.status}</span><span class="text-sm">${formatPrice(o.payment.amount)}</span></div>` : '<p style="color:var(--muted)">No payment info</p>'}
            </div>
        </div>
        <div class="grid md:grid-cols-2 gap-6">
            <div><h4 class="font-bold text-sm mb-3" style="color:var(--fg-secondary)">Order Items</h4><div class="space-y-3 max-h-[300px] overflow-y-auto">${itemsList}</div></div>
            <div><h4 class="font-bold text-sm mb-3" style="color:var(--fg-secondary)">Tracking</h4><div class="max-h-[300px] overflow-y-auto">${timeline}</div></div>
        </div>
        <div class="grid md:grid-cols-2 gap-4 mt-6 pt-4" style="border-top:1px solid var(--border)">
            <div class="space-y-2 text-sm">
                <div class="flex gap-2"><span style="color:var(--muted);min-width:60px">Address:</span><span>${o.delivery_address}</span></div>
                <div class="flex gap-2"><span style="color:var(--muted);min-width:60px">Phone:</span><span>${o.phone}</span></div>
            </div>
            ${o.notes ? `<div class="text-sm"><div class="flex gap-2"><span style="color:var(--muted);min-width:60px">Notes:</span><span>${o.notes}</span></div></div>` : ''}
        </div>
    `;
}

function attachListeners() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        let debounce;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                state.searchQuery = e.target.value.trim();
                filterMenuItems();
                render();
            }, 300);
        });
    }

    document.querySelectorAll('[data-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.cat;
            state.selectedCategory = cat === 'all' ? null : parseInt(cat);
            filterMenuItems();
            render();
        });
    });

    document.querySelectorAll('.add-cart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToCart(parseInt(btn.dataset.id), btn.dataset.name, parseFloat(btn.dataset.price));
        });
    });

    // Notification link click handler (event delegation)
    document.addEventListener('click', function(e) {
        const notifLink = e.target.closest('[data-notif-link]');
        if (notifLink) {
            e.preventDefault();
            const fn = new Function(notifLink.dataset.notifLink);
            fn();
            closeNotifDropdown();
        }
    });
}

// ══════════════════════════════════════════════════════
// Cart Logic
// ══════════════════════════════════════════════════════
function addToCart(id, name, price) {
    const existing = state.cart.find(i => i.id === id);
    if (existing) existing.quantity++;
    else state.cart.push({ id, name, price, quantity: 1 });
    saveCart();
    renderCartPanel();
    toast(`${name} added to cart`, 'success');
    const badge = document.getElementById('cart-badge');
    badge.classList.remove('badge-bounce');
    void badge.offsetWidth;
    badge.classList.add('badge-bounce');
}

function removeFromCart(id) {
    state.cart = state.cart.filter(i => i.id !== id);
    saveCart();
    renderCartPanel();
}

function updateCartQty(id, delta) {
    const item = state.cart.find(i => i.id === id);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) { removeFromCart(id); return; }
    saveCart();
    renderCartPanel();
}

function getCartTotal() { return state.cart.reduce((s, i) => s + i.price * i.quantity, 0); }

function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    const count = state.cart.reduce((s, i) => s + i.quantity, 0);
    if (count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
}

function renderCartPanel() {
    const container = document.getElementById('cart-items');
    if (!container) return;
    if (!state.cart.length) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center py-12">
                <i class="fa-solid fa-bag-shopping text-4xl mb-4" style="color:var(--muted)"></i>
                <p class="font-medium mb-1" style="color:var(--fg-secondary)">Your cart is empty</p>
                <p class="text-sm" style="color:var(--muted)">Add some delicious items</p>
            </div>
        `;
    } else {
        container.innerHTML = state.cart.map(item => `
            <div class="flex gap-4 mb-4 pb-4" style="border-bottom:1px solid var(--border)">
                <div class="flex-1">
                    <p class="font-medium text-sm">${item.name}</p>
                    <p class="text-sm mt-1" style="color:var(--accent)">${formatPrice(item.price)}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button class="qty-btn" onclick="updateCartQty(${item.id}, -1)"><i class="fa-solid fa-minus" style="font-size:10px"></i></button>
                    <span class="w-8 text-center text-sm font-semibold">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateCartQty(${item.id}, 1)"><i class="fa-solid fa-plus" style="font-size:10px"></i></button>
                </div>
                <button class="btn-ghost text-sm" style="color:var(--danger)" onclick="removeFromCart(${item.id})">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `).join('');
    }
    const total = getCartTotal();
    document.getElementById('cart-subtotal').textContent = formatPrice(total);
    document.getElementById('cart-total').textContent = formatPrice(total);
}

function openCart() {
    if (state.user && state.user.role === 'admin') return; // Don't open cart for admin
    renderCartPanel();
    document.getElementById('cart-panel').classList.add('open');
    document.getElementById('cart-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeCart() {
    document.getElementById('cart-panel').classList.remove('open');
    document.getElementById('cart-overlay').classList.remove('open');
    document.body.style.overflow = '';
}

// ══════════════════════════════════════════════════════
// Auth Logic
// ══════════════════════════════════════════════════════
function openAuthModal() { openModal('auth-modal'); }

function switchAuthTab(tab) {
    state.authMode = tab;
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('register-fields').classList.toggle('hidden', tab !== 'register');
    document.getElementById('register-phone').classList.toggle('hidden', tab !== 'register');
    document.getElementById('auth-title').textContent = tab === 'login' ? 'Sign In' : 'Create Account';
    document.getElementById('auth-submit-btn').textContent = tab === 'login' ? 'Sign In' : 'Create Account';
    const nameField = document.getElementById('reg-name');
    if (tab === 'register') nameField.setAttribute('required', '');
    else nameField.removeAttribute('required');
}

async function handleAuth(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const data = { email: fd.get('email'), password: fd.get('password') };
    if (state.authMode === 'register') {
        const name = fd.get('name');
        if (!name || name.trim() === '') { toast('Please enter your name', 'warning'); return; }
        data.name = name;
        data.phone = fd.get('phone') || null;
    }
    const btn = document.getElementById('auth-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner mx-auto" style="width:18px;height:18px;border-width:2px;"></div>';
    try {
        const res = await api('POST', state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register', data);
        state.user = res.user; state.token = res.token; saveAuth();
        closeModal('auth-modal'); form.reset();
        toast(`Welcome, ${res.user.name}!`, 'success');
        // Navigate to admin dashboard if admin, otherwise menu
        if (res.user.role === 'admin') {
            await navigate('admin');
        } else {
            await navigate('menu');
        }
    } catch (err) {
        toast(err.message || "Authentication failed", 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = state.authMode === 'login' ? 'Sign In' : 'Create Account';
    }
}

function logout() {
    state.user = null;
    state.token = null;
    state.notifications = [];
    state.unreadNotifCount = 0;
    saveAuth();
    saveNotifs();
    stopNotifPolling();
    toast('Signed out', 'info');
    navigate('menu');
}

// ══════════════════════════════════════════════════════
// Checkout & Map Logic
// ══════════════════════════════════════════════════════
function openCheckoutModal() {
    if (!state.user) { closeCart(); openAuthModal(); toast('Please sign in to checkout', 'warning'); return; }
    if (!state.cart.length) { toast('Cart is empty', 'warning'); return; }
    document.getElementById('checkout-total').textContent = formatPrice(getCartTotal());
    document.getElementById('checkout-address').value = '';
    document.getElementById('map-search').value = '';
    openModal('checkout-modal');
    setTimeout(initMap, 200);
}

function initMap() {
    if (map) { setTimeout(() => map.invalidateSize(), 150); return; }
    map = L.map('checkout-map').setView([11.5564, 104.9282], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    map.on('click', function(e) {
        setMapMarker(e.latlng.lat, e.latlng.lng);
        reverseGeocode(e.latlng.lat, e.latlng.lng);
    });
}

function setMapMarker(lat, lon) {
    if (mapMarker) map.removeLayer(mapMarker);
    mapMarker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 16);
}

function reverseGeocode(lat, lon) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
        .then(res => res.json())
        .then(data => { if (data.display_name) document.getElementById('checkout-address').value = data.display_name; })
        .catch(err => console.error("Geocoding error:", err));
}

function debounceSearchLocation() {
    clearTimeout(searchTimeout);
    const query = document.getElementById('map-search').value.trim();
    if (query.length < 3) { document.getElementById('map-search-results').classList.remove('active'); return; }
    searchTimeout = setTimeout(() => searchLocation(query), 800);
}

function searchLocation(query) {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=kh`)
        .then(res => res.json())
        .then(data => {
            const resultsDiv = document.getElementById('map-search-results');
            if (data.length === 0) {
                resultsDiv.innerHTML = '<div class="map-search-item" style="color:var(--muted)">No results found</div>';
            } else {
                resultsDiv.innerHTML = data.slice(0, 5).map(item => `
                    <div class="map-search-item" onclick="selectSearchResult(${item.lat}, ${item.lon}, '${item.display_name.replace(/'/g, "\\'")}')">
                        ${item.display_name}
                    </div>
                `).join('');
            }
            resultsDiv.classList.add('active');
        })
        .catch(err => console.error("Search error:", err));
}

function selectSearchResult(lat, lon, name) {
    setMapMarker(lat, lon);
    document.getElementById('checkout-address').value = name;
    document.getElementById('map-search-results').classList.remove('active');
    document.getElementById('map-search').value = '';
}

// async function handleCheckout(e) {
//     e.preventDefault();
//     const fd = new FormData(e.target);
//     try {
//         const res = await api('POST', '/api/orders', {
//             items: state.cart.map(i => ({ food_item_id: i.id, quantity: i.quantity })),
//             delivery_address: fd.get('address'),
//             phone: fd.get('phone'),
//             notes: fd.get('notes') || null,
//         });
//         state.cart = []; saveCart(); closeCart(); closeModal('checkout-modal'); e.target.reset();
//         toast(`Order #${res.id} placed successfully!`, 'success');
//         state.pendingOrderId = res.id;
//         await generateQR(res.id);
//     } catch (err) { toast(err.message, 'error'); }
// }

async function handleCheckout(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
        // 1. រក្សាទុក Cart ទុកមុននឹងលុប (ប្រសិនបើគាត់បិទ QR វានឹងត្រឡប់មកវិញ)
        state.pendingCart = [...state.cart];
        
        const res = await api('POST', '/api/orders', {
            items: state.cart.map(i => ({ food_item_id: i.id, quantity: i.quantity })),
            delivery_address: fd.get('address'),
            phone: fd.get('phone'),
            notes: fd.get('notes') || null,
        });
        
        // 2. លុប Cart ពីក្តារ តែបន្ទាប់ពីបង្កើត Order ដោយជោគជ័យហើយ
        state.cart = []; 
        saveCart(); 
        closeCart(); 
        closeModal('checkout-modal'); 
        e.target.reset();
        
        toast(`Order #${res.id} placed successfully!`, 'success');
        state.pendingOrderId = res.id;
        await generateQR(res.id);
    } catch (err) { 
        toast(err.message, 'error'); 
    }
}


// ══════════════════════════════════════════════════════
// បោះបង់ការបញ្ជាទិញ និងត្រឡប់ Cart មកវិញ
// ══════════════════════════════════════════════════════
async function cancelPaymentAndClose() {
    // បិទផ្ទាំង QR ទាន់តែមុន
    closeModal('qr-modal');
    
    // ត្រឡប់ Cart មកវិញវិញដោយស្វ័យប្រវត្តិ
    if (state.pendingCart.length > 0) {
        state.cart = [...state.pendingCart];
        saveCart();
        state.pendingCart = [];
        toast("Order cancelled and cart restored.", "info");
    }
    
    // បញ្ជាទៅកាន់ Server ឲ្យដាក់ Order ជា Cancelled
    if (state.pendingOrderId) {
        try {
            await api('POST', `/api/orders/${state.pendingOrderId}/cancel-unpaid`);
        } catch (err) {
            // ប្រសិនបើបោះបង់មិនបាន កុំអោយវាខូច ព្រោយតែទុកវាបាន
            console.log("Cancel order error:", err.message);
        }
        state.pendingOrderId = null;
    }
}


async function generateQR(orderId) {
    state.pendingOrderId = orderId;
    openModal('qr-modal');
    document.getElementById('qr-loading').classList.remove('hidden');
    document.getElementById('qr-content').classList.add('hidden');
    try {
        const res = await api('POST', `/api/payment/generate-qr/${orderId}`);
        document.getElementById('qr-image').src = res.qr_code_path;
        document.getElementById('qr-amount').textContent = formatPrice(res.amount);
        document.getElementById('qr-loading').classList.add('hidden');
        document.getElementById('qr-content').classList.remove('hidden');
    } catch (err) { 
        closeModal('qr-modal'); 
        toast(err.message, 'error'); 
    }
}


function openEditItemModal(itemId) {
    const item = state.adminItems.find(i => i.id === itemId);
    if (!item) return;
    const catOptions = state.adminCategories.map(c => `<option value="${c.id}" ${c.id === item.category_id ? 'selected' : ''}>${c.name}</option>`).join('');
    document.getElementById('edit-item-id').value = item.id;
    document.getElementById('edit-item-name').value = item.name;
    document.getElementById('edit-item-price').value = item.price;
    document.getElementById('edit-item-cat').innerHTML = catOptions;
    document.getElementById('edit-item-img').value = item.image_url || '';
    document.getElementById('edit-item-desc').value = item.description || '';
    document.getElementById('edit-item-available').checked = item.is_available;
    document.getElementById('edit-item-title').textContent = `Edit: ${item.name}`;
    updateEditImagePreview();
    openModal('edit-item-modal');
}

function updateEditImagePreview() {
    const url = document.getElementById('edit-item-img').value.trim();
    const preview = document.getElementById('edit-item-preview');
    const placeholder = document.getElementById('edit-item-placeholder');
    if (url) { preview.src = url; preview.style.display = 'block'; placeholder.style.display = 'none'; }
    else { preview.style.display = 'none'; placeholder.style.display = 'flex'; }
}

async function saveEditItem(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('edit-item-id').value);
    try {
        await api('PUT', `/api/admin/menu/items/${id}`, {
            name: document.getElementById('edit-item-name').value.trim(),
            price: parseFloat(document.getElementById('edit-item-price').value),
            category_id: parseInt(document.getElementById('edit-item-cat').value),
            image_url: document.getElementById('edit-item-img').value.trim() || null,
            description: document.getElementById('edit-item-desc').value.trim() || null,
            is_available: document.getElementById('edit-item-available').checked,
        });
        toast('Item updated successfully', 'success');
        closeModal('edit-item-modal');
        await loadAdminMenu(); render();
    } catch (err) { toast(err.message, 'error'); }
}

function openAddItemModal() {
    const catOptions = state.adminCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    document.getElementById('new-item-name').value = '';
    document.getElementById('new-item-price').value = '';
    document.getElementById('new-item-cat').innerHTML = catOptions;
    document.getElementById('new-item-img').value = '';
    document.getElementById('new-item-desc').value = '';
    document.getElementById('add-item-preview').style.display = 'none';
    document.getElementById('add-item-placeholder').style.display = 'flex';
    openModal('add-item-modal');
}

function updateAddImagePreview() {
    const url = document.getElementById('new-item-img').value.trim();
    const preview = document.getElementById('add-item-preview');
    const placeholder = document.getElementById('add-item-placeholder');
    if (url) { preview.src = url; preview.style.display = 'block'; placeholder.style.display = 'none'; }
    else { preview.style.display = 'none'; placeholder.style.display = 'flex'; }
}

async function addNewItem(e) {
    e.preventDefault();
    const data = {
        name: document.getElementById('new-item-name').value.trim(),
        price: parseFloat(document.getElementById('new-item-price').value),
        category_id: parseInt(document.getElementById('new-item-cat').value),
        image_url: document.getElementById('new-item-img').value.trim() || null,
        description: document.getElementById('new-item-desc').value.trim() || null,
    };
    if (!data.name || isNaN(data.price) || !data.category_id) { toast('Please fill in required fields', 'warning'); return; }
    try {
        await api('POST', '/api/admin/menu/items', data);
        toast('Item added successfully', 'success');
        closeModal('add-item-modal');
        await loadAdminMenu(); render();
    } catch (err) { toast(err.message, 'error'); }
}

function confirmDeleteItem(id, name) {
    document.getElementById('confirm-title').textContent = 'Delete Item?';
    document.getElementById('confirm-message').textContent = `Are you sure you want to delete "${name}"? This action cannot be undone.`;
    document.getElementById('confirm-btn').onclick = () => deleteItem(id);
    document.getElementById('confirm-btn').textContent = 'Delete';
    openModal('confirm-modal');
}

async function deleteItem(id) {
    closeModal('confirm-modal');
    try {
        await api('DELETE', `/api/admin/menu/items/${id}`);
        toast('Item deleted', 'success');
        await loadAdminMenu(); render();
    } catch (err) { toast(err.message, 'error'); }
}

async function toggleItemAvailability(id, available) {
    try {
        await api('PUT', `/api/admin/menu/items/${id}`, { is_available: available });
        toast(available ? 'Item shown on menu' : 'Item hidden', 'info');
        await loadAdminMenu(); render();
    } catch (err) { toast(err.message, 'error'); }
}

// ══════════════════════════════════════════════════════
// Admin Order Detail Modal
// ══════════════════════════════════════════════════════
async function viewAdminOrderDetail(orderId) {
    try {
        const order = await api('GET', `/api/admin/orders/${orderId}`);
        document.getElementById('admin-order-title').textContent = `Order #${orderId}`;
        document.getElementById('admin-order-content').innerHTML = renderAdminOrderDetailContent(order);
        openModal('admin-order-modal');
    } catch (err) { toast(err.message, 'error'); }
}


function filterAdminOrders(status) {
    state.adminOrderStatusFilter = status;
    render();
}

async function updateOrderStatus(orderId, status) {
    try {
        await api('PUT', `/api/admin/orders/${orderId}/status`, { status });
        toast(`Order #${orderId} → ${statusLabel(status)}`, 'success');
        showAdminConfirm(orderId, status);
        if (state.currentView === 'admin-orders') {
            await loadAdminOrders();
            render();
        }
    } catch (err) {
        toast(err.message, 'error');
        if (state.currentView === 'admin-orders') { await loadAdminOrders(); render(); }
    }
}

// ══════════════════════════════════════════════════════
// Admin Payment Verification (ពិតប្រាកដ)
// ══════════════════════════════════════════════════════
async function adminVerifyPayment(orderId) {
    if (!confirm("តើអ្នកបានពិនិត្យ Bakong App របស់អ្នកហើយ និងប្រាកដថាទទួលបានលុយពិតប្រាកដដែរឬទេ?")) {
        return;
    }
    
    try {
        await api('POST', `/api/admin/payments/verify/${orderId}`);
        toast("ទទួលបានបញ្ជាក់ការបង់ប្រាក់ដោយជោគជ័យ!", 'success');
        
        // បិទទម្រង់ និងធ្វើបច្ចុប្បន្នភាពតារាង
        closeModal('admin-order-modal');
        if (state.currentView === 'admin-orders') {
            await loadAdminOrders();
            render();
        } else if (state.currentView === 'admin') {
            await loadAdminDashboard();
            render();
        }
    } catch (err) {
        toast(err.message, 'error');
    }
}

// ══════════════════════════════════════════════════════
// Data Loading
// ══════════════════════════════════════════════════════
function filterMenuItems() {
    let items = [...state.menuItems];
    if (state.selectedCategory) items = items.filter(i => i.category_id === state.selectedCategory);
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        items = items.filter(i => i.name.toLowerCase().includes(q) || (i.description && i.description.toLowerCase().includes(q)) || (i.category_name && i.category_name.toLowerCase().includes(q)));
    }
    state.filteredItems = items;
}

async function loadMenu() {
    try {
        const [cats, items] = await Promise.all([api('GET', '/api/menu/categories'), api('GET', '/api/menu/items')]);
        state.categories = cats; state.menuItems = items; filterMenuItems();
    } catch (err) { toast('Failed to load menu: ' + err.message, 'error'); }
}

async function loadOrders() {
    if (!state.user) return;
    try {
        state.orders = await api('GET', '/api/orders');
        checkForOrderUpdates();
    } catch (err) { toast('Failed to load orders: ' + err.message, 'error'); }
}

async function viewOrderDetail(orderId) {
    try { await loadOrderDetail(orderId); navigate('order-detail'); } catch (err) { toast(err.message, 'error'); }
}

async function loadOrderDetail(orderId) {
    try { state.selectedOrder = await api('GET', `/api/orders/${orderId}`); } catch (err) { toast(err.message, 'error'); }
}

async function loadAdminDashboard() {
    try { state.adminDashboard = await api('GET', '/api/admin/dashboard'); } catch (err) { toast('Failed to load dashboard: ' + err.message, 'error'); }
}

async function loadAdminMenu() {
    try {
        const [cats, items] = await Promise.all([api('GET', '/api/admin/categories'), api('GET', '/api/admin/menu/items')]);
        state.adminCategories = cats; state.adminItems = items;
    } catch (err) { toast('Failed to load admin menu: ' + err.message, 'error'); }
}

async function loadAdminOrders() {
    try {
        state.adminOrders = await api('GET', '/api/admin/orders');
    } catch (err) { toast('Failed to load admin orders: ' + err.message, 'error'); }
}

navigate = async function(view, data = {}) {
    state.currentView = view;
    Object.assign(state, data);

    if (view === 'menu' && !state.menuItems.length) await loadMenu();
    if (view === 'orders') {
        await loadOrders();
        checkForOrderUpdates();
    }
    if (view === 'admin') await loadAdminDashboard();
    if (view === 'admin-menu') await loadAdminMenu();
    if (view === 'admin-orders') await loadAdminOrders();
    if (view === 'profile' && state.user) {
        // Load orders for stats on profile page
        if (!state.user.role || state.user.role !== 'admin') {
            await loadOrders();
        }
    }

    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};


// ══════════════════════════════════════════════════════
// Notification Functions (WebSockets)
// ══════════════════════════════════════════════════════
let ws = null; // រក្សាទុកការតភ្ជាប់ WebSocket

function updateNotifBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    if (state.unreadNotifCount > 0) {
        badge.textContent = state.unreadNotifCount > 9 ? '9+' : state.unreadNotifCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// បើកការតភ្ជាប់ WebSocket ពេលអ្នកប្រើឡូកបាន
function connectWebSocket() {
    if (!state.token || ws) return;

    // ស្វែងរកថាប្រើ wss:// (សុវត្ថិភាព) ឬ ws:// តាមគេហទំពរក្រុមហ្គិន
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/notifications/${state.token}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log ("តភ្ជាប់ WebSocket ដោយជោគជ័យ");
    };

    // នេះជាចំណុចសំខាន់: ពេលមានសារមកពី Server វានឹងដំណើរការអនុគមន៍នេះ
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleLiveNotification(data); // ហៅ function ដើម្បីបង្ហាញ Popup
        } catch (e) {
            console.error("WS Parse Error", e);
        }
    };

    // ប្រសិនបើតភ្ជាប់ត្រូវបានផ្តាច់ (ដូចចិត្តអាក្រក់)
    ws.onclose = () => {
        console.log("WebSocket ត្រូវបានផ្តាច់។ កំពុងភ្ជាប់ម្តងទៀតក្នុង 3 វិនាទី...");
        ws = null;
        // ភ្ជាប់ម្តងទៀតដោយស្វ័យប្រវត្តិ ប្រសិនបើអ្នកប្រើនៅតែអាចប្រើបាន
        if (state.token) {
            setTimeout(connectWebSocket, 3000);
        }
    };

    ws.onerror = (err) => {
        console.error("មានបញ្ហាជាមួយ WebSocket");
        ws.close();
    };
}

// អនុគមន៍ដំណើរការពេលទទួលបានសារភ្លាមៗពី Server
function handleLiveNotification(data) {
    // 1. បន្ថែមចំនួន Notif មិនបានអាន
    state.unreadNotifCount++;
    updateNotifBadge();

    // 2. ដាក់សារថ្មីបញ្ចូលទៅក្នុងបញ្ជីផ្ទាល់ខ្លួន
    state.notifications.unshift({
        id: Date.now(), 
        title: data.title,
        message: data.message,
        type: data.type,
        is_read: false,
        related_id: data.related_id,
        created_at: new Date().toISOString()
    });

    // 3. បង្ហាញ Pop-up លើក្តាររុញ (Banner)
    showNotifBanner(data);

    // 4. ប្រសិនបើ Dropdown កំពុងបើក ឲ្យធ្វើបច្ចុប្បន្នភាពវាផងដែរ
    renderNotifDropdown();
}

// ផ្តាច់ការតភ្ជាប់ពេល User Logout
function disconnectWebSocket() {
    if (ws) {
        ws.onclose = null; // បុកការភ្ជាប់ម្តងទៀតដោយស្វ័យប្រវត្តិ
        ws.close();
        ws = null;
    }
}

// ទាញយកប្រវត្តិ Notif ពី Database (សម្រាប់សារដែលមកពេល User មិននៅក្នុងគេហទំពរ)
async function fetchNotifications() {
    if (!state.token) return;
    try {
        const res = await api('GET', '/api/notifications');
        state.notifications = res.notifications;
        state.unreadNotifCount = res.unread_count;
        updateNotifBadge();
        renderNotifDropdown();
    } catch (err) {}
}
function renderNotifDropdown() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    
    if (!state.notifications.length) {
        list.innerHTML = `<div class="p-8 text-center" style="color:var(--muted)"><i class="fa-solid fa-bell-slash text-2xl mb-2 block"></i><p class="text-sm">មិនមានការជូនដំណឹងនៅឡើយទេ</p></div>`;
        return;
    }
    
    const iconMap = { order: 'fa-receipt', status: 'fa-route', menu: 'fa-utensils', info: 'fa-circle-info' };
    
    list.innerHTML = state.notifications.slice(0, 15).map(n => `
        <div class="notif-item ${!n.is_read ? 'unread' : ''}" onclick="handleNotifClick(${n.id}, '${n.type}', ${n.related_id})">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style="background:${!n.is_read ? 'rgba(232,119,46,0.15)' : 'var(--card)'}">
                <i class="fa-solid ${iconMap[n.type] || 'fa-bell'} text-sm" style="color:${!n.is_read ? 'var(--accent)' : 'var(--muted)'}"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium" style="color:${!n.is_read ? 'var(--fg)' : 'var(--fg-secondary)'}">${n.title}</p>
                <p class="text-xs truncate" style="color:var(--muted)">${n.message}</p>
                <p class="text-xs mt-1" style="color:var(--muted);opacity:0.6">${formatDate(n.created_at)}</p>
            </div>
            ${!n.is_read ? '<div class="w-2 h-2 rounded-full flex-shrink-0 mt-2" style="background:var(--accent)"></div>' : ''}
        </div>
    `).join('');
}



function handleNotifClick(notifId, type, relatedId) {
    closeNotifDropdown();
    
    // ប្រសិនបើគ្មាន ID 关联 (Linked ID)
    if (!relatedId) {
        toast("ការជូនដំណឹងនេះមិនមានទិន្នន័យភ្ជាប់ទេ។", "warning");
        return;
    }

    if (type === 'order' && state.user && state.user.role === 'admin') {
        toast("កំពុងបើកមើលការបញ្ជាទិញ...", "info");
        viewAdminOrderDetail(relatedId);
    } else if (type === 'status') {
        toast("កំពុងដាក់ពាក្យបញ្ជាទិញ...", "info");
        viewOrderDetail(relatedId);
    } else if (type === 'menu') {
        navigate('menu');
    } else {
        toast("មិនស្គាល់ប្រភេទការជូនដំណឹងនេះទេ។", "warning");
    }
}

async function markAllRead() {
    try {
        await api('PUT', '/api/notifications/read-all');
        state.notifications.forEach(n => n.is_read = true);
        state.unreadNotifCount = 0;
        updateNotifBadge();
        renderNotifDropdown();
        toast('បានសម្គាល់ថាអានរួចទាំងអស់ហើយ', 'info');
    } catch (err) {}
}

function toggleNotifDropdown(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    dropdown.classList.toggle('active');
    if (dropdown.classList.contains('active')) {
        fetchNotifications(); // ធ្វើបច្ចុប្បន្នពី Database ពេលបើក Dropdown
    }
}

function closeNotifDropdown() {
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) dropdown.classList.remove('active');
}

function showNotifBanner(data) {
    const banner = document.getElementById('notif-banner');
    const content = document.getElementById('notif-banner-content');
    
    let linkFn = '';
    if (data.type === 'order' && state.user && state.user.role === 'admin') linkFn = `viewAdminOrderDetail(${data.related_id})`;
    else if (data.type === 'status') linkFn = `viewOrderDetail(${data.related_id})`;
    else if (data.type === 'menu') linkFn = `navigate('menu')`;
    
    content.innerHTML = `
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(232,119,46,0.15)">
                <i class="fa-solid fa-bell" style="color:var(--accent)"></i>
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm">${data.title}</p>
                <p class="text-xs" style="color:var(--fg-secondary)">${data.message}</p>
            </div>
            ${linkFn ? `<button onclick="${linkFn}; closeNotifBanner();" class="btn-accent text-xs px-3 py-1.5 rounded-lg flex-shrink-0">មើល</button>` : ''}
        </div>
    `;
    
    banner.classList.add('active');
    setTimeout(() => closeNotifBanner(), 5000); // លាក់ចោលដោយស្វ័យប្រវត្តិក្នុង 5 វិនាទី
}

function closeNotifBanner() {
    const banner = document.getElementById('notif-banner');
    if (banner) banner.classList.remove('active');
}

// ប្តូរពី Polling ទៅ WebSocket
function manageNotifPolling() {
    if (state.user) {
        connectWebSocket();   // តភ្ជាប់ WebSocket
        fetchNotifications(); // ទាញសារចាស់ពី Database ម្តង
    } else {
        disconnectWebSocket(); // ផ្តាច់ពេល Logout
    }
}

function stopNotifPolling() {
    disconnectWebSocket();
}

function addNotification(notif) {
    state.notifications.unshift(notif);
    state.unreadNotifCount++;
    saveNotifs();
    updateNotifBadge();
}

function saveNotifs() {
    localStorage.setItem('ventro_notifs', JSON.stringify(state.notifications));
    localStorage.setItem('ventro_notif_count', state.unreadNotifCount.toString());
}


function stopNotifPolling() {
    if (state.notifPollInterval) {
        clearInterval(state.notifPollInterval);
        state.notifPollInterval = null;
    }
}

function toggleNotifDropdown(e) {
    e.stopPropagation();
    // Implement notification dropdown toggle
}

function closeNotifDropdown() {
    // Implement notification dropdown close
}

function showNotifBanner(data) {
    // Implement notification banner
}

function closeNotifBanner() {
    const banner = document.getElementById('notif-banner');
    if (banner) banner.classList.remove('active');
}

function showAdminConfirm(orderId, status) {
    // Implement admin confirm popup
}

function checkForOrderUpdates() {
    // Implement order update checking
}

// ══════════════════════════════════════════════════════
// Event Listeners
// ══════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeCart();
        closeNotifDropdown();
        closeNotifBanner();
        ['auth-modal', 'qr-modal', 'checkout-modal', 'edit-item-modal', 'add-item-modal', 'confirm-modal', 'admin-order-modal', 'order-success-modal', 'edit-profile-modal', 'change-password-modal'].forEach(id => closeModal(id));
    }
});

document.addEventListener('click', function(e) {
    if (!e.target.closest('#notif-bell-btn') && !e.target.closest('#notif-dropdown')) {
        closeNotifDropdown();
    }
    if (!e.target.closest('#map-search') && !e.target.closest('#map-search-results')) {
        const r = document.getElementById('map-search-results');
        if (r) r.classList.remove('active');
    }
});

// ══════════════════════════════════════════════════════
// INIT - Admin goes to Dashboard, Customer goes to Menu
// ══════════════════════════════════════════════════════

(async function init() {
    // ═══ ស្វែងរកថាតើមកពី Google Login អត់? ═══
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const userStr = urlParams.get('user');
    
    if (token && userStr) {
        try {
            const user = JSON.parse(userStr);
            state.user = user;
            state.token = token;
            saveAuth();
            
            // សម្អាត Token ចេញពី Address Bar មិនឲ្យគេឃើញ (សុវត្ថិភាព)
            window.history.replaceState({}, document.title, window.location.pathname);
            
            toast(`សូមស្វាគមន៍ ${user.name}!`, 'success');
        } catch (e) {
            console.error("Google login error", e);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
    // ═══ ចប់ការត្រួតពិនិត្យ Google Login ═══

    updateCartBadge();
    updateNotifBadge();
    
    if (state.user && state.user.role === 'admin') {
        await navigate('admin');
    } else {
        await navigate('menu');
    }
})();


// ══════════════════════════════════════════════════════
// Google OAuth Login
// ══════════════════════════════════════════════════════
function loginWithGoogle() {
    // ស្ត្រូវទៅកាន់ Backend របស់យើង ដែលនឹងបន្តទៅកាន់ Google បន្ទាប់មក
    window.location.href = '/api/auth/google';
}

// ══════════════════════════════════════════════════════
// Facebook OAuth Login
// ══════════════════════════════════════════════════════
function loginWithFacebook() {
    // ត្រួតពិនិត្យថា SDK បានផ្ទុំហើយអត់
    if (typeof FB === 'undefined') {
        toast("Facebook is loading, please try again in a few seconds.", "warning");
        return;
    }
    
    // បើកផ្ទាំងឡូកិនដោយស្វ័យប្រវត្តិរបស់ Facebook
    FB.login(function(response) {
        if (response.authResponse) {
            // បើស្ថានភាពជោគជ័យ ប្រើ Function ខាងក្រោមនេះដើម្បីផ្ញើទៅ Backend
            sendFbTokenToBackend(response.authResponse.accessToken);
        } else {
            console.log('User cancelled login or did not fully authorize.');
        }
    }, { scope: 'email,public_profile' }); // សុំអាចទាញ Email បាន
}

async function sendFbTokenToBackend(accessToken) {
    try {
        const res = await api('POST', '/api/auth/facebook', {
            access_token: accessToken
        });

        state.user = res.user;
        state.token = res.token;
        saveAuth();
        closeModal('auth-modal');

        toast(`សូមស្វាគមន៍ ${res.user.name}!`, 'success');

        if (res.user.role === 'admin') {
            await navigate('admin');
        } else {
            await navigate('menu');
        }
    } catch (err) {
        toast(err.message, 'error');
    }
}


async function linkTelegram() {
    try {
        const res = await api('GET', '/api/auth/telegram/generate-link');
        if (res.is_linked) {
            toast("គណនី Telegram របស់អ្នកត្រូវបានភ្ជាប់រួចហើយ!", "info");
            return;
        }
        
        // បើក Window ថ្មីទៅកាន់ Telegram Bot
        window.open(res.telegram_link, '_blank');
        
        toast("សូមចុច Start នៅក្នុង Telegram ដើម្បីភ្ជាប់គណនី។", "info");
    } catch (err) {
        toast(err.message, 'error');
    }
}
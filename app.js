/**
 * FinanzasDuo - Estabilidad Máxima Plus
 */
window.resetApp = async () => {
    if (confirm('¿Borrar todo y forzar actualización total?')) {
        localStorage.clear();
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (let reg of regs) await reg.unregister();
        }
        if ('caches' in window) {
            const keys = await caches.keys();
            for (let key of keys) await caches.delete(key);
        }
        location.reload(true);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Estado y Configuración ---
    const expenseCategories = {
        "Gastos casa": ["Hipoteca", "Crédito coche + obra", "Agua", "Electricidad", "Gas", "Telefono/Internet Casa", "Limpieza casa", "IBI"],
        "COMIDA": ["SuperMERCADO"],
        "Ocio": ["Espectáculos", "Restauración", "Regalos", "Bodas y cumpleaños", "Viajes y escapadas"],
        "SEGUROS": ["Seguro salud (Sanitas)", "Seguro hogar", "Seguros vida"],
        "Suscripciones": ["Netflix", "Apple Music", "Apple almacenamiento"],
        "Transporte": ["Gasolina GOLF", "Gasolina TIGUAN", "Seguro GOLF", "Seguro TIGUAN", "ITV GOLF", "ITV TIGUAN", "Parking / Otros"],
        "Mencía": ["Ropa - Accesorios", "Comedor", "Cooperativa Fontán Grupo 4A", "Ludoteca", "Baile", "Inglés", "Pintura", "Piscina"],
        "Gadea": ["Guardería", "Piscina", "Ropa - Accesorios"],
        "AMAZON": ["Compras", "Suscripción Prime", "Otros"],
        "Otros": ["Varios"]
    };

    const incomeCategories = {
        "Ingresos": ["Nómina Javier", "Nómina Teté", "Ventas", "Intereses", "Fondo Emergencias", "Ahorro", "Préstamo", "Otros Ingresos"]
    };

    const categoryHierarchy = { ...expenseCategories, ...incomeCategories };

    const initialState = {
        transactions: [],
        accounts: [
            { id: 'acc1', name: 'Nómina Javier', balance: 0, type: 'Banco', bank: 'BBVA' },
            { id: 'acc2', name: 'Nómina Teté', balance: 0, type: 'Banco', bank: 'BBVA' },
            { id: 'acc3', name: 'Cuenta Ahorro', balance: 0, type: 'Ahorros', bank: 'Openbank' },
            { id: 'acc4', name: 'Fondo Emergencias', balance: 0, type: 'Emergencias', bank: 'MyInvestor' },
            { id: 'acc5', name: 'Préstamo Bankinter', balance: -10981.27, type: 'Préstamo', bank: 'Bankinter', loanTotal: 15000, monthlyFee: 756.66, extraSaving: 500 },
            { id: 'acc6', name: 'Hipoteca', balance: -207763.07, type: 'Préstamo', bank: 'BBVA', loanTotal: 250000, monthlyFee: 985.29, extraSaving: 0 }
        ],
        budgets: Object.keys(expenseCategories).filter(c => !["Otros", "SEGUROS"].includes(c)).map(c => ({ category: c, limit: 0 })),
        syncUrl: ''
    };

    // Carga de Almacenamiento Local
    let store;
    try {
        store = JSON.parse(localStorage.getItem('finanzasDuo_store')) || initialState;
    } catch (e) {
        store = initialState;
    }

    // Validación de seguridad
    if (!store || !Array.isArray(store.transactions)) store = initialState;
    if (!Array.isArray(store.accounts)) store.accounts = initialState.accounts;
    if (!Array.isArray(store.budgets)) store.budgets = initialState.budgets;

    // Variables de Estado Dinámico
    let syncUrl = store.syncUrl || localStorage.getItem('finanzasDuo_syncUrl') || '';
    let selectedMonth = new Date().getMonth();
    let selectedYear = new Date().getFullYear();
    const monthsNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    // --- 2. Utilidades Nucleares (Definidas antes de las Migraciones) ---
    const slug = (str) => String(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]/g, '');

    const updateSyncLED = (status) => {
        const led = document.getElementById('sync-led');
        if (!led) return;
        led.className = 'sync-led ' + (status || '');
        if (!status && syncUrl) led.classList.add('success');
    };

    const pushToCloud = async () => {
        if (!syncUrl) return;
        updateSyncLED('syncing');
        try {
            await fetch(syncUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(store)
            });
            localStorage.setItem('finanzasDuo_lastSync', new Date().toISOString());
            setTimeout(() => updateSyncLED('success'), 500);
        } catch (e) {
            console.error("Sync error", e);
            updateSyncLED('error');
        }
    };

    const saveStore = () => {
        store.syncUrl = syncUrl;
        localStorage.setItem('finanzasDuo_store', JSON.stringify(store));
        if (syncUrl) pushToCloud();
    };

    const getFilteredTx = () => store.transactions.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });

    const isFixed = (cat) => ["Gastos casa", "SEGUROS", "Suscripciones", "Mencía", "Gadea"].includes(cat);

    const getAccountForTx = (tx) => {
        if (tx.mainCategory === 'Ingresos') {
            if (tx.category === 'Fondo Emergencias') return store.accounts.find(a => a.bank === 'MyInvestor');
            if (tx.category === 'Ahorro') return store.accounts.find(a => a.bank === 'Openbank');
            if (tx.category === 'Préstamo') return store.accounts.find(a => a.bank === 'Bankinter');
        }
        return store.accounts.find(a => a.name.includes(tx.user)) || store.accounts[0];
    };

    // --- 3. Procesamiento y Migraciones ---
    // Asegurar presupuestos obligatorios
    store.budgets = store.budgets.filter(b => !["Ingresos", "Otros", "SEGUROS"].includes(b.category));
    Object.keys(expenseCategories).filter(c => !["Otros", "SEGUROS"].includes(c)).forEach(cat => {
        if (!store.budgets.find(b => b.category === cat)) store.budgets.push({ category: cat, limit: 0 });
    });

    // Migración: Asegurar cuenta Bankinter
    if (!store.accounts.find(a => a.name.includes('Bankinter'))) {
        store.accounts.push({ id: 'acc5', name: 'Préstamo Bankinter', balance: -10981.27, type: 'Préstamo', bank: 'Bankinter', loanTotal: 15000, monthlyFee: 756.66, extraSaving: 500 });
        saveStore();
    }
    // Migración: Asegurar cuenta Hipoteca
    const mortgageAcc = store.accounts.find(a => a.name === 'Hipoteca');
    if (!mortgageAcc) {
        store.accounts.push({ id: 'acc6', name: 'Hipoteca', balance: -207763.07, type: 'Préstamo', bank: 'BBVA', loanTotal: 250000, monthlyFee: 985.29, extraSaving: 0 });
        saveStore();
    } else {
        mortgageAcc.monthlyFee = 985.29; // Asegurar cuota fija actualizada
    }

    const fetchFromCloud = async () => {
        if (!syncUrl) return;
        updateSyncLED('syncing');
        try {
            const cacheBuster = syncUrl.includes('?') ? `&t=${Date.now()}` : `?t=${Date.now()}`;
            const resp = await fetch(syncUrl + cacheBuster);
            if (!resp.ok) throw new Error("Network response was not ok");
            const data = await resp.json();
            if (data && data.transactions) {
                if (JSON.stringify(data) !== JSON.stringify(store)) {
                    const currentUrl = syncUrl;
                    store = data;
                    store.syncUrl = currentUrl;
                    saveStore();
                    refreshAll();
                }
                updateSyncLED('success');
            }
        } catch (e) {
            console.error("Fetch error", e);
            updateSyncLED('error');
        }
    };

    // --- Renders ---
    let charts = { category: null, balance: null, type: null };

    const initCharts = () => {
        if (typeof Chart === 'undefined') return;
        const filtered = getFilteredTx();
        const canvases = { cat: document.getElementById('categoryChart'), bal: document.getElementById('balanceChart'), type: document.getElementById('typeChart') };
        if (!canvases.cat || !canvases.bal || !canvases.type) return;

        const expenses = filtered.filter(t => t.amount < 0 && t.mainCategory !== 'Ingresos');
        const mainCats = [...new Set(expenses.map(t => t.mainCategory))];
        const catData = mainCats.map(c => Math.abs(expenses.filter(t => t.mainCategory === c).reduce((s, t) => s + t.amount, 0)));

        if (charts.category) charts.category.destroy();
        charts.category = new Chart(canvases.cat, { type: 'doughnut', data: { labels: mainCats, datasets: [{ data: catData, backgroundColor: ['#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f43f5e'], borderWidth: 0 }] }, options: { cutout: '72%', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#E5E7EB', font: { family: 'Outfit', size: 10 } } } } } });

        const fAmt = Math.abs(expenses.filter(t => isFixed(t.mainCategory)).reduce((s, t) => s + t.amount, 0));
        const vAmt = Math.abs(expenses.filter(t => !isFixed(t.mainCategory)).reduce((s, t) => s + t.amount, 0));
        if (charts.type) charts.type.destroy();
        charts.type = new Chart(canvases.type, { type: 'pie', data: { labels: ['Fijos', 'Variables'], datasets: [{ data: [fAmt, vAmt], backgroundColor: ['#6366f1', '#14b8a6'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#E5E7EB', font: { family: 'Outfit', size: 10 } } } } } });

        const statsDiv = document.getElementById('type-stats');
        if (statsDiv) statsDiv.innerHTML = `<div style="display:flex; justify-content:space-between;"><span>Fijos:</span><span style="color:white; font-weight:600;">${fAmt.toLocaleString('es-ES')}€</span></div><div style="display:flex; justify-content:space-between;"><span>Variables:</span><span style="color:white; font-weight:600;">${vAmt.toLocaleString('es-ES')}€</span></div>`;

        if (charts.balance) charts.balance.destroy();
        charts.balance = new Chart(canvases.bal, { type: 'line', data: { labels: ['S1', 'S2', 'S3', 'S4'], datasets: [{ data: [0, 0, 0, 0], borderColor: '#14b8a6', backgroundColor: 'rgba(20, 184, 166, 0.1)', fill: true, tension: 0.45, borderWidth: 3, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } } });
    };

    const updateDashboard = () => {
        const filtered = getFilteredTx();
        const balEl = document.getElementById('total-balance');
        if (balEl) balEl.innerHTML = `${store.accounts.reduce((s, a) => s + a.balance, 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}<span>€</span>`;

        // Gastos del mes y deudas
        const monthExpensesEl = document.getElementById('dashboard-month-expenses');
        const mortgageEl = document.getElementById('dashboard-mortgage-remaining');
        const loanEl = document.getElementById('dashboard-loan-remaining');

        if (monthExpensesEl) {
            const mExp = Math.abs(filtered.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0));
            monthExpensesEl.textContent = `${mExp.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`;
        }

        const mortgageAcc = store.accounts.find(a => a.name === 'Hipoteca');
        if (mortgageEl && mortgageAcc) {
            mortgageEl.textContent = `${mortgageAcc.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`;
        }

        const loanAcc = store.accounts.find(a => a.name.includes('Bankinter'));
        if (loanEl && loanAcc) {
            loanEl.textContent = `${loanAcc.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`;
        }

        // Actualizar el estado de "Cargando datos..."
        const trendEl = document.querySelector('.balance-card .trend');
        if (trendEl) {
            trendEl.innerHTML = `↑ Balance actualizado`;
            trendEl.style.opacity = "0.7";
        }

        const recent = document.getElementById('recent-transactions-list');
        if (recent) {
            recent.innerHTML = '';
            filtered.slice(-5).reverse().forEach(t => {
                const li = document.createElement('li');
                const mainClass = slug(t.mainCategory);
                const subClass = slug(t.category);
                li.innerHTML = `<div class="icon-circle ${mainClass} ${subClass}"></div><div class="details"><p class="title">${t.title} <span class="user-badge badge-${slug(t.user)}">${t.user}</span></p><p class="category">${t.category} <span>(${isFixed(t.mainCategory) ? 'Fijo' : 'Variable'})</span></p></div><p class="amount ${t.amount < 0 ? 'expense' : 'income'}">${t.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</p>`;
                recent.appendChild(li);
            });
        }
    };

    const renderBudgets = () => {
        const list = document.getElementById('budgets-list');
        if (!list) return;
        list.innerHTML = '';
        const filtered = getFilteredTx();

        store.budgets.forEach(b => {
            const spent = Math.abs(filtered.filter(t => t.mainCategory === b.category && t.amount < 0).reduce((s, t) => s + t.amount, 0));
            const perc = Math.min((spent / b.limit) * 100, 100) || 0;
            const mainClass = slug(b.category);
            const subs = {};
            filtered.filter(t => t.mainCategory === b.category && t.amount < 0).forEach(t => subs[t.category] = (subs[t.category] || 0) + Math.abs(t.amount));

            let subHtml = '', summary = '';
            Object.entries(subs).forEach(([s, a]) => { subHtml += `<div class="sub-budget-item"><span>${s}</span><span>${a.toLocaleString('es-ES')}€</span></div>`; summary += `${s}: ${a.toFixed(0)}€ • `; });

            const card = document.createElement('div');
            card.className = 'card glass budget-card';
            card.innerHTML = `<div class="budget-main"><div class="budget-actions"><button class="budget-action-btn edit-budget">✎</button><button class="budget-action-btn delete-budget delete">✕</button></div><div class="budget-header" style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;"><div class="icon-circle small ${mainClass}"></div><div style="flex:1"><h3>${b.category}</h3><p style="font-size: 0.9rem; opacity: 0.8;">${spent.toLocaleString('es-ES')} / ${b.limit.toLocaleString('es-ES')}€</p></div></div><p class="budget-subs-summary" style="font-size: 0.65rem; color: var(--text-muted); font-style: italic; margin-bottom: 8px;">${summary.slice(0, -3) || 'Sin gastos'}</p><div class="progress-bar"><div class="progress" style="width: ${perc}%; background: ${perc > 90 ? '#ff3d00' : '#14b8a6'}"></div></div><p class="subtext" style="font-size: 0.75rem; margin-top: 8px; opacity: 0.6; text-align: center;">Detalle ↓</p></div><div class="budget-details">${subHtml || '<p class="subtext">Sin gastos.</p>'}</div>`;
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.budget-action-btn')) card.classList.toggle('expanded');
            });
            card.querySelector('.edit-budget').addEventListener('click', (e) => {
                e.stopPropagation(); openBudgetModal(b);
            });
            card.querySelector('.delete-budget').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`¿Eliminar?`)) { store.budgets = store.budgets.filter(x => x !== b); saveStore(); renderBudgets(); }
            });
            list.appendChild(card);
        });
    };

    const renderFullTx = () => {
        const list = document.getElementById('full-transactions-list');
        if (!list) return;
        const filtered = getFilteredTx();
        list.innerHTML = '<ul class="transaction-list"></ul>';
        const ul = list.querySelector('ul');
        filtered.slice().reverse().forEach(t => {
            const li = document.createElement('li');
            li.className = 'transaction-item';
            const mainClass = slug(t.mainCategory);
            const subClass = slug(t.category);
            li.innerHTML = `
                <div class="icon-circle ${mainClass} ${subClass}"></div>
                <div class="details">
                    <p class="title">${t.title} <span class="user-badge badge-${slug(t.user)}">${t.user}</span></p>
                    <p class="category">${t.category} (${isFixed(t.mainCategory) ? 'Fijo' : 'Variable'})</p>
                </div>
                <div class="amount-actions">
                    <p class="amount ${t.amount < 0 ? 'expense' : 'income'}">${t.amount.toLocaleString('es-ES')}€</p>
                    <div class="tx-list-actions">
                        <button class="edit-tx-btn" data-id="${t.id}">✎</button>
                        <button class="delete-tx-btn" data-id="${t.id}">✕</button>
                    </div>
                </div>
            `;
            li.querySelector('.edit-tx-btn').addEventListener('click', () => openTxModal(t));
            li.querySelector('.delete-tx-btn').addEventListener('click', () => deleteTx(t.id));
            ul.appendChild(li);
        });
    };

    const refreshAll = () => {
        try {
            updateDashboard(); initCharts();
            if (document.getElementById('accounts-view')?.classList.contains('active')) {
                const grid = document.getElementById('accounts-grid');
                if (grid) {
                    grid.innerHTML = '';
                    store.accounts.forEach(acc => {
                        const isLoan = acc.type === 'Préstamo';
                        const card = document.createElement('div');
                        card.className = `card glass account-card bank-${slug(acc.bank)} ${isLoan ? 'loan' : ''}`;

                        let loanHtml = '';
                        if (isLoan) {
                            const remaining = Math.abs(acc.balance);
                            const total = acc.loanTotal || remaining;
                            const perc = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
                            const extra = acc.extraSaving || 0;
                            const totalMonthly = (acc.monthlyFee || 0) + extra;
                            const monthsLeft = totalMonthly > 0 ? Math.ceil(remaining / totalMonthly) : 0;

                            const endDate = new Date();
                            endDate.setMonth(endDate.getMonth() + monthsLeft);
                            const dateStr = monthsNames[endDate.getMonth()] + ' ' + endDate.getFullYear();

                            loanHtml = `
                                <div class="loan-stats">
                                    <div class="progress-bar">
                                        <div class="progress" style="width: ${perc}%; background: var(--primary)"></div>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; opacity:0.8; margin-top:5px;">
                                        <span>Progreso: ${perc.toFixed(1)}%</span>
                                        <span>Fin: <strong>${dateStr}</strong></span>
                                    </div>
                                    <div class="loan-input-group">
                                        <label>Ahorro extra variable:</label>
                                        <input type="number" value="${extra}" class="loan-extra-input" data-id="${acc.id}">
                                        <span>€</span>
                                    </div>
                                </div>
                            `;
                        }

                        card.innerHTML = `
                            <div style="display:flex; justify-content:space-between;">
                                <p class="type">${acc.type}</p>
                                <span class="bank-label">${acc.bank}</span>
                            </div>
                            <h3>${acc.name}</h3>
                            <p class="balance">${acc.balance.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</p>
                            ${loanHtml}
                        `;

                        if (isLoan) {
                            const input = card.querySelector('.loan-extra-input');
                            input.addEventListener('change', (e) => {
                                const val = parseFloat(e.target.value) || 0;
                                acc.extraSaving = val;
                                saveStore();
                                refreshAll();
                            });
                        }

                        grid.appendChild(card);
                    });
                }
            }
            if (document.getElementById('budgets-view')?.classList.contains('active')) renderBudgets();
            if (document.getElementById('transactions-view')?.classList.contains('active')) renderFullTx();
        } catch (e) { console.error("Refresh error", e); }
    };

    const swView = (viewId) => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(`${viewId}-view`);
        if (target) {
            target.classList.add('active');
            localStorage.setItem('finanzasDuo_lastView', viewId);
            const title = document.getElementById('view-title');
            if (title) {
                const titles = {
                    'dashboard': 'Dashboard Duo',
                    'accounts': 'Tus Cuentas',
                    'transactions': 'Movimientos',
                    'budgets': 'Presupuestos Mensuales',
                    'sync': 'Nube'
                };
                title.textContent = titles[viewId] || viewId.charAt(0).toUpperCase() + viewId.slice(1);
            }
            document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === viewId));
            refreshAll();
        }
    };

    document.querySelectorAll('.nav-item, .nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view) swView(view);
        });
    });

    const txModal = document.getElementById('transaction-modal');
    const txForm = document.getElementById('transaction-form');
    const mSelect = document.getElementById('main-category-select');
    const sSelect = document.getElementById('sub-category-select');

    const updateS = () => { const m = mSelect.value; const subs = categoryHierarchy[m] || ["Otros"]; sSelect.innerHTML = ''; subs.forEach(s => { const o = document.createElement('option'); o.value = s; o.textContent = s; sSelect.appendChild(o); }); };
    mSelect?.addEventListener('change', updateS);

    const openTxModal = (tx = null, defaultType = 'expense') => {
        if (!mSelect) return;
        const titleEl = document.getElementById('tx-modal-title');

        const updateMainCats = (type) => {
            const cats = type === 'income' ? incomeCategories : expenseCategories;
            mSelect.innerHTML = '';
            Object.keys(cats).forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; mSelect.appendChild(o); });
            mSelect.selectedIndex = 0;
            updateS();
        };

        if (tx) {
            const type = tx.amount < 0 ? 'expense' : 'income';
            titleEl.textContent = type === 'income' ? 'Editar Ingreso' : 'Editar Gasto';
            updateMainCats(type);

            document.getElementById('tx-id').value = tx.id;
            document.getElementById('tx-title').value = tx.title;
            txForm.querySelector('input[name="amount"]').value = Math.abs(tx.amount);
            document.getElementById('tx-date').value = tx.date.split('T')[0];

            txForm.querySelectorAll('input[name="type"]').forEach(i => {
                i.checked = i.value === type;
                i.closest('.toggle-btn').classList.toggle('active', i.value === type);
            });

            txForm.querySelectorAll('input[name="user"]').forEach(i => {
                i.checked = i.value === tx.user;
                i.closest('.toggle-btn').classList.toggle('active', i.value === tx.user);
            });

            mSelect.value = tx.mainCategory;
            updateS();
            sSelect.value = tx.category;
        } else {
            titleEl.textContent = defaultType === 'income' ? 'Nuevo Ingreso' : 'Nuevo Gasto';
            txForm.reset();
            document.getElementById('tx-id').value = '';
            document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];

            updateMainCats(defaultType);
            mSelect.selectedIndex = 0;
            updateS();
            txForm.querySelectorAll('input[name="type"]').forEach(i => {
                const isActive = i.value === defaultType;
                i.checked = isActive;
                i.closest('.toggle-btn').classList.toggle('active', isActive);
            });
        }
        txModal.classList.add('active');
    };

    // Al cambiar el tipo manualmente en el modal, actualizar categorías
    txForm.querySelectorAll('input[name="type"]').forEach(input => {
        input.addEventListener('change', (e) => {
            const type = e.target.value;
            const cats = type === 'income' ? incomeCategories : expenseCategories;
            mSelect.innerHTML = '';
            Object.keys(cats).forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; mSelect.appendChild(o); });
            updateS();
            document.getElementById('tx-modal-title').textContent = type === 'income' ? 'Nuevo Ingreso' : 'Nuevo Gasto';
        });
    });

    const deleteTx = (id) => {
        if (!confirm('¿Seguro que quieres borrar este movimiento? El saldo volverá a la cuenta origen.')) return;
        const tx = store.transactions.find(t => t.id == id);
        if (tx) {
            const account = getAccountForTx(tx);
            if (account) account.balance -= tx.amount;
            store.transactions = store.transactions.filter(t => t.id != id);
            saveStore();
            refreshAll();
        }
    };

    document.getElementById('open-modal-btn')?.addEventListener('click', () => openTxModal(null, 'expense'));
    document.getElementById('open-income-modal-btn')?.addEventListener('click', () => openTxModal(null, 'income'));
    document.getElementById('close-modal-btn')?.addEventListener('click', () => txModal.classList.remove('active'));

    txForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = new FormData(txForm);
        const txId = d.get('id');
        const type = txForm.querySelector('input[name="type"]:checked').value;
        const selectedUser = txForm.querySelector('input[name="user"]:checked').value;
        const amt = parseFloat(d.get('amount'));
        const newAmount = type === 'expense' ? -amt : amt;

        if (txId) {
            const oldTx = store.transactions.find(t => t.id == txId);
            if (oldTx) {
                const oldAccount = getAccountForTx(oldTx);
                if (oldAccount) oldAccount.balance -= oldTx.amount;

                oldTx.title = d.get('title');
                oldTx.amount = newAmount;
                oldTx.mainCategory = d.get('mainCategory');
                oldTx.category = d.get('category');
                oldTx.user = selectedUser;
                oldTx.date = d.get('date');

                const newAccount = getAccountForTx(oldTx);
                if (newAccount) newAccount.balance += newAmount;
            }
        } else {
            const newTx = {
                id: Date.now(),
                title: d.get('title'),
                amount: newAmount,
                mainCategory: d.get('mainCategory'),
                category: d.get('category'),
                user: selectedUser,
                date: d.get('date') || new Date().toISOString()
            };
            store.transactions.push(newTx);
            const account = getAccountForTx(newTx);
            if (account) account.balance += newAmount;
        }

        saveStore(); txModal.classList.remove('active'); txForm.reset(); refreshAll();
    });

    const bgModal = document.getElementById('budget-modal');
    const bgForm = document.getElementById('budget-form');
    const openBudgetModal = (b = null) => {
        const t = document.getElementById('budget-modal-title');
        if (b) { t.textContent = 'Editar'; document.getElementById('budget-original-category').value = b.category; document.getElementById('budget-category-input').value = b.category; document.getElementById('budget-limit-input').value = b.limit; }
        else { t.textContent = 'Nuevo'; bgForm.reset(); document.getElementById('budget-original-category').value = ''; }
        bgModal.classList.add('active');
    };

    bgForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const d = new FormData(bgForm); const or = d.get('originalCategory'); const c = d.get('category'); const l = parseFloat(d.get('limit'));
        if (or) { const b = store.budgets.find(x => x.category === or); if (b) { b.category = c; b.limit = l; } }
        else { store.budgets.push({ category: c, limit: l }); }
        saveStore(); bgModal.classList.remove('active'); refreshAll();
    });

    document.getElementById('add-budget-btn')?.addEventListener('click', () => openBudgetModal());
    document.getElementById('close-budget-modal-btn')?.addEventListener('click', () => bgModal.classList.remove('active'));

    const filter = document.getElementById('month-filter');
    const initFilter = () => {
        if (!filter) return;
        filter.innerHTML = '';

        const startYear = 2026;
        const currentYear = new Date().getFullYear();
        const endYear = currentYear + 1; // Un año de margen a futuro

        for (let y = startYear; y <= endYear; y++) {
            for (let m = 0; m < 12; m++) {
                const o = document.createElement('option');
                o.value = `${y}-${m}`;
                o.textContent = `${monthsNames[m]} ${y}`;
                if (y === selectedYear && (m === selectedMonth || (selectedMonth === null && m === new Date().getMonth()))) o.selected = true;
                filter.appendChild(o);
            }
        }
    };
    filter?.addEventListener('change', (e) => { [selectedYear, selectedMonth] = e.target.value.split('-').map(Number); refreshAll(); });

    document.getElementById('sync-url-input').value = syncUrl;

    document.getElementById('save-sync-btn')?.addEventListener('click', () => {
        syncUrl = document.getElementById('sync-url-input').value.trim();
        store.syncUrl = syncUrl;
        localStorage.setItem('finanzasDuo_syncUrl', syncUrl);
        saveStore();
        alert("URL Guardada");
        if (syncUrl) fetchFromCloud();
    });
    document.getElementById('manual-sync-btn')?.addEventListener('click', fetchFromCloud);
    document.getElementById('initial-push-btn')?.addEventListener('click', pushToCloud);

    try {
        initFilter();
        const lastView = localStorage.getItem('finanzasDuo_lastView') || 'dashboard';
        swView(lastView);
        if (syncUrl) {
            updateSyncLED('success');
            setTimeout(fetchFromCloud, 1000); // Pequeño retardo para asegurar que todo está listo
        } else {
            updateSyncLED(''); // Grey
        }
    } catch (e) {
        console.error("Startup error", e);
    }

    document.querySelectorAll('.toggle-group').forEach(gr => {
        const btns = gr.querySelectorAll('.toggle-btn');
        btns.forEach(b => b.addEventListener('click', () => { btns.forEach(x => x.classList.remove('active')); b.classList.add('active'); const r = b.querySelector('input'); if (r) r.checked = true; }));
    });
});

// --- Pull to Refresh Gesture ---
let touchStartY = 0;
const pullIndicator = document.getElementById('pull-indicator');
const PULL_THRESHOLD = 80;

window.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0) {
        touchStartY = e.touches[0].clientY;
    } else {
        touchStartY = null;
    }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
    if (touchStartY === null || !pullIndicator) return;
    const currentY = e.touches[0].clientY;
    const pullDistance = currentY - touchStartY;

    if (pullDistance > 0 && window.scrollY === 0) {
        const translate = Math.min(pullDistance * 0.5, PULL_THRESHOLD + 20);
        pullIndicator.style.transform = `translateY(${translate}px)`;
        pullIndicator.classList.add('active');

        if (pullDistance > PULL_THRESHOLD) {
            pullIndicator.querySelector('span').textContent = "Soltar para actualizar";
        } else {
            pullIndicator.querySelector('span').textContent = "Arrastra para actualizar";
        }
    }
}, { passive: true });

window.addEventListener('touchend', (e) => {
    if (touchStartY === null || !pullIndicator) return;
    const currentY = e.changedTouches[0].clientY;
    const pullDistance = currentY - touchStartY;

    if (pullDistance > PULL_THRESHOLD && window.scrollY === 0) {
        pullIndicator.querySelector('span').textContent = "Sincronizando...";
        fetchFromCloud().finally(() => {
            setTimeout(() => {
                pullIndicator.style.transform = `translateY(0)`;
                pullIndicator.classList.remove('active');
            }, 500);
        });
    } else {
        pullIndicator.style.transform = `translateY(0)`;
        pullIndicator.classList.remove('active');
    }
    touchStartY = null;
});

// PWA: Registro del Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered'))
            .catch(err => console.log('SW Error', err));
    });
}

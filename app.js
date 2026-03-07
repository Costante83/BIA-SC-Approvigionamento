/**
 * app.js - PROCUREMENT MANAGEMENT SYSTEM
 * ==========================================================
 * Web-app client-side per gestire richieste di approvvigionamento.
 * 
 * Stack:
 * - HTML5, CSS3, JavaScript (vanilla)
 * - localStorage per persistenza
 * 
 * Sezioni:
 * 1. Stato applicazione
 * 2. Utility & helper
 * 3. Storage (localStorage)
 * 4. Creazione richieste
 * 5. Rendering UI
 * 6. Consuntivo richiesta
 * 7. Step & avanzamento
 * 8. (PDF rimosso)
 * 9. Event listeners
 * 10. Inizializzazione
 */

'use strict';

/* ==========================================================
   1) STATO APPLICAZIONE
   ========================================================== */
const state = {
  session: null,           // { user: { id, name, role } }
  requests: [],            // Array di richieste
  selectedRequestId: null, // ID della richiesta aperta
  stepCollapsed: true      // Step compatti di default
};

/* Ruoli */
const ROLE = {
  player: 'player',
  manager: 'manager',
  admin: 'admin'
};

/* Permessi */
const PERM = {
  canManageFlags: (role) => role === ROLE.manager || role === ROLE.admin,
  canDeleteRequest: (role) => role === ROLE.manager || role === ROLE.admin,
  canAcceptAssignment: (role) => role !== 'guest'
};

/* Stato richieste */
const STATUS = {
  open: 'open',          // Creata, non assegnata
  in_progress: 'in_progress', // Assegnata
  closed: 'closed'       // Saldato
};

/* Storage keys */
const STORAGE_REQUESTS = 'bia_procurement_requests_v1';
const STORAGE_SESSION = 'bia_procurement_session_v1';

/* ==========================================================
   2) UTILITY & HELPER
   ========================================================== */

/**
 * Genera un ID univoco
 */
function uid() {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Formatta data in formato italiano
 */
function fmtDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (e) {
    return '-';
  }
}

/**
 * Tronca testo con ellipsis
 */
function ellipsis(text, maxLen = 40) {
  if (!text) return '-';
  if (text.length > maxLen) return text.substring(0, maxLen) + '…';
  return text;
}

/**
 * Calcola statistiche
 */
function calcStats() {
  const stats = {
    open: 0,
    in_progress: 0,
    closed: 0
  };
  
  state.requests.forEach(req => {
    if (req.status === STATUS.open) stats.open++;
    if (req.status === STATUS.in_progress) stats.in_progress++;
    if (req.status === STATUS.closed) stats.closed++;
  });
  
  return stats;
}

/**
 * Determina stato della richiesta
 * open -> in_progress (se assegnata) -> closed (se saldato)
 */
function updateRequestStatus(req) {
  if (req.flags.saldato) {
    req.status = STATUS.closed;
  } else if (req.assignees && req.assignees.length > 0) {
    req.status = STATUS.in_progress;
  } else {
    req.status = STATUS.open;
  }
}

/**
 * Filtra richieste per testo di ricerca
 */
function filterRequests(requests, query) {
  if (!query.trim()) return requests;
  
  const q = query.toLowerCase();
  return requests.filter(req => 
    req.title.toLowerCase().includes(q) ||
    req.createdBy.name.toLowerCase().includes(q) ||
    req.section.toLowerCase().includes(q) ||
    req.status.toLowerCase().includes(q)
  );
}

/* ==========================================================
   3) STORAGE (localStorage)
   ========================================================== */

/**
 * Salva richieste in localStorage
 */
function saveRequests() {
  try {
    localStorage.setItem(STORAGE_REQUESTS, JSON.stringify(state.requests));
  } catch (e) {
    console.error('Storage full o errore:', e);
    alert('Errore nel salvataggio. Spazio localStorage pieno?');
  }
}

/**
 * Carica richieste da localStorage
 */
function loadRequests() {
  try {
    const data = localStorage.getItem(STORAGE_REQUESTS);
    state.requests = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Errore nel caricamento:', e);
    state.requests = [];
  }
}

/**
 * Salva sessione
 */
function saveSession() {
  try {
    localStorage.setItem(STORAGE_SESSION, JSON.stringify(state.session));
  } catch (e) {
    console.error('Errore sessione:', e);
  }
}

/**
 * Carica sessione
 */
function loadSession() {
  try {
    const data = localStorage.getItem(STORAGE_SESSION);
    state.session = data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Errore nel caricamento sessione:', e);
    state.session = null;
  }
}

/**
 * Pulisce sessione
 */
function clearSession() {
  state.session = null;
  try {
    localStorage.removeItem(STORAGE_SESSION);
  } catch (e) {
    console.error('Errore pulizia sessione:', e);
  }
}

/* ==========================================================
   4) CREAZIONE RICHIESTE
   ========================================================== */

/**
 * Crea una nuova richiesta
 */
function createRequest(data) {
  const req = {
    id: uid(),
    title: data.title.trim(),
    desc: data.desc.trim(),
    priority: data.priority,
    dueDate: data.dueDate || null,
    budgetUEC: parseInt(data.budget) || 0,
    section: data.section.trim(),
    
    createdAt: new Date().toISOString(),
    createdBy: {
      id: state.session.user.id,
      name: state.session.user.name
    },
    
    status: STATUS.open,
    assignees: [],
    
    flags: {
      ritirato: false,
      saldato: false
    },

    notes: '',
    attachments: [],
    steps: []
  };
  
  state.requests.push(req);
  saveRequests();
  return req;
}

/**
 * Trova richiesta per ID
 */
function findRequest(id) {
  return state.requests.find(r => r.id === id);
}

/**
 * Elimina richiesta
 */
function deleteRequest(id) {
  state.requests = state.requests.filter(r => r.id !== id);
  saveRequests();
}

/**
 * Aggiorna flag richiesta (ritirato, saldato)
 */
function updateRequestFlag(id, flagName, value) {
  const req = findRequest(id);
  if (!req) return;
  
  if (flagName === 'ritirato') req.flags.ritirato = value;
  if (flagName === 'saldato') req.flags.saldato = value;
  
  updateRequestStatus(req);
  saveRequests();
}

/**
 * Accetta incarico (player accetta di fare la consegna)
 */
function acceptAssignment(requestId, playerName) {
  const req = findRequest(requestId);
  if (!req) return;
  
  // Controlla se già assegnato
  if (req.assignees.some(a => a.name === playerName)) return;
  
  req.assignees.push({
    id: uid(),
    name: playerName,
    acceptedAt: new Date().toISOString()
  });
  
  updateRequestStatus(req);
  saveRequests();
}

/**
 * Rimuove l'assegnazione dell'utente corrente
 */
function unacceptAssignment(requestId, playerName) {
  const req = findRequest(requestId);
  if (!req) return;

  req.assignees = (req.assignees || []).filter(a => a.name !== playerName);
  updateRequestStatus(req);
  saveRequests();
}

/* ==========================================================
   5) RENDERING UI
   ========================================================== */

/**
 * Rendering principale (aggiorna tutto)
 */
function render() {
  const isLoggedIn = !!state.session;
  
  document.getElementById('viewLogin').classList.toggle('hidden', isLoggedIn);
  document.getElementById('viewDashboard').classList.toggle('hidden', !isLoggedIn);
  
  if (isLoggedIn) {
    renderUserChip();
    renderStats();
    renderRequestList();
  }
}

/**
 * Renderizza chip utente in topbar
 */
function renderUserChip() {
  const chip = document.getElementById('userChip');
  const loginBtn = document.getElementById('btnLogin');
  const logoutBtn = document.getElementById('btnLogout');
  
  if (!state.session) {
    chip.classList.add('hidden');
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    return;
  }
  
  const user = state.session.user;
  chip.textContent = `👤 ${user.name} (${user.role})`;
  chip.classList.remove('hidden');
  loginBtn.classList.add('hidden');
  logoutBtn.classList.remove('hidden');
}

/**
 * Renderizza statistiche
 */
function renderStats() {
  const stats = calcStats();
  
  document.getElementById('statOpen').textContent = stats.open;
  document.getElementById('statInProgress').textContent = stats.in_progress;
  document.getElementById('statClosed').textContent = stats.closed;
}

/**
 * Renderizza lista richieste
 */
function renderRequestList() {
  const container = document.getElementById('requestList');
  const searchQuery = document.getElementById('searchInput').value;
  
  let requests = state.requests;
  requests = filterRequests(requests, searchQuery);
  
  // Ordina per data (più recenti prima)
  requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  if (requests.length === 0) {
    container.innerHTML = '<div class="muted small" style="padding: 20px; text-align: center;">Nessuna richiesta. Crea una nuova richiesta per iniziare.</div>';
    return;
  }
  
  container.innerHTML = requests.map(req => `
    <div class="req">
      <div class="req__left">
        <div class="req__title">${req.title}</div>
        <div class="req__meta">
          <span>${req.createdBy.name}</span>
          <span>${req.section || '-'}</span>
          <span>Priorità: ${req.priority}</span>
          <span>${fmtDate(req.dueDate)}</span>
        </div>
      </div>
      
      <div class="req__right">
        <div class="phaseDots">
          ${renderPhaseDots(req)}
        </div>
        
        <button class="btn btn--secondary req__btn" data-open-request="${req.id}">Apri</button>
      </div>
    </div>
  `).join('');
}

/**
 * Renderizza 4 pallini di stato (Assegnato, Consegna, Ritirato, Saldato)
 */
function renderPhaseDots(req) {
  const dots = [];

  // 1. Assegnato (verde se almeno un assignees)
  const assigned = req.assignees && req.assignees.length > 0;
  const assignedNames = assigned ? req.assignees.map(a => a.name).join(', ') : 'Nessuno';
  dots.push(`<div class="phaseDot ${assigned ? 'phaseDot--ok' : ''}" title="Assegnato: ${assigned ? assignedNames : 'No'}"></div>`);

  // 2. Consegna (rosso = nessuno step, giallo = step presenti, verde = almeno un step totale)
  const hasSteps = req.steps && req.steps.length > 0;
  const hasTotalStep = hasSteps && req.steps.some(s => s.fulfillment === 'total');
  let stepClass = '';
  let stepTitle = 'Consegna: nessuno step';

  if (hasTotalStep) {
    stepClass = 'phaseDot--ok';
    stepTitle = 'Consegna: almeno un trasporto totale';
  } else if (hasSteps) {
    stepClass = 'phaseDot--partial';
    stepTitle = 'Consegna: in corso (tutti parziali)';
  }

  dots.push(`<div class="phaseDot ${stepClass}" title="${stepTitle}"></div>`);

  // 3. Ritirato (verde se flags.ritirato = true)
  const ritirato = req.flags.ritirato;
  dots.push(`<div class="phaseDot ${ritirato ? 'phaseDot--ok' : ''}" title="Ritirato: ${ritirato ? 'Sì' : 'No'}"></div>`);

  // 4. Saldato (verde se flags.saldato = true)
  const saldato = req.flags.saldato;
  dots.push(`<div class="phaseDot ${saldato ? 'phaseDot--ok' : ''}" title="Saldato: ${saldato ? 'Sì' : 'No'}"></div>`);

  return dots.join('');
}

function renderConsuntivoPhaseDots(req) {
  // Usa la stessa logica dei pallini della lista
  return renderPhaseDots(req);
}

/* ==========================================================
   6) CONSUNTIVO RICHIESTA
   ========================================================== */

/**
 * Apre modal consuntivo
 */
function openConsuntivo(requestId) {
  const req = findRequest(requestId);
  if (!req) return;
  
  state.selectedRequestId = requestId;
  state.stepCollapsed = true;
  
  renderConsuntivo(req);
  document.getElementById('modalConsuntivo').showModal();
}

/**
 * Chiude modal consuntivo
 */
function closeConsuntivo() {
  state.selectedRequestId = null;
  state.stepCollapsed = true;
  document.getElementById('modalConsuntivo').close();
}

/**
 * Renderizza contenuto consuntivo
 */
function renderConsuntivo(req) {
  // Intestazione
  document.getElementById('consTitle').textContent = req.title;
  document.getElementById('consMeta').innerHTML = `
    Creato da <b>${req.createdBy.name}</b> il <b>${fmtDate(req.createdAt)}</b>
  `;
  
  // Pallini stato
  const phaseDotsContainer = document.getElementById('consPhaseDots');
  if (phaseDotsContainer) {
    phaseDotsContainer.innerHTML = renderConsuntivoPhaseDots(req);
  }
  
  // Pulsante elimina (solo manager/admin)
  const btnDelete = document.getElementById('btnDeleteReq');
  if (PERM.canDeleteRequest(state.session.user.role)) {
    btnDelete.classList.remove('hidden');
  } else {
    btnDelete.classList.add('hidden');
  }
  
  // Dettagli
  document.getElementById('kvTitle').textContent = req.title;
  document.getElementById('kvPriority').textContent = req.priority;
  document.getElementById('kvDue').textContent = fmtDate(req.dueDate);
  document.getElementById('kvBudget').textContent = `${req.budgetUEC.toLocaleString('it-IT')} UEC`;
  document.getElementById('kvSection').textContent = req.section || '-';
  document.getElementById('kvDesc').textContent = req.desc || '(Nessuna descrizione)';
  
  // Status pill
  const statusMap = { open: 'Aperta', in_progress: 'In corso', closed: 'Chiusa' };
  document.getElementById('kvStatus').textContent = statusMap[req.status] || req.status;
  
  // Incarichi
  renderAssignmentBox(req);
  
  // Flag (ritirato, saldato)
  renderFlagsBox(req);
  
  // Note
  const notesField = document.getElementById('reqNotes');
  if (notesField) {
    notesField.value = req.notes || '';
  }
  
  // Step
  renderStepList(req);
}

/**
 * Renderizza box incarichi
 */
function renderAssignmentBox(req) {
  const box = document.getElementById('assignmentBox');
  const canAccept = state.session && PERM.canAcceptAssignment(state.session.user.role);
  const currentUser = state.session?.user?.name;
  const alreadyAssigned = req.assignees && req.assignees.some(a => a.name === currentUser);
  const assignedCount = req.assignees ? req.assignees.length : 0;

  const assigneeList = assignedCount
    ? `<div><b>Incaricati (${assignedCount}):</b><ul class="list">${req.assignees.map(a => `<li>${a.name}</li>`).join('')}</ul></div>`
    : '<div class="muted">Nessun incarico accettato.</div>';

  let actionButton = '';
  if (canAccept) {
    if (alreadyAssigned) {
      actionButton = `<button class="btn btn--secondary" type="button" data-unaccept-assignment="${req.id}">Rinuncia incarico</button>`;
    } else {
      actionButton = `<button class="btn btn--secondary" type="button" data-accept-assignment="${req.id}">Accetta incarico</button>`;
    }
  }

  box.innerHTML = `
    <div>
      ${assigneeList}
      ${actionButton}
    </div>
  `;
}

/**
 * Renderizza flag (ritirato, saldato)
 */
function renderFlagsBox(req) {
  const chkRitirato = document.getElementById('chkRitirato');
  const chkSaldato = document.getElementById('chkSaldato');
  
  const canModify = PERM.canManageFlags(state.session.user.role);
  
  chkRitirato.checked = req.flags.ritirato;
  chkRitirato.disabled = !canModify;
  
  chkSaldato.checked = req.flags.saldato;
  chkSaldato.disabled = !canModify;
}

/* ==========================================================
   7) STEP & AVANZAMENTO
   ========================================================== */

/**
 * Renderizza lista step
 */
function renderStepList(req) {
  const container = document.getElementById('stepList');
  
  if (!req.steps || req.steps.length === 0) {
    container.innerHTML = '<div class="muted small">Nessuno step. Aggiungine uno con il pulsante.</div>';
    return;
  }
  
  container.innerHTML = req.steps.map((step, idx) => renderStep(req, step, idx)).join('');
}

/**
 * Renderizza un singolo step (compatto)
 */
function renderStep(req, step, idx) {
  const fulfill = step.fulfillment === 'total' ? 'Totale' : 'Parziale';
  const cost = (step.scu * step.pricePerSCU).toFixed(2);
  const compenso = (cost * 0.10).toFixed(2);
  const rimborso = (parseFloat(cost) + parseFloat(compenso)).toFixed(2);
  
  return `
    <div class="step step--compact">
      <div class="step__top">
        <div>
          <div class="step__title">${step.name}</div>
          <div class="step__meta">
            SCU: ${step.scu} • Player: ${step.player} • Adempimento: ${fulfill} • Rimborso: ${rimborso} UEC
          </div>
        </div>
        <div class="step__actions">
          <button class="btn btn--secondary" style="padding: 6px 10px; font-size: 12px;"
            data-open-step-detail="${req.id}" data-step-idx="${idx}">Dettagli</button>
          <button class="btn btn--danger" style="padding: 6px 10px; font-size: 12px;"
            data-delete-step="${req.id}" data-step-idx="${idx}">Elimina</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Aggiunge nuovo step
 */
function addStep(requestId) {
  const req = findRequest(requestId);
  if (!req) return;
  
  // Pulisci il form
  document.getElementById('transportForm').reset();
  
  // Mostra/nascondi flag admin
  const isAdmin = state.session && (state.session.user.role === ROLE.admin || state.session.user.role === ROLE.manager);
  document.getElementById('adminFlags').style.display = isAdmin ? 'block' : 'none';
  
  // Apri il modal
  const modal = document.getElementById('modalTransporto');
  modal.showModal();
  
  // Focus sul primo campo
  document.getElementById('transportSCU').focus();
  
  // Salva il requestId per usarlo al submit
  modal.dataset.requestId = requestId;
  modal.dataset.stepIdx = '';  // Empty = creazione nuovo step
}

/**
 * Apri step detail per modifica
 */
function openStepDetail(requestId, stepIdx) {
  const req = findRequest(requestId);
  if (!req || !req.steps[stepIdx]) return;
  
  const step = req.steps[stepIdx];
  
  // Popola il form con i dati dello step
  document.getElementById('transportSCU').value = step.scu;
  document.getElementById('transportPrice').value = step.pricePerSCU;

  // Imposta il radio fra parziale / totale
  const radioPartial = document.getElementById('transportFulfillmentPartial');
  const radioTotal = document.getElementById('transportFulfillmentTotal');
  if (radioPartial && radioTotal) {
    radioPartial.checked = step.fulfillment === 'partial';
    radioTotal.checked = step.fulfillment === 'total';
  }

  document.getElementById('chkTransportScaricato').checked = step.flags?.scaricato || false;
  document.getElementById('chkTransportPagato').checked = step.flags?.pagato || false;
  
  // Calcola gli importi
  updateTransportCalculations();
  
  // Mostra/nascondi flag admin
  const isAdmin = state.session && (state.session.user.role === ROLE.admin || state.session.user.role === ROLE.manager);
  document.getElementById('adminFlags').style.display = isAdmin ? 'block' : 'none';
  
  // Apri il modal
  const modal = document.getElementById('modalTransporto');
  modal.showModal();
  
  // Salva requestId e stepIdx per sapere che è modifica
  modal.dataset.requestId = requestId;
  modal.dataset.stepIdx = stepIdx;
  
  // Focus sul primo campo
  document.getElementById('transportSCU').focus();
}

/**
 * Elimina step
 */
function deleteStep(requestId, stepIdx) {
  const req = findRequest(requestId);
  if (!req || !req.steps[stepIdx]) return;
  
  if (!confirm('Eliminare questo step?')) return;
  
  req.steps.splice(stepIdx, 1);
  saveRequests();
  renderConsuntivo(req);
}


/**
 * Aggiorna adempimento step
 */
function updateStepFulfillment(requestId, stepIdx, value) {
  const req = findRequest(requestId);
  if (!req || !req.steps[stepIdx]) return;
  
  req.steps[stepIdx].fulfillment = value;
  saveRequests();
}

/* ==========================================================
   8) PDF (GENERAZIONE BOLLE)
   ========================================================== */

/**
 * Genera PDF bolla per step
 */
/* ==========================================================
   9) EVENT LISTENERS
   ========================================================== */

/**
 * Login DEMO
 */
document.getElementById('btnDemoLogin').addEventListener('click', function() {
  const nameInput = document.getElementById('demoName');
  const roleSelect = document.getElementById('demoRole');
  
  const name = nameInput.value.trim();
  if (!name) {
    alert('Inserisci un nome.');
    return;
  }
  
  state.session = {
    user: {
      id: uid(),
      name: name,
      role: roleSelect.value
    }
  };
  
  saveSession();
  render();
});

/**
 * Logout
 */
document.getElementById('btnLogout').addEventListener('click', function() {
  if (confirm('Disconnettere?')) {
    clearSession();
    state.selectedRequestId = null;
    render();
    document.getElementById('modalConsuntivo').close();
    document.getElementById('modalRequest').close();
  }
});

/**
 * Apri modal nuova richiesta
 */
document.getElementById('btnNewRequest').addEventListener('click', function() {
  document.getElementById('modalRequest').showModal();
});

/**
 * Chiudi modal nuova richiesta
 */
document.querySelectorAll('[data-close-request]').forEach(btn => {
  btn.addEventListener('click', function() {
    document.getElementById('modalRequest').close();
  });
});

document.getElementById('btnCancelReq').addEventListener('click', function() {
  document.getElementById('modalRequest').close();
});

/**
 * Salva richiesta
 */
document.getElementById('requestForm').addEventListener('submit', function(e) {
  e.preventDefault();
  
  const title = document.getElementById('reqTitle').value.trim();
  if (!title) {
    alert('Titolo obbligatorio.');
    return;
  }
  
  createRequest({
    title: title,
    desc: document.getElementById('reqDesc').value,
    priority: document.getElementById('reqPriority').value,
    dueDate: document.getElementById('reqDue').value,
    budget: document.getElementById('reqBudget').value,
    section: document.getElementById('reqSection').value
  });
  
  // Reset form
  this.reset();
  document.getElementById('modalRequest').close();
  
  // Aggiorna UI
  render();
});

/**
 * Ricerca richieste
 */
document.getElementById('searchInput').addEventListener('input', function() {
  renderRequestList();
});

/**
 * Apri richiesta (consuntivo)
 */
document.addEventListener('click', function(e) {
  if (e.target.hasAttribute('data-open-request')) {
    e.stopPropagation();
    const reqId = e.target.getAttribute('data-open-request');
    openConsuntivo(reqId);
  }
});

/**
 * Chiudi consuntivo
 */
document.querySelectorAll('[data-close-cons]').forEach(btn => {
  btn.addEventListener('click', function() {
    closeConsuntivo();
  });
});

/**
 * Update flag step (scaricato, pagato)
 */
document.addEventListener('change', function(e) {
  if (e.target.hasAttribute('data-flag-step')) {
    const reqId = e.target.getAttribute('data-flag-step');
    const stepIdx = parseInt(e.target.getAttribute('data-step-idx'));
    const flagName = e.target.getAttribute('data-flag-name');
    
    const req = findRequest(reqId);
    if (!req || !req.steps[stepIdx]) return;
    
    if (!req.steps[stepIdx].flags) req.steps[stepIdx].flags = {};
    req.steps[stepIdx].flags[flagName] = e.target.checked;
    
    saveRequests();
    renderConsuntivo(req);
  }
});

/**
 * Apri richiesta (consuntivo)
 */
document.getElementById('btnDeleteReq').addEventListener('click', function() {
  if (!state.selectedRequestId) return;
  
  if (!confirm('Eliminare definitivamente questa richiesta?')) return;
  
  deleteRequest(state.selectedRequestId);
  closeConsuntivo();
  render();
});

/**
 * Update flag (ritirato, saldato)
 */
document.getElementById('chkRitirato').addEventListener('change', function() {
  if (state.selectedRequestId) {
    updateRequestFlag(state.selectedRequestId, 'ritirato', this.checked);
    const req = findRequest(state.selectedRequestId);
    if (req) renderConsuntivo(req);
    render();
  }
});

document.getElementById('chkSaldato').addEventListener('change', function() {
  if (state.selectedRequestId) {
    updateRequestFlag(state.selectedRequestId, 'saldato', this.checked);
    const req = findRequest(state.selectedRequestId);
    if (req) renderConsuntivo(req);
    render();
  }
});

/**
 * Aggiungi step
 */
document.getElementById('btnAddStep').addEventListener('click', function() {
  if (state.selectedRequestId) {
    addStep(state.selectedRequestId);
  }
});

/**
 * Apri dettagli step (per modifica)
 */
document.addEventListener('click', function(e) {
  if (e.target.hasAttribute('data-open-step-detail')) {
    e.stopPropagation();
    const reqId = e.target.getAttribute('data-open-step-detail');
    const stepIdx = parseInt(e.target.getAttribute('data-step-idx'));
    openStepDetail(reqId, stepIdx);
  }
});

/**
 * Elimina step
 */
document.addEventListener('click', function(e) {
  if (e.target.hasAttribute('data-delete-step')) {
    const reqId = e.target.getAttribute('data-delete-step');
    const stepIdx = e.target.getAttribute('data-step-idx');
    deleteStep(reqId, stepIdx);
  }
});

/**
 * Accetta / rinuncia incarico dalla vista consuntivo
 */
document.addEventListener('click', function(e) {
  if (!state.session || !state.session.user) return;
  const userName = state.session.user.name;

  if (e.target.hasAttribute('data-accept-assignment')) {
    const reqId = e.target.getAttribute('data-accept-assignment');
    acceptAssignment(reqId, userName);
    const req = findRequest(reqId);
    if (req) renderConsuntivo(req);
    render();
    return;
  }

  if (e.target.hasAttribute('data-unaccept-assignment')) {
    const reqId = e.target.getAttribute('data-unaccept-assignment');
    unacceptAssignment(reqId, userName);
    const req = findRequest(reqId);
    if (req) renderConsuntivo(req);
    render();
  }
});

/**
 * Update adempimento step (radio button)
 */
document.addEventListener('change', function(e) {
  if (e.target.hasAttribute('data-fulfillment')) {
    const reqId = e.target.getAttribute('data-fulfillment');
    const stepIdx = e.target.getAttribute('data-step-idx');
    const value = e.target.value;
    
    updateStepFulfillment(reqId, stepIdx, value);
    const req = findRequest(reqId);
    if (req) renderConsuntivo(req);
    render();
  }
});

/**
 * Note consuntivo: salva automaticamente
 */
const reqNotesEl = document.getElementById('reqNotes');
if (reqNotesEl) {
  reqNotesEl.addEventListener('input', function() {
    if (!state.selectedRequestId) return;
    const req = findRequest(state.selectedRequestId);
    if (!req) return;
    req.notes = this.value;
    saveRequests();
  });
}

/**
 * Modal trasporto: calcolo automatico spesa e importo totale
 */
function updateTransportCalculations() {
  const scu = parseFloat(document.getElementById('transportSCU').value) || 0;
  const price = parseFloat(document.getElementById('transportPrice').value) || 0;
  
  const spesaTotal = scu * price;
  const compenso = spesaTotal * 0.10;
  const importoTotal = spesaTotal + compenso;
  
  document.getElementById('transportSpesaTotal').textContent = spesaTotal.toFixed(2) + ' UEC';
  document.getElementById('transportCompenso').textContent = compenso.toFixed(2) + ' UEC';
  document.getElementById('transportImportoTotal').textContent = importoTotal.toFixed(2) + ' UEC';
}

document.getElementById('transportSCU').addEventListener('input', updateTransportCalculations);
document.getElementById('transportPrice').addEventListener('input', updateTransportCalculations);

/**
 * Modal trasporto: chiudi
 */
document.querySelectorAll('[data-close-transport]').forEach(btn => {
  btn.addEventListener('click', function() {
    const modal = document.getElementById('modalTransporto');
    const requestId = modal.dataset.requestId;
    modal.close();
    if (requestId) {
      // Torna al consuntivo della stessa richiesta
      openConsuntivo(requestId);
    }
  });
});

/**
 * Modal trasporto: salva nuovo trasporto O modifica esistente
 */
document.getElementById('transportForm').addEventListener('submit', function(e) {
  e.preventDefault();
  
  const modal = document.getElementById('modalTransporto');
  const requestId = modal.dataset.requestId;
  const stepIdx = modal.dataset.stepIdx;
  
  if (!requestId) return;
  
  const scu = parseFloat(document.getElementById('transportSCU').value);
  const price = parseFloat(document.getElementById('transportPrice').value);
  
  if (isNaN(scu) || isNaN(price)) {
    alert('Compila tutti i campi correttamente.');
    return;
  }
  
  const req = findRequest(requestId);
  if (!req) return;
  
  // Prendi il nome del pilota dalla sessione
  const player = state.session?.user?.name || 'Unknown';
  
  // Flag parziale/totale
  const fulfillmentInput = document.querySelector('input[name="transportFulfillment"]:checked');
  const fulfillment = fulfillmentInput ? fulfillmentInput.value : 'partial';
  
  const flags = {
    scaricato: document.getElementById('chkTransportScaricato').checked,
    pagato: document.getElementById('chkTransportPagato').checked
  };
  
  if (stepIdx === '' || stepIdx === undefined) {
    // CREAZIONE NUOVO STEP
    const step = {
      id: uid(),
      name: `Trasporto ${req.steps.length + 1}`,
      player: player,
      scu: scu,
      pricePerSCU: price,
      fulfillment: fulfillment,
      attachments: [],
      flags: flags
    };
    
    req.steps.push(step);
  } else {
    // MODIFICA STEP ESISTENTE
    const step = req.steps[stepIdx];
    if (step) {
      step.scu = scu;
      step.pricePerSCU = price;
      step.fulfillment = fulfillment;
      step.flags = flags;
    }
  }
  
  saveRequests();
  
  // Chiudi modal e riapri consuntivo della stessa richiesta
  modal.close();
  openConsuntivo(requestId);
});

/* ==========================================================
   10) INIZIALIZZAZIONE
   ========================================================== */

// Carica dati all'avvio
loadSession();
loadRequests();

// Render iniziale
render();

// Se non loggato, mostra login (default)
if (!state.session) {
  document.getElementById('viewLogin').classList.remove('hidden');
  document.getElementById('viewDashboard').classList.add('hidden');
}

'use strict';

const STORAGE_SESSION = 'bia_procurement_session_v1';

function uid() {
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(STORAGE_SESSION);
}

function render(session) {
  const viewLogin = document.getElementById('viewLogin');
  const viewHub = document.getElementById('viewHub');
  const userChip = document.getElementById('userChip');
  const btnLogout = document.getElementById('btnLogout');

  const isLogged = !!session;
  viewLogin.classList.toggle('hidden', isLogged);
  viewHub.classList.toggle('hidden', !isLogged);
  userChip.classList.toggle('hidden', !isLogged);
  btnLogout.classList.toggle('hidden', !isLogged);

  if (isLogged) {
    userChip.textContent = `👤 ${session.user.name} (${session.user.role})`;
  }
}

function init() {
  let session = loadSession();
  render(session);

  document.getElementById('btnDemoLogin').addEventListener('click', function () {
    const name = document.getElementById('demoName').value.trim();
    const role = document.getElementById('demoRole').value;

    if (!name) {
      alert('Inserisci un nome.');
      return;
    }

    session = {
      user: {
        id: uid(),
        name,
        role
      }
    };

    saveSession(session);
    render(session);
  });

  document.getElementById('btnLogout').addEventListener('click', function () {
    if (!confirm('Disconnettere?')) return;
    clearSession();
    render(null);
  });
}

window.addEventListener('DOMContentLoaded', init);

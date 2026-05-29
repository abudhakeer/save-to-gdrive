import './style.css';
import { getAccessToken, invalidateToken } from '../../components/gdrive';

// DOM elements
const statusBadge = document.getElementById('status-badge') as HTMLDivElement;
const panelUnauth = document.getElementById('panel-unauth') as HTMLDivElement;
const panelAuth = document.getElementById('panel-auth') as HTMLDivElement;
const btnLogin = document.getElementById('btn-login') as HTMLButtonElement;
const btnLogout = document.getElementById('btn-logout') as HTMLButtonElement;
const historyList = document.getElementById('history-list') as HTMLDivElement;

let currentToken: string | null = null;
let currentFilter: string = 'all';

/**
 * Renders the list of recently uploaded files from storage.
 */
async function renderHistory(): Promise<void> {
  const data = await chrome.storage.local.get('recent_uploads');
  const uploads = (data.recent_uploads as any[]) || [];

  // Filter uploads based on active category
  let filteredUploads = uploads;
  if (currentFilter === 'image') {
    filteredUploads = uploads.filter(item => {
      const ext = item.name.split('.').pop()?.toLowerCase() || '';
      return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || item.name.toLowerCase().startsWith('file:');
    });
  } else if (currentFilter === 'pdf') {
    filteredUploads = uploads.filter(item => {
      const ext = item.name.split('.').pop()?.toLowerCase() || '';
      return ext === 'pdf';
    });
  }

  if (filteredUploads.length === 0) {
    let emptyMessage = 'No files uploaded yet. Right-click any asset to start saving.';
    if (currentFilter === 'image') {
      emptyMessage = 'No image uploads found.';
    } else if (currentFilter === 'pdf') {
      emptyMessage = 'No PDF uploads found.';
    }
    historyList.innerHTML = `<div class="empty-state">${emptyMessage}</div>`;
    return;
  }

  historyList.innerHTML = filteredUploads
    .map((item: { name: string; date: string; url: string; status?: 'uploading' | 'success' | 'failed' }) => {
      let actionHtml = `<a href="${escapeHtml(item.url)}" target="_blank" class="item-link">View</a>`;
      let statusClass = '';

      if (item.status === 'uploading') {
        actionHtml = `<span class="item-status status-uploading"><span class="pulse-dot"></span>Saving</span>`;
        statusClass = 'state-uploading';
      } else if (item.status === 'failed') {
        actionHtml = `<span class="item-status status-failed">Failed</span>`;
        statusClass = 'state-failed';
      }

      return `
        <div class="history-item ${statusClass}">
          <div class="item-meta">
            <span class="item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
            <span class="item-date">${escapeHtml(item.date)}</span>
          </div>
          <div class="item-action">${actionHtml}</div>
        </div>
      `;
    })
    .join('');
}

/**
 * Escapes unsafe characters for HTML safety.
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Transition UI to authorized state.
 */
function setAuthorizedState(token: string): void {
  currentToken = token;
  statusBadge.textContent = 'connected';
  statusBadge.className = 'badge badge-connected';
  panelUnauth.classList.add('hidden');
  panelAuth.classList.remove('hidden');
  renderHistory();
}

/**
 * Transition UI to unauthorized state.
 */
function setUnauthorizedState(): void {
  currentToken = null;
  statusBadge.textContent = 'disconnected';
  statusBadge.className = 'badge badge-disconnected';
  panelUnauth.classList.remove('hidden');
  panelAuth.classList.add('hidden');
}

/**
 * Initial boot check for silent authorization.
 */
async function initializePopup(): Promise<void> {
  try {
    // Check for cached token silently
    const token = await getAccessToken(false);
    setAuthorizedState(token);
  } catch {
    // If silent acquisition fails, show login panel
    setUnauthorizedState();
  }
}

// Event Listeners
btnLogin.addEventListener('click', async () => {
  try {
    statusBadge.textContent = 'connecting...';
    // Trigger interactive OAuth2 consent screen
    const token = await getAccessToken(true);
    setAuthorizedState(token);
  } catch (error: any) {
    console.error('Google Sign-in failed:', error);
    setUnauthorizedState();
  }
});

btnLogout.addEventListener('click', async () => {
  if (currentToken) {
    try {
      // Invalidate Google OAuth token
      await invalidateToken(currentToken);
      // Remove cached token from identity storage
      await new Promise<void>((resolve) => {
        chrome.identity.clearAllCachedAuthTokens(() => resolve());
      });
      // Clear folder ID cache
      await chrome.storage.local.remove('google_drive_folder_id');
    } catch (e) {
      console.warn('Error clearing cached tokens:', e);
    }
  }
  setUnauthorizedState();
});

// Reactively refresh history list when a file finishes background uploading while the popup is open
chrome.storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
  if (areaName === 'local' && changes.recent_uploads) {
    renderHistory();
  }
});

// Boot popup
document.addEventListener('DOMContentLoaded', () => {
  initializePopup();

  // Bind filter button click events
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      
      // Toggle active classes on segmented buttons
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      target.classList.add('active');
      
      currentFilter = target.getAttribute('data-filter') || 'all';
      renderHistory();
    });
  });
});

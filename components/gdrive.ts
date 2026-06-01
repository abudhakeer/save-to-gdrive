/**
 * Google Drive REST API Client for WXT Browser Extension
 * Handles OAuth2, token lifecycle, folder queries, and direct file uploads.
 */

const DEFAULT_FOLDER_NAME = 'Saved from Browser';
const FOLDER_CACHE_KEY = 'google_drive_folder_id';

export interface UploadProgress {
  fileName: string;
  status: 'starting' | 'uploading' | 'success' | 'error';
  message: string;
}

const CLIENT_ID = '277746463787-7pbq41lkcnmcjb3m9j78od09ul3a2jn0.apps.googleusercontent.com';
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_STORAGE_KEY = 'google_drive_access_token';

/**
 * Retrieves the OAuth2 access token via chrome.identity.launchWebAuthFlow for cross-browser compatibility.
 * @param interactive Whether to show the Google login prompt if not authenticated.
 */
export async function getAccessToken(interactive: boolean = false): Promise<string> {
  // 1. Check local storage for cached token first
  const storage = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  if (storage[TOKEN_STORAGE_KEY]) {
    return storage[TOKEN_STORAGE_KEY] as string;
  }

  // If not interactive and no cached token, fail fast
  if (!interactive) {
    throw new Error('No active sign-in session found. Please sign in.');
  }

  // 2. Launch OAuth web flow
  return new Promise((resolve, reject) => {
    const redirectUri = chrome.identity.getRedirectURL(); // e.g. https://ancmikanfcngodakllchbicmkbgeclbn.chromiumapp.org/
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
      `client_id=${CLIENT_ID}` +
      `&response_type=token` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(SCOPES.join(' '))}`;

    chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    }, (responseUrl) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!responseUrl) {
        return reject(new Error('Sign-in cancelled or failed.'));
      }

      try {
        const url = new URL(responseUrl);
        // Extract the token from the hash fragment
        const hashParams = new URLSearchParams(url.hash.substring(1));
        const token = hashParams.get('access_token');
        if (!token) {
          return reject(new Error('No access token found in response.'));
        }

        // Cache the token in local storage
        chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token }, () => {
          resolve(token);
        });
      } catch (err: any) {
        reject(new Error('Failed to parse authentication response: ' + err.message));
      }
    });
  });
}

/**
 * Invalidates the cached token when a 401 Unauthorized occurs.
 */
export async function invalidateToken(token: string): Promise<void> {
  await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
}

/**
 * Displays a native Chrome browser notification.
 */
export function showNotification(id: string, title: string, message: string): void {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: '/wxt.svg', // Default WXT template icon
    title,
    message,
    silent: false,
  });
}

/**
 * Queries the Google Drive API to find or create the default folder.
 */
async function getOrCreateFolderId(token: string): Promise<string> {
  // Check local cache first
  const cache = await chrome.storage.local.get(FOLDER_CACHE_KEY);
  if (cache[FOLDER_CACHE_KEY]) {
    return cache[FOLDER_CACHE_KEY] as string;
  }

  const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${DEFAULT_FOLDER_NAME}' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;

  let response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    await invalidateToken(token);
    throw new Error('Unauthorized. Token refreshed. Please try again.');
  }

  let data = await response.json();
  if (data.files && data.files.length > 0) {
    const folderId = data.files[0].id;
    await chrome.storage.local.set({ [FOLDER_CACHE_KEY]: folderId });
    return folderId;
  }

  // Create folder if not exists
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: DEFAULT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createResponse.ok) {
    throw new Error('Failed to create target folder in Google Drive.');
  }

  const newFolder = await createResponse.json();
  await chrome.storage.local.set({ [FOLDER_CACHE_KEY]: newFolder.id });
  return newFolder.id;
}

/**
 * Core upload engine. Takes a Blob, uploads it to the target 'Saved from Browser' folder in Google Drive,
 * and updates the cached history and shows notifications.
 */
export async function uploadBlobToDrive(
  blob: Blob,
  fileName: string,
  contentType: string,
  notificationId: string
): Promise<string> {
  try {
    // 1. Get access token
    const token = await getAccessToken(false).catch(async () => {
      return await getAccessToken(true);
    });

    // 2. Resolve folder ID
    const folderId = await getOrCreateFolderId(token);

    // 3. Perform Google Drive Multipart Upload
    const metadata = {
      name: fileName,
      parents: [folderId],
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataPart = JSON.stringify(metadata);

    const reader = new FileReader();
    const uploadPromise = new Promise<string>((resolve, reject) => {
      reader.onload = async () => {
        try {
          const rawData = reader.result as string;
          const body = 
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            metadataPart +
            delimiter +
            `Content-Type: ${contentType}\r\n` +
            'Content-Transfer-Encoding: base64\r\n\r\n' +
            btoa(rawData) +
            closeDelimiter;

          const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
          const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: body,
          });

          if (uploadResponse.status === 401) {
            await invalidateToken(token);
            reject(new Error('Session unauthorized. Please try again.'));
            return;
          }

          if (!uploadResponse.ok) {
            const errBody = await uploadResponse.text();
            reject(new Error(`Google API returned error: ${uploadResponse.status} - ${errBody}`));
            return;
          }

          const uploadData = await uploadResponse.json();
          resolve(uploadData.id || '');
        } catch (e: any) {
          reject(e);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read binary data stream.'));
      reader.readAsBinaryString(blob);
    });

    const fileId = await uploadPromise;

    // Update local storage history status to success
    const historyData = await chrome.storage.local.get('recent_uploads');
    let historyList = (historyData.recent_uploads as any[]) || [];
    historyList = historyList.map((item: any) => {
      if (item.id === notificationId) {
        return {
          ...item,
          status: 'success',
          url: fileId ? `https://drive.google.com/open?id=${fileId}` : 'https://drive.google.com/drive/my-drive',
        };
      }
      return item;
    });
    await chrome.storage.local.set({ recent_uploads: historyList });

    showNotification(notificationId, 'Save Successful', `${fileName} successfully uploaded to Google Drive.`);
    return fileId;
  } catch (error: any) {
    // Update local storage history status to failed
    try {
      const historyData = await chrome.storage.local.get('recent_uploads');
      let historyList = (historyData.recent_uploads as any[]) || [];
      historyList = historyList.map((item: any) => {
        if (item.id === notificationId) {
          return {
            ...item,
            status: 'failed',
          };
        }
        return item;
      });
      await chrome.storage.local.set({ recent_uploads: historyList });
    } catch (e) {
      console.warn('Failed to update upload failure state in storage logs:', e);
    }

    showNotification(notificationId, 'Upload Failed', error.message || 'An unknown error occurred.');
    throw error;
  }
}

/**
 * Downloads a file from a URL as a Blob, then uploads it directly to Google Drive.
 * Passes along browser credentials (cookies) to support session-locked downloads.
 */
export async function downloadAndUploadToDrive(fileUrl: string, customName?: string): Promise<void> {
  const notificationId = `save-${Date.now()}`;
  let tempName = customName || fileUrl.split('/').pop()?.split('?')[0] || 'saved_file';
  
  try {
    // Record initial "uploading" state in local history
    const initialHistoryData = await chrome.storage.local.get('recent_uploads');
    const initialHistoryList = (initialHistoryData.recent_uploads as any[]) || [];
    initialHistoryList.unshift({
      id: notificationId,
      name: tempName,
      status: 'uploading',
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      url: '#',
    });
    await chrome.storage.local.set({ recent_uploads: initialHistoryList.slice(0, 15) });

    showNotification(notificationId, 'Save to Drive', `Starting transfer of ${tempName}...`);

    // Fetch file content in the background (self-healing credentials fallback to bypass CORS wildcards)
    let fileResponse: Response;
    try {
      // Try standard fetch first (required for public resources with wildcard CORS headers like Wikipedia)
      fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new Error('Fallback to credentials needed');
      }
    } catch (e) {
      // Retry with credentials if the standard fetch fails or requires authorization
      fileResponse = await fetch(fileUrl, {
        credentials: 'include',
      });
    }

    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file: ${fileResponse.status} ${fileResponse.statusText}`);
    }

    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
    const blob = await fileResponse.blob();

    // Check size limit (50MB)
    const MAX_SIZE_BYTES = 50 * 1024 * 1024;
    if (blob.size > MAX_SIZE_BYTES) {
      throw new Error('File exceeds the maximum transfer size limit of 50MB.');
    }

    // Try to refine filename if not custom-specified
    if (!customName) {
      const disposition = fileResponse.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          tempName = match[1];
        }
      }
    }

    await uploadBlobToDrive(blob, tempName, contentType, notificationId);
  } catch (error: any) {
    try {
      const historyData = await chrome.storage.local.get('recent_uploads');
      let historyList = (historyData.recent_uploads as any[]) || [];
      historyList = historyList.map((item: any) => {
        if (item.id === notificationId) {
          return { ...item, status: 'failed' };
        }
        return item;
      });
      await chrome.storage.local.set({ recent_uploads: historyList });
    } catch (e) {}
    showNotification(notificationId, 'Upload Failed', error.message || 'An unknown error occurred.');
  }
}

/**
 * Saves a text snippet to Google Drive as a .txt file.
 */
export async function uploadTextSnippetToDrive(text: string, sourceUrl: string): Promise<void> {
  const notificationId = `save-${Date.now()}`;
  const timestamp = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fileName = `Snippet_${Date.now()}.txt`;
  
  try {
    // Record initial "uploading" state in local history
    const initialHistoryData = await chrome.storage.local.get('recent_uploads');
    const initialHistoryList = (initialHistoryData.recent_uploads as any[]) || [];
    initialHistoryList.unshift({
      id: notificationId,
      name: `Snippet (${timestamp})`,
      status: 'uploading',
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      url: '#',
    });
    await chrome.storage.local.set({ recent_uploads: initialHistoryList.slice(0, 15) });

    showNotification(notificationId, 'Clipping Snippet', 'Saving web text snippet to Google Drive...');

    const fileContent = `AirSave Snippet
============================================================
Source URL : ${sourceUrl}
Date Saved : ${timestamp}
============================================================

${text}
`;

    const blob = new Blob([fileContent], { type: 'text/plain' });
    await uploadBlobToDrive(blob, fileName, 'text/plain', notificationId);
  } catch (error: any) {
    try {
      const historyData = await chrome.storage.local.get('recent_uploads');
      let historyList = (historyData.recent_uploads as any[]) || [];
      historyList = historyList.map((item: any) => {
        if (item.id === notificationId) {
          return { ...item, status: 'failed' };
        }
        return item;
      });
      await chrome.storage.local.set({ recent_uploads: historyList });
    } catch (e) {}
    showNotification(notificationId, 'Upload Failed', error.message || 'An unknown error occurred.');
  }
}

/**
 * Saves a screenshot data URL to Google Drive as a PNG.
 */
export async function uploadScreenshotToDrive(dataUrl: string): Promise<void> {
  const notificationId = `save-${Date.now()}`;
  const timestamp = new Date().toISOString().slice(0, 10) + '_' + new Date().toTimeString().slice(0, 5).replace(':', '-');
  const fileName = `Screenshot_${timestamp}.png`;

  try {
    // Record initial "uploading" state in local history
    const initialHistoryData = await chrome.storage.local.get('recent_uploads');
    const initialHistoryList = (initialHistoryData.recent_uploads as any[]) || [];
    initialHistoryList.unshift({
      id: notificationId,
      name: fileName,
      status: 'uploading',
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      url: '#',
    });
    await chrome.storage.local.set({ recent_uploads: initialHistoryList.slice(0, 15) });

    showNotification(notificationId, 'Capturing Screenshot', 'Uploading webpage viewport capture...');

    // Convert data URI to Blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    await uploadBlobToDrive(blob, fileName, 'image/png', notificationId);
  } catch (error: any) {
    try {
      const historyData = await chrome.storage.local.get('recent_uploads');
      let historyList = (historyData.recent_uploads as any[]) || [];
      historyList = historyList.map((item: any) => {
        if (item.id === notificationId) {
          return { ...item, status: 'failed' };
        }
        return item;
      });
      await chrome.storage.local.set({ recent_uploads: historyList });
    } catch (e) {}
    showNotification(notificationId, 'Upload Failed', error.message || 'An unknown error occurred.');
  }
}

export interface UserProfile {
  email: string;
  name: string;
  photoUrl: string;
}

/**
 * Fetches basic user info from Google Drive API to show logged in details.
 */
export async function getUserProfile(token: string): Promise<UserProfile> {
  const url = 'https://www.googleapis.com/drive/v3/about?fields=user';
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      await invalidateToken(token);
    }
    throw new Error('Failed to fetch user profile.');
  }

  const data = await response.json();
  return {
    email: data.user.emailAddress || '',
    name: data.user.displayName || '',
    photoUrl: data.user.photoLink || '',
  };
}

export interface DriveFileItem {
  id: string;
  name: string;
  status: 'success' | 'uploading' | 'failed';
  url: string;
  timestamp: string;
}

/**
 * Fetches the actual files contained within the target folder in Google Drive.
 */
export async function fetchRecentUploads(token: string): Promise<DriveFileItem[]> {
  try {
    const folderId = await getOrCreateFolderId(token);
    const query = `'${folderId}' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,createdTime)&orderBy=createdTime+desc&pageSize=15`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        await invalidateToken(token);
      }
      throw new Error('Failed to fetch files from Google Drive.');
    }

    const data = await response.json();
    const files = data.files || [];
    return files.map((file: any) => ({
      id: file.id,
      name: file.name,
      status: 'success',
      url: file.webViewLink,
      timestamp: new Date(file.createdTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));
  } catch (error) {
    console.error('Error fetching files:', error);
    return [];
  }
}

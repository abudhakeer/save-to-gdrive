import { downloadAndUploadToDrive } from '../components/gdrive';

export default defineBackground(() => {
  // Register context menu items on installation
  chrome.runtime.onInstalled.addListener(() => {
    // 1. Context Menu for Images
    chrome.contextMenus.create({
      id: 'save-image',
      title: 'Save Image to Google Drive',
      contexts: ['image'],
    });

    // 2. Context Menu for Audio Files
    chrome.contextMenus.create({
      id: 'save-audio',
      title: 'Save Audio to Google Drive',
      contexts: ['audio'],
    });

    // 3. Context Menu for Video Files
    chrome.contextMenus.create({
      id: 'save-video',
      title: 'Save Video to Google Drive',
      contexts: ['video'],
    });
  });

  // Listen for context menu click events
  chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
    let targetUrl: string | undefined;

    switch (info.menuItemId) {
      case 'save-image':
        targetUrl = info.srcUrl;
        break;
      case 'save-audio':
      case 'save-video':
        targetUrl = info.srcUrl;
        break;
    }

    if (!targetUrl) {
      console.warn('No target URL resolved from right-click context menu event.');
      return;
    }

    // Ignore internal browser pages (chrome://, about://, etc.)
    if (targetUrl.startsWith('chrome://') || targetUrl.startsWith('chrome-extension://') || targetUrl.startsWith('about:')) {
      console.error('Direct downloads are not supported on internal browser settings pages.');
      return;
    }

    // Trigger direct cloud transfer pipeline asynchronously
    downloadAndUploadToDrive(targetUrl).catch((err) => {
      console.error('Context menu upload handler encountered error:', err);
    });
  });
});

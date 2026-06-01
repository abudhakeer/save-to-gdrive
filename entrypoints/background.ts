import { downloadAndUploadToDrive, uploadTextSnippetToDrive, uploadScreenshotToDrive } from '../components/gdrive';

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

    // 4. Context Menu for Links (PDFs/spreadsheets/zips/documents)
    chrome.contextMenus.create({
      id: 'save-link',
      title: 'Save Linked File to Google Drive',
      contexts: ['link'],
    });

    // 5. Context Menu for Highlighted Text Selection
    chrome.contextMenus.create({
      id: 'save-selection',
      title: 'Save Snippet to Google Drive',
      contexts: ['selection'],
    });

    // 6. Context Menu for Page Viewport Screenshot
    chrome.contextMenus.create({
      id: 'save-screenshot',
      title: 'Save Screenshot to Google Drive',
      contexts: ['page'],
    });
  });

  // Listen for context menu click events
  chrome.contextMenus.onClicked.addListener((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => {
    // Helper to ignore internal browser pages
    const isInternalUrl = (url: string) => 
      url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') || 
      url.startsWith('about:') || 
      url.startsWith('edge://');

    switch (info.menuItemId) {
      case 'save-image':
      case 'save-audio':
      case 'save-video': {
        const targetUrl = info.srcUrl;
        if (!targetUrl || isInternalUrl(targetUrl)) return;
        downloadAndUploadToDrive(targetUrl).catch((err) => {
          console.error('Context menu upload handler encountered error:', err);
        });
        break;
      }
      
      case 'save-link': {
        const targetUrl = info.linkUrl;
        if (!targetUrl || isInternalUrl(targetUrl)) return;
        downloadAndUploadToDrive(targetUrl).catch((err) => {
          console.error('Link context menu upload handler encountered error:', err);
        });
        break;
      }
      
      case 'save-selection': {
        const text = info.selectionText;
        const pageUrl = info.pageUrl || (tab ? tab.url : '');
        if (!text || !pageUrl || isInternalUrl(pageUrl)) return;
        uploadTextSnippetToDrive(text, pageUrl).catch((err) => {
          console.error('Snippet clipper encountered error:', err);
        });
        break;
      }
      
      case 'save-screenshot': {
        if (tab && tab.windowId) {
          // Capture the viewport of the current active tab
          chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) {
              console.error('Screenshot capture failed:', chrome.runtime.lastError?.message);
              return;
            }
            uploadScreenshotToDrive(dataUrl).catch((err) => {
              console.error('Screenshot upload encountered error:', err);
            });
          });
        }
        break;
      }
    }
  });
});

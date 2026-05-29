import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "AirSave",
    description:
      "Save web assets, images, and documents directly to your Google Drive.",
    version: "1.0.0",
    permissions: ["identity", "contextMenus", "storage", "notifications"],
    host_permissions: ["<all_urls>"],
    oauth2: {
      client_id:
        "277746463787-6419q14fi1bfkvsv1cs97mtuh94o51d2.apps.googleusercontent.com",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    },
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "96": "icon/96.png",
      "128": "icon/128.png",
    },
  },
});

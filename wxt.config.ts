import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAue+ZB4XsqdhTKLZSeGPnK6RG0OTYf8B0i+kQfzxERV226ItlUJ/4pA6t12czzk983CDCFbCcrlUFO66yEbadBqXNDMAsSpUtTHl2zQChlaGhDHATvORPK+nYosgE9kOc2PzfRC/007+/Y5FEk6X0OaRuiI85BPrzGJa2vK5eCAWLkuSeOxmbsg+3xR34ROq50A/AARWi7ko4AQlguy3cMSICGFWyRVzVPk5nfeVc62T7R/nIVspHCRPYwQC+82UUhh01lJWT3GkjgvNl5/Ux/eevxvPU4uxrAyYC8LqQB3Wr5cgn+voAY3qlTEFnuzKJmwbWBT0A9Bdhxp8sm5Kx1QIDAQAB",
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

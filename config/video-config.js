const MAX_UPLOAD_SIZE = 300 * 1024 * 1024;
/** JSON enviado ao proxy do Drive (base64 + metadados). Apps Script costuma falhar acima de ~45–50 MB. */
const MAX_DRIVE_PROXY_JSON = 52 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm"
};

module.exports = {
  MAX_UPLOAD_SIZE,
  MAX_DRIVE_PROXY_JSON,
  MIME_TYPES
};

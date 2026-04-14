const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");

const HOST = "0.0.0.0";
const HTTP_PORT = Number(process.env.HTTP_PORT || 8080);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 8443);

const TLS_KEY_PATH = path.join(ROOT_DIR, "certs", "localhost-key.pem");
const TLS_CERT_PATH = path.join(ROOT_DIR, "certs", "localhost.pem");
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");

const MK360_PUBLIC_ORIGIN = String(process.env.MK360_PUBLIC_ORIGIN || "")
  .trim()
  .replace(/\/$/, "");

module.exports = {
  ROOT_DIR,
  HOST,
  HTTP_PORT,
  HTTPS_PORT,
  TLS_KEY_PATH,
  TLS_CERT_PATH,
  UPLOAD_DIR,
  MK360_PUBLIC_ORIGIN
};

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const url = require("url");
const os = require("os");
const crypto = require("crypto");

const HOST = "0.0.0.0";
const HTTP_PORT = Number(process.env.HTTP_PORT || 8080);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 8443);
const MAX_UPLOAD_SIZE = 300 * 1024 * 1024;

const ROOT_DIR = __dirname;
const TLS_KEY_PATH = path.join(ROOT_DIR, "certs", "localhost-key.pem");
const TLS_CERT_PATH = path.join(ROOT_DIR, "certs", "localhost.pem");
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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
  ".ico": "image/x-icon"
};

function setSecurityHeaders(res) {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // credentialless melhora compatibilidade com recursos de CDN sem credenciais.
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function getLanIPv4() {
  const interfaces = os.networkInterfaces();
  for (const values of Object.values(interfaces)) {
    if (!values) continue;
    for (const net of values) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

function asJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(message);
}

function handleRequest(req, res) {
  setSecurityHeaders(res);

  const parsedUrl = url.parse(req.url || "/");
  let pathname = decodeURIComponent(parsedUrl.pathname || "/");
  const query = new url.URLSearchParams(parsedUrl.query || "");

  if (req.method === "GET" && pathname === "/api/server-info") {
    const hostHeader = req.headers.host || `${getLanIPv4()}:${HTTP_PORT}`;
    const protocol = req.socket.encrypted ? "https" : "http";
    return asJson(res, 200, {
      origin: `${protocol}://${hostHeader}`,
      lanOrigin: `http://${getLanIPv4()}:${HTTP_PORT}`
    });
  }

  if (req.method === "POST" && pathname === "/api/upload") {
    const extRaw = String(query.get("ext") || "webm").toLowerCase();
    const ext = extRaw.replace(/[^a-z0-9]/g, "") || "webm";
    const safeExt = ext.slice(0, 5);
    const videoId = crypto.randomUUID();
    const fileName = `${videoId}.${safeExt}`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_UPLOAD_SIZE) {
        sendError(res, 413, "Arquivo muito grande.");
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        if (!chunks.length) return sendError(res, 400, "Upload vazio.");
        fs.writeFileSync(filePath, Buffer.concat(chunks));
        const hostHeader = req.headers.host || `${getLanIPv4()}:${HTTP_PORT}`;
        const protocol = req.socket.encrypted ? "https" : "http";
        const currentOrigin = `${protocol}://${hostHeader}`;
        const isLocalHostOrigin = currentOrigin.includes("localhost") || currentOrigin.includes("127.0.0.1");
        const bestOrigin = isLocalHostOrigin
          ? `http://${getLanIPv4()}:${HTTP_PORT}`
          : currentOrigin;
        const downloadPath = `/download/${fileName}`;
        return asJson(res, 200, {
          ok: true,
          id: videoId,
          downloadPath,
          downloadUrl: `${bestOrigin}${downloadPath}`
        });
      } catch (error) {
        return sendError(res, 500, `Falha no upload: ${error.message}`);
      }
    });

    req.on("error", () => sendError(res, 500, "Erro no upload."));
    return;
  }

  if (req.method === "GET" && pathname.startsWith("/download/")) {
    const fileName = path.basename(pathname.replace("/download/", ""));
    if (!fileName) return sendError(res, 400, "Arquivo invalido.");
    const filePath = path.join(UPLOAD_DIR, fileName);
    if (!filePath.startsWith(UPLOAD_DIR) || !fs.existsSync(filePath)) {
      return sendError(res, 404, "Video nao encontrado.");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => sendError(res, 500, "Erro ao ler arquivo."));
    stream.pipe(res);
    return;
  }

  if (pathname === "/") pathname = "/index.html";

  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT_DIR, safePath);

  if (!filePath.startsWith(ROOT_DIR)) {
    return sendError(res, 403, "Acesso negado.");
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      return sendError(res, 404, "Arquivo nao encontrado.");
    }

    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => sendError(res, 500, "Erro ao ler arquivo."));
    stream.pipe(res);
  });
}

function startHttpServer() {
  ensureUploadDir();
  const httpServer = http.createServer(handleRequest);
  httpServer.listen(HTTP_PORT, HOST, () => {
    const lanIp = getLanIPv4();
    console.log(`[OK] HTTP Local:  http://localhost:${HTTP_PORT}`);
    console.log(`[OK] HTTP Rede :  http://${lanIp}:${HTTP_PORT}`);
    console.log("[INFO] Use o endereco de rede para leitura de QR no celular.");
  });
}

function startHttpsServer() {
  if (!fs.existsSync(TLS_KEY_PATH) || !fs.existsSync(TLS_CERT_PATH)) {
    console.log("[AVISO] Certificados HTTPS nao encontrados em ./certs.");
    console.log("[AVISO] Iniciando apenas HTTP em localhost.");
    return;
  }

  const options = {
    key: fs.readFileSync(TLS_KEY_PATH),
    cert: fs.readFileSync(TLS_CERT_PATH)
  };

  const httpsServer = https.createServer(options, handleRequest);
  httpsServer.listen(HTTPS_PORT, HOST, () => {
    console.log(`[OK] HTTPS: https://${HOST}:${HTTPS_PORT}`);
  });
}

startHttpServer();
startHttpsServer();

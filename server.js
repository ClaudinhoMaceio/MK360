const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const url = require("url");
const os = require("os");
const crypto = require("crypto");
const {
  ROOT_DIR,
  HOST,
  HTTP_PORT,
  HTTPS_PORT,
  TLS_KEY_PATH,
  TLS_CERT_PATH,
  UPLOAD_DIR,
  MK360_PUBLIC_ORIGIN
} = require("./config/app-config");
const {
  MAX_UPLOAD_SIZE,
  MAX_DRIVE_PROXY_JSON,
  MIME_TYPES
} = require("./config/video-config");

/**
 * @param {import("http").ServerResponse} res
 * @param {{ apiRoute?: boolean }} opts — rotas /api/* usam CORP cross-origin para o browser ler JSON quando o MK360 está noutro domínio e chama o Node por CORS.
 */
function setSecurityHeaders(res, opts = {}) {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  // require-corp + mesma origem: ativa crossOriginIsolated / SharedArrayBuffer exigido pelo ffmpeg.wasm.
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader(
    "Cross-Origin-Resource-Policy",
    opts.apiRoute ? "cross-origin" : "same-origin"
  );
  // Garante que a política de permissões não bloqueie getUserMedia na própria origem.
  res.setHeader("Permissions-Policy", "camera=(self)");
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

/** Permite o site estático (GitHub Pages, Hugo, etc.) chamar /api/upload e /api/drive-upload noutro domínio. */
function applyApiCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function apiJson(req, res, status, payload) {
  applyApiCors(req, res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function apiSendError(req, res, status, message) {
  applyApiCors(req, res);
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(message);
}

/**
 * O browser costuma falhar ao POSTar JSON para script.google.com (CORS / redirecionamento sem corpo).
 * O servidor reenvia o mesmo JSON e segue 302/307 até script.googleusercontent.com.
 */
function isAllowedDriveWebhookUrl(webhookUrl) {
  try {
    const u = new URL(webhookUrl);
    const p = String(u.pathname || "").replace(/\/$/, "");
    return (
      u.protocol === "https:" &&
      u.hostname === "script.google.com" &&
      /^\/macros\/s\/[^/]+\/exec$/.test(p)
    );
  } catch (_) {
    return false;
  }
}

function postJsonFollowGoogleRedirects(urlString, jsonBody, redirectsLeft = 10) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlString);
    } catch (e) {
      reject(e);
      return;
    }
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const options = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(jsonBody, "utf8"),
      },
    };
    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString("utf8");
        const code = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error("Muitos redirecionamentos ao contactar o Google Apps Script."));
            return;
          }
          const next = new URL(res.headers.location, u).href;
          resolve(postJsonFollowGoogleRedirects(next, jsonBody, redirectsLeft - 1));
          return;
        }
        resolve({ statusCode: code, body: text });
      });
    });
    req.on("error", reject);
    req.write(jsonBody);
    req.end();
  });
}

/** GET ao /exec?action=ping (sem JSONP), seguindo redirecionamentos do Google. */
function httpGetFollowGoogleRedirects(urlString, redirectsLeft = 10) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlString);
    } catch (e) {
      reject(e);
      return;
    }
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const options = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: "GET",
      headers: { Accept: "application/json, */*" },
    };
    const reqLib = lib.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const code = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error("Muitos redirecionamentos ao contactar o Google Apps Script."));
            return;
          }
          const next = new URL(res.headers.location, u).href;
          resolve(httpGetFollowGoogleRedirects(next, redirectsLeft - 1));
          return;
        }
        resolve({ statusCode: code, body: text });
      });
    });
    reqLib.on("error", reject);
    reqLib.end();
  });
}

function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url || "/");
  let pathname = decodeURIComponent(parsedUrl.pathname || "/");
  const query = new url.URLSearchParams(parsedUrl.query || "");
  const isApiRoute = pathname.startsWith("/api/");
  setSecurityHeaders(res, { apiRoute: isApiRoute });

  if (
    req.method === "OPTIONS" &&
    (pathname === "/api/server-info" ||
      pathname === "/api/upload" ||
      pathname === "/api/drive-upload" ||
      pathname === "/api/drive-ping")
  ) {
    applyApiCors(req, res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/api/server-info") {
    const hostHeader = req.headers.host || `${getLanIPv4()}:${HTTP_PORT}`;
    const protocol = req.socket.encrypted ? "https" : "http";
    return apiJson(req, res, 200, {
      origin: `${protocol}://${hostHeader}`,
      lanOrigin: `http://${getLanIPv4()}:${HTTP_PORT}`,
      publicDownloadOrigin: MK360_PUBLIC_ORIGIN || null,
      uploadDir: UPLOAD_DIR
    });
  }

  if (req.method === "GET" && pathname === "/api/drive-ping") {
    const webhook = String(query.get("webhook") || "").trim();
    if (!isAllowedDriveWebhookUrl(webhook)) {
      apiSendError(req, res, 400, "URL do webhook invalida (use https://script.google.com/macros/s/.../exec).");
      return;
    }
    const pingUrl = new URL(webhook);
    pingUrl.searchParams.set("action", "ping");
    httpGetFollowGoogleRedirects(pingUrl.toString())
      .then(({ statusCode, body }) => {
        const trimmed = String(body || "").trim();
        if (!trimmed.startsWith("{")) {
          apiJson(req, res, 502, {
            ok: false,
            error:
              "Resposta nao-JSON do Google. Confirme a URL /exec, implementacao Web (qualquer pessoa) e nova versao publicada.",
          });
          return;
        }
        applyApiCors(req, res);
        res.statusCode = statusCode >= 200 && statusCode < 600 ? statusCode : 502;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(trimmed);
      })
      .catch((e) => apiJson(req, res, 502, { ok: false, error: String(e.message || e) }));
    return;
  }

  if (req.method === "POST" && pathname === "/api/drive-upload") {
    const chunks = [];
    let total = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      total += chunk.length;
      if (total > MAX_DRIVE_PROXY_JSON) {
        aborted = true;
        apiSendError(req, res, 413, "Pedido demasiado grande para o Drive (reduza a duração ou a qualidade).");
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", async () => {
      if (aborted) return;
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw) return apiSendError(req, res, 400, "Corpo vazio.");
        let body;
        try {
          body = JSON.parse(raw);
        } catch (_) {
          return apiSendError(req, res, 400, "JSON invalido.");
        }
        const webhook = String(body.webhook || "").trim();
        if (!isAllowedDriveWebhookUrl(webhook)) {
          return apiSendError(req, res, 400, "URL do webhook invalida (use https://script.google.com/macros/s/.../exec).");
        }
        const forward = {
          action: "upload",
          fileName: body.fileName,
          eventName: body.eventName,
          contentType: body.contentType,
          dataBase64: body.dataBase64,
        };
        if (!forward.dataBase64 || typeof forward.dataBase64 !== "string") {
          return apiSendError(req, res, 400, "dataBase64 ausente.");
        }
        const payloadStr = JSON.stringify(forward);
        const { statusCode, body: respText } = await postJsonFollowGoogleRedirects(webhook, payloadStr);
        applyApiCors(req, res);
        res.statusCode = statusCode >= 200 && statusCode < 600 ? statusCode : 502;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(respText || "{}");
      } catch (e) {
        apiJson(req, res, 502, { ok: false, error: String(e && e.message ? e.message : e) });
      }
    });
    req.on("error", () => apiJson(req, res, 500, { ok: false, error: "Erro ao ler pedido." }));
    return;
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
    let uploadAborted = false;

    req.on("data", (chunk) => {
      if (uploadAborted) return;
      total += chunk.length;
      if (total > MAX_UPLOAD_SIZE) {
        uploadAborted = true;
        apiSendError(req, res, 413, "Arquivo muito grande.");
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (uploadAborted) return;
      try {
        if (!chunks.length) return apiSendError(req, res, 400, "Upload vazio.");
        fs.writeFileSync(filePath, Buffer.concat(chunks));
        const hostHeader = req.headers.host || `${getLanIPv4()}:${HTTP_PORT}`;
        const protocol = req.socket.encrypted ? "https" : "http";
        const currentOrigin = `${protocol}://${hostHeader}`;
        const isLocalHostOrigin = currentOrigin.includes("localhost") || currentOrigin.includes("127.0.0.1");
        const bestOrigin = isLocalHostOrigin
          ? `http://${getLanIPv4()}:${HTTP_PORT}`
          : currentOrigin;
        const downloadPath = `/download/${fileName}`;
        const downloadBase = MK360_PUBLIC_ORIGIN || bestOrigin;
        return apiJson(req, res, 200, {
          ok: true,
          id: videoId,
          downloadPath,
          downloadUrl: `${downloadBase}${downloadPath}`,
          publicDownloadOrigin: MK360_PUBLIC_ORIGIN || null
        });
      } catch (error) {
        return apiSendError(req, res, 500, `Falha no upload: ${error.message}`);
      }
    });

    req.on("error", () => apiSendError(req, res, 500, "Erro no upload."));
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
    if (MK360_PUBLIC_ORIGIN) {
      console.log(`[INFO] MK360_PUBLIC_ORIGIN=${MK360_PUBLIC_ORIGIN} (links /download no JSON).`);
    }
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

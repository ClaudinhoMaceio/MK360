/**
 * MK360 -> Google Drive Webhook (Apps Script)
 *
 * Pasta de destino (MK360):
 * https://drive.google.com/drive/folders/1WCKCxmsSSHwkAqmn2V4sJYPeHHetlIiq
 *
 * Cada upload do MK360 grava um arquivo nesta pasta (nome: Evento_data_nome.ext).
 *
 * Formato do POST: application/json com campo dataBase64 (vídeo em Base64).
 * Corpo binário cru (octet-stream) costuma chegar vazio no Apps Script — não use.
 *
 * Recomendado no MK360: enviar via servidor Node (POST /api/drive-upload), que reencaminha
 * para este /exec e segue redirecionamentos HTTPS com o JSON intacto (o fetch direto do
 * browser para script.google.com costuma falhar por CORS ou corpo perdido no redirect).
 *
 * URL da APLICAÇÃO WEB (use esta no MK360, campo Webhook — termina em /exec):
 *   https://script.google.com/macros/s/AKfycbz_9K0sTxa6W5AsqjMNDLHlIfo1cgfb_Yempygvwx9Te1G068ZwVahLNvLHDUyxszN_/exec
 *
 * NÃO use no MK360 links do tipo script.google.com/macros/library/... — isso é biblioteca
 * para importar noutro projeto no editor do Apps Script, não é o endpoint de upload.
 *
 * ID do deployment (trecho do URL): AKfycbz_9K0sTxa6W5AsqjMNDLHlIfo1cgfb_Yempygvwx9Te1G068ZwVahLNvLHDUyxszN_
 *
 * Como publicar:
 * 1) Conta Google com permissão de escrita na pasta do Drive acima.
 * 2) Implementar > Nova implementação > Tipo: Aplicação Web
 * 3) Executar como: Eu
 * 4) Quem tem acesso: Qualquer pessoa (para o MK360 enviar POST sem login no browser)
 * 5) Copiar URL /exec para o MK360 e clicar em Salvar Drive / Testar Conexão.
 *
 * Se abrir o /exec no browser e aparecer login Google, reveja o passo 4 ou crie nova versão da implementação.
 *
 * Após criar o ficheiro, o script tenta setSharing(ANYONE_WITH_LINK, VIEW) para o link viewUrl do QR funcionar
 * sem login. Contas Google Workspace podem bloquear partilha pública — nesse caso verifique sharingWarning na resposta JSON.
 */

const FOLDER_ID = "1WCKCxmsSSHwkAqmn2V4sJYPeHHetlIiq";

function jsonOut(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "";
  const callback = e && e.parameter && e.parameter.callback;

  if (action === "ping") {
    const payload = {
      ok: true,
      service: "mk360-drive-webhook",
      timestamp: new Date().toISOString()
    };
    // JSONP: permite testar o webhook a partir de sites (ex.: GitHub Pages) onde fetch bloqueia CORS.
    const cb = String(callback || "").trim();
    if (cb && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cb)) {
      return ContentService
        .createTextOutput(cb + "(" + JSON.stringify(payload) + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonOut(payload);
  }
  return jsonOut({ ok: false, error: "Use action=ping para teste." });
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, error: "Corpo vazio." });
    }

    var folder;
    try {
      folder = DriveApp.getFolderById(FOLDER_ID);
    } catch (folderErr) {
      return jsonOut({
        ok: false,
        error: "Sem acesso à pasta do Drive (confirme FOLDER_ID e partilhe a pasta com a conta que executa este script): " + String(folderErr)
      });
    }
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
    const type = String((e.postData && e.postData.type) || "").toLowerCase();

    /** JSON + Base64: único fluxo fiável para vídeo no navegador → Apps Script. */
    if (type.indexOf("application/json") !== -1) {
      const body = JSON.parse(e.postData.contents);
      const action = body.action || (e.parameter && e.parameter.action) || "upload";
      if (action !== "upload") {
        return jsonOut({ ok: false, error: "action inválida" });
      }
      const fileName = sanitizeName(body.fileName || "MK360_video.webm");
      const eventName = sanitizeName(body.eventName || "Evento");
      const contentType = body.contentType || "application/octet-stream";
      const b64 = body.dataBase64;
      if (!b64 || typeof b64 !== "string") {
        return jsonOut({ ok: false, error: "dataBase64 ausente ou inválido." });
      }
      const finalName = eventName + "_" + now + "_" + fileName;
      const bytes = Utilities.base64Decode(b64);
      const blob = Utilities.newBlob(bytes, contentType, finalName);
      const file = folder.createFile(blob);
      var shareWarning = null;
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) {
        shareWarning = String(shareErr);
      }
      var fid = file.getId();
      var out = {
        ok: true,
        fileId: fid,
        fileName: file.getName(),
        fileUrl: file.getUrl(),
        viewUrl: "https://drive.google.com/file/d/" + fid + "/view?usp=sharing"
      };
      if (shareWarning) out.sharingWarning = shareWarning;
      return jsonOut(out);
    }

    /** Legado: octet-stream + metadados na query (binário cru frequentemente falha). */
    const action = (e && e.parameter && e.parameter.action) || "upload";
    if (action !== "upload") {
      return jsonOut({ ok: false, error: "action inválida" });
    }
    const fileName = sanitizeName((e.parameter.fileName || "MK360_video.webm"));
    const eventName = sanitizeName((e.parameter.eventName || "Evento"));
    const contentType = e.parameter.contentType || "application/octet-stream";
    const finalName = eventName + "_" + now + "_" + fileName;
    const blob = Utilities.newBlob(e.postData.contents, contentType, finalName);
    const file = folder.createFile(blob);
    var shareWarning2 = null;
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr2) {
      shareWarning2 = String(shareErr2);
    }
    var fid2 = file.getId();
    var out2 = {
      ok: true,
      fileId: fid2,
      fileName: file.getName(),
      fileUrl: file.getUrl(),
      viewUrl: "https://drive.google.com/file/d/" + fid2 + "/view?usp=sharing"
    };
    if (shareWarning2) out2.sharingWarning = shareWarning2;
    return jsonOut(out2);
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function sanitizeName(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|#%{}~]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120) || "arquivo";
}

/**
 * MK360 -> Google Drive Webhook (Apps Script)
 *
 * Pasta de destino (MK360):
 * https://drive.google.com/drive/folders/1WCKCxmsSSHwkAqmn2V4sJYPeHHetlIiq
 *
 * Cada upload do MK360 grava um arquivo nesta pasta (nome: Evento_data_nome.ext).
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
 */

const FOLDER_ID = "1WCKCxmsSSHwkAqmn2V4sJYPeHHetlIiq";

function jsonOut(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "";
  if (action === "ping") {
    return jsonOut({
      ok: true,
      service: "mk360-drive-webhook",
      timestamp: new Date().toISOString()
    });
  }
  return jsonOut({ ok: false, error: "Use action=ping para teste." });
}

function doPost(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || "upload";
    if (action !== "upload") {
      return jsonOut({ ok: false, error: "action inválida" });
    }

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const fileName = sanitizeName((e.parameter.fileName || "MK360_video.webm"));
    const eventName = sanitizeName((e.parameter.eventName || "Evento"));
    const contentType = e.parameter.contentType || "application/octet-stream";
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
    const finalName = `${eventName}_${now}_${fileName}`;

    if (!e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, error: "Corpo vazio." });
    }

    const blob = Utilities.newBlob(e.postData.contents, contentType, finalName);
    const file = folder.createFile(blob);

    return jsonOut({
      ok: true,
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl()
    });
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

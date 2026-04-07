/**
 * MK360 -> Google Drive Webhook (Apps Script)
 *
 * Como usar:
 * 1) Substitua FOLDER_ID pelo ID da pasta do Drive.
 * 2) Deploy > New deployment > Web app
 * 3) Execute as: Me
 * 4) Who has access: Anyone
 * 5) Cole a URL do Web App no campo "Webhook Google Drive" do MK360.
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

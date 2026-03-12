// sync_api.gs — CropManager PWA Sync Endpoint
// Deploy: Web App, Execute as Me, Anyone can access
// Set SYNC_TOKEN in Project Settings → Script Properties

// Reference CONFIG.SPREADSHEET_ID from main script or hardcode here
const SYNC_SPREADSHEET_ID = '1jA1Fpw27aPoO1wdz6Y0GWRGBgP1xp60wWKjWiMYgV38';

const SYNC_SHEETS = {
  crops:             { name: 'CropTracking',             idCol: 0 },
  propagations:      { name: 'PropagationTracking',      idCol: 0 },
  reminders:         { name: 'ReminderQueue',            idCol: 0 },
  stageLogs:         { name: 'StageLog',                 idCol: 0 },
  harvestLogs:       { name: 'HarvestLog',               idCol: 0 },
  treatmentLogs:     { name: 'TreatmentLog',             idCol: 0 },
  cropDbAdjustments: { name: 'CropDatabase_Adjustments', idCol: 0 },
  propDbAdjustments: { name: 'PropDatabase_Adjustments', idCol: 0 },
  batchPlantingLogs: { name: 'BatchPlantingLog',         idCol: 0 },
  cropSearchLogs:    { name: 'CropSearchLog',            idCol: 0 },
};

function doPost(e) {
  try {
    var body  = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
    if (body.token !== token) return _res({ error: 'Unauthorized' });
    if (body.action === 'push') return _res(pushHandler(body.payload));
    if (body.action === 'pull') return _res(pullHandler(body.since || 0));
    return _res({ error: 'Unknown action' });
  } catch(err) { return _res({ error: err.message }); }
}

function doGet(e) {
  return _res({ status: 'CropManager Sync API OK', version: '1.0' });
}

function pushHandler(payload) {
  var ss      = SpreadsheetApp.openById(SYNC_SPREADSHEET_ID);
  var written = {};
  var errors  = [];
  Object.keys(SYNC_SHEETS).forEach(function(key) {
    var records = payload[key] || [];
    var cfg     = SYNC_SHEETS[key];
    written[key] = 0;
    records.forEach(function(rec) {
      try { _upsertRow(ss, cfg.name, cfg.idCol, rec); written[key]++; }
      catch(err) { errors.push(cfg.name + ':' + rec[0] + ':' + err.message); }
    });
  });
  return { success: true, written: written, errors: errors };
}

function pullHandler(since) {
  var ss     = SpreadsheetApp.openById(SYNC_SPREADSHEET_ID);
  var result = {};
  Object.keys(SYNC_SHEETS).forEach(function(key) {
    var sheet = ss.getSheetByName(SYNC_SHEETS[key].name);
    if (!sheet) { result[key] = []; return; }
    var rows = sheet.getDataRange().getValues();
    result[key] = rows.slice(1).filter(function(r){ return r[0]; });
  });
  return { success: true, data: result };
}

function _upsertRow(ss, sheetName, idCol, rowArr) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  var id   = String(rowArr[idCol]);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === id) {
      sheet.getRange(i+1, 1, 1, rowArr.length).setValues([rowArr]);
      return;
    }
  }
  sheet.appendRow(rowArr);
}

function _res(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

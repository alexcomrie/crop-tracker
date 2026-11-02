# The-Hub Google Apps Script implementation

This document explains the GAS backend. **Do not paste this Markdown file into
Apps Script** — the code fences are not valid JavaScript and will cause
`SyntaxError: Unexpected identifier`. Instead, open `docs/gas-backend.gs` and
paste its contents (pure JavaScript) into `Code.gs`.

The script is a single `doGet`/`doPost` router. All requests go to one URL with
an `action` query parameter.

```javascript
const SHEETS = {
  treatments: 'Treatments',
  posts: 'CommunityPosts',
  comments: 'CommunityComments',
  likes: 'CommunityLikes',
  farmers: 'Farmers',
};

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function readRows(sheetName) {
  const sh = getSheet(sheetName);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1).map(row => {
    const o = {};
    headers.forEach((h, i) => { o[h] = row[i]; });
    return o;
  }).filter(r => Object.values(r).some(v => v !== '' && v !== null));
}

function appendRow(sheetName, obj) {
  const sh = getSheet(sheetName);
  const values = sh.getDataRange().getValues();
  const headers = values.length ? values[0].map(h => String(h).trim()) : Object.keys(obj);
  if (values.length === 0) sh.appendRow(headers);
  const row = headers.map(h => (obj[h] === undefined ? '' : obj[h]));
  sh.appendRow(row);
}

function adminToken() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN') || '';
}

function checkToken(token) {
  return token && token === adminToken();
}

function doGet(e) {
  const action = (e.parameter.action || 'health').toLowerCase();
  try {
    if (action === 'health') {
      return jsonOut({ success: true, ok: true, version: 1, communityEnabled: true });
    }
    if (action === 'treatments') {
      return jsonOut({ success: true, data: { entries: readRows(SHEETS.treatments), updatedAt: new Date().toISOString() } });
    }
    if (action === 'posts') {
      const posts = readRows(SHEETS.posts).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      const comments = readRows(SHEETS.comments);
      const likes = readRows(SHEETS.likes);
      const likeMap = {};
      likes.forEach(l => { likeMap[l.postId] = (likeMap[l.postId] || 0) + 1; });
      const enriched = posts.map(p => ({
        ...p,
        commentCount: comments.filter(c => c.postId === p.id).length,
        likeCount: likeMap[p.id] || 0,
      }));
      return jsonOut({ success: true, data: { posts: enriched } });
    }
    if (action === 'comments') {
      const postId = e.parameter.postId;
      const comments = readRows(SHEETS.comments).filter(c => c.postId === postId);
      return jsonOut({ success: true, data: { comments } });
    }
    return jsonOut({ success: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut({ success: false, error: String(err) });
  }
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { body = {}; }
  const action = (body.action || '').toLowerCase();
  try {
    if (action === 'replace' && body.payload && Array.isArray(body.payload.entries)) {
      // Admin-only bulk replace of the treatment database
      if (!checkToken(body.token)) return jsonOut({ success: false, error: 'Unauthorized' });
      const sh = getSheet(SHEETS.treatments);
      sh.clear();
      const headers = ['id','name','category','classification','activeIngredient','crops','targets','reiHours','phiDays','guide','warnings','imageUrl','rates','notes','updatedAt'];
      sh.appendRow(headers);
      body.payload.entries.forEach(entry => {
        sh.appendRow(headers.map(h => {
          if (h === 'crops' || h === 'targets') return Array.isArray(entry[h]) ? entry[h].join(',') : (entry[h] || '');
          if (h === 'rates') return JSON.stringify(entry.rates || []);
          return entry[h] === undefined ? '' : entry[h];
        }));
      });
      return jsonOut({ success: true, message: 'Treatments replaced' });
    }

    if (action === 'createpost') {
      const p = body.post || {};
      if (!p.author || !p.text) return jsonOut({ success: false, error: 'author and text are required' });
      // Server-side weekly limit: 3 posts per farmer per rolling 7 days
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recent = readRows(SHEETS.posts).filter(r => r.authorId === p.authorId && Number(r.createdAt) > weekAgo);
      if (recent.length >= 3) return jsonOut({ success: false, error: 'Weekly post limit reached (3 per week)' });
      const post = {
        id: 'post_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        author: p.author,
        authorId: p.authorId || '',
        text: p.text,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      appendRow(SHEETS.posts, post);
      return jsonOut({ success: true, data: { post } });
    }

    if (action === 'createcomment') {
      const c = body.comment || {};
      if (!c.postId || !c.author || !c.text) return jsonOut({ success: false, error: 'postId, author and text are required' });
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recent = readRows(SHEETS.comments).filter(r => r.authorId === c.authorId && Number(r.createdAt) > weekAgo);
      if (recent.length >= 10) return jsonOut({ success: false, error: 'Weekly comment limit reached (10 per week)' });
      const comment = {
        id: 'comment_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        postId: c.postId,
        parentId: c.parentId || '',
        author: c.author,
        authorId: c.authorId || '',
        text: c.text,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      appendRow(SHEETS.comments, comment);
      return jsonOut({ success: true, data: { comment } });
    }

    if (action === 'like') {
      const postId = body.postId;
      const farmerId = body.farmerId;
      if (!postId || !farmerId) return jsonOut({ success: false, error: 'postId and farmerId are required' });
      const likes = readRows(SHEETS.likes);
      const existing = likes.find(l => l.postId === postId && l.farmerId === farmerId);
      if (existing) {
        // Unlike: remove the row
        const sh = getSheet(SHEETS.likes);
        const values = sh.getDataRange().getValues();
        const headers = values[0].map(h => String(h).trim());
        const idx = headers.indexOf('postId');
        const fIdx = headers.indexOf('farmerId');
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][idx]) === String(postId) && String(values[i][fIdx]) === String(farmerId)) {
            sh.deleteRow(i + 1);
            break;
          }
        }
        return jsonOut({ success: true, data: { liked: false } });
      }
      appendRow(SHEETS.likes, { postId, farmerId, createdAt: Date.now() });
      return jsonOut({ success: true, data: { liked: true } });
    }

    if (action === 'killswitch') {
      // Admin-only: toggle community on/off by writing a flag row
      if (!checkToken(body.token)) return jsonOut({ success: false, error: 'Unauthorized' });
      const props = PropertiesService.getScriptProperties();
      props.setProperty('COMMUNITY_ENABLED', body.enabled ? 'true' : 'false');
      return jsonOut({ success: true, data: { enabled: body.enabled } });
    }

    if (action === 'status') {
      const props = PropertiesService.getScriptProperties();
      const enabled = props.getProperty('COMMUNITY_ENABLED') !== 'false';
      return jsonOut({ success: true, data: { communityEnabled: enabled } });
    }

    return jsonOut({ success: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut({ success: false, error: String(err) });
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('CropManager')
    .addItem('Setup sheets', 'setupSheets')
    .addToUi();
}

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const defs = {
    Treatments: ['id','name','category','classification','activeIngredient','crops','targets','reiHours','phiDays','guide','warnings','imageUrl','rates','notes','updatedAt','description','action','distributor','active'],
    CommunityPosts: ['id','author','authorId','text','createdAt','updatedAt'],
    CommunityComments: ['id','postId','parentId','author','authorId','text','createdAt','updatedAt'],
    CommunityLikes: ['postId','farmerId','createdAt'],
    Farmers: ['farmerId','farmerName','farmName','farmLocation','farmerPhone','createdAt','updatedAt'],
  };
  Object.keys(defs).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(defs[name]);
  });
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('COMMUNITY_ENABLED')) props.setProperty('COMMUNITY_ENABLED', 'true');
  if (!props.getProperty('ADMIN_TOKEN')) props.setProperty('ADMIN_TOKEN', 'change-me');
}
```

## Sheet bootstrap (run once)

Add this function to the Apps Script project and run it from the editor
(**Run → setupSheets**) to create every tab with the correct headers. It is
idempotent — existing sheets are left untouched, only missing ones are created.

```javascript
function onOpen() {
  SpreadsheetApp.getUi().createMenu('CropManager')
    .addItem('Setup sheets', 'setupSheets')
    .addToUi();
}

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const defs = {
    Treatments: ['id','name','category','classification','activeIngredient','crops','targets','reiHours','phiDays','guide','warnings','imageUrl','rates','notes','updatedAt','description','action','distributor','active'],
    CommunityPosts: ['id','author','authorId','text','createdAt','updatedAt'],
    CommunityComments: ['id','postId','parentId','author','authorId','text','createdAt','updatedAt'],
    CommunityLikes: ['postId','farmerId','createdAt'],
    Farmers: ['farmerId','farmerName','farmName','farmLocation','farmerPhone','createdAt','updatedAt'],
  };
  Object.keys(defs).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(defs[name]);
  });
  // Community config stored as script properties, not a sheet.
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('COMMUNITY_ENABLED')) props.setProperty('COMMUNITY_ENABLED', 'true');
  if (!props.getProperty('ADMIN_TOKEN')) props.setProperty('ADMIN_TOKEN', 'change-me');
}
```

## Testing on localhost

The PWA and API server can be pointed at a local mock instead of the deployed
GAS URL while developing:

1. Set `GAS_SYNC_URL`, `TREATMENT_DB_URL` and `VITE_COMMUNITY_API_URL` to
   `http://localhost:5001/api/gas-mock`.
2. The API server ships a mock router (see `artifacts/api-server/src/routes/gasMock.ts`)
   that mirrors the GAS actions against an in-memory store, so the front-end can
   be exercised without a Google account.
3. For end-to-end validation, deploy the script and run `setupSheets()`, then
   switch the env vars to the real `script.google.com` URL.

## Runtime requirement

Apps Script must use the **V8** runtime (default for new projects). If you are on
the legacy Rhino runtime, arrow functions and `const`/`let` will fail to parse.
Enable V8 via **Project Settings → Show appsscript.json manifest file** and set:

```json
{ "timeZone": "America/Jamaica", "dependencies": {}, "exceptionLogging": "STACKDRIVER", "runtimeVersion": "V8" }
```

After saving, reload the editor and use the **CropManager → Setup sheets** menu
(or Run → setupSheets) to create all tabs.

## Kill switch

The PWA calls `?action=status` on load. If `communityEnabled` is false (or the
endpoint is unreachable, or the local toggle in Settings is off), the Community
screen shows **Coming Soon** instead of the feed. Admins flip it with a POST
`{ action: 'killswitch', token, enabled }`.

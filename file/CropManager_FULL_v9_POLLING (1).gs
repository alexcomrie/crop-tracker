// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║         ALEX'S CROP & PROPAGATION MANAGEMENT SYSTEM                        ║
// ║         Google Apps Script — Complete Implementation                        ║
// ║         VERSION 9 — Telegram Bot Integration + Batch Planting Update       ║
// ║                                                                              ║
// ║  WHAT'S NEW IN v9:                                                          ║
// ║  1. ALL input/output moved from Gmail → Telegram bot                        ║
// ║  2. Batch planting confirmation: send crop id + batch number + "planted"    ║
// ║     → marks batch done, clears old calendar event, schedules next batch     ║
// ║  3. Telegram webhook handles all inbound messages (replaces email trigger)  ║
// ║  4. All outbound notifications sent via Telegram sendMessage                ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

// ══════════════════════════════════════════════════════
//  CONFIGURATION — EDIT THESE VALUES
// ══════════════════════════════════════════════════════

const CONFIG = {
  MY_EMAIL: "YOUR_EMAIL@gmail.com",          // Keep for fallback/alerts only
  SPREADSHEET_ID: "1jA1Fpw27aPoO1wdz6Y0GWRGBgP1xp60wWKjWiMYgV38",
  MONTHS_OF_PLANTING_DATES: 3,
  LEARNING_THRESHOLD: 3,
  CALENDAR_NAME: "🌱 Crop Manager",

  // ── TELEGRAM ──────────────────────────────────────
  // Your bot token from BotFather
  TELEGRAM_TOKEN: "8785143281:AAEheLMeADsaHftaPEB9CP8boc0--mHgjLQ",
  // Your personal Telegram chat ID (get it by messaging @userinfobot)
  // REQUIRED: fill this in after deploying — see setup instructions
  TELEGRAM_CHAT_ID: "5837914244",

  // SerpAPI — auto-search crop data once per crop (cucumber excluded)
  SERP_API_KEY: "a316951a4119e280200462643f4b4bc486743821af592c200c92a2f6f66d0be6",
  SERP_EXCLUDE_CROPS: ["cucumber", "cucumbers"],
  SEARCH_LOG_SHEET: "CropSearchLog",

  // ── Script version — update this string each time you deploy new code ──────
  // The bot will send a "New version deployed" message when setupSystem() runs.
  SCRIPT_VERSION: "v9.13",

  // ── WEATHER (Open-Meteo — no API key needed) ──────
  // Saint Ann's Bay, Jamaica coords
  WEATHER_LAT: 18.4358,
  WEATHER_LON: -77.2010,
  WEATHER_LOCATION: "Saint Ann's Bay",
  // Rain threshold in mm/day to flag as "rainy" (affects spray warnings)
  RAIN_THRESHOLD_MM: 5,
};



// ══════════════════════════════════════════════════════
//  NOTIFICATION CENTRE
//  Every action — user-triggered or automatic — sends
//  a confirmation to Telegram so nothing is silent.
// ══════════════════════════════════════════════════════

/**
 * Central notify dispatcher. All notification calls go through here
 * so formatting and routing are consistent.
 *
 * type:
 *   "deploy"       — script deployed / reinitialised
 *   "crop_logged"  — new crop or batch crop saved
 *   "prop_logged"  — new propagation saved
 *   "crop_updated" — crop stage/treatment updated
 *   "prop_updated" — propagation stage updated
 *   "crop_deleted" — crop deleted
 *   "germinated"   — germination confirmed
 *   "harvested"    — harvest logged
 *   "transplanted" — transplant confirmed
 *   "rooted"       — rooting confirmed
 *   "reminder"     — scheduled reminder fired
 *   "background"   — daily learning/overdue/missed-date check ran
 *   "learning"     — database adjusted from real data
 */
function _notify(type, payload, chatId) {
  const cid = chatId || CONFIG.TELEGRAM_CHAT_ID;
  let msg   = "";

  switch (type) {

    // ── 1. Script deployed ─────────────────────────────
    case "deploy": {
      const props   = PropertiesService.getScriptProperties();
      const prevVer = props.getProperty("deployed_version") || "unknown";
      const now     = new Date();
      const ts      = _formatDate(now) + " at " +
                      Utilities.formatDate(now, Session.getScriptTimeZone(), "h:mm a");
      const isNew   = prevVer !== CONFIG.SCRIPT_VERSION;

      msg  = (isNew ? "🚀" : "🔄") + " <b>" + (isNew ? "New Version Deployed" : "System Re-initialised") +
             ": " + CONFIG.SCRIPT_VERSION + "</b>\n";
      msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
      msg += "📅 " + ts + "\n";
      if (isNew) msg += "⬆️ Previous: " + prevVer + "\n";
      msg += "\n<b>Background jobs active:</b>\n";
      msg += "⏱ Polling — every 1 min\n";
      msg += "📬 Reminders — every 30 min\n";
      msg += "🌿 Daily check — 7:00 AM\n";
      msg += "\nSend <code>menu</code> to start.";

      props.setProperty("deployed_version", CONFIG.SCRIPT_VERSION);
      props.setProperty("last_deploy_time", now.toISOString());
      break;
    }

    // ── 2. Reminder fired ──────────────────────────────
    case "reminder": {
      // payload: { subject, body, reminderType, cropName, trackingID }
      // Reminders already have their own rich body — just tag them
      msg = "🔔 <b>REMINDER</b>\n" +
            "━━━━━━━━━━━━━━━━━━━━━━━━\n" +
            (payload.body || payload.subject || "");
      break;
    }

    // ── 3. Background daily check ran ─────────────────
    case "background": {
      // payload: { checks: [], learningUpdates: [], overdueAlerts: [] }
      const now2 = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "h:mm a");
      msg  = "⚙️ <b>Daily Check — " + now2 + "</b>\n";
      msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
      if (payload.checks && payload.checks.length) {
        payload.checks.forEach(function(line) { msg += line + "\n"; });
      }
      if (payload.learningUpdates && payload.learningUpdates.length) {
        msg += "\n📚 <b>Database updated from your data:</b>\n";
        payload.learningUpdates.forEach(function(u) { msg += "  • " + u + "\n"; });
      }
      if (payload.overdueAlerts && payload.overdueAlerts.length) {
        msg += "\n⚠️ <b>Overdue harvests:</b>\n";
        payload.overdueAlerts.forEach(function(a) {
          msg += "  🌱 " + a.cropName + " — " + a.daysOverdue + " days overdue\n";
        });
      }
      const lastDeploy = PropertiesService.getScriptProperties().getProperty("last_deploy_time");
      if (lastDeploy) {
        const dSince = Math.floor((new Date() - new Date(lastDeploy)) / (1000*60*60*24));
        msg += "\n🚀 " + CONFIG.SCRIPT_VERSION + " · deployed " + dSince + " day" + (dSince!==1?"s":"") + " ago";
      }
      break;
    }

    // ── 4. Learning adjustment applied ────────────────
    case "learning": {
      // payload: { cropKey, field, dbDefault, newAvg, sampleCount }
      msg  = "📚 <b>Database Learning Update</b>\n";
      msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
      msg += "🌱 Crop: <b>" + payload.cropKey + "</b>\n";
      msg += "📊 Field: " + payload.field + "\n";
      msg += "🗄 DB default: " + payload.dbDefault + " days\n";
      msg += "📈 Your average: <b>" + payload.newAvg + " days</b> (" + payload.sampleCount + " samples)\n";
      msg += "\n<i>Your data now overrides the database default for this crop.</i>";
      break;
    }

    // ── 5. Germination confirmed ───────────────────────
    case "germinated": {
      // payload: { cropName, trackingID, daysToGerminate, germDate }
      msg  = "🌱 <b>Germination Confirmed</b>\n";
      msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
      msg += "🌿 Crop: <b>" + payload.cropName + "</b>\n";
      msg += "📅 Date: " + _formatDate(payload.germDate) + "\n";
      msg += "⏱ Days to germinate: <b>" + payload.daysToGerminate + "</b>\n";
      msg += "📊 Status: Seedling\n";
      msg += "\n🆔 <code>" + payload.trackingID + "</code>";
      break;
    }

    // ── 6. Harvest logged ──────────────────────────────
    case "harvested": {
      // payload: { cropName, trackingID, harvestCount, daysFromPlanting, daysDiff, harvestDate }
      const diff = payload.daysDiff || 0;
      msg  = "🥬 <b>Harvest #" + payload.harvestCount + " Logged</b>\n";
      msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
      msg += "🌿 Crop: <b>" + payload.cropName + "</b>\n";
      msg += "📅 Date: " + _formatDate(payload.harvestDate) + "\n";
      msg += "🗓 Days from planting: <b>" + payload.daysFromPlanting + "</b>\n";
      if (diff !== 0) msg += (diff > 0 ? "⏰ " : "🚀 ") + Math.abs(diff) + " days " +
                             (diff > 0 ? "later" : "earlier") + " than estimated\n";
      msg += "\n🆔 <code>" + payload.trackingID + "</code>";
      break;
    }

    // ── 7. Transplant confirmed ────────────────────────
    case "transplanted": {
      // payload: { cropName, trackingID, confirmedDate, daysDiff, newHarvestDate }
      const tdiff = payload.daysDiff || 0;
      msg  = "🌱 <b>Transplant Confirmed</b>\n";
      msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
      msg += "🌿 Crop: <b>" + payload.cropName + "</b>\n";
      msg += "📅 Date: " + _formatDate(payload.confirmedDate) + "\n";
      if (tdiff !== 0) msg += (tdiff > 0 ? "⏰ " : "🚀 ") + Math.abs(tdiff) + " days " +
                              (tdiff > 0 ? "later" : "earlier") + " than scheduled\n";
      if (payload.newHarvestDate) msg += "🥬 Revised harvest estimate: <b>" + _formatDate(payload.newHarvestDate) + "</b>\n";
      msg += "📊 Status: Transplanted\n";
      msg += "\n🆔 <code>" + payload.trackingID + "</code>";
      break;
    }

    // ── 8. Rooting confirmed ───────────────────────────
    case "rooted": {
      // payload: { plantName, trackingID, daysToRoot, daysDiff, confirmedDate }
      const rdiff = payload.daysDiff || 0;
      msg  = "🌿 <b>Rooting Confirmed</b>\n";
      msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
      msg += "🌱 Plant: <b>" + payload.plantName + "</b>\n";
      msg += "📅 Date: " + _formatDate(payload.confirmedDate) + "\n";
      msg += "⏱ Days to root: <b>" + payload.daysToRoot + "</b>\n";
      if (rdiff !== 0) msg += (rdiff > 0 ? "⏰ " : "🚀 ") + Math.abs(rdiff) + " days " +
                              (rdiff > 0 ? "later" : "earlier") + " than expected\n";
      msg += "📊 Status: Rooted\n";
      msg += "\n🆔 <code>" + payload.trackingID + "</code>";
      break;
    }

    // ── 9. Crop stage / treatment updated ─────────────
    case "crop_updated": {
      // payload: { cropName, trackingID, updateDate, daysFromPlanting, stage, treatment, oldStatus, newStatus }
      msg  = "✏️ <b>Crop Updated</b>\n";
      msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
      msg += "🌿 Crop: <b>" + payload.cropName + "</b>\n";
      msg += "📅 Date: " + _formatDate(payload.updateDate) + "\n";
      msg += "🗓 Day " + payload.daysFromPlanting + " from planting\n";
      if (payload.stage) msg += "🌱 Stage: <b>" + payload.stage + "</b>\n";
      if (payload.treatment && payload.treatment !== "none") {
        msg += "💊 Treatment: <b>" + payload.treatment + "</b>\n";
      }
      if (payload.oldStatus !== payload.newStatus) {
        msg += "📊 Status: " + payload.oldStatus + " → <b>" + payload.newStatus + "</b>\n";
      }
      msg += "\n🆔 <code>" + payload.trackingID + "</code>";
      break;
    }

    // ── 10. Propagation stage updated ─────────────────
    case "prop_updated": {
      // payload: { plantName, trackingID, updateDate, daysFromProp, stage, newStatus }
      msg  = "✏️ <b>Propagation Updated</b>\n";
      msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
      msg += "🌱 Plant: <b>" + payload.plantName + "</b>\n";
      msg += "📅 Date: " + _formatDate(payload.updateDate) + "\n";
      msg += "🗓 Day " + payload.daysFromProp + " from propagation\n";
      if (payload.stage) msg += "🌿 Stage: <b>" + payload.stage + "</b>\n";
      msg += "📊 Status: <b>" + payload.newStatus + "</b>\n";
      msg += "\n🆔 <code>" + payload.trackingID + "</code>";
      break;
    }

    // ── 11. Crop deleted ───────────────────────────────
    case "crop_deleted": {
      // payload: { cropName, trackingID, remindersRemoved, eventsRemoved }
      msg  = "🗑️ <b>Crop Deleted</b>\n";
      msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
      msg += "🌿 Crop: <b>" + payload.cropName + "</b>\n";
      msg += "🆔 <code>" + payload.trackingID + "</code>\n";
      msg += "📊 Status: Deleted\n";
      if (payload.remindersRemoved) msg += "🔔 " + payload.remindersRemoved + " reminder(s) removed\n";
      if (payload.eventsRemoved)    msg += "📅 " + payload.eventsRemoved + " calendar event(s) removed\n";
      msg += "\n<i>Harvest log and learning data retained.</i>";
      break;
    }

    // ── 12. New crop logged ────────────────────────────
    case "crop_logged": {
      // payload: just pass through — _processCropEmail already sends its own
      // rich confirmation. This type is reserved for future use / batch summary.
      return;
    }

    // ── 13. New propagation logged ─────────────────────
    case "prop_logged": {
      return; // _processPropagationEmail sends its own confirmation
    }

    default:
      Logger.log("_notify: unknown type: " + type);
      return;
  }

  if (msg) _tgSend(msg, cid);
}

// Backwards-compat wrapper (called by setupSystem / createTriggers)
function notifyDeployment() { _notify("deploy", {}, CONFIG.TELEGRAM_CHAT_ID); }

// Backwards-compat wrapper (called by runDailyLearningCheck)
function _notifyBackgroundActivity(summary) {
  // Old-style string summary — wrap it
  if (typeof summary === "string") {
    _notify("background", { checks: [summary] }, CONFIG.TELEGRAM_CHAT_ID);
  }
}



// ══════════════════════════════════════════════════════
//  FERTILIZER SCHEDULE DATA
//  Used by the true-leaf check and fertilizer reminder system.
//  5 teas: Cow (C), Chicken (CH), Plant-base (P), Wood Ash (W), Yeast (Y)
//  Dilutions follow the conversation-based chart Alex developed.
// ══════════════════════════════════════════════════════

var FERT_PROFILES = {

  // ─── FRUITING VEGETABLES ─────────────────────────────────────────────
  "fruiting": {
    trueLeafThreshold: 4,   // 2 sets of true leaves
    checkNote: "Fruiting crops (tomato, pepper, eggplant) need 2 full sets of true leaves (4 leaves) before first feeding.",
    stages: {
      seedling: {
        label: "🌱 Seedling (2 sets of true leaves reached)",
        foliar:  "Cow (1:25) + Plant (1:25) + Yeast (1 tsp/L)",
        drench:  "Cow (1:20) + Plant (1:20) + Yeast (1 tbsp/5L)",
        freq:    "Every 7 days",
        freqDays: 7,
        note:    "No chicken or wood ash — roots are still delicate."
      },
      midVeg: {
        label: "🌿 Mid-Vegetative (6–8 true leaves, strong stem)",
        foliar:  "Cow (1:20) + Plant (1:20) + Chicken (1:25)",
        drench:  "Cow (1:15) + Plant (1:15) + Chicken (1:20)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "Nitrogen push for rapid stem and leaf growth."
      },
      flowering: {
        label: "🌸 Pre-Flowering / Flowering (buds visible)",
        foliar:  "Cow (1:25) + Plant (1:25) + Wood Ash (1:30)",
        drench:  "Cow (1:15) + Plant (1:15) + Wood Ash (1:20)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "Potassium & calcium support flower set. Reduce chicken manure."
      },
      fruiting: {
        label: "🍅 Fruiting (fruit forming)",
        foliar:  "Cow (1:25) + Plant (1:25) + Wood Ash (1:30) + Eggshell powder",
        drench:  "Cow (1:15) + Plant (1:15) + Wood Ash (1:20) + Eggshell powder",
        freq:    "Every 10–14 days",
        freqDays: 12,
        note:    "Calcium critical for tomato/pepper to prevent blossom end rot."
      }
    }
  },

  // ─── CUCURBITS (cucumber, melon, pumpkin, squash, watermelon) ────────
  "cucurbit": {
    trueLeafThreshold: 2,   // 1–2 true leaves (fast growers)
    checkNote: "Cucurbits (cucumber, melon, pumpkin, squash) are fast growers — feed once 1–2 true leaves appear.",
    stages: {
      seedling: {
        label: "🌱 Seedling (1–2 true leaves)",
        foliar:  "Cow (1:25) + Plant (1:25) + Yeast (1 tsp/L)",
        drench:  "Cow (1:20) + Plant (1:20) + Yeast (1 tbsp/5L)",
        freq:    "Every 7 days",
        freqDays: 7,
        note:    "Keep mild — cucurbits are sensitive to salt burn at this stage."
      },
      midVeg: {
        label: "🌿 Mid-Vegetative (vine running, 4+ true leaves)",
        foliar:  "Cow (1:20) + Plant (1:20) + Chicken (1:25)",
        drench:  "Cow (1:15) + Plant (1:15) + Chicken (1:20)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "Nitrogen drives vine extension and canopy."
      },
      flowering: {
        label: "🌸 Flowering (male & female flowers open)",
        foliar:  "Cow (1:25) + Plant (1:25) + Wood Ash (1:30)",
        drench:  "Cow (1:15) + Plant (1:15) + Wood Ash (1:20)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "Potassium improves pollination and fruit set."
      },
      fruiting: {
        label: "🍈 Fruiting (fruit swelling)",
        foliar:  "Cow (1:25) + Plant (1:25) + Wood Ash (1:30)",
        drench:  "Cow (1:15) + Plant (1:15) + Wood Ash (1:20)",
        freq:    "Every 10–14 days",
        freqDays: 12,
        note:    "Keep potassium high for sugar accumulation in melon/watermelon."
      }
    }
  },

  // ─── BRASSICAS (broccoli, cabbage, cauliflower) ──────────────────────
  "brassica": {
    trueLeafThreshold: 2,
    checkNote: "Brassicas (broccoli, cabbage, cauliflower) need 2 true leaves before feeding.",
    stages: {
      seedling: {
        label: "🌱 Seedling (2 true leaves)",
        foliar:  "Cow (1:25) + Plant (1:25) + Yeast (1 tsp/L)",
        drench:  "Cow (1:20) + Plant (1:20) + Yeast (1 tbsp/5L)",
        freq:    "Every 7 days",
        freqDays: 7,
        note:    "Brassicas respond well to microbial inoculation early."
      },
      midVeg: {
        label: "🌿 Mid-Vegetative (4–6 true leaves, rosette forming)",
        foliar:  "Cow (1:20) + Plant (1:20) + Chicken (1:25)",
        drench:  "Cow (1:15) + Plant (1:15) + Chicken (1:20)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "Nitrogen for leaf and stem mass."
      },
      flowering: {
        label: "🌸 Head Formation (buds tightening for broccoli/cauliflower)",
        foliar:  "Cow (1:25) + Plant (1:25)",
        drench:  "Cow (1:15) + Plant (1:15)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "Reduce nitrogen. Avoid wood ash — brassicas prefer slightly acidic soil."
      },
      fruiting: {
        label: "🥦 Harvest Stage (head ready)",
        foliar:  "Cow (1:30) + Plant (1:30)",
        drench:  "Cow (1:20) + Plant (1:20)",
        freq:    "Every 14 days",
        freqDays: 14,
        note:    "Light feed only. Focus on head quality not more leaf growth."
      }
    }
  },

  // ─── LEAFY GREENS (callaloo, lettuce, spinach, kale, mustard, pak choi) ─
  "leafy": {
    trueLeafThreshold: 2,
    checkNote: "Leafy greens are light feeders — start once 2 true leaves appear.",
    stages: {
      seedling: {
        label: "🌱 Seedling (2 true leaves)",
        foliar:  "Cow (1:25) + Plant (1:25) + Yeast (1 tsp/L)",
        drench:  "Cow (1:20) + Plant (1:20) + Yeast (1 tbsp/5L)",
        freq:    "Every 7 days",
        freqDays: 7,
        note:    "Very mild. Leafy greens burn easily."
      },
      midVeg: {
        label: "🌿 Vegetative (4+ true leaves, active growth)",
        foliar:  "Cow (1:20) + Plant (1:20) + Chicken (1:25)",
        drench:  "Cow (1:15) + Plant (1:15) + Chicken (1:20)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "Nitrogen drives leaf mass. No wood ash for leafy greens."
      },
      flowering: {
        label: "🌸 Pre-Harvest / Maturity",
        foliar:  "Cow (1:25) + Plant (1:25)",
        drench:  "Cow (1:15) + Plant (1:15)",
        freq:    "Every 10–14 days",
        freqDays: 12,
        note:    "Maintain leaf quality. Avoid bolting by not over-feeding nitrogen."
      },
      fruiting: {
        label: "🥬 Harvest Cycling (continuous harvest crops)",
        foliar:  "Cow (1:25) + Plant (1:25)",
        drench:  "Cow (1:15) + Plant (1:15)",
        freq:    "Every 14 days",
        freqDays: 14,
        note:    "Light maintenance feed after each cut to promote regrowth."
      }
    }
  },

  // ─── ROOT CROPS (carrot, beetroot, radish, sweet potato) ─────────────
  "root": {
    trueLeafThreshold: 2,
    checkNote: "Root crops need 2 true leaves before feeding. Keep nitrogen low — focus on potassium for root development.",
    stages: {
      seedling: {
        label: "🌱 Seedling (2 true leaves)",
        foliar:  "Cow (1:25) + Plant (1:25) + Yeast (1 tsp/L)",
        drench:  "Cow (1:20) + Yeast (1 tbsp/5L)",
        freq:    "Every 7 days",
        freqDays: 7,
        note:    "Minimal nitrogen. Roots develop best without excess N."
      },
      midVeg: {
        label: "🌿 Canopy Stage (leaf cover established)",
        foliar:  "Cow (1:25) + Plant (1:25)",
        drench:  "Cow (1:20) + Plant (1:20)",
        freq:    "Every 10–14 days",
        freqDays: 12,
        note:    "No chicken manure. Balanced, low-nitrogen feeding."
      },
      flowering: {
        label: "🌸 Root Bulking (root enlarging underground)",
        foliar:  "Cow (1:30) + Plant (1:30)",
        drench:  "Cow (1:20) + Plant (1:20) + Wood Ash (1:40, if soil acidic)",
        freq:    "Every 14 days",
        freqDays: 14,
        note:    "Small potassium boost supports root quality. Avoid excess water."
      },
      fruiting: {
        label: "🥕 Near-Harvest",
        foliar:  "Plain water only — no spray",
        drench:  "Cow (1:25) — very light",
        freq:    "Every 14–21 days",
        freqDays: 17,
        note:    "Stop heavy feeding 2 weeks before harvest for best flavour."
      }
    }
  },

  // ─── LEGUMES (red peas, gungo peas, string beans) ────────────────────
  "legume": {
    trueLeafThreshold: 1,   // first trifoliate leaf
    checkNote: "Legumes fix their own nitrogen — feed very lightly. Start once the first trifoliate (true) leaf appears.",
    stages: {
      seedling: {
        label: "🌱 Seedling (first true/trifoliate leaf)",
        foliar:  "Plant (1:30) + Yeast (1 tsp/L)",
        drench:  "Plant (1:25) + Yeast (1 tbsp/5L)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "No cow or chicken manure at this stage — nitrogen-fixing bacteria need to establish first."
      },
      midVeg: {
        label: "🌿 Vegetative (4+ leaves, nodules forming)",
        foliar:  "Plant (1:25) + Cow (1:30)",
        drench:  "Plant (1:20) + Cow (1:25)",
        freq:    "Every 10–14 days",
        freqDays: 12,
        note:    "Very light feeding. Legumes self-supply most nitrogen."
      },
      flowering: {
        label: "🌸 Flowering",
        foliar:  "Plant (1:25) + Wood Ash (1:35)",
        drench:  "Plant (1:20) + Wood Ash (1:30)",
        freq:    "Every 14 days",
        freqDays: 14,
        note:    "Potassium improves pod set."
      },
      fruiting: {
        label: "🫘 Pod Fill",
        foliar:  "Plant (1:30) + Wood Ash (1:35)",
        drench:  "Plant (1:25) + Wood Ash (1:30)",
        freq:    "Every 14 days",
        freqDays: 14,
        note:    "Light potassium to fill pods. No nitrogen boost needed."
      }
    }
  },

  // ─── HERBS (thyme, basil, lemongrass, scallion) ──────────────────────
  "herb": {
    trueLeafThreshold: 2,
    checkNote: "Herbs prefer light feeding. Wait for 2 true leaves then feed sparingly.",
    stages: {
      seedling: {
        label: "🌱 Seedling (2 true leaves)",
        foliar:  "Cow (1:30) + Plant (1:30) + Yeast (1 tsp/L)",
        drench:  "Cow (1:25) + Plant (1:25) + Yeast (1 tbsp/5L)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "Herbs are sensitive. Keep very dilute."
      },
      midVeg: {
        label: "🌿 Active Growth (bushy, 4+ leaves)",
        foliar:  "Cow (1:25) + Plant (1:25)",
        drench:  "Cow (1:20) + Plant (1:20)",
        freq:    "Every 14 days",
        freqDays: 14,
        note:    "No chicken manure — excess nitrogen reduces aroma."
      },
      flowering: {
        label: "🌸 Pre-Flower / Mature",
        foliar:  "Plant (1:30)",
        drench:  "Cow (1:25) + Plant (1:25)",
        freq:    "Every 14–21 days",
        freqDays: 17,
        note:    "Avoid nitrogen when flowering — preserves essential oils."
      },
      fruiting: {
        label: "✂️ Harvest / Cutting Stage",
        foliar:  "Plain water only",
        drench:  "Cow (1:30)",
        freq:    "Every 21 days",
        freqDays: 21,
        note:    "After each harvest cut, a light cow manure drench promotes regrowth."
      }
    }
  },

  // ─── ALLIUMS / BULBS (onion, garlic, scallion/escallion) ─────────────
  "allium": {
    trueLeafThreshold: 3,   // 3 leaf blades
    checkNote: "Alliums (onion, garlic, scallion) need 3 leaf blades before feeding.",
    stages: {
      seedling: {
        label: "🌱 Seedling (3 leaf blades / pencil-thin)",
        foliar:  "Cow (1:25) + Plant (1:25) + Yeast (1 tsp/L)",
        drench:  "Cow (1:20) + Plant (1:20) + Yeast (1 tbsp/5L)",
        freq:    "Every 7 days",
        freqDays: 7,
        note:    "Nitrogen supports early leaf growth."
      },
      midVeg: {
        label: "🌿 Bulb Initiation (leaves thickening)",
        foliar:  "Cow (1:20) + Plant (1:20) + Chicken (1:25)",
        drench:  "Cow (1:15) + Plant (1:15) + Chicken (1:20)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "Nitrogen push before bulbing begins."
      },
      flowering: {
        label: "🌸 Bulb Swelling",
        foliar:  "Plant (1:25) + Wood Ash (1:30)",
        drench:  "Plant (1:20) + Wood Ash (1:25)",
        freq:    "Every 10–14 days",
        freqDays: 12,
        note:    "Reduce nitrogen. Potassium + phosphorus drive bulb size."
      },
      fruiting: {
        label: "🧅 Maturity (tops falling over for onion/garlic)",
        foliar:  "Plain water — no spray",
        drench:  "Plant (1:25) + Wood Ash (1:30)",
        freq:    "Every 14 days",
        freqDays: 14,
        note:    "Stop nitrogen completely. Potassium hardens bulbs for storage."
      }
    }
  },

  // ─── GRAIN (corn/maize) ──────────────────────────────────────────────
  "grain": {
    trueLeafThreshold: 3,
    checkNote: "Corn/maize: wait for 3 true leaves (V3 stage) before first fertilizer application.",
    stages: {
      seedling: {
        label: "🌱 Seedling (3 true leaves / V3)",
        foliar:  "Cow (1:25) + Plant (1:25) + Yeast (1 tsp/L)",
        drench:  "Cow (1:20) + Plant (1:20) + Yeast (1 tbsp/5L)",
        freq:    "Every 7 days",
        freqDays: 7,
        note:    "Phosphorus critical for root establishment."
      },
      midVeg: {
        label: "🌿 Rapid Growth (knee-high, V6+)",
        foliar:  "Cow (1:20) + Plant (1:20) + Chicken (1:20)",
        drench:  "Cow (1:15) + Plant (1:15) + Chicken (1:15)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "Heavy nitrogen demand during rapid elongation."
      },
      flowering: {
        label: "🌸 Tasselling / Silking",
        foliar:  "Cow (1:25) + Plant (1:25) + Wood Ash (1:30)",
        drench:  "Cow (1:15) + Plant (1:15) + Wood Ash (1:20)",
        freq:    "Every 10 days",
        freqDays: 10,
        note:    "Potassium for pollination and ear fill."
      },
      fruiting: {
        label: "🌽 Ear Fill / Grain Filling",
        foliar:  "Plant (1:25) + Wood Ash (1:30)",
        drench:  "Plant (1:20) + Wood Ash (1:25)",
        freq:    "Every 14 days",
        freqDays: 14,
        note:    "Reduce nitrogen. Potassium drives starch accumulation."
      }
    }
  },

  // ─── TUBERS / RHIZOMES (cassava, ginger, sweet potato) ───────────────
  "tuber": {
    trueLeafThreshold: 2,
    checkNote: "Cassava/ginger/sweet potato: feed once 2–3 leaves are established.",
    stages: {
      seedling: {
        label: "🌱 Establishment (first 2 leaves)",
        foliar:  "Cow (1:25) + Plant (1:25) + Yeast (1 tsp/L)",
        drench:  "Cow (1:20) + Plant (1:20) + Yeast (1 tbsp/5L)",
        freq:    "Every 7–10 days",
        freqDays: 8,
        note:    "Gentle start. Support root and shoot establishment."
      },
      midVeg: {
        label: "🌿 Canopy / Vine Growth",
        foliar:  "Cow (1:20) + Plant (1:20) + Chicken (1:25)",
        drench:  "Cow (1:15) + Plant (1:15) + Chicken (1:20)",
        freq:    "Every 10–14 days",
        freqDays: 12,
        note:    "Nitrogen for canopy. Tubers begin forming underground."
      },
      flowering: {
        label: "🌸 Tuber Bulking",
        foliar:  "Plant (1:25) + Wood Ash (1:30)",
        drench:  "Cow (1:20) + Plant (1:20) + Wood Ash (1:25)",
        freq:    "Every 14 days",
        freqDays: 14,
        note:    "Potassium and phosphorus drive tuber size and starch."
      },
      fruiting: {
        label: "🍠 Near-Harvest",
        foliar:  "Plain water only",
        drench:  "Wood Ash (1:30) + Cow (1:25)",
        freq:    "Every 21 days",
        freqDays: 21,
        note:    "Stop nitrogen 3 weeks before harvest. Harden off tubers."
      }
    }
  }
};

// ── Crop key → fertilizer profile ──────────────────────────────────────
var CROP_FERT_TYPE = {
  // Fruiting vegetables
  "tomato": "fruiting", "hot pepper": "fruiting", "sweet pepper (bell pepper)": "fruiting",
  "eggplant (aubergine)": "fruiting", "okra": "fruiting",
  // Cucurbits
  "cucumber": "cucurbit", "pumpkin": "cucurbit", "squash (butternut / zucchini)": "cucurbit",
  "watermelon": "cucurbit", "melon": "cucurbit",
  // Brassicas
  "broccoli": "brassica", "cabbage": "brassica", "cauliflower": "brassica",
  // Leafy greens
  "callaloo": "leafy", "pak choi (bok choy)": "leafy", "lettuce": "leafy",
  "spinach": "leafy", "kale": "leafy", "mustard greens": "leafy",
  // Root crops
  "carrot": "root", "beetroot": "root", "radish": "root", "sweet potato": "root",
  // Legumes
  "red peas (kidney beans)": "legume", "gungo peas (pigeon peas)": "legume",
  "string beans (green beans)": "legume",
  // Herbs
  "thyme": "herb", "basil": "herb", "lemongrass (fever grass)": "herb",
  "scallion": "herb",
  // Alliums
  "onion": "allium", "garlic": "allium",
  // Grain
  "corn (maize)": "grain",
  // Tubers
  "cassava (yuca)": "tuber", "ginger": "tuber"
};

/**
 * Look up a crop's fertilizer profile type.
 * Falls back to "fruiting" if not mapped (covers most vegetables).
 */
// ══════════════════════════════════════════════════════
//  FERTILIZER JSON DATABASE — loaded from Google Drive
//  File: fertilizer_schedule.json (My Drive root)
//  Falls back to hardcoded FERT_PROFILES if file missing.
// ══════════════════════════════════════════════════════

var _fertDbCache = null;

/**
 * Load fertilizer_schedule.json from Google Drive.
 * Caches in _fertDbCache for the lifetime of this execution.
 * Returns the parsed JSON object, or null on failure.
 */
function _loadFertDb() {
  if (_fertDbCache) return _fertDbCache;
  try {
    var files = DriveApp.getFilesByName("fertilizer_schedule.json");
    if (!files.hasNext()) {
      Logger.log("fertilizer_schedule.json not found in Drive — using hardcoded profiles.");
      return null;
    }
    var raw = files.next().getBlob().getDataAsString();
    _fertDbCache = JSON.parse(raw);
    Logger.log("fertilizer_schedule.json loaded OK. Crops: " + Object.keys(_fertDbCache.crops || {}).length);
    return _fertDbCache;
  } catch(e) {
    Logger.log("_loadFertDb error: " + e.message);
    return null;
  }
}

/**
 * Look up a crop's fertilizer entry from the JSON database.
 * Returns the crop entry (with .stages, .fert_profile etc.) or null.
 */
function _lookupFertCrop(cropName) {
  var db = _loadFertDb();
  if (!db || !db.crops) return null;
  var key = (cropName || "").toLowerCase().trim();
  if (db.crops[key]) return db.crops[key];
  // Partial match
  var keys = Object.keys(db.crops);
  for (var i = 0; i < keys.length; i++) {
    if (key.includes(keys[i]) || keys[i].includes(key)) return db.crops[keys[i]];
  }
  return null;
}

/**
 * Map GAS stage key (midVeg) to JSON stage key (mid_vegetative).
 */
function _jsonStageKey(gasKey) {
  var map = { seedling: "seedling", midVeg: "mid_vegetative", flowering: "flowering", fruiting: "fruiting" };
  return map[gasKey] || gasKey;
}

/**
 * Get the fertilizer profile for a crop.
 * Tries JSON DB first, falls back to hardcoded FERT_PROFILES.
 * Returns an object with a .stages property in GAS key format,
 * plus a .fromJson flag and .meta reference.
 */
function _getFertProfile(cropName) {
  var entry = _lookupFertCrop(cropName);
  if (entry && entry.stages) {
    // Wrap JSON stages into GAS-compatible format
    var stages = {};
    var jsonToGas = { seedling: "seedling", mid_vegetative: "midVeg", flowering: "flowering", fruiting: "fruiting" };
    Object.keys(jsonToGas).forEach(function(jk) {
      var gk = jsonToGas[jk];
      var s  = entry.stages[jk];
      if (!s) return;
      // Build human-readable foliar/drench strings from mix_parts + dilution
      stages[gk] = {
        label:    _fertStageLabel(gk, entry.fert_profile),
        foliar:   _fertMixStr(s.foliar),
        drench:   _fertMixStr(s.drench),
        freq:     _fertFreqStr(gk, entry.fert_profile),
        freqDays: _fertFreqDays(gk, entry.fert_profile),
        note:     s.foliar.note || s.drench.note || "",
        // Raw JSON data also available
        raw_foliar: s.foliar,
        raw_drench: s.drench
      };
    });
    return {
      trueLeafThreshold: _trueLeafThresholdForProfile(entry.fert_profile),
      checkNote: entry.fert_profile,
      stages: stages,
      fromJson: true,
      meta: (_loadFertDb() || {})._meta || {}
    };
  }
  // Fallback to hardcoded
  var key  = (cropName || "").toLowerCase().trim();
  var type = CROP_FERT_TYPE[key];
  if (!type) {
    var keys2 = Object.keys(CROP_FERT_TYPE);
    for (var i = 0; i < keys2.length; i++) {
      if (key.includes(keys2[i]) || keys2[i].includes(key)) { type = CROP_FERT_TYPE[keys2[i]]; break; }
    }
  }
  return FERT_PROFILES[type || "fruiting"];
}

/** Build a human-readable mix string from a JSON foliar/drench object. */
function _fertMixStr(stageHalf) {
  if (!stageHalf) return "Plain water";
  var parts = stageHalf.mix_parts || {};
  var names = { cow_manure_tea: "Cow", chicken_manure_tea: "Chicken", plant_based_tea: "Plant", wood_ash_tea: "Wood Ash" };
  var dil   = stageHalf.final_dilution || 20;
  var active = Object.keys(parts).filter(function(k){ return parts[k] > 0; });
  if (active.length === 0) return "Plain water only";
  var str = active.map(function(k){ return names[k] || k; }).join(" + ");
  str += " (1:" + dil + ")";
  if (stageHalf.yeast_tsp_per_litre) str += " + Yeast (" + stageHalf.yeast_tsp_per_litre + " tsp/L)";
  if (stageHalf.yeast_tbsp_per_5L)   str += " + Yeast (" + stageHalf.yeast_tbsp_per_5L + " tbsp/5L)";
  return str;
}

/** Return frequency string for a stage/profile. */
function _fertFreqStr(gasStageKey, profileKey) {
  var map = {
    seedling:   { fruiting:"Every 7 days", cucurbit:"Every 7 days", brassica:"Every 7 days", leafy:"Every 7 days",
                  root:"Every 7 days", legume:"Every 10 days", herb:"Every 10 days", allium:"Every 7 days",
                  grain:"Every 7 days", tuber_no_ash:"Every 7-10 days", sweet_potato:"Every 7-10 days" },
    midVeg:     { fruiting:"Every 10 days", cucurbit:"Every 10 days", brassica:"Every 10 days", leafy:"Every 10 days",
                  root:"Every 10-14 days", legume:"Every 10-14 days", herb:"Every 14 days", allium:"Every 10 days",
                  grain:"Every 10 days", tuber_no_ash:"Every 10-14 days", sweet_potato:"Every 10-14 days" },
    flowering:  { fruiting:"Every 10 days", cucurbit:"Every 10 days", brassica:"Every 10 days", leafy:"Every 10-14 days",
                  root:"Every 14 days", legume:"Every 14 days", herb:"Every 14-21 days", allium:"Every 10-14 days",
                  grain:"Every 10 days", tuber_no_ash:"Every 14 days", sweet_potato:"Every 14 days" },
    fruiting:   { fruiting:"Every 10-14 days", cucurbit:"Every 10-14 days", brassica:"Every 14 days", leafy:"Every 14 days",
                  root:"Every 14-21 days", legume:"Every 14 days", herb:"Every 21 days", allium:"Every 14 days",
                  grain:"Every 14 days", tuber_no_ash:"Every 21 days", sweet_potato:"Every 21 days" }
  };
  return (map[gasStageKey] && map[gasStageKey][profileKey]) || "Every 10-14 days";
}

/** Return numeric freqDays for scheduling. */
function _fertFreqDays(gasStageKey, profileKey) {
  var str = _fertFreqStr(gasStageKey, profileKey);
  var m = str.match(/(\d+)/);
  return m ? parseInt(m[1]) : 10;
}

/** Return a nice stage label. */
function _fertStageLabel(gasStageKey, profileKey) {
  var labels = {
    seedling:  "\uD83C\uDF31 Seedling (2-3 true leaves reached)",
    midVeg:    "\uD83C\uDF3F Mid-Vegetative (active growth)",
    flowering: "\uD83C\uDF38 Pre-Flowering / Flowering",
    fruiting:  "\uD83C\uDF45 Fruiting / Harvest Stage"
  };
  return labels[gasStageKey] || gasStageKey;
}

/** Return true-leaf threshold from profile key. */
function _trueLeafThresholdForProfile(profileKey) {
  var t = { fruiting:4, cucurbit:2, brassica:2, leafy:2, root:2, legume:1, herb:2, allium:3, grain:3, tuber_no_ash:2, sweet_potato:2 };
  return t[profileKey] || 2;
}

/** Test: run from Apps Script editor to verify JSON loaded. */
function testFertDb() {
  var db = _loadFertDb();
  if (!db) { Logger.log("ERROR: fertilizer_schedule.json not found"); return; }
  Logger.log("Meta version: " + db._meta.version);
  Logger.log("Crops in DB: " + Object.keys(db.crops).length);
  var tomato = _lookupFertCrop("tomato");
  if (tomato) {
    Logger.log("Tomato profile: " + tomato.fert_profile);
    Logger.log("Tomato seedling foliar mix: " + JSON.stringify(tomato.stages.seedling.foliar.mix_parts));
    Logger.log("Tomato seedling mixing example: " + tomato.stages.seedling.foliar.mixing_example);
  }
  var profile = _getFertProfile("tomato");
  Logger.log("getFertProfile(tomato) fromJson=" + profile.fromJson);
  Logger.log("seedling foliar str: " + profile.stages.seedling.foliar);
}

// ══════════════════════════════════════════════════════
//  TELEGRAM PIN UTILITIES
// ══════════════════════════════════════════════════════

/**
 * Send a message and return the message_id (needed for pinning).
 * Uses the same HTML parse_mode as _tgSend.
 */
function _tgSendAndGetId(text, chatId) {
  const cid = (chatId && chatId !== "YOUR_CHAT_ID_HERE") ? chatId : CONFIG.TELEGRAM_CHAT_ID;
  if (!cid) return null;
  try {
    const resp = UrlFetchApp.fetch(
      "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/sendMessage",
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ chat_id: cid, text: text, parse_mode: "HTML" }),
        muteHttpExceptions: true
      }
    );
    const json = JSON.parse(resp.getContentText());
    if (json.ok) return json.result.message_id;
    Logger.log("_tgSendAndGetId error: " + resp.getContentText());
    return null;
  } catch(e) {
    Logger.log("_tgSendAndGetId exception: " + e.message);
    return null;
  }
}

/**
 * Pin a message in the chat by its message_id.
 * disable_notification: true = pin silently (no "pinned message" system notification).
 */
function _tgPin(messageId, chatId, silent) {
  const cid = chatId || CONFIG.TELEGRAM_CHAT_ID;
  if (!messageId || !cid) return false;
  try {
    const resp = UrlFetchApp.fetch(
      "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/pinChatMessage",
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          chat_id: cid,
          message_id: messageId,
          disable_notification: silent !== false   // default true (silent)
        }),
        muteHttpExceptions: true
      }
    );
    const json = JSON.parse(resp.getContentText());
    return json.ok === true;
  } catch(e) {
    Logger.log("_tgPin error: " + e.message);
    return false;
  }
}

/**
 * Unpin a specific message_id, or the most recent pinned if no id given.
 */
function _tgUnpin(messageId, chatId) {
  const cid = chatId || CONFIG.TELEGRAM_CHAT_ID;
  if (!cid) return false;
  try {
    const payload = { chat_id: cid };
    if (messageId) payload.message_id = messageId;
    const resp = UrlFetchApp.fetch(
      "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/unpinChatMessage",
      { method: "post", contentType: "application/json",
        payload: JSON.stringify(payload), muteHttpExceptions: true }
    );
    return JSON.parse(resp.getContentText()).ok === true;
  } catch(e) { return false; }
}

/**
 * Unpin ALL pinned messages in the chat.
 */
function _tgUnpinAll(chatId) {
  const cid = chatId || CONFIG.TELEGRAM_CHAT_ID;
  if (!cid) return false;
  try {
    const resp = UrlFetchApp.fetch(
      "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/unpinAllChatMessages",
      { method: "post", contentType: "application/json",
        payload: JSON.stringify({ chat_id: cid }), muteHttpExceptions: true }
    );
    return JSON.parse(resp.getContentText()).ok === true;
  } catch(e) { return false; }
}

/**
 * Store a pinned message ID in ScriptProperties so we can replace it later.
 * key: e.g. "pinned_status", "pinned_weekly", "pinned_custom"
 */
function _savePinnedId(key, messageId) {
  PropertiesService.getScriptProperties().setProperty("pinned_" + key, String(messageId));
}

function _getPinnedId(key) {
  const val = PropertiesService.getScriptProperties().getProperty("pinned_" + key);
  return val ? parseInt(val) : null;
}

function _clearPinnedId(key) {
  PropertiesService.getScriptProperties().deleteProperty("pinned_" + key);
}

/**
 * Send a message, pin it, and unpin the previous one for that slot.
 * slot: string key for this "pin slot" (e.g. "status", "weekly", "custom")
 * Returns the new message_id or null.
 */
function _sendAndReplace(text, chatId, slot, silent) {
  const cid = chatId || CONFIG.TELEGRAM_CHAT_ID;
  // Unpin previous message in this slot
  const oldId = _getPinnedId(slot);
  if (oldId) _tgUnpin(oldId, cid);
  // Send + pin new message
  const newId = _tgSendAndGetId(text, cid);
  if (newId) {
    _tgPin(newId, cid, silent !== false);
    _savePinnedId(slot, newId);
  }
  return newId;
}

// ══════════════════════════════════════════════════════
//  TELEGRAM CORE FUNCTIONS
// ══════════════════════════════════════════════════════

/**
 * Send a Telegram message to your chat.
 * Splits messages longer than 4096 chars automatically.
 * chatId param always takes priority — CONFIG.TELEGRAM_CHAT_ID is only a fallback.
 */
function _tgSend(text, chatId) {
  // Always prefer the explicit chatId; fall back to config only if both are set
  const cid = (chatId && chatId !== "YOUR_CHAT_ID_HERE") ? chatId
            : (CONFIG.TELEGRAM_CHAT_ID !== "YOUR_CHAT_ID_HERE" ? CONFIG.TELEGRAM_CHAT_ID : null);
  if (!cid) {
    Logger.log("⚠️ No chat ID available. Message not sent:\n" + text.substring(0, 200));
    return;
  }
  const url = "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/sendMessage";
  const maxLen = 4000;
  let parts = [];
  // Split on newlines to avoid cutting mid-word
  if (text.length <= maxLen) {
    parts = [text];
  } else {
    let remaining = text;
    while (remaining.length > maxLen) {
      let cut = remaining.lastIndexOf("\n", maxLen);
      if (cut < 1000) cut = maxLen;
      parts.push(remaining.substring(0, cut));
      remaining = remaining.substring(cut);
    }
    if (remaining.length > 0) parts.push(remaining);
  }
  parts.forEach(function(part) {
    try {
      UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({
          chat_id: cid,
          text: part,
          parse_mode: "HTML"
        }),
        muteHttpExceptions: true
      });
    } catch(e) {
      Logger.log("Telegram send error: " + e.message);
    }
  });
}

// ══════════════════════════════════════════════════════
//  POLLING MODE — no webhook needed, no 302/405 errors
//  A 1-minute trigger calls pollTelegram() which fetches
//  new messages via getUpdates and processes them directly.
// ══════════════════════════════════════════════════════

/**
 * ★ MAIN POLLING FUNCTION — called every minute by a time trigger.
 * Fetches new Telegram messages using getUpdates (long-poll offset).
 * No webhook, no 302, no deployment URL needed.
 */
function pollTelegram() {
  const props     = PropertiesService.getScriptProperties();
  const offsetKey = "tg_offset";
  let   offset    = parseInt(props.getProperty(offsetKey) || "0", 10);

  const url  = "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN +
               "/getUpdates?offset=" + offset + "&limit=10&timeout=0&allowed_updates=message,callback_query,poll_answer";
  let resp, json;
  try {
    resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    json = JSON.parse(resp.getContentText());
  } catch(e) {
    Logger.log("pollTelegram fetch error: " + e.message);
    return;
  }

  if (!json.ok || !json.result || json.result.length === 0) return;

  json.result.forEach(function(update) {
    try {
      _processTelegramUpdate(update);
    } catch(e) {
      Logger.log("Error processing update " + update.update_id + ": " + e.message + "\n" + e.stack);
    }
    offset = update.update_id + 1;
  });

  props.setProperty(offsetKey, String(offset));
}

/**
 * ★ RUN THIS ONCE to set up polling.
 * Deletes any old webhook and creates the 1-minute polling trigger.
 * You do NOT need to deploy as a Web App for this to work.
 */
function setupPolling() {
  // Step 1: Remove any existing webhook so Telegram stops trying to push
  try {
    const delResp = UrlFetchApp.fetch(
      "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/deleteWebhook?drop_pending_updates=true",
      { muteHttpExceptions: true }
    );
    Logger.log("Webhook removed: " + delResp.getContentText());
  } catch(e) {
    Logger.log("deleteWebhook error: " + e.message);
  }

  // Step 2: Reset offset so we start fresh (skip old messages)
  try {
    const updResp = UrlFetchApp.fetch(
      "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/getUpdates?offset=-1&limit=1",
      { muteHttpExceptions: true }
    );
    const updJson = JSON.parse(updResp.getContentText());
    if (updJson.ok && updJson.result && updJson.result.length > 0) {
      const lastId = updJson.result[0].update_id + 1;
      PropertiesService.getScriptProperties().setProperty("tg_offset", String(lastId));
      Logger.log("Offset set to: " + lastId + " (skipping old messages)");
    } else {
      PropertiesService.getScriptProperties().setProperty("tg_offset", "0");
      Logger.log("No old messages — offset set to 0");
    }
  } catch(e) {
    Logger.log("Offset reset error: " + e.message);
  }

  // Step 3: Delete old pollTelegram triggers, create a fresh 1-minute one
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "pollTelegram") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("pollTelegram").timeBased().everyMinutes(1).create();
  Logger.log("✅ Polling trigger created — bot will check for messages every minute.");
  Logger.log("Send a message to your bot and within 60 seconds you will get a reply.");
  Logger.log("You do NOT need to deploy as a Web App.");
}

/**
 * Check polling status — shows last offset and whether trigger is active.
 */
function checkPollingStatus() {
  const offset   = PropertiesService.getScriptProperties().getProperty("tg_offset") || "0";
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "pollTelegram");
  Logger.log("Polling offset:  " + offset);
  Logger.log("Active triggers: " + triggers.length + (triggers.length > 0 ? " ✅" : " ❌ — run setupPolling()"));
  // Quick test fetch
  const resp = UrlFetchApp.fetch(
    "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/getWebhookInfo",
    { muteHttpExceptions: true }
  );
  const info = JSON.parse(resp.getContentText()).result;
  Logger.log("Webhook URL:     " + (info.url || "none (correct for polling)"));
  Logger.log("Pending updates: " + info.pending_update_count);
  if (!info.url) Logger.log("✅ No webhook set — polling mode is correct.");
}

/**
 * Stop polling — removes the 1-minute trigger.
 */
function stopPolling() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "pollTelegram") ScriptApp.deleteTrigger(t);
  });
  Logger.log("Polling stopped.");
}

/**
 * Send a test message to confirm the bot can reach you.
 * Run this to verify CONFIG.TELEGRAM_CHAT_ID is correct.
 */
function testBotConnection() {
  const resp = UrlFetchApp.fetch(
    "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/sendMessage",
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_CHAT_ID,
        text: "✅ <b>CropManager v9 is connected!</b>\n\nPolling mode is active. Send /help to see all commands.",
        parse_mode: "HTML"
      }),
      muteHttpExceptions: true
    }
  );
  const json = JSON.parse(resp.getContentText());
  Logger.log(json.ok ? "✅ Test message sent!" : "❌ Failed: " + JSON.stringify(json));
}

// doGet kept for compatibility — not needed for polling
function doGet(e) {
  return ContentService.createTextOutput("CropManager v9 is running (polling mode).");
}



/**
 * Process a single Telegram update (message).
 */
function _processTelegramUpdate(update) {
  // ── Poll answers (tray color selections) ─────────────
  if (update.poll_answer) { _handlePollAnswer(update.poll_answer); return; }
  // ── Inline button presses ─────────────────────────────
  if (update.callback_query) { _handleCallbackQuery(update.callback_query); return; }
  if (!update.message) return;

  const msg    = update.message;
  const chatId = String(msg.chat.id);
  const raw    = (msg.text || "").trim();
  const text   = raw.replace(/\\n/g, "\n").trim();
  if (!text) return;

  if (CONFIG.TELEGRAM_CHAT_ID === "YOUR_CHAT_ID_HERE") {
    Logger.log("ℹ️ First message from chat ID: " + chatId);
  } else if (chatId !== String(CONFIG.TELEGRAM_CHAT_ID)) {
    Logger.log("Ignored message from unknown chat: " + chatId);
    return;
  }

  // ── Built-in commands ─────────────────────────────────
  const lower = text.trim().toLowerCase();
  if (text === "/start")                  { _sendFullHelp(chatId); return; }
  if (text === "/help")                   { _sendFullHelp(chatId); return; }
  if (text.startsWith("/status"))         { _sendStatusReport(chatId); return; }
  if (lower === "/pin"    || lower === "pin")   { _sendPinMenu(chatId); return; }
  if (lower === "/fert"   || lower === "fert schedule") { _sendFertScheduleMenu(chatId); return; }
  if (lower === "unpin all")                    { _tgUnpinAll(chatId); _tgSend("✅ All unpinned.", chatId); return; }
  if (lower === "/today")  { _sendTodayBriefing(chatId); return; }  // bare "today" → date-entry flow below
  if (lower === "/crops" || lower === "crops") { _sendActiveCropsList(chatId); return; }
  if (lower === "/week"  || lower === "week")  { _sendWeekAhead(chatId); return; }
  if (lower === "/harvest report" || lower === "harvest report") { _sendHarvestReport(chatId); return; }
  if (lower === "/weather" || lower === "weather") { _sendWeatherForecast(chatId); return; }
  if (lower === "/gaps"   || lower === "gaps")   { _sendSuccessionGapAnalysis(chatId); return; }
  if (lower === "/menu" || lower === "menu") { _sendMenu(chatId); return; }
  if (lower === "/cancel" || lower === "cancel") {
    _clearSession(chatId);
    _tgSend("❌ Cancelled. Send <code>menu</code> to start again.", chatId);
    return;
  }

  // ── Active session: continue whichever flow is open ───
  const session = _getSession(chatId);
  if (session) {
    switch (session.type) {
      case "date_entry":  _continueDateEntry(session, text, chatId);        return;
      case "crop":        _continueCropOnboarding(session, text, chatId);   return;
      case "batch_crop":  _continueBatchCropOnboarding(session, text, chatId); return;
      case "crop_update": _continueCropUpdateOnboarding(session, text, chatId); return;
      case "quick_event": _continueQuickEventOnboarding(session, text, chatId); return;
      case "db_edit":     _continueDbEditFlow(session, text, chatId);       return;
      case "pin_custom":  _continuePinCustom(session, text, chatId);        return;
      case "crop_delete": _continueCropDeleteOnboarding(session, text, chatId); return;
      case "prop":        _continuePropOnboarding(session, text, chatId);   return;
      case "batch_prop":  _continueBatchPropOnboarding(session, text, chatId); return;
      case "prop_update": _continuePropUpdateOnboarding(session, text, chatId); return;
    }
  }

  // ── Date-first entry point ─────────────────────────────
  // "today", "yesterday", or any recognisable date → ask what they did
  var parsedEntryDate = null;
  if (lower === "today")     { parsedEntryDate = new Date(); }
  else if (lower === "yesterday") {
    parsedEntryDate = new Date();
    parsedEntryDate.setDate(parsedEntryDate.getDate() - 1);
  } else {
    // Try parsing as a date ("mar 12", "12 march", "12-03-2026", etc.)
    var attemptDate = _parseDate(lower);
    // Only accept if it looks like a standalone date, not a random word
    if (attemptDate && lower.match(/\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i)) {
      parsedEntryDate = attemptDate;
    }
  }
  if (parsedEntryDate) {
    _startDateEntry(parsedEntryDate, chatId);
    return;
  }

  // ── Direct keyword shortcuts ──────────────────────────
  if (lower === "edit db" || lower === "edit database" || lower === "/editdb") { _startDbEditFlow(chatId); return; }
  if (lower === "crop"  || lower === "/crop")   { _sendCropHub(chatId,  null); return; }
  if (lower === "prop"  || lower === "propagation" || lower === "/prop") { _sendPropHub(chatId, null); return; }
  if (lower === "batch crop"  || lower === "batch crops")         { _startBatchCropOnboarding(chatId);  return; }
  if (lower === "update crop")                                    { _startCropUpdateOnboarding(chatId); return; }
  if (lower === "delete crop")                                    { _startCropDeleteOnboarding(chatId); return; }
  if (lower === "batch prop"  || lower === "batch propagation")   { _startBatchPropOnboarding(chatId);  return; }
  if (lower === "update prop" || lower === "update propagation")  { _startPropUpdateOnboarding(chatId); return; }

  // ── Legacy structured-text messages still work ────────
  _routeIncomingMessage(text, chatId);
}

/**
 * Route incoming text to the right handler based on content.
 */
function _routeIncomingMessage(text, chatId) {
  const fields = _parseFields(text);
  const dataType = (fields["data type"] || fields["type"] || "").trim().toLowerCase();

  // ── Crop logging ──────────────────────────────────
  if (dataType === "crop") {
    if (fields["crop id"] && (fields["status"] || "").trim().toLowerCase() === "delete") {
      _processCropDelete(fields, chatId);
    } else if (fields["crop id"] && (fields["status"] || "").trim().toLowerCase() === "planted") {
      // BATCH PLANTING CONFIRMATION
      _processBatchPlantedUpdate(fields, chatId);
    } else if (fields["crop id"]) {
      _processCropUpdate(fields, chatId);
    } else {
      // Check for batch (multiple crops separated by ---)
      const blocks = _splitBatchBlocks(text);
      if (blocks.length > 1) {
        _processBatchCrops(blocks, chatId);
      } else {
        _processCropEmail(fields, chatId);
      }
    }
    return;
  }

  // ── Propagation logging ───────────────────────────
  if (dataType === "propagation") {
    const blocks = _splitBatchBlocks(text);
    if (blocks.length > 1) {
      _processBatchPropagations(blocks, chatId);
    } else {
      if (fields["prop id"]) _processPropUpdate(fields, chatId);
      else _processPropagationEmail(fields, chatId);
    }
    return;
  }

  // ── Reply keywords (no data type needed) ─────────
  const lower = text.toLowerCase();
  // True leaf count reply
  if (lower.match(/^true\s+leaves?\s+\d/i)) {
    _handleTrueLeafReply(text, chatId);
    return;
  }
  if (lower.startsWith("germinated") || lower.startsWith("not germinated")) {
    _handleGerminationReply(text, chatId);
    return;
  }
  if (lower.startsWith("harvested")) {
    _handleHarvestReply(text, chatId);
    return;
  }
  if (lower.startsWith("ready") || lower.startsWith("transplanted")) {
    _handleReadyReply(text, chatId);
    return;
  }
  if (lower.startsWith("rooted")) {
    _handleRootedReply(text, chatId);
    return;
  }

  // ── Fallback: try to guess intent ─────────────────
  if (fields["crop name"] || fields["crop"]) {
    _processCropEmail(fields, chatId);
    return;
  }
  if (fields["plant name"] || fields["plant"]) {
    _processPropagationEmail(fields, chatId);
    return;
  }

  _tgSend(
    "❓ <b>Message not recognised.</b>\n\n" +
    "Send /help to see all message formats.\n\n" +
    "Most messages need:\n<code>data type - crop</code>\nor\n<code>data type - propagation</code>",
    chatId
  );
}



// ══════════════════════════════════════════════════════
//  INTERACTIVE ONBOARDING ENGINE  v2
//  7 flows: new crop, batch crop, crop update, crop delete,
//           new prop, batch prop, prop update
//  State stored in ScriptProperties under "session_<chatId>"
// ══════════════════════════════════════════════════════

// ── Telegram helpers ─────────────────────────────────────────────────────────

function _tgSendPoll(question, options, chatId, allowMultiple) {
  const url  = "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/sendPoll";
  const resp = UrlFetchApp.fetch(url, {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({
      chat_id: chatId, question: question, options: options,
      is_anonymous: false, allows_multiple_answers: allowMultiple === true
    }), muteHttpExceptions: true
  });
  const j = JSON.parse(resp.getContentText());
  if (!j.ok) Logger.log("Poll error: " + JSON.stringify(j));
  return j.ok ? j.result.message_id : null;
}

function _tgSendButtons(text, rows, chatId) {
  // rows = array of arrays of [label, callback_data]
  const keyboard = { inline_keyboard: rows.map(row => row.map(b => ({ text: b[0], callback_data: b[1] }))) };
  const url  = "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/sendMessage";
  UrlFetchApp.fetch(url, {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML", reply_markup: keyboard }),
    muteHttpExceptions: true
  });
}

function _tgAnswerCallback(id, text) {
  UrlFetchApp.fetch("https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/answerCallbackQuery", {
    method: "post", contentType: "application/json",
    payload: JSON.stringify({ callback_query_id: id, text: text || "" }),
    muteHttpExceptions: true
  });
}

// ── Session helpers ───────────────────────────────────────────────────────────

function _getSession(chatId) {
  const raw = PropertiesService.getScriptProperties().getProperty("session_" + chatId);
  return raw ? JSON.parse(raw) : null;
}
function _setSession(chatId, data) {
  PropertiesService.getScriptProperties().setProperty("session_" + chatId, JSON.stringify(data));
}
function _clearSession(chatId) {
  PropertiesService.getScriptProperties().deleteProperty("session_" + chatId);
}

// ══════════════════════════════════════════════════════
//  DATE-FIRST ENTRY FLOW
//  User sends "today", "yesterday", or a date.
//  Bot asks what they did → Crop or Propagation buttons.
//  The chosen date is passed into every subsequent flow
//  so they never have to type it again.
// ══════════════════════════════════════════════════════

function _startDateEntry(date, chatId) {
  var tz      = Session.getScriptTimeZone();
  var dateStr = Utilities.formatDate(date, tz, "EEE dd MMM yyyy");
  var iso     = Utilities.formatDate(date, tz, "yyyy-MM-dd");
  _setSession(chatId, { type: "date_entry", step: "pick_area", date: date.toISOString(), dateStr: dateStr });
  _tgSendButtons(
    "\uD83D\uDCC5 <b>" + dateStr + "</b>\n\n" +
    "What did you work on?",
    [
      [
        ["\uD83C\uDF31 Crop",        "hub:crop:_from_date:" + iso],
        ["\uD83C\uDF3F Propagation", "hub:prop:_from_date:" + iso]
      ]
    ],
    chatId
  );
}

/** Text input during date_entry (unlikely but handles cancel etc.) */
function _continueDateEntry(session, input, chatId) {
  // If user types something unexpected, just re-show the buttons
  _startDateEntry(new Date(session.date), chatId);
}

// ══════════════════════════════════════════════════════
//  CROP HUB
//  Shown after date selection OR when user types "crop".
//  date is ISO string or null (null = bot will ask later).
// ══════════════════════════════════════════════════════

function _sendCropHub(chatId, dateIso) {
  var dateSuffix = dateIso ? "\n\uD83D\uDCC5 Date: <b>" + Utilities.formatDate(new Date(dateIso), Session.getScriptTimeZone(), "EEE dd MMM yyyy") + "</b>" : "";
  _tgSendButtons(
    "\uD83C\uDF31 <b>CROP MANAGER</b>" + dateSuffix + "\n" +
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n" +
    "What would you like to do?",
    [
      [
        ["\uD83C\uDF31 Log New Crop",         "hub:crop:new:"      + (dateIso||"")],
        ["\uD83D\uDCE6 Log Batch Crops",      "hub:crop:batch:"    + (dateIso||"")]
      ],
      [
        ["\u270F\uFE0F Update Crop",          "hub:crop:update:"   + (dateIso||"")],
        ["\uD83D\uDCCA Change Status",        "hub:crop:status:"   + (dateIso||"")]
      ],
      [
        ["\uD83D\uDEAE Mark Germinated",      "hub:crop:germinated:"   + (dateIso||"")],
        ["\uD83D\uDE9C Mark Transplanted",    "hub:crop:transplanted:" + (dateIso||"")]
      ],
      [
        ["\uD83E\uDD47 Log Harvest",          "hub:crop:harvest:"  + (dateIso||"")],
        ["\uD83D\uDDD1\uFE0F Delete Crop",    "hub:crop:delete:"   + (dateIso||"")]
      ],
      [
        ["\uD83D\uDCCB View Active Crops",    "hub:crop:list:"],
        ["\uD83D\uDD19 Back to Menu",         "menu:status"]
      ]
    ],
    chatId
  );
}

// ══════════════════════════════════════════════════════
//  PROPAGATION HUB
// ══════════════════════════════════════════════════════

function _sendPropHub(chatId, dateIso) {
  var dateSuffix = dateIso ? "\n\uD83D\uDCC5 Date: <b>" + Utilities.formatDate(new Date(dateIso), Session.getScriptTimeZone(), "EEE dd MMM yyyy") + "</b>" : "";
  _tgSendButtons(
    "\uD83C\uDF3F <b>PROPAGATION MANAGER</b>" + dateSuffix + "\n" +
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n" +
    "What would you like to do?",
    [
      [
        ["\uD83C\uDF3F New Propagation",      "hub:prop:new:"         + (dateIso||"")],
        ["\uD83D\uDCE6 Batch Propagations",   "hub:prop:batch:"       + (dateIso||"")]
      ],
      [
        ["\u270F\uFE0F Update Propagation",   "hub:prop:update:"      + (dateIso||"")],
        ["\uD83D\uDCCA Change Status",        "hub:prop:status:"      + (dateIso||"")]
      ],
      [
        ["\u2705 Mark Rooted",               "hub:prop:rooted:"       + (dateIso||"")],
        ["\uD83C\uDF31 Mark Transplanted",   "hub:prop:transplanted:" + (dateIso||"")]
      ],
      [
        ["\uD83D\uDD19 Back to Menu",        "menu:status"]
      ]
    ],
    chatId
  );
}

// ══════════════════════════════════════════════════════
//  QUICK-EVENT FLOWS  (germinated / transplanted / harvest
//                      / rooted / prop-transplanted)
//  Steps: crop_id → confirm date → done
//  The date is pre-filled when coming from the date hub.
// ══════════════════════════════════════════════════════

function _startCropQuickEvent(chatId, eventType, dateIso) {
  var labels = {
    germinated:   { emoji: "\uD83D\uDEAE", title: "Mark as Germinated"  },
    transplanted: { emoji: "\uD83D\uDE9C", title: "Mark as Transplanted" },
    harvest:      { emoji: "\uD83E\uDD47", title: "Log Harvest"          }
  };
  var lbl = labels[eventType] || { emoji: "\u2705", title: eventType };
  var sess = { type: "quick_event", step: "crop_id", eventType: eventType };
  if (dateIso) { sess.date = dateIso; sess.step = "crop_id_with_date"; }
  _setSession(chatId, sess);
  _tgSend(
    lbl.emoji + " <b>" + lbl.title + "</b>\n\n" +
    (dateIso ? "\uD83D\uDCC5 Date: <b>" + Utilities.formatDate(new Date(dateIso), Session.getScriptTimeZone(), "EEE dd MMM yyyy") + "</b>\n\n" : "") +
    "Enter the <b>Crop ID</b>:\n" +
    "<i>e.g. CROP_1234567_890</i>\n\nSend /cancel to quit.",
    chatId
  );
}

function _startPropQuickEvent(chatId, eventType, dateIso) {
  var labels = {
    rooted:       { emoji: "\u2705",        title: "Mark as Rooted"      },
    transplanted: { emoji: "\uD83C\uDF31",  title: "Mark as Transplanted" }
  };
  var lbl = labels[eventType] || { emoji: "\u2705", title: eventType };
  var sess = { type: "quick_event", step: "prop_id", eventType: "prop_" + eventType };
  if (dateIso) { sess.date = dateIso; }
  _setSession(chatId, sess);
  _tgSend(
    lbl.emoji + " <b>Propagation: " + lbl.title + "</b>\n\n" +
    (dateIso ? "\uD83D\uDCC5 Date: <b>" + Utilities.formatDate(new Date(dateIso), Session.getScriptTimeZone(), "EEE dd MMM yyyy") + "</b>\n\n" : "") +
    "Enter the <b>Prop ID</b>:\n" +
    "<i>e.g. PROP_1234567_890</i>\n\nSend /cancel to quit.",
    chatId
  );
}

function _startCropStatusChange(chatId, dateIso) {
  var sess = { type: "crop_update", step: "crop_id", mode: "status_only" };
  if (dateIso) sess.prefillDate = dateIso;
  _setSession(chatId, sess);
  _tgSend(
    "\uD83D\uDCCA <b>Change Crop Status</b>\n\n" +
    (dateIso ? "\uD83D\uDCC5 Date: <b>" + Utilities.formatDate(new Date(dateIso), Session.getScriptTimeZone(), "EEE dd MMM yyyy") + "</b>\n\n" : "") +
    "Enter the <b>Crop ID</b>:\n<i>e.g. CROP_1234567_890</i>\n\nSend /cancel to quit.",
    chatId
  );
}

function _startPropStatusChange(chatId, dateIso) {
  var sess = { type: "prop_update", step: "prop_id", mode: "status_only" };
  if (dateIso) sess.prefillDate = dateIso;
  _setSession(chatId, sess);
  _tgSend(
    "\uD83D\uDCCA <b>Change Propagation Status</b>\n\n" +
    (dateIso ? "\uD83D\uDCC5 Date: <b>" + Utilities.formatDate(new Date(dateIso), Session.getScriptTimeZone(), "EEE dd MMM yyyy") + "</b>\n\n" : "") +
    "Enter the <b>Prop ID</b>:\n<i>e.g. PROP_1234567_890</i>\n\nSend /cancel to quit.",
    chatId
  );
}

/**
 * Continue the quick_event flow for crops.
 * Handles: germinated, transplanted, harvest (prop_rooted, prop_transplanted).
 */
function _continueQuickEventOnboarding(session, input, chatId) {
  var tz = Session.getScriptTimeZone();

  // ── PROP quick events ───────────────────────────────
  if (session.eventType === "prop_rooted" || session.eventType === "prop_transplanted") {
    if (session.step === "prop_id") {
      var pid = input.trim().toUpperCase();
      var prow = _findRowById("PropagationTracking", pid, 1);
      if (!prow) { _tgSend("\u274C Prop ID not found: <code>" + pid + "</code>", chatId); return; }
      session.propId    = pid;
      session.plantName = prow.rowData[1] || "Plant";
      if (session.date) {
        session.step = "confirm";
        _setSession(chatId, session);
        _quickEventConfirm(session, chatId);
      } else {
        session.step = "date";
        _setSession(chatId, session);
        _tgSend("\u2705 Found: <b>" + session.plantName + "</b>\n\n\uD83D\uDCC5 What date?\n<i>today / yesterday / 12-03-2026</i>", chatId);
      }
      return;
    }
    if (session.step === "date") {
      var d = _parseDate(input.trim());
      if (!d) { _tgSend("\u274C Date not recognised. Try: today, yesterday, 12-03-2026", chatId); return; }
      session.date = d.toISOString();
      session.step = "confirm";
      _setSession(chatId, session);
      _quickEventConfirm(session, chatId);
      return;
    }
    return;
  }

  // ── CROP quick events ───────────────────────────────
  if (session.step === "crop_id" || session.step === "crop_id_with_date") {
    var cid = input.trim().toUpperCase();
    var crow = _findRowById("CropTracking", cid, 1);
    if (!crow) { _tgSend("\u274C Crop ID not found: <code>" + cid + "</code>", chatId); return; }
    session.cropId   = cid;
    session.cropName = crow.rowData[1] || "Crop";
    session.variety  = crow.rowData[2] || "";
    if (session.date) {
      session.step = "confirm";
      _setSession(chatId, session);
      _quickEventConfirm(session, chatId);
    } else {
      session.step = "date";
      _setSession(chatId, session);
      _tgSend("\u2705 Found: <b>" + session.cropName + (session.variety ? " (" + session.variety + ")" : "") + "</b>\n\n\uD83D\uDCC5 What date?\n<i>today / yesterday / 12-03-2026</i>", chatId);
    }
    return;
  }

  if (session.step === "date") {
    var d2 = _parseDate(input.trim());
    if (!d2) { _tgSend("\u274C Date not recognised. Try: today, yesterday, 12-03-2026", chatId); return; }
    session.date = d2.toISOString();
    session.step = "confirm";
    _setSession(chatId, session);
    _quickEventConfirm(session, chatId);
    return;
  }
}

/** Send confirm buttons for a quick event. */
function _quickEventConfirm(session, chatId) {
  var tz      = Session.getScriptTimeZone();
  var dateStr = Utilities.formatDate(new Date(session.date), tz, "EEE dd MMM yyyy");
  var evtLabels = {
    germinated:       "Mark Germinated",
    transplanted:     "Mark Transplanted",
    harvest:          "Log Harvest",
    prop_rooted:      "Mark Rooted",
    prop_transplanted:"Mark Transplanted"
  };
  var emojis = { germinated:"\uD83D\uDEAE", transplanted:"\uD83D\uDE9C", harvest:"\uD83E\uDD47", prop_rooted:"\u2705", prop_transplanted:"\uD83C\uDF31" };
  var name = session.cropName || session.plantName || "Crop";
  var varStr = (session.variety ? " (" + session.variety + ")" : "");

  _tgSendButtons(
    emojis[session.eventType] + " <b>Confirm " + (evtLabels[session.eventType]||session.eventType) + "?</b>\n\n" +
    "\uD83C\uDF31 <b>" + name + varStr + "</b>\n" +
    "\uD83D\uDCC5 Date: " + dateStr + "\n" +
    "\uD83C\uDD94 <code>" + (session.cropId || session.propId) + "</code>",
    [
      [
        ["\u2705 Confirm",   "qevt:confirm"],
        ["\u274C Cancel",    "qevt:cancel"]
      ]
    ],
    chatId
  );
}



/**
 * Execute a confirmed quick event — writes to sheet and sends confirmation.
 */
function _executeQuickEvent(session, chatId) {
  _clearSession(chatId);
  var tz      = Session.getScriptTimeZone();
  var date    = new Date(session.date);
  var dateStr = Utilities.formatDate(date, tz, "EEE dd MMM yyyy");
  var id      = session.cropId || session.propId;
  var name    = session.cropName || session.plantName || "Plant";
  var varStr  = session.variety ? " (" + session.variety + ")" : "";

  var evt = session.eventType;

  if (evt === "germinated") {
    _processGerminationConfirm(session.cropId, date, chatId);
    return;
  }
  if (evt === "transplanted") {
    _processTransplantConfirm(session.cropId, date, chatId);
    return;
  }
  if (evt === "harvest") {
    _processHarvestConfirm(session.cropId, date, chatId);
    return;
  }
  if (evt === "prop_rooted") {
    _processPropRootedConfirm(session.propId, date, chatId);
    return;
  }
  if (evt === "prop_transplanted") {
    _processPropTransplantConfirm(session.propId, date, chatId);
    return;
  }
  _tgSend("\u274C Unknown event type: " + evt, chatId);
}

/**
 * Mark a crop as germinated on the given date.
 */
function _processGerminationConfirm(cropId, date, chatId) {
  var row = _findRowById("CropTracking", cropId, 1);
  if (!row) { _tgSend("\u274C Crop not found: <code>" + cropId + "</code>", chatId); return; }
  var sheet = _getSheet("CropTracking");
  var r     = row.rowIndex + 1;
  var name  = row.rowData[1];
  sheet.getRange(r, 8).setValue(_formatDateShort(date));   // GerminationDate col
  sheet.getRange(r, 16).setValue("Seedling");              // Status col
  _logStageChange(cropId, name, "Seedling", date, "Germinated via quick-event");
  _tgSend("\uD83D\uDEAE <b>Germinated!</b>\n\n\uD83C\uDF31 <b>" + name + "</b>\n\uD83D\uDCC5 " + _formatDateShort(date) + "\n\uD83C\uDD94 <code>" + cropId + "</code>", chatId);
}

/**
 * Mark a crop as transplanted on the given date.
 */
function _processTransplantConfirm(cropId, date, chatId) {
  var row = _findRowById("CropTracking", cropId, 1);
  if (!row) { _tgSend("\u274C Crop not found: <code>" + cropId + "</code>", chatId); return; }
  var sheet = _getSheet("CropTracking");
  var r     = row.rowIndex + 1;
  var name  = row.rowData[1];
  sheet.getRange(r, 9).setValue(_formatDateShort(date));   // TransplantDate col
  sheet.getRange(r, 16).setValue("Transplanted");
  _logStageChange(cropId, name, "Transplanted", date, "Transplanted via quick-event");
  _tgSend("\uD83D\uDE9C <b>Transplanted!</b>\n\n\uD83C\uDF31 <b>" + name + "</b>\n\uD83D\uDCC5 " + _formatDateShort(date) + "\n\uD83C\uDD94 <code>" + cropId + "</code>", chatId);
}

/**
 * Log a harvest on the given date.
 */
function _processHarvestConfirm(cropId, date, chatId) {
  var row = _findRowById("CropTracking", cropId, 1);
  if (!row) { _tgSend("\u274C Crop not found: <code>" + cropId + "</code>", chatId); return; }
  var sheet = _getSheet("CropTracking");
  var r     = row.rowIndex + 1;
  var name  = row.rowData[1];
  var consH = String(row.rowData[14] || "").toLowerCase() === "yes";
  sheet.getRange(r, 10).setValue(_formatDateShort(date));  // LastHarvestDate col
  sheet.getRange(r, 16).setValue(consH ? "Active" : "Harvested");
  _logStageChange(cropId, name, "Harvested", date, "Harvest logged via quick-event");
  _tgSend("\uD83E\uDD47 <b>Harvest logged!</b>\n\n\uD83C\uDF31 <b>" + name + "</b>\n\uD83D\uDCC5 " + _formatDateShort(date) + (consH ? "\n\uD83D\uDD04 Continuous harvest \u2014 crop stays Active" : "\n\u2705 Crop marked Harvested") + "\n\uD83C\uDD94 <code>" + cropId + "</code>", chatId);
}

/**
 * Mark a propagation as rooted.
 */
function _processPropRootedConfirm(propId, date, chatId) {
  var row = _findRowById("PropagationTracking", propId, 1);
  if (!row) { _tgSend("\u274C Prop not found: <code>" + propId + "</code>", chatId); return; }
  var sheet = _getSheet("PropagationTracking");
  var r     = row.rowIndex + 1;
  var name  = row.rowData[1];
  sheet.getRange(r, 7).setValue(_formatDateShort(date));   // RootedDate col
  sheet.getRange(r, 8).setValue("Rooted");                 // Status col
  _tgSend("\u2705 <b>Rooted!</b>\n\n\uD83C\uDF3F <b>" + name + "</b>\n\uD83D\uDCC5 " + _formatDateShort(date) + "\n\uD83C\uDD94 <code>" + propId + "</code>", chatId);
}

/**
 * Mark a propagation as transplanted.
 */
function _processPropTransplantConfirm(propId, date, chatId) {
  var row = _findRowById("PropagationTracking", propId, 1);
  if (!row) { _tgSend("\u274C Prop not found: <code>" + propId + "</code>", chatId); return; }
  var sheet = _getSheet("PropagationTracking");
  var r     = row.rowIndex + 1;
  var name  = row.rowData[1];
  sheet.getRange(r, 8).setValue("Transplanted");           // Status col
  _tgSend("\uD83C\uDF31 <b>Transplanted!</b>\n\n\uD83C\uDF3F <b>" + name + "</b>\n\uD83D\uDCC5 " + _formatDateShort(date) + "\n\uD83C\uDD94 <code>" + propId + "</code>", chatId);
}

// ── Menu — sent when user sends "menu" or is lost ────────────────────────────

function _sendMenu(chatId) {
  _tgSendButtons(
    "🌱 <b>CropManager — What would you like to do?</b>\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━",
    [
      [["🌱 Log New Crop",        "menu:new_crop"],   ["📦 Log Batch Crops",    "menu:batch_crop"]],
      [["✏️ Update Crop",         "menu:update_crop"],["🗑️ Delete Crop",        "menu:delete_crop"]],
      [["🌿 New Propagation",     "menu:new_prop"],   ["📦 Batch Propagations", "menu:batch_prop"]],
      [["✏️ Update Propagation",  "menu:update_prop"],["📊 Status Report",      "menu:status"]]
    ],
    chatId
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FLOW 1 — NEW SINGLE CROP
//  Trigger: "crop"  or  menu:new_crop
//  Steps: name → date → method → [tray colors] → cons_harvest → notes → done
// ═══════════════════════════════════════════════════════════════════════════════

function _startCropOnboarding(chatId, dateIso) {
  var sess = { type: "crop", step: "name" };
  if (dateIso) sess.plantingDate = dateIso;
  _setSession(chatId, sess);
  var dateHint = dateIso ? " \u2022 \uD83D\uDCC5 " + Utilities.formatDate(new Date(dateIso), Session.getScriptTimeZone(), "EEE dd MMM yyyy") : "";
  _tgSend(
    "\uD83C\uDF31 <b>New Crop</b>" + dateHint + "\n\n" +
    "What is the <b>crop name</b>?\n" +
    "<i>e.g. Tomato, Pumpkin, Hot Pepper</i>\n\n" +
    "Send /cancel at any time to quit.",
    chatId
  );
}


// ══════════════════════════════════════════════════════
//  VARIETY HELPER
// ══════════════════════════════════════════════════════

/**
 * Show variety selection step.
 * - If crop has varieties in DB → show inline buttons + "Other" option
 * - If no varieties in DB → show text input prompt with skip option
 * Supports both "crop" and "batch_crop" session types.
 */
function _askCropVariety(cropData, session, chatId) {
  const varieties = cropData.varieties || [];
  const isBatch   = session.type === "batch_crop";
  const stepLabel = isBatch ? "Variety" : "Step 2";

  if (varieties.length > 0) {
    // Build rows of variety buttons (2 per row max)
    const rows = [];
    for (let i = 0; i < varieties.length; i += 2) {
      const row = [];
      const prefix = isBatch ? "bvariety:" : "variety:";
      row.push([varieties[i], prefix + varieties[i]]);
      if (varieties[i+1]) row.push([varieties[i+1], prefix + varieties[i+1]]);
      rows.push(row);
    }
    // Add "Other" and "Skip / None" at the bottom
    const prefix2 = isBatch ? "bvariety:" : "variety:";
    rows.push([["✏️ Other (type it)", prefix2 + "_type_other"], ["⏭️ No Variety", prefix2 + "_skip"]]);

    session.step = "variety";
    _setSession(chatId, session);
    _tgSendButtons(
      "🌿 <b>" + stepLabel + "</b> — Select the <b>variety</b> of <b>" + cropData.display_name + "</b>:",
      rows, chatId
    );
  } else {
    // No varieties in DB — prompt text entry
    session.step = "variety";
    _setSession(chatId, session);
    _tgSend(
      "🌿 <b>" + stepLabel + "</b> — Enter the <b>variety</b> of <b>" + cropData.display_name + "</b>\n" +
      "<i>e.g. Cherry, Beefsteak, Heirloom</i>\n\n" +
      "Type <code>none</code> to skip.",
      chatId
    );
  }
}

function _continueCropOnboarding(session, input, chatId) {
  switch (session.step) {

    case "name": {
      const cropData = _lookupCrop(input.trim());
      if (!cropData) {
        _tgSend("❌ <b>Crop not found:</b> <i>" + input + "</i>\n\nCheck spelling and try again.", chatId);
        return;
      }
      session.cropName    = input.trim();
      session.cropDisplay = cropData.display_name;
      session.cropDataRef = cropData;          // cache for variety step
      _setSession(chatId, session);
      _askCropVariety(cropData, session, chatId);
      break;
    }

    case "variety": {
      // "none" or "skip" → null variety
      const raw = input.trim();
      session.variety = (raw.toLowerCase() === "none" || raw.toLowerCase() === "skip") ? null : raw;
      // If date was pre-filled from the date-first flow, skip the date step
      if (session.plantingDate) {
        session.step = "method";
        _setSession(chatId, session);
        _tgSend(
          "\u2705 <b>" + session.cropDisplay + (session.variety ? " \u2014 " + session.variety : "") + "</b>",
          chatId
        );
        _askCropMethod(session, chatId);
      } else {
        session.step = "date";
        _setSession(chatId, session);
        _tgSend(
          "\u2705 <b>" + session.cropDisplay + (session.variety ? " \u2014 " + session.variety : "") + "</b>\n\n" +
          "\uD83C\uDF31 What is the <b>planting date</b>?\n" +
          "<i>today / yesterday / 26-01-2026</i>",
          chatId
        );
      }
      break;
    }

    case "date": {
      const d = _parseDate(input.trim());
      if (!d) { _tgSend("❌ Date not recognised. Try: <code>today</code> or <code>26-01-2026</code>", chatId); return; }
      session.plantingDate = d.toISOString();
      session.step         = "method";
      _setSession(chatId, session);
      _askCropMethod(session, chatId);

      break;
    }

    case "method": {
      // text fallback if user types instead of tapping button
      session.method = input.trim();
      _afterCropMethod(session, chatId);
      break;
    }

    case "graft_info": {
      const raw = input.trim().toLowerCase();
      const healDays = (raw === "default" || raw === "") ? 12 : (parseInt(raw) || 12);
      session.graftHealDays = healDays;
      session.step          = "cons_harvest";
      _setSession(chatId, session);
      _tgSend(
        "✅ Graft healing period: <b>" + healDays + " days</b>\n\n" +
        "This will be added to your transplant timeline and tracked in StageLog.",
        chatId
      );
      _askCropConsHarvest(session, chatId);
      break;
    }

    case "tray_colors_wait": {
      // text fallback if poll not tapped
      const colors = input.split(",").map(c => c.trim()).filter(Boolean);
      session.trayColors = colors;
      session.step       = "cons_harvest";
      _setSession(chatId, session);
      _askCropConsHarvest(session, chatId);
      break;
    }

    case "cons_harvest": {
      const ans = input.trim().toLowerCase();
      session.consHarvest = (ans === "yes" || ans === "y");
      session.step        = "notes";
      _setSession(chatId, session);
      _tgSend(
        "🌱 <b>Step 6</b> — Any <b>notes</b>?\n" +
        "<i>e.g. planted in bed 3, heirloom variety, gifted from neighbour</i>\n\n" +
        "Type <code>none</code> to skip.",
        chatId
      );
      break;
    }

    case "notes": {
      session.notes = input.trim().toLowerCase() === "none" ? "" : input.trim();
      _clearSession(chatId);
      _finishCropOnboarding(session, chatId);
      break;
    }
  }
}

function _afterCropMethod(session, chatId) {
  const method  = (session.method || "").toLowerCase();
  const isTray  = method.includes("seed tray");
  const isGraft = method.includes("grafted");

  if (isGraft) {
    // Grafting flow: ask for rootstock planting date + expected healing period
    session.step = "graft_info";
    _setSession(chatId, session);
    _tgSend(
      "🔗 <b>Grafted onto Pumpkin Rootstock</b>\n\n" +
      "This tracks three stages:\n" +
      "1️⃣ <b>Seed → Germination</b> (both scion & rootstock)\n" +
      "2️⃣ <b>Graft healing</b> (union callusing — typically 10–14 days)\n" +
      "3️⃣ <b>Transplant → Harvest</b>\n\n" +
      "How many days do you expect the <b>graft healing</b> to take?\n" +
      "<i>Type a number (e.g. <code>12</code>) or <code>default</code> for 12 days.</i>",
      chatId
    );
  } else if (isTray) {
    session.step = "tray_colors_wait";
    _setSession(chatId, session);
    _tgSendPoll(
      "🎨 Step 4a — Choose tray color(s) — select all that apply:",
      ["⬜ White", "🔴 Red", "🟡 Yellow", "🟢 Green", "🔵 Blue"],
      chatId, true
    );
  } else {
    session.step = "cons_harvest";
    _setSession(chatId, session);
    _askCropConsHarvest(session, chatId);
  }
}


/**
 * Show method selection.
 * - All crops: Seed Tray is default (highlighted first)
 * - Watermelon / Melon: also offer "Grafted onto Pumpkin Rootstock"
 */
function _askCropMethod(session, chatId) {
  const name    = (session.cropName || session.current && session.current.cropName || "").toLowerCase();
  const isBatch = session.type === "batch_crop";
  const pre     = isBatch ? "bmethod:" : "method:";
  const isGraftable = name.includes("watermelon") || name.includes("melon") ||
                      name.includes("honeydew") || name.includes("cantaloupe");

  const rows = [
    [["🪴 Seed Tray (recommended)", pre + "Seed tray"], ["🌍 Direct Ground", pre + "Direct ground"]],
    [["🌿 Raised Bed",              pre + "Raised bed"], ["🪣 Pot / Container", pre + "Pot"]]
  ];
  if (isGraftable) {
    rows.push([["🔗 Grafted onto Pumpkin Rootstock", pre + "Grafted onto Pumpkin"]]);
  }

  const step = isBatch ? "Planting method" : "Step 4";
  _tgSendButtons(
    "🌱 <b>" + step + "</b> — Choose the <b>planting method</b>:\n" +
    "<i>Starting in a seed tray gives the best germination control.</i>",
    rows,
    chatId
  );
}

function _askCropConsHarvest(session, chatId) {
  const cropData   = _lookupCrop(session.cropName || "");
  const defaultYes = cropData && (cropData.number_of_weeks_harvest || 1) > 1;
  _tgSendButtons(
    "🌱 <b>Step 5</b> — <b>Continuous harvests?</b>\n" +
    "<i>Yes = keeps producing (tomatoes, peppers, okra)\n" +
    "No = single harvest (cabbage, carrot, corn)\n\n" +
    "Suggested for " + (session.cropDisplay || session.cropName) + ": <b>" + (defaultYes ? "Yes" : "No") + "</b></i>",
    [[["✅ Yes — keeps producing", "cons:yes"], ["❌ No — single harvest", "cons:no"]]],
    chatId
  );
}

function _finishCropOnboarding(session, chatId) {
  _processCropEmail({
    "crop name":       session.cropName,
    "variety":         session.variety || "",
    "date":            _formatDateShort(new Date(session.plantingDate)),
    "planting method": session.method || "Seed tray",
    "stage":           "Seed",
    "cons harvest":    session.consHarvest ? "yes" : "no",
    "notes":           session.notes || "",
    "tray colors":     (session.trayColors || []).join(", "),
    "graft heal days": session.graftHealDays ? String(session.graftHealDays) : ""
  }, chatId);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FLOW 2 — BATCH CROPS
//  Trigger: "batch crop" or menu:batch_crop
//  User adds crops one at a time; each gets its own onboarding pass.
//  When done they tap "Done — Save All".
// ═══════════════════════════════════════════════════════════════════════════════

function _startBatchCropOnboarding(chatId, dateIso) {
  var sess = { type: "batch_crop", step: "name", crops: [], current: {} };
  if (dateIso) sess.batchDate = dateIso;
  _setSession(chatId, sess);
  var dh = dateIso ? " \u2022 \uD83D\uDCC5 " + Utilities.formatDate(new Date(dateIso), Session.getScriptTimeZone(), "EEE dd MMM yyyy") : "";
  _tgSend(
    "\uD83D\uDCE6 <b>Batch Crop Log</b>" + dh + "\n\n" +
    "What is the <b>crop name</b> for crop 1?\n" +
    "<i>e.g. Tomato</i>\n\n" +
    "Send /cancel to quit.",
    chatId
  );
}

function _continueBatchCropOnboarding(session, input, chatId) {
  const cur = session.current;

  switch (session.step) {

    case "name": {
      const cropData = _lookupCrop(input.trim());
      if (!cropData) { _tgSend("❌ Crop not found: <i>" + input + "</i>. Try again.", chatId); return; }
      cur.cropName    = input.trim();
      cur.cropDisplay = cropData.display_name;
      cur.cropDataRef = cropData;
      _setSession(chatId, session);
      _askCropVariety(cropData, session, chatId);
      break;
    }

    case "variety": {
      const raw2 = input.trim();
      cur.variety  = (raw2.toLowerCase() === "none" || raw2.toLowerCase() === "skip") ? null : raw2;
      session.step = "date";
      _setSession(chatId, session);
      _tgSend(
        "✅ <b>" + cur.cropDisplay + (cur.variety ? " — " + cur.variety : "") + "</b>\n\n" +
        "📅 <b>Planting date?</b>\n<i>today / 26-01-2026</i>",
        chatId
      );
      break;
    }

    case "date": {
      const d = _parseDate(input.trim());
      if (!d) { _tgSend("❌ Date not recognised. Try <code>today</code> or <code>26-01-2026</code>", chatId); return; }
      cur.plantingDate = d.toISOString();
      session.step     = "method";
      _setSession(chatId, session);
      _askCropMethod(session, chatId);
      break;
    }

    case "method": {
      cur.method = input.trim();
      _afterBatchMethod(session, chatId);
      break;
    }

    case "tray_colors_wait": {
      cur.trayColors = input.split(",").map(c => c.trim()).filter(Boolean);
      session.step   = "cons_harvest";
      _setSession(chatId, session);
      _askBatchConsHarvest(session, chatId);
      break;
    }

    case "cons_harvest": {
      const ans = input.trim().toLowerCase();
      cur.consHarvest = (ans === "yes" || ans === "y");
      session.step    = "notes";
      _setSession(chatId, session);
      _tgSend("📝 <b>Notes for " + cur.cropDisplay + "?</b>\n<i>Type <code>none</code> to skip.</i>", chatId);
      break;
    }

    case "notes": {
      cur.notes = input.trim().toLowerCase() === "none" ? "" : input.trim();
      session.crops.push(Object.assign({}, cur));
      session.current = {};
      session.step    = "add_more";
      _setSession(chatId, session);
      _askBatchAddMore(session, chatId);
      break;
    }

    case "add_more": {
      // text fallback
      const lower = input.trim().toLowerCase();
      if (lower === "done" || lower === "save") {
        _clearSession(chatId);
        _finishBatchCropOnboarding(session, chatId);
      } else {
        // start next crop
        const nextNum = session.crops.length + 1;
        session.step    = "name";
        session.current = {};
        _setSession(chatId, session);
        _tgSend("📦 <b>Batch — Crop " + nextNum + "</b>\n\nWhat is the <b>crop name</b>?", chatId);
      }
      break;
    }
  }
}

function _afterBatchMethod(session, chatId) {
  const cur    = session.current;
  const isTray = (cur.method || "").toLowerCase().includes("seed tray");
  if (isTray) {
    session.step = "tray_colors_wait";
    _setSession(chatId, session);
    _tgSendPoll(
      "🎨 Tray color(s) for " + cur.cropDisplay + " — select all that apply:",
      ["⬜ White", "🔴 Red", "🟡 Yellow", "🟢 Green", "🔵 Blue"],
      chatId, true
    );
  } else {
    session.step = "cons_harvest";
    _setSession(chatId, session);
    _askBatchConsHarvest(session, chatId);
  }
}

function _askBatchConsHarvest(session, chatId) {
  const cur      = session.current;
  const cropData = _lookupCrop(cur.cropName || "");
  const def      = cropData && (cropData.number_of_weeks_harvest || 1) > 1;
  _tgSendButtons(
    "♻️ <b>Continuous harvests for " + cur.cropDisplay + "?</b>\n" +
    "<i>Suggested: <b>" + (def ? "Yes" : "No") + "</b></i>",
    [[["✅ Yes", "bcons:yes"], ["❌ No", "bcons:no"]]],
    chatId
  );
}

function _askBatchAddMore(session, chatId) {
  const count = session.crops.length;
  _tgSendButtons(
    "✅ <b>" + session.crops[count-1].cropDisplay + "</b> added! (" + count + " crop" + (count>1?"s":"") + " so far)\n\n" +
    "Add another crop or save the batch?",
    [[["➕ Add Another Crop", "batch:more"], ["💾 Save All & Done", "batch:done"]]],
    chatId
  );
}

function _finishBatchCropOnboarding(session, chatId) {
  const blocks = session.crops.map(c =>
    "crop name - " + c.cropName + "\n" +
    (c.variety ? "variety - " + c.variety + "\n" : "") +
    "date - " + _formatDateShort(new Date(c.plantingDate)) + "\n" +
    "planting method - " + c.method + "\n" +
    "stage - Seed\n" +
    "cons harvest - " + (c.consHarvest ? "yes" : "no") + "\n" +
    (c.notes ? "notes - " + c.notes + "\n" : "") +
    (c.trayColors && c.trayColors.length ? "tray colors - " + c.trayColors.join(", ") + "\n" : "")
  );
  _processBatchCrops(blocks, chatId);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FLOW 3 — CROP UPDATE (stage / treatment)
//  Trigger: "update crop" or menu:update_crop
//  Steps: crop_id → date → stage → treatment → notes → done
// ═══════════════════════════════════════════════════════════════════════════════

function _startCropUpdateOnboarding(chatId, dateIso) {
  var sess = { type: "crop_update", step: "crop_id" };
  if (dateIso) sess.prefillDate = dateIso;
  _setSession(chatId, sess);
  var dh = dateIso ? " \u2022 \uD83D\uDCC5 " + Utilities.formatDate(new Date(dateIso), Session.getScriptTimeZone(), "EEE dd MMM yyyy") : "";
  _tgSend(
    "\u270F\uFE0F <b>Update Crop</b>" + dh + "\n\n" +
    "Enter the <b>Crop ID</b> to update:\n" +
    "<i>e.g. CROP_1234567_890</i>\n\nSend /cancel to quit.",
    chatId
  );
}

function _askCropUpdateStage(session, chatId) {
  _tgSendButtons(
    "\u270F\uFE0F <b>Update: " + session.cropName + "</b>\n\nWhat is the new <b>stage</b>?",
    [
      [["\uD83C\uDF31 Seedling",         "ustage:Seedling"],   ["\uD83C\uDF3F Transplanted",    "ustage:Transplanted"]],
      [["\uD83C\uDF38 Flowering",         "ustage:Flowering"],  ["\uD83C\uDF45 Ready to Harvest","ustage:Ready to Harvest"]],
      [["\u2014 No stage change",          "ustage:none"],       ["\uD83D\uDCDD Type a stage",    "ustage:custom"]]
    ],
    chatId
  );
}

function _continueCropUpdateOnboarding(session, input, chatId) {
  switch (session.step) {

    case "crop_id": {
      const id  = input.trim().toUpperCase();
      const row = _findRowById("CropTracking", id, 1);
      if (!row) { _tgSend("\u274C Crop ID not found: <code>" + id + "</code>\n\nCheck the ID and try again.", chatId); return; }
      session.cropId   = id;
      session.cropName = row.rowData[1];
      if (session.prefillDate) {
        session.updateDate = session.prefillDate;
        session.step       = "stage";
        _setSession(chatId, session);
        _tgSend("\u2705 Found: <b>" + session.cropName + "</b>", chatId);
        _askCropUpdateStage(session, chatId);
      } else {
        session.step = "date";
        _setSession(chatId, session);
        _tgSend(
          "\u2705 Found: <b>" + session.cropName + "</b>\n\n" +
          "\u270F\uFE0F What is the <b>update date</b>?\n" +
          "<i>today / yesterday / 26-01-2026</i>",
          chatId
        );
      }
      break;
    }

    case "date": {
      const d = _parseDate(input.trim());
      if (!d) { _tgSend("\u274C Date not recognised. Try: today, yesterday, 26-01-2026", chatId); return; }
      session.updateDate = d.toISOString();
      session.step       = "stage";
      _setSession(chatId, session);
      _askCropUpdateStage(session, chatId);
      break;
    }

    case "stage": {
      // text fallback
      session.stage = input.trim().toLowerCase() === "none" ? "" : input.trim();
      session.step  = "treatment";
      _setSession(chatId, session);
      _askCropTreatment(session, chatId);
      break;
    }

    case "treatment": {
      // text fallback
      session.treatment = input.trim().toLowerCase() === "none" ? "" : input.trim();
      session.step      = "update_notes";
      _setSession(chatId, session);
      _tgSend(
        "✏️ <b>Step 4 of 4</b> — Any <b>notes</b> for this update?\n" +
        "<i>e.g. signs of leaf curl, moved to shade</i>\n\nType <code>none</code> to skip.",
        chatId
      );
      break;
    }

    case "update_notes": {
      session.notes = input.trim().toLowerCase() === "none" ? "" : input.trim();
      _clearSession(chatId);
      _processCropUpdate({
        "crop id":   session.cropId,
        "date":      _formatDateShort(new Date(session.updateDate)),
        "stage":     session.stage     || "",
        "treatment": session.treatment || "",
        "notes":     session.notes     || ""
      }, chatId);
      break;
    }
  }
}

function _askCropTreatment(session, chatId) {
  _tgSendButtons(
    "💊 <b>Step 3b — Treatment applied?</b>",
    [
      [["🍄 fungicide:dithane",    "utreat:fungicide:dithane"],   ["🍄 fungicide:mancozeb",   "utreat:fungicide:mancozeb"]],
      [["🍄 fungicide:copper",     "utreat:fungicide:copper"],    ["🍄 fungicide:ridomil",    "utreat:fungicide:ridomil"]],
      [["🐛 pesticide:neem",       "utreat:pesticide:neem"],      ["🐛 pesticide:malathion",  "utreat:pesticide:malathion"]],
      [["🐛 pesticide:permethrin", "utreat:pesticide:permethrin"],["🐛 pesticide:spinosad",   "utreat:pesticide:spinosad"]],
      [["— No treatment",          "utreat:none"]]
    ],
    chatId
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FLOW 4 — DELETE CROP
//  Trigger: "delete crop" or menu:delete_crop
//  Steps: crop_id → confirm → done
// ═══════════════════════════════════════════════════════════════════════════════

function _startCropDeleteOnboarding(chatId) {
  _setSession(chatId, { type: "crop_delete", step: "crop_id" });
  _tgSend(
    "🗑️ <b>Delete Crop — Step 1 of 2</b>\n\n" +
    "Enter the <b>Crop ID</b> to delete:\n" +
    "<i>e.g. CROP_1234567_890</i>",
    chatId
  );
}

function _continueCropDeleteOnboarding(session, input, chatId) {
  switch (session.step) {

    case "crop_id": {
      const id  = input.trim().toUpperCase();
      const row = _findRowById("CropTracking", id, 1);
      if (!row) { _tgSend("❌ Crop ID not found: <code>" + id + "</code>", chatId); return; }
      session.cropId   = id;
      session.cropName = row.rowData[1];
      session.step     = "confirm";
      _setSession(chatId, session);
      _tgSendButtons(
        "⚠️ <b>Confirm Delete?</b>\n\n" +
        "🌱 Crop: <b>" + session.cropName + "</b>\n" +
        "🆔 <code>" + id + "</code>\n\n" +
        "This will also remove all reminders and calendar events for this crop.",
        [[["✅ Yes, Delete", "delcrop:confirm"], ["❌ Cancel", "delcrop:cancel"]]],
        chatId
      );
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FLOW 5 — NEW SINGLE PROPAGATION
//  Trigger: "propagation" / "prop" or menu:new_prop
//  Steps: name → method → date → notes → done
// ═══════════════════════════════════════════════════════════════════════════════

function _startPropOnboarding(chatId, dateIso) {
  var sess = { type: "prop", step: "name" };
  if (dateIso) sess.propDate = dateIso;
  _setSession(chatId, sess);
  var dh = dateIso ? " \u2022 \uD83D\uDCC5 " + Utilities.formatDate(new Date(dateIso), Session.getScriptTimeZone(), "EEE dd MMM yyyy") : "";
  _tgSend(
    "\uD83C\uDF3F <b>New Propagation</b>" + dh + "\n\n" +
    "What is the <b>plant name</b>?\n" +
    "<i>e.g. Rose, Hibiscus, Mint, Mango</i>\n\n" +
    "Send /cancel at any time to quit.",
    chatId
  );
}

function _continuePropOnboarding(session, input, chatId) {
  switch (session.step) {

    case "name": {
      session.plantName = input.trim();
      session.step      = "method";
      _setSession(chatId, session);
      _tgSendButtons(
        "🌿 <b>Step 2 of 4</b> — Choose the <b>propagation method</b>:",
        [
          [["✂️ Cutting",      "pmethod:Cutting"],    ["🌱 Seed",         "pmethod:Seed"]],
          [["⚡ Division",     "pmethod:Division"],   ["🔗 Grafting",     "pmethod:Grafting"]],
          [["🌫️ Air Layering", "pmethod:Air layering"],["💧 Water Rooting","pmethod:Water rooting"]]
        ],
        chatId
      );
      break;
    }

    case "method": {
      session.method = input.trim();
      if (session.propDate) {
        // Date already set from date-first flow — skip to notes
        session.step = "notes";
        _setSession(chatId, session);
        _tgSend(
          "\uD83C\uDF3F Any <b>notes</b>?\n" +
          "<i>e.g. taken from mother plant, rooting hormone applied</i>\n\n" +
          "Type <code>none</code> to skip.",
          chatId
        );
      } else {
        session.step = "date";
        _setSession(chatId, session);
        _tgSend(
          "\uD83C\uDF3F What is the <b>propagation date</b>?\n" +
          "<i>today / yesterday / 26-01-2026</i>",
          chatId
        );
      }
      break;
    }

    case "date": {
      const d = _parseDate(input.trim());
      if (!d) { _tgSend("❌ Date not recognised. Try <code>today</code> or <code>26-01-2026</code>", chatId); return; }
      session.propDate = d.toISOString();
      session.step     = "notes";
      _setSession(chatId, session);
      _tgSend(
        "🌿 <b>Step 4 of 4</b> — Any <b>notes</b>?\n" +
        "<i>e.g. taken from mother plant, wrapped in damp moss, rooting hormone applied</i>\n\n" +
        "Type <code>none</code> to skip.",
        chatId
      );
      break;
    }

    case "notes": {
      session.notes = input.trim().toLowerCase() === "none" ? "" : input.trim();
      _clearSession(chatId);
      _processPropagationEmail({
        "plant name":         session.plantName,
        "propagation method": session.method || "Cutting",
        "date":               _formatDateShort(new Date(session.propDate)),
        "notes":              session.notes || ""
      }, chatId);
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FLOW 6 — BATCH PROPAGATIONS
//  Trigger: "batch prop" or menu:batch_prop
//  Same add-more loop as batch crop
// ═══════════════════════════════════════════════════════════════════════════════

function _startBatchPropOnboarding(chatId, dateIso) {
  _setSession(chatId, { type: "batch_prop", step: "name", props: [], current: {} });
  _tgSend(
    "📦 <b>Batch Propagation — Plant 1</b>\n\n" +
    "What is the <b>plant name</b>?\n" +
    "<i>e.g. Rose</i>\n\nSend /cancel to quit.",
    chatId
  );
}

function _continueBatchPropOnboarding(session, input, chatId) {
  const cur = session.current;

  switch (session.step) {

    case "name": {
      cur.plantName = input.trim();
      session.step  = "method";
      _setSession(chatId, session);
      _tgSendButtons(
        "🌿 <b>Method for " + cur.plantName + "?</b>",
        [
          [["✂️ Cutting",      "bpmethod:Cutting"],    ["🌱 Seed",          "bpmethod:Seed"]],
          [["⚡ Division",     "bpmethod:Division"],   ["🔗 Grafting",      "bpmethod:Grafting"]],
          [["🌫️ Air Layering", "bpmethod:Air layering"],["💧 Water Rooting", "bpmethod:Water rooting"]]
        ],
        chatId
      );
      break;
    }

    case "method": {
      cur.method   = input.trim();
      session.step = "date";
      _setSession(chatId, session);
      _tgSend("📅 <b>Propagation date for " + cur.plantName + "?</b>\n<i>today / 26-01-2026</i>", chatId);
      break;
    }

    case "date": {
      const d = _parseDate(input.trim());
      if (!d) { _tgSend("❌ Date not recognised.", chatId); return; }
      cur.propDate = d.toISOString();
      session.step = "notes";
      _setSession(chatId, session);
      _tgSend("📝 <b>Notes for " + cur.plantName + "?</b>\n<i>Type <code>none</code> to skip.</i>", chatId);
      break;
    }

    case "notes": {
      cur.notes = input.trim().toLowerCase() === "none" ? "" : input.trim();
      session.props.push(Object.assign({}, cur));
      session.current = {};
      session.step    = "add_more";
      _setSession(chatId, session);
      const count = session.props.length;
      _tgSendButtons(
        "✅ <b>" + session.props[count-1].plantName + "</b> added! (" + count + " so far)\n\nAdd another or save?",
        [[["➕ Add Another", "bprop:more"], ["💾 Save All & Done", "bprop:done"]]],
        chatId
      );
      break;
    }

    case "add_more": {
      const lower = input.trim().toLowerCase();
      if (lower === "done" || lower === "save") {
        _clearSession(chatId);
        _finishBatchPropOnboarding(session, chatId);
      } else {
        const nextNum   = session.props.length + 1;
        session.step    = "name";
        session.current = {};
        _setSession(chatId, session);
        _tgSend("📦 <b>Batch — Plant " + nextNum + "</b>\n\nWhat is the <b>plant name</b>?", chatId);
      }
      break;
    }
  }
}

function _finishBatchPropOnboarding(session, chatId) {
  const blocks = session.props.map(p =>
    "plant name - " + p.plantName + "\n" +
    "propagation method - " + (p.method || "Cutting") + "\n" +
    "date - " + _formatDateShort(new Date(p.propDate)) + "\n" +
    (p.notes ? "notes - " + p.notes + "\n" : "")
  );
  _processBatchPropagations(blocks, chatId);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FLOW 7 — PROPAGATION STAGE UPDATE
//  Trigger: "update prop" or menu:update_prop
//  Steps: prop_id → date → stage → notes → done
// ═══════════════════════════════════════════════════════════════════════════════

function _startPropUpdateOnboarding(chatId, dateIso) {
  _setSession(chatId, { type: "prop_update", step: "prop_id" });
  _tgSend(
    "✏️ <b>Update Propagation — Step 1 of 3</b>\n\n" +
    "Enter the <b>Prop ID</b> to update:\n" +
    "<i>e.g. PROP_1234567_890</i>",
    chatId
  );
}

function _continuePropUpdateOnboarding(session, input, chatId) {
  switch (session.step) {

    case "prop_id": {
      const id  = input.trim().toUpperCase();
      const row = _findRowById("PropagationTracking", id, 1);
      if (!row) { _tgSend("❌ Prop ID not found: <code>" + id + "</code>", chatId); return; }
      session.propId    = id;
      session.plantName = row.rowData[1];
      session.step      = "date";
      _setSession(chatId, session);
      _tgSend(
        "✅ Found: <b>" + session.plantName + "</b>\n\n" +
        "✏️ <b>Step 2 of 3</b> — What is the <b>update date</b>?\n<i>today / 26-01-2026</i>",
        chatId
      );
      break;
    }

    case "date": {
      const d = _parseDate(input.trim());
      if (!d) { _tgSend("❌ Date not recognised.", chatId); return; }
      session.updateDate = d.toISOString();
      session.step       = "stage";
      _setSession(chatId, session);
      _tgSendButtons(
        "🌿 <b>Step 3 of 3</b> — New <b>stage</b> for " + session.plantName + "?\n" +
        "<i>Callusing → Rooted → Potted</i>",
        [
          [["🪨 Callusing",     "pstage:Callusing"],  ["🌱 Rooted",    "pstage:Rooted"]],
          [["🪴 Potted",        "pstage:Potted"],      ["— No change",  "pstage:none"]]
        ],
        chatId
      );
      break;
    }

    case "stage": {
      // text fallback
      session.stage = input.trim().toLowerCase() === "none" ? "" : input.trim();
      session.step  = "pupdate_notes";
      _setSession(chatId, session);
      _tgSend("📝 Any <b>notes</b> for this update?\n<i>e.g. roots visible at base</i>\n\nType <code>none</code> to skip.", chatId);
      break;
    }

    case "pupdate_notes": {
      session.notes = input.trim().toLowerCase() === "none" ? "" : input.trim();
      _clearSession(chatId);
      _processPropUpdate({
        "prop id": session.propId,
        "date":    _formatDateShort(new Date(session.updateDate)),
        "stage":   session.stage || "",
        "notes":   session.notes || ""
      }, chatId);
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CALLBACK QUERY ROUTER
//  All inline button presses land here — dispatched by prefix
// ═══════════════════════════════════════════════════════════════════════════════

function _handleCallbackQuery(cq) {
  const chatId  = String(cq.message.chat.id);
  const data    = cq.data || "";
  const qid     = cq.id;
  if (chatId !== String(CONFIG.TELEGRAM_CHAT_ID)) { _tgAnswerCallback(qid, ""); return; }

  const session = _getSession(chatId);

  // ── Crop & Propagation Hub button callbacks ──────────
  // ── qevt: confirm / cancel (quick-event flow) ────────
  if (data.startsWith("qevt:")) {
    _tgAnswerCallback(qid, "");
    var qsess = _getSession(chatId);
    if (!qsess || qsess.type !== "quick_event") { _tgSend("Session expired. Start again.", chatId); return; }
    if (data === "qevt:cancel") {
      _clearSession(chatId);
      _tgSend("\u274C Cancelled.", chatId);
      return;
    }
    if (data === "qevt:confirm") {
      _executeQuickEvent(qsess, chatId);
    }
    return;
  }

  // ── hub: crop/prop action buttons ─────────────────────
  if (data.startsWith("hub:")) {
    _tgAnswerCallback(qid, "");
    // Format: hub:section:action:dateIso  (dateIso may contain colons — find it after 3rd colon)
    var h1       = data.indexOf(":");
    var h2       = data.indexOf(":", h1 + 1);
    var h3       = data.indexOf(":", h2 + 1);
    var hubSection = data.substring(h1 + 1, h2);           // "crop" or "prop"
    var hubAction  = h3 === -1 ? data.substring(h2 + 1) : data.substring(h2 + 1, h3);
    var hubDate    = h3 === -1 ? "" : data.substring(h3 + 1);  // ISO string or ""
    var hubDateIso = hubDate || null;

    if (hubSection === "crop") {
      switch (hubAction) {
        case "_from_date":   _sendCropHub(chatId, hubDateIso);                      break;
        case "new":          _startCropOnboarding(chatId, hubDateIso);              break;
        case "batch":        _startBatchCropOnboarding(chatId, hubDateIso);         break;
        case "update":       _startCropUpdateOnboarding(chatId, hubDateIso);        break;
        case "status":       _startCropStatusChange(chatId, hubDateIso);            break;
        case "germinated":   _startCropQuickEvent(chatId, "germinated",   hubDateIso); break;
        case "transplanted": _startCropQuickEvent(chatId, "transplanted", hubDateIso); break;
        case "harvest":      _startCropQuickEvent(chatId, "harvest",      hubDateIso); break;
        case "delete":       _startCropDeleteOnboarding(chatId);                    break;
        case "list":         _sendActiveCropsList(chatId);                          break;
        default:             _sendCropHub(chatId, hubDateIso);
      }
    } else if (hubSection === "prop") {
      switch (hubAction) {
        case "_from_date":   _sendPropHub(chatId, hubDateIso);                          break;
        case "new":          _startPropOnboarding(chatId, hubDateIso);                  break;
        case "batch":        _startBatchPropOnboarding(chatId, hubDateIso);             break;
        case "update":       _startPropUpdateOnboarding(chatId, hubDateIso);            break;
        case "status":       _startPropStatusChange(chatId, hubDateIso);                break;
        case "rooted":       _startPropQuickEvent(chatId, "rooted",       hubDateIso);  break;
        case "transplanted": _startPropQuickEvent(chatId, "transplanted", hubDateIso);  break;
        default:             _sendPropHub(chatId, hubDateIso);
      }
    }
    return;
  }

  // ── Menu selections ─────────────────────────────────
  if (data.startsWith("menu:")) {
    _tgAnswerCallback(qid, "");
    switch (data) {
      case "menu:new_crop":    _startCropOnboarding(chatId);        break;
      case "menu:edit_db":     _startDbEditFlow(chatId);            break;
      case "menu:batch_crop":  _startBatchCropOnboarding(chatId);   break;
      case "menu:update_crop": _startCropUpdateOnboarding(chatId);  break;
      case "menu:delete_crop": _startCropDeleteOnboarding(chatId);  break;
      case "menu:new_prop":    _startPropOnboarding(chatId);        break;
      case "menu:batch_prop":  _startBatchPropOnboarding(chatId);   break;
      case "menu:update_prop": _startPropUpdateOnboarding(chatId);  break;
      case "menu:status":          _sendStatusReport(chatId);           break;
      case "menu:today":           _sendTodayBriefing(chatId);          break;
      case "menu:week":            _sendWeekAhead(chatId);               break;
      case "menu:weather":         _sendWeatherForecast(chatId);         break;
      case "menu:harvest_report":  _sendHarvestReport(chatId);           break;
      case "menu:crops":           _sendActiveCropsList(chatId);         break;
      case "menu:gaps":            _sendSuccessionGapAnalysis(chatId);   break;
      case "menu:pin":             _sendPinMenu(chatId);                 break;
      case "menu:fert":            _sendFertScheduleMenu(chatId);        break;
    }
    return;
  }

  // ── Single crop: planting method ────────────────────
  // ── Variety selection (single crop) ────────────────
  if (data.startsWith("variety:") && session && session.type === "crop") {
    const val = data.split(":")[1];
    if (val === "_skip") {
      session.variety = null;
    } else if (val === "_type_other") {
      session.step = "variety";
      _setSession(chatId, session);
      _tgSend("✏️ Type the variety name (or <code>none</code> to skip):", chatId);
      return;
    } else {
      session.variety = val;
    }
    session.step = "date";
    _setSession(chatId, session);
    _tgSend(
      "✅ <b>" + session.cropDisplay + (session.variety ? " — " + session.variety : "") + "</b>\n\n" +
      "🌱 <b>Step 3</b> — What is the <b>planting date</b>?\n" +
      "<i>today / 26-01-2026</i>",
      chatId
    );
    return;
  }

  // ── Variety selection (batch crop) ─────────────────
  if (data.startsWith("bvariety:") && session && session.type === "batch_crop") {
    const val2 = data.split(":")[1];
    if (val2 === "_skip") {
      session.current.variety = null;
    } else if (val2 === "_type_other") {
      session.step = "variety";
      _setSession(chatId, session);
      _tgSend("✏️ Type the variety name (or <code>none</code> to skip):", chatId);
      return;
    } else {
      session.current.variety = val2;
    }
    session.step = "date";
    _setSession(chatId, session);
    _tgSend(
      "✅ <b>" + session.current.cropDisplay + (session.current.variety ? " — " + session.current.variety : "") + "</b>\n\n" +
      "📅 <b>Planting date?</b>\n<i>today / 26-01-2026</i>",
      chatId
    );
    return;
  }

  if (data.startsWith("method:") && session && session.type === "crop") {
    session.method = data.replace("method:", "");
    _tgAnswerCallback(qid, session.method);
    _afterCropMethod(session, chatId);
    return;
  }

  // ── Single crop: continuous harvest ─────────────────
  if (data.startsWith("cons:") && session && session.type === "crop") {
    session.consHarvest = data === "cons:yes";
    _tgAnswerCallback(qid, session.consHarvest ? "Continuous ✅" : "Single harvest ❌");
    session.step = "notes";
    _setSession(chatId, session);
    _tgSend(
      "🌱 <b>Step 5 of 5</b> — Any <b>notes</b>?\n" +
      "<i>e.g. planted in bed 3, heirloom variety</i>\n\nType <code>none</code> to skip.",
      chatId
    );
    return;
  }

  // ── Batch crop: planting method ──────────────────────
  if (data.startsWith("bmethod:") && session && session.type === "batch_crop") {
    session.current.method = data.replace("bmethod:", "");
    _tgAnswerCallback(qid, session.current.method);
    _afterBatchMethod(session, chatId);
    return;
  }

  // ── Batch crop: continuous harvest ──────────────────
  if (data.startsWith("bcons:") && session && session.type === "batch_crop") {
    session.current.consHarvest = data === "bcons:yes";
    _tgAnswerCallback(qid, session.current.consHarvest ? "Continuous ✅" : "Single ❌");
    session.step = "notes";
    _setSession(chatId, session);
    _tgSend("📝 <b>Notes for " + session.current.cropDisplay + "?</b>\n<i>Type <code>none</code> to skip.</i>", chatId);
    return;
  }

  // ── Batch crop: add more / done ──────────────────────
  if (data.startsWith("batch:") && session && session.type === "batch_crop") {
    _tgAnswerCallback(qid, "");
    if (data === "batch:done") {
      _clearSession(chatId);
      _finishBatchCropOnboarding(session, chatId);
    } else {
      const nextNum   = session.crops.length + 1;
      session.step    = "name";
      session.current = {};
      _setSession(chatId, session);
      _tgSend("📦 <b>Batch — Crop " + nextNum + "</b>\n\nWhat is the <b>crop name</b>?", chatId);
    }
    return;
  }

  // ── Crop update: stage ──────────────────────────────
  if (data.startsWith("ustage:") && session && session.type === "crop_update") {
    const val = data.replace("ustage:", "");
    _tgAnswerCallback(qid, val === "none" ? "No stage change" : val);
    if (val === "custom") {
      session.step = "stage";
      _setSession(chatId, session);
      _tgSend("Type the new stage:", chatId);
    } else {
      session.stage = val === "none" ? "" : val;
      session.step  = "treatment";
      _setSession(chatId, session);
      _askCropTreatment(session, chatId);
    }
    return;
  }

  // ── Crop update: treatment ──────────────────────────
  if (data.startsWith("utreat:") && session && session.type === "crop_update") {
    session.treatment = data.replace("utreat:", "") === "none" ? "" : data.replace("utreat:", "");
    _tgAnswerCallback(qid, session.treatment || "No treatment");
    session.step = "update_notes";
    _setSession(chatId, session);
    _tgSend(
      "✏️ <b>Step 4 of 4</b> — Any <b>notes</b>?\n<i>Type <code>none</code> to skip.</i>",
      chatId
    );
    return;
  }

  // ── Crop delete: confirm / cancel ───────────────────
  // ── Fert schedule view callback ───────────────────
  if (data.startsWith("fertview:")) {
    var fvId  = data.replace("fertview:", "");
    var fvRow = _findRowById("CropTracking", fvId, 1);
    if (!fvRow) { _tgSend("Crop not found.", chatId); }
    else {
      var fvName = fvRow.rowData[1], fvVar = fvRow.rowData[2];
      var fvGerm = _parseDate(String(fvRow.rowData[8])) || new Date();
      _tgAnswerCallback(qid, fvName);
      _tgSend(_buildFertScheduleMsg(fvName, fvVar, fvId, fvGerm), chatId);
    }
    return;
  }

  // ── Fertilizer confirm (✅ Applied / ❌ Not Yet) ──────
  if (data.startsWith("fertdone:")) {
    _handleFertConfirm(data, chatId, qid);
    return;
  }

  // ── Fertilizer snooze (2–3 Hours / Next Day) ─────────
  if (data.startsWith("fertsnooze:")) {
    _handleFertSnooze(data, chatId, qid);
    return;
  }

  // ── True-leaf button callbacks ────────────────────
  if (data.startsWith("tleaf:")) {
    // format: tleaf:COUNT:TRACKING_ID
    var tlParts = data.split(":");
    var tlCount = parseInt(tlParts[1]);
    var tlId    = tlParts[2];
    _tgAnswerCallback(qid, tlCount + " leaf" + (tlCount === 1 ? "" : "s"));
    // Synthesise the equivalent text reply and reuse handler
    _handleTrueLeafReply("true leaves " + tlCount + "\n" + tlId, chatId);
    return;
  }

  // ── Pin callbacks ─────────────────────────────────
  if (data.startsWith("pin:")) {
    _handlePinAction(data.slice(4), chatId);
    return;
  }

  // ── DB Edit callbacks ──────────────────────────────
  if (data.startsWith("dbedit:") && session && session.type === "db_edit") {
    const parts = data.split(":");
    const sub   = parts[1];

    if (sub === "var") {
      const varVal = parts[2] === "_all" ? null : parts[2];
      session.editVariety = varVal;
      session.step        = "field";
      _setSession(chatId, session);
      _askDbEditField(session, chatId);
      return;
    }
    if (sub === "field") {
      session.editField = parts[2];
      session.step      = "new_value";
      _setSession(chatId, session);
      _askDbEditValue(session, chatId);
      return;
    }
    if (sub === "confirm") {
      _saveDbEdit(session, chatId);
      return;
    }
    if (sub === "cancel") {
      _clearSession(chatId);
      _tgSend("❌ Edit cancelled.", chatId);
      return;
    }
  }

  if (data.startsWith("delcrop:") && session && session.type === "crop_delete") {
    _tgAnswerCallback(qid, "");
    _clearSession(chatId);
    if (data === "delcrop:confirm") {
      _processCropDelete({ "crop id": session.cropId, "status": "delete" }, chatId);
    } else {
      _tgSend("❌ Delete cancelled.", chatId);
    }
    return;
  }

  // ── Propagation method ───────────────────────────────
  if (data.startsWith("pmethod:") && session && session.type === "prop") {
    session.method = data.replace("pmethod:", "");
    session.step   = "date";
    _tgAnswerCallback(qid, session.method);
    _setSession(chatId, session);
    _tgSend(
      "🌿 <b>Step 3 of 4</b> — What is the <b>propagation date</b>?\n<i>today / 26-01-2026</i>",
      chatId
    );
    return;
  }

  // ── Batch prop: method ───────────────────────────────
  if (data.startsWith("bpmethod:") && session && session.type === "batch_prop") {
    session.current.method = data.replace("bpmethod:", "");
    session.step           = "date";
    _tgAnswerCallback(qid, session.current.method);
    _setSession(chatId, session);
    _tgSend("📅 <b>Propagation date for " + session.current.plantName + "?</b>\n<i>today / 26-01-2026</i>", chatId);
    return;
  }

  // ── Batch prop: add more / done ──────────────────────
  if (data.startsWith("bprop:") && session && session.type === "batch_prop") {
    _tgAnswerCallback(qid, "");
    if (data === "bprop:done") {
      _clearSession(chatId);
      _finishBatchPropOnboarding(session, chatId);
    } else {
      const nextNum   = session.props.length + 1;
      session.step    = "name";
      session.current = {};
      _setSession(chatId, session);
      _tgSend("📦 <b>Batch — Plant " + nextNum + "</b>\n\nWhat is the <b>plant name</b>?", chatId);
    }
    return;
  }

  // ── Prop update: stage ───────────────────────────────
  if (data.startsWith("pstage:") && session && session.type === "prop_update") {
    const val = data.replace("pstage:", "");
    _tgAnswerCallback(qid, val === "none" ? "No change" : val);
    session.stage = val === "none" ? "" : val;
    session.step  = "pupdate_notes";
    _setSession(chatId, session);
    _tgSend("📝 Any <b>notes</b>?\n<i>e.g. roots visible at base</i>\n\nType <code>none</code> to skip.", chatId);
    return;
  }

  _tgAnswerCallback(qid, "");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  POLL ANSWER HANDLER  (tray color selections)
// ═══════════════════════════════════════════════════════════════════════════════

function _handlePollAnswer(pollAnswer) {
  const userId = String(pollAnswer.user.id);
  if (userId !== String(CONFIG.TELEGRAM_CHAT_ID)) return;
  const chatId  = userId;
  const session = _getSession(chatId);
  if (!session || session.step !== "tray_colors_wait") return;

  const colorMap = ["White", "Red", "Yellow", "Green", "Blue"];
  const chosen   = (pollAnswer.option_ids || []).map(i => colorMap[i]).filter(Boolean);

  if (session.type === "crop") {
    session.trayColors = chosen;
    session.step       = "cons_harvest";
    _setSession(chatId, session);
    _tgSend("🎨 Tray color" + (chosen.length > 1 ? "s" : "") + ": <b>" + chosen.join(", ") + "</b>", chatId);
    Utilities.sleep(400);
    _askCropConsHarvest(session, chatId);

  } else if (session.type === "batch_crop") {
    session.current.trayColors = chosen;
    session.step               = "cons_harvest";
    _setSession(chatId, session);
    _tgSend("🎨 Tray: <b>" + chosen.join(", ") + "</b>", chatId);
    Utilities.sleep(400);
    _askBatchConsHarvest(session, chatId);
  }
}

// ══════════════════════════════════════════════════════
//  CROP DATABASE  (unchanged from v8)
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
//  CROP DATABASE — loaded from crop_database.json on Google Drive
//  To add a new crop: edit crop_database.json — no code changes needed.
// ══════════════════════════════════════════════════════

/**
 * Internal cache so we only read the JSON file once per execution.
 * Reset automatically each time the script runs.
 */
let _cropDbCache = null;

/**
 * Loads and returns the crop database from crop_database.json on Google Drive.
 * Caches the result for the duration of the current execution.
 * Falls back to an empty object if the file cannot be found.
 */
function _loadCropDb() {
  if (_cropDbCache !== null) return _cropDbCache;

  try {
    const files = DriveApp.getFilesByName("crop_database.json");
    if (!files.hasNext()) {
      Logger.log("⚠️ crop_database.json not found on Google Drive. Upload it and try again.");
      _cropDbCache = {};
      return _cropDbCache;
    }
    const file    = files.next();
    const content = file.getBlob().getDataAsString("UTF-8");
    _cropDbCache  = JSON.parse(content);
    Logger.log("✅ Loaded crop_database.json — " + Object.keys(_cropDbCache).length + " entries");
  } catch(e) {
    Logger.log("❌ Error loading crop_database.json: " + e.message);
    _cropDbCache = {};
  }

  return _cropDbCache;
}

/**
 * Looks up a crop by name (case-insensitive).
 * 1. Exact match first
 * 2. Follows alias entries automatically
 * 3. Falls back to fuzzy partial match (e.g. "scotch bonnet pepper" → "scotch bonnet")
 * Returns null if not found.
 */
function _lookupCrop(name) {
  if (!name) return null;
  const db  = _loadCropDb();
  const key = name.trim().toLowerCase();

  // Exact match
  let entry = db[key];
  if (entry) {
    if (entry.alias) entry = db[entry.alias.toLowerCase()] || null;
    return entry || null;
  }

  // Fuzzy: check if any db key contains the search term or vice versa
  for (const k in db) {
    if (k.includes(key) || key.includes(k)) {
      let fe = db[k];
      if (fe && fe.alias) fe = db[fe.alias.toLowerCase()] || null;
      if (fe) return fe;
    }
  }

  return null;
}


// ══════════════════════════════════════════════════════
//  SETUP

// ══════════════════════════════════════════════════════
//  SETUP & TRIGGERS
// ══════════════════════════════════════════════════════

function setupSystem() {
  Logger.log("Setting up Alex's Crop Management System v9...");
  // Seed crop ID snapshot for sheet-delete sync
  try { seedCropIdSnapshot(); } catch(e) {}
  let ss;
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.length > 10) {
    ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  } else {
    ss = SpreadsheetApp.create("🌱 Alex's Crop & Propagation Tracker");
    Logger.log("Created new spreadsheet: " + ss.getUrl());
  }

  _ensureSheet(ss, "CropTracking", [
    "ID", "Crop Name", "Variety", "Planting Method", "Plant Stage", "Planting Date",
    "Transplant Date (Scheduled)", "Transplant Date (Actual)", "Germination Date",
    "Harvest Date (Estimated)", "Harvest Date (Actual)",
    "Next Consistent Planting", "Batch Number",
    "Fungus Spray Dates", "Pest Spray Dates",
    "Status", "Notes",
    "Days: Seed-Germ", "Days: Germ-Transplant", "Days: Transplant-Harvest",
    "Telegram Chat ID"
  ]);
  _ensureSheet(ss, "PropagationTracking", [
    "ID", "Plant Name", "Propagation Date", "Propagation Method",
    "Notes", "Expected Rooting Start", "Expected Rooting End",
    "Actual Rooting Date", "Days to Root (Actual)", "Status", "Telegram Chat ID"
  ]);
  _ensureSheet(ss, "CropDatabase_Adjustments", [
    "Crop Key", "Variety", "Field", "Database Default", "Your Average", "Sample Count",
    "Use Custom", "Last Updated"
  ]);
  _ensureSheet(ss, "PropDatabase_Adjustments", [
    "Plant Key", "Method", "DB Default Rooting Days", "Your Average", "Sample Count",
    "Use Custom", "Last Updated"
  ]);
  _ensureSheet(ss, "HarvestLog", [
    "Crop Tracking ID", "Crop Name", "Harvest Number", "Harvest Date",
    "Days From Planting", "Deviation From DB (days)", "Notes"
  ]);
  _ensureSheet(ss, "ReminderQueue", [
    "Reminder ID", "Type", "Crop/Plant Name", "Tracking ID",
    "Send Date", "Subject", "Body", "Sent", "Chat ID"
  ]);
  _ensureSheet(ss, "TreatmentLog", [
    "Crop ID", "Crop Name", "Date", "Days From Planting", "Type", "Product", "Notes"
  ]);
  _ensureSheet(ss, "PropagationDatabase", [
    "Plant Key", "Method", "Default Rooting Days Min", "Default Rooting Days Max",
    "Your Average Rooting Days", "Sample Count", "Last Updated"
  ]);
  _ensureSheet(ss, "StageLog", [
    "Tracking ID", "Crop Name", "Variety", "Stage From", "Stage To",
    "Date", "Days Elapsed", "Method", "Notes"
  ]);
  _ensureSheet(ss, "BatchPlantingLog", [
    "Crop Tracking ID", "Crop Name", "Batch Number", "Batch Planting Date",
    "Confirmed Planted Date", "Next Batch Date", "Status", "Notes"
  ]);
  _ensureSheet(ss, CONFIG.SEARCH_LOG_SHEET, [
    "Crop Key", "Search Date", "Growing Time Found", "Germination Days Min", "Germination Days Max",
    "Source Summary", "Applied To Tracker"
  ]);

  Logger.log("✅ Setup complete!");
  migrateToV98();   // adds any missing columns to existing sheets
  notifyDeployment();
}

/**
 * ★ Run this (or setupSystem) after upgrading to v9.8.
 * Adds missing columns to the existing CropTracking sheet in-place.
 * Safe to run multiple times — skips any column that already exists.
 *
 * Columns added:
 *   "Germination Date"         — inserted after "Transplant Date (Actual)"
 *   "Days: Seed-Germ"          — inserted after "Notes"
 *   "Days: Germ-Transplant"    — inserted after "Days: Seed-Germ"
 *   "Days: Transplant-Harvest" — inserted after "Days: Germ-Transplant"
 * Also creates StageLog sheet if it doesn't exist yet.
 */
function migrateToV98() {
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName("CropTracking");
  if (!sheet) {
    Logger.log("CropTracking not found — run setupSystem() first.");
    return;
  }

  var changes = 0;

  // ── helper: fresh header read (always re-read after any insertion) ──
  function getHeaders() {
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).trim().toLowerCase(); });
  }

  // ── helper: style a header cell ──
  function styleHeader(col1based) {
    var cell = sheet.getRange(1, col1based);
    cell.setFontWeight("bold");
    cell.setBackground("#2d6a2d");
    cell.setFontColor("#ffffff");
  }

  // ── 1. "Germination Date" — must come after "Transplant Date (Actual)" ──
  var h1 = getHeaders();
  if (h1.indexOf("germination date") === -1) {
    // find "transplant date (actual)" — insert the new col right after it
    var transIdx = -1;
    for (var i = 0; i < h1.length; i++) {
      if (h1[i].indexOf("transplant date") !== -1 && h1[i].indexOf("actual") !== -1) {
        transIdx = i; break;
      }
    }
    var insertAt = (transIdx >= 0 ? transIdx + 2 : 9); // 1-based col to insert before
    sheet.insertColumnBefore(insertAt);
    sheet.getRange(1, insertAt).setValue("Germination Date");
    styleHeader(insertAt);
    Logger.log("Added 'Germination Date' at col " + insertAt);
    changes++;
  } else {
    Logger.log("'Germination Date' already present — skipping");
  }

  // ── 2. Three duration columns — insert after "Notes" ──
  var durCols = ["Days: Seed-Germ", "Days: Germ-Transplant", "Days: Transplant-Harvest"];
  for (var d = 0; d < durCols.length; d++) {
    var label    = durCols[d];
    var labelLow = label.toLowerCase();
    var h2       = getHeaders(); // re-read each time
    if (h2.indexOf(labelLow) !== -1) {
      Logger.log("'" + label + "' already present — skipping");
      continue;
    }
    // Find "Notes" each pass (position may have shifted from previous insertions)
    var notesIdx = -1;
    for (var j = 0; j < h2.length; j++) {
      if (h2[j] === "notes") { notesIdx = j; break; }
    }
    var pos = (notesIdx >= 0 ? notesIdx + 2 : sheet.getLastColumn() + 1);
    sheet.insertColumnBefore(pos);
    sheet.getRange(1, pos).setValue(label);
    styleHeader(pos);
    Logger.log("Added '" + label + "' at col " + pos);
    changes++;
  }

  // ── 3. StageLog sheet ──
  if (!ss.getSheetByName("StageLog")) {
    var sl = ss.insertSheet("StageLog");
    var slH = ["Tracking ID","Crop Name","Variety","Stage From","Stage To","Date","Days Elapsed","Method","Notes"];
    var slR = sl.getRange(1, 1, 1, slH.length);
    slR.setValues([slH]);
    slR.setFontWeight("bold");
    slR.setBackground("#2d6a2d");
    slR.setFontColor("#ffffff");
    sl.setFrozenRows(1);
    Logger.log("Created StageLog sheet");
    changes++;
  } else {
    Logger.log("StageLog already present — skipping");
  }

  // ── Done ──
  var finalHeaders = getHeaders();
  Logger.log("Final CropTracking headers (" + finalHeaders.length + "): " + finalHeaders.join(" | "));

  if (changes === 0) {
    Logger.log("migrateToV98: already up to date.");
  } else {
    Logger.log("migrateToV98: " + changes + " change(s) applied successfully.");
    try {
      _tgSend(
        "\uD83D\uDD27 <b>Sheet Migration Complete (v9.8)</b>\n" +
        "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n" +
        changes + " change(s) applied to your sheet:\n\n" +
        "\u2022 <b>Germination Date</b> column added\n" +
        "\u2022 <b>Days: Seed-Germ</b> column added\n" +
        "\u2022 <b>Days: Germ-Transplant</b> column added\n" +
        "\u2022 <b>Days: Transplant-Harvest</b> column added\n" +
        "\u2022 <b>StageLog</b> sheet created\n\n" +
        "<i>Existing crop rows are untouched. All new crops will track every stage duration automatically.</i>",
        CONFIG.TELEGRAM_CHAT_ID
      );
    } catch(e) { Logger.log("Telegram notify skipped: " + e.message); }
  }
}

// Keep old name as alias so any saved bookmarks still work
function migrateSheetFromV8() {
  migrateToV98();
}

// ══════════════════════════════════════════════════════
//  fixSheetLayout()
//  ★ Run this ONCE if your CropTracking sheet is missing
//    the Variety column or has wrong column order.
//
//  What it does:
//  1. Ensures all 11 required sheets exist with correct headers
//  2. Inserts "Variety" column at col C (position 3) if missing
//  3. Reorders the 3 Days columns to match code expectations:
//       Seed-Germ → Germ-Transplant → Transplant-Harvest
//  4. Fixes data issues:
//       • Moves "slicing tomatoes" (Notes) → Variety column
//       • Moves misplaced "Seedling" from Notes → Plant Stage
//       • Clears negative Days values
//  5. Logs a full before/after report
//
//  Safe to run multiple times — skips steps already done.
// ══════════════════════════════════════════════════════
function fixSheetLayout() {
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var report = [];
  var changed = 0;

  // ── 1. Ensure all sheets exist ────────────────────────
  var allSheets = {
    "CropTracking": [
      "ID","Crop Name","Variety","Planting Method","Plant Stage","Planting Date",
      "Transplant Date (Scheduled)","Transplant Date (Actual)","Germination Date",
      "Harvest Date (Estimated)","Harvest Date (Actual)",
      "Next Consistent Planting","Batch Number",
      "Fungus Spray Dates","Pest Spray Dates",
      "Status","Notes",
      "Days: Seed-Germ","Days: Germ-Transplant","Days: Transplant-Harvest",
      "Telegram Chat ID"
    ],
    "PropagationTracking": [
      "ID","Plant Name","Propagation Date","Propagation Method",
      "Notes","Expected Rooting Start","Expected Rooting End",
      "Actual Rooting Date","Days to Root (Actual)","Status","Telegram Chat ID"
    ],
    "CropDatabase_Adjustments": [
      "Crop Key","Variety","Field","Database Default","Your Average","Sample Count",
      "Use Custom","Last Updated"
    ],
    "PropDatabase_Adjustments": [
      "Plant Key","Method","DB Default Rooting Days","Your Average","Sample Count",
      "Use Custom","Last Updated"
    ],
    "HarvestLog": [
      "Crop Tracking ID","Crop Name","Harvest Number","Harvest Date",
      "Days From Planting","Deviation From DB (days)","Notes"
    ],
    "ReminderQueue": [
      "Reminder ID","Type","Crop/Plant Name","Tracking ID",
      "Send Date","Subject","Body","Sent","Chat ID"
    ],
    "TreatmentLog": [
      "Crop ID","Crop Name","Date","Days From Planting","Type","Product","Notes"
    ],
    "StageLog": [
      "Tracking ID","Crop Name","Variety","Stage From","Stage To",
      "Date","Days Elapsed","Method","Notes"
    ],
    "BatchPlantingLog": [
      "Crop Tracking ID","Crop Name","Batch Number","Batch Planting Date",
      "Confirmed Planted Date","Next Batch Date","Status","Notes"
    ],
    "PropagationDatabase": [
      "Plant Key","Method","Default Rooting Days Min","Default Rooting Days Max",
      "Your Average Rooting Days","Sample Count","Last Updated"
    ]
  };

  Object.keys(allSheets).forEach(function(name) {
    var headers = allSheets[name];
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      var rng = sh.getRange(1, 1, 1, headers.length);
      rng.setValues([headers]);
      rng.setFontWeight("bold");
      rng.setBackground("#2d6a2d");
      rng.setFontColor("#ffffff");
      sh.setFrozenRows(1);
      report.push("✅ Created sheet: " + name + " (" + headers.length + " columns)");
      changed++;
    } else {
      // Check if headers need updating
      var existing = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(function(h){return String(h).trim();});
      var needsHeaders = false;
      for (var i = 0; i < headers.length; i++) {
        if (existing[i] !== headers[i]) { needsHeaders = true; break; }
      }
      if (!needsHeaders) {
        report.push("✓ Sheet OK: " + name);
      } else {
        report.push("⚠️ Sheet exists but headers differ: " + name + " — run fixCropTrackingColumns() to repair");
      }
    }
  });

  // ── 2. Fix CropTracking columns ───────────────────────
  var ct = ss.getSheetByName("CropTracking");
  if (!ct) {
    report.push("❌ CropTracking not found — run setupSystem() first");
    Logger.log(report.join("\n"));
    return;
  }

  function getHeaders() {
    return ct.getRange(1,1,1,ct.getLastColumn()).getValues()[0].map(function(h){return String(h).trim();});
  }
  function headerIdx(name) { return getHeaders().indexOf(name); }  // 0-based
  function styleHeader(col1) {
    var c = ct.getRange(1, col1);
    c.setFontWeight("bold"); c.setBackground("#2d6a2d"); c.setFontColor("#ffffff");
  }

  // 2a. Insert Variety column at position 3 (col C, 1-based) if missing
  if (headerIdx("Variety") === -1) {
    ct.insertColumnBefore(3);
    ct.getRange(1, 3).setValue("Variety");
    styleHeader(3);
    report.push("✅ Inserted 'Variety' column at col C (position 3)");
    changed++;
  } else {
    report.push("✓ 'Variety' column already present at col " + (headerIdx("Variety")+1));
  }

  // 2b. Fix Days column ORDER if wrong
  // After Variety insert, correct order should be:
  //   ...Notes [col 17], Days:Seed-Germ [18], Days:Germ-Transplant [19], Days:Transplant-Harvest [20]...
  var h = getHeaders();
  var sgIdx  = h.indexOf("Days: Seed-Germ");          // 0-based
  var gtIdx  = h.indexOf("Days: Germ-Transplant");
  var thIdx  = h.indexOf("Days: Transplant-Harvest");
  var notesIdx = h.indexOf("Notes");

  if (sgIdx === -1 || gtIdx === -1 || thIdx === -1) {
    report.push("⚠️ One or more Days columns missing — skipping reorder");
  } else if (sgIdx < gtIdx && gtIdx < thIdx && notesIdx < sgIdx) {
    report.push("✓ Days columns already in correct order");
  } else {
    // Extract data from all 3 Days columns (full column, skip header row)
    var lastRow = ct.getLastRow();
    var sgData  = lastRow > 1 ? ct.getRange(2, sgIdx+1,  lastRow-1, 1).getValues() : [];
    var gtData  = lastRow > 1 ? ct.getRange(2, gtIdx+1,  lastRow-1, 1).getValues() : [];
    var thData  = lastRow > 1 ? ct.getRange(2, thIdx+1,  lastRow-1, 1).getValues() : [];

    // Delete the 3 old columns (delete from right to left to preserve indices)
    var toDel = [sgIdx+1, gtIdx+1, thIdx+1].sort(function(a,b){return b-a;});
    toDel.forEach(function(c) { ct.deleteColumn(c); });
    report.push("🗑️ Deleted old Days columns (to re-insert in correct order)");

    // Re-read headers after deletion and find Notes position
    var h2      = getHeaders();
    var notes2  = h2.indexOf("Notes");
    var insertPos = notes2 + 2; // insert after Notes (1-based)

    // Insert 3 new columns at the right position
    ct.insertColumnsAfter(notes2 + 1, 3);
    var labels = ["Days: Seed-Germ","Days: Germ-Transplant","Days: Transplant-Harvest"];
    var allData = [sgData, gtData, thData];
    for (var d = 0; d < 3; d++) {
      var col = notes2 + 2 + d; // 1-based
      ct.getRange(1, col).setValue(labels[d]);
      styleHeader(col);
      if (allData[d].length > 0) ct.getRange(2, col, allData[d].length, 1).setValues(allData[d]);
    }
    report.push("✅ Days columns reinserted in correct order: Seed-Germ → Germ-Transplant → Transplant-Harvest");
    changed++;
  }

  // ── 3. Fix data quality issues ────────────────────────
  if (ct.getLastRow() > 1) {
    var data     = ct.getDataRange().getValues();
    var finalH   = getHeaders();
    var varCol   = finalH.indexOf("Variety") + 1;       // 1-based
    var stageCol = finalH.indexOf("Plant Stage") + 1;
    var notesCol = finalH.indexOf("Notes") + 1;
    var sgCol    = finalH.indexOf("Days: Seed-Germ") + 1;
    var gtCol    = finalH.indexOf("Days: Germ-Transplant") + 1;
    var thCol    = finalH.indexOf("Days: Transplant-Harvest") + 1;

    for (var i = 1; i < data.length; i++) {
      var rowNum  = i + 1; // 1-based sheet row
      var notesVal = String(data[i][notesCol-1] || "").trim();
      var variety  = String(data[i][varCol-1]   || "").trim();
      var stage    = String(data[i][stageCol-1] || "").trim();

      // "slicing tomatoes" in Notes → move to Variety (if Variety is empty)
      if (notesVal.toLowerCase() === "slicing tomatoes" && variety === "") {
        ct.getRange(rowNum, varCol).setValue("Slicing");
        ct.getRange(rowNum, notesCol).setValue("");
        report.push("✅ Row " + rowNum + " (" + data[i][1] + "): moved 'slicing tomatoes' → Variety, cleared Notes");
        changed++;
      }
      // "Seedling" in Notes when Plant Stage is empty → move to Plant Stage
      if (notesVal.toLowerCase() === "seedling" && (stage === "" || stage.toLowerCase() === "seed")) {
        ct.getRange(rowNum, stageCol).setValue("Seedling");
        ct.getRange(rowNum, notesCol).setValue("");
        report.push("✅ Row " + rowNum + " (" + data[i][1] + "): moved 'Seedling' from Notes → Plant Stage");
        changed++;
      }
      // Clear negative Days values
      var daysChecks = [[sgCol,"Days:Seed-Germ"],[gtCol,"Days:Germ-Transplant"],[thCol,"Days:Transplant-Harvest"]];
      daysChecks.forEach(function(dc) {
        var v = data[i][dc[0]-1];
        if (v !== "" && v !== null && !isNaN(parseFloat(v)) && parseFloat(v) < 0) {
          ct.getRange(rowNum, dc[0]).setValue("");
          report.push("✅ Row " + rowNum + " (" + data[i][1] + "): cleared negative " + dc[1] + " = " + v);
          changed++;
        }
      });
    }
  }

  // ── 4. Summary ────────────────────────────────────────
  var summary = "\uD83D\uDD27 <b>Sheet Layout Fix Complete</b>\n" +
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n" +
    "Changes applied: " + changed + "\n\n" +
    report.map(function(r){ return r; }).join("\n");

  Logger.log(summary.replace(/<[^>]+>/g,""));

  if (changed > 0) {
    try { _tgSend(summary, CONFIG.TELEGRAM_CHAT_ID); } catch(e) {}
  }

  Logger.log("\n\u2705 fixSheetLayout() complete. Changes: " + changed);
}


// ══════════════════════════════════════════════════════
//  fixCropDatabaseAdjustments()
//  ★ Run this ONCE to repair corrupt data in the
//    CropDatabase_Adjustments sheet.
//
//  PROBLEMS IT FIXES:
//  1. Missing "Variety" column — inserts it at col B and
//     shifts Field / DB Default columns right
//  2. Corrupt rows written before Variety column existed
//     (planting method in Variety slot, field name shifted)
//     → Detects and corrects these rows automatically
//  3. Negative "Your Average" values (bad stage date calcs)
//     → Deletes those rows (invalid data)
//  4. StageLog rows with planting method in Variety column
//     and negative Days Elapsed → clears those cells
//  5. Removes trailing blank column from PropagationTracking
//  6. Fixes 'tomatoe' typo in CropSearchLog → 'tomato'
//
//  Safe to run multiple times.
// ══════════════════════════════════════════════════════
function fixCropDatabaseAdjustments() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var report = [];
  var changed = 0;

  function styleHeader(sheet, col1) {
    var c = sheet.getRange(1, col1);
    c.setFontWeight("bold"); c.setBackground("#2d6a2d"); c.setFontColor("#ffffff");
  }

  // ── 1. CropDatabase_Adjustments ───────────────────────
  var cda = ss.getSheetByName("CropDatabase_Adjustments");
  if (!cda) {
    report.push("❌ CropDatabase_Adjustments not found");
  } else {
    var cdaHeaders = cda.getRange(1,1,1,cda.getLastColumn()).getValues()[0].map(function(h){return String(h).trim();});

    // 1a. Insert Variety column at col B if missing
    if (cdaHeaders.indexOf("Variety") === -1) {
      cda.insertColumnBefore(2);
      cda.getRange(1, 2).setValue("Variety");
      styleHeader(cda, 2);
      // Also rename "Field" header if it's at col 2 (now shifted to col 3)
      var newHeaders = cda.getRange(1,1,1,cda.getLastColumn()).getValues()[0].map(function(h){return String(h).trim();});
      // Make sure col 3 says "Field" and col 4 says "Database Default"
      if (newHeaders[2] !== "Field")       { cda.getRange(1,3).setValue("Field"); styleHeader(cda,3); }
      if (newHeaders[3] !== "Database Default") { cda.getRange(1,4).setValue("Database Default"); styleHeader(cda,4); }
      if (newHeaders[4] !== "Your Average")     { cda.getRange(1,5).setValue("Your Average"); styleHeader(cda,5); }
      if (newHeaders[5] !== "Sample Count")     { cda.getRange(1,6).setValue("Sample Count"); styleHeader(cda,6); }
      if (newHeaders[6] !== "Use Custom")       { cda.getRange(1,7).setValue("Use Custom"); styleHeader(cda,7); }
      if (newHeaders[7] !== "Last Updated")     { cda.getRange(1,8).setValue("Last Updated"); styleHeader(cda,8); }
      report.push("✅ CropDatabase_Adjustments: inserted 'Variety' column at col B");
      changed++;
    } else {
      report.push("✓ CropDatabase_Adjustments: 'Variety' column already present");
    }

    // 1b. Scan and fix corrupt data rows
    // A corrupt row is one where col[2] (Field) contains a number (should be a field name string)
    // or col[1] (Variety) contains a known field name like 'germination_days'
    // or col[4] (Your Average) is negative
    var knownFields = ["germination_days","germination_days_min","germination_days_max",
                       "growing_time_days","transplant_days","growing_from_transplant","batch_offset_days"];
    var knownMethods = ["seed tray","direct ground","direct bed","transplant","cutting","division","grafting"];

    var rowsToDelete = [];
    if (cda.getLastRow() > 1) {
      var cdaData = cda.getRange(2,1, cda.getLastRow()-1, cda.getLastColumn()).getValues();
      for (var i = 0; i < cdaData.length; i++) {
        var rowNum = i + 2;
        var rCropKey  = String(cdaData[i][0] || "").trim();
        var rVariety  = String(cdaData[i][1] || "").trim();
        var rField    = String(cdaData[i][2] || "").trim();
        var rDbDef    = cdaData[i][3];
        var rAvg      = cdaData[i][4];
        var rSamples  = cdaData[i][5];

        if (!rCropKey) continue;

        // Case A: Variety slot contains a field name (old corrupt write without Variety col)
        var varietyIsFieldName = knownFields.some(function(f){ return rVariety.toLowerCase() === f; });
        // Case B: Variety slot contains a planting method (another corrupt write pattern)
        var varietyIsMethod = knownMethods.some(function(m){ return rVariety.toLowerCase().indexOf(m) !== -1; });
        // Case C: Your Average is negative (invalid data)
        var avgIsNegative = !isNaN(parseFloat(rAvg)) && parseFloat(rAvg) < 0;

        if (varietyIsFieldName) {
          // Old row: [cropKey, fieldName, dbDefault, yourAvg, sampleCount, useCustom, lastUpdated]
          // Shift: field was at col B, dbDefault at C, avg at D — now variety col exists so we fix in-place
          // The variety was not stored (empty), field is at wrong place
          // Current state after Variety insert: [cropKey, (blank), fieldName, dbDefault, yourAvg, sampleCount, useCustom, lastUpdated]
          // Wait — after insert, old col[1] (field) is now col[2], so it might already be OK structure
          // Just clear variety (col2) if it has a field name there from BEFORE the insert
          // Re-read after the Variety column insert
          var freshData = cda.getRange(rowNum,1,1,cda.getLastColumn()).getValues()[0];
          var fVariety = String(freshData[1]||"").trim();
          var fField   = String(freshData[2]||"").trim();
          var fFieldIsKnown = knownFields.some(function(f){ return fField.toLowerCase() === f; });
          if (!fFieldIsKnown && knownFields.some(function(f){ return fVariety.toLowerCase() === f; })) {
            // Field name is stuck in Variety col, shift it
            cda.getRange(rowNum,3).setValue(fVariety);  // move to Field col
            cda.getRange(rowNum,2).setValue("");          // clear Variety col
            report.push("✅ Row " + rowNum + " (" + rCropKey + "): moved field name '" + fVariety + "' from Variety → Field col");
            changed++;
          }
        }

        if (varietyIsMethod) {
          // Variety col has planting method (e.g. "Seed tray") — clear it, it's not a variety
          cda.getRange(rowNum, 2).setValue("");
          report.push("✅ Row " + rowNum + " (" + rCropKey + "): cleared planting method '" + rVariety + "' from Variety col");
          changed++;
        }

        if (avgIsNegative) {
          rowsToDelete.push(rowNum);
          report.push("🗑️ Row " + rowNum + " (" + rCropKey + "): negative Your Average = " + rAvg + " — row will be deleted");
          changed++;
        }
      }
    }

    // Delete negative-average rows from bottom up
    for (var d = rowsToDelete.length - 1; d >= 0; d--) {
      cda.deleteRow(rowsToDelete[d]);
    }

    // Remove trailing blank column if present
    var finalCols = cda.getLastColumn();
    if (finalCols > 8) {
      var lastColVals = cda.getRange(1,finalCols,1,1).getValues()[0][0];
      if (!lastColVals || String(lastColVals).trim() === "") {
        cda.deleteColumn(finalCols);
        report.push("✅ CropDatabase_Adjustments: removed trailing blank column");
        changed++;
      }
    }
  }

  // ── 2. StageLog — fix corrupt Variety and negative Days ──
  var sl = ss.getSheetByName("StageLog");
  if (sl && sl.getLastRow() > 1) {
    var slData = sl.getRange(2,1, sl.getLastRow()-1, sl.getLastColumn()).getValues();
    var plantingMethods = ["seed tray","direct ground","direct bed","transplant","cutting"];
    for (var si = 0; si < slData.length; si++) {
      var sRowNum = si + 2;
      var sVariety = String(slData[si][2] || "").trim();
      var sDays    = slData[si][6];
      var sIsMethod = plantingMethods.some(function(m){ return sVariety.toLowerCase().indexOf(m) !== -1; });
      if (sIsMethod) {
        sl.getRange(sRowNum, 3).setValue("");
        report.push("✅ StageLog row " + sRowNum + ": cleared planting method '" + sVariety + "' from Variety col");
        changed++;
      }
      if (!isNaN(parseFloat(sDays)) && parseFloat(sDays) < 0) {
        sl.getRange(sRowNum, 7).setValue("");
        report.push("✅ StageLog row " + sRowNum + ": cleared negative Days Elapsed = " + sDays);
        changed++;
      }
    }
  }

  // ── 3. PropagationTracking — remove trailing blank column ──
  var pt = ss.getSheetByName("PropagationTracking");
  if (pt) {
    var ptCols = pt.getLastColumn();
    if (ptCols > 11) {
      var ptLastHeader = String(pt.getRange(1, ptCols).getValue() || "").trim();
      if (ptLastHeader === "") {
        pt.deleteColumn(ptCols);
        report.push("✅ PropagationTracking: removed trailing blank column (had " + ptCols + " cols, should be 11)");
        changed++;
      }
    }
  }

  // ── 4. CropSearchLog — fix 'tomatoe' typo ──
  var csl = ss.getSheetByName("CropSearchLog");
  if (csl && csl.getLastRow() > 1) {
    var cslData = csl.getRange(2,1, csl.getLastRow()-1, 1).getValues();
    for (var ci = 0; ci < cslData.length; ci++) {
      if (String(cslData[ci][0]).trim().toLowerCase() === "tomatoe") {
        csl.getRange(ci+2, 1).setValue("tomato");
        report.push("✅ CropSearchLog row " + (ci+2) + ": fixed typo 'tomatoe' → 'tomato'");
        changed++;
      }
    }
  }

  // ── Summary ──────────────────────────────────────────
  var summary = "\uD83D\uDD27 <b>CropDatabase Fix Complete</b>\n" +
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n" +
    "Changes: " + changed + "\n\n" +
    report.join("\n");

  Logger.log(summary.replace(/<[^>]+>/g, ""));
  if (changed > 0) {
    try { _tgSend(summary, CONFIG.TELEGRAM_CHAT_ID); } catch(e) {}
  }
  Logger.log("\n✅ fixCropDatabaseAdjustments() done. Changes: " + changed);
}


/**
 * Creates time-based triggers for reminders and daily check.
 * NOTE: processIncomingEmails is REMOVED — replaced by Telegram webhook (doPost).
 */
function createTriggers() {
  // Remove all existing triggers
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  // Background jobs
  ScriptApp.newTrigger("sendPendingReminders").timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger("syncDeletedCrops").timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger("runDailyLearningCheck").timeBased().everyDays(1).atHour(7).create();
  ScriptApp.newTrigger("sendWeeklyDigest").timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  ScriptApp.newTrigger("checkWeatherAndWarnSprays").timeBased().everyDays(1).atHour(6).create();
  // Telegram polling — checks for new messages every minute
  ScriptApp.newTrigger("pollTelegram").timeBased().everyMinutes(1).create();
  Logger.log("✅ Triggers created including 1-minute Telegram polling.");
  Logger.log("Run setupPolling() to remove old webhook and reset message offset.");
  notifyDeployment();
}


// ══════════════════════════════════════════════════════
//  SHEET UTILITIES
// ══════════════════════════════════════════════════════

function _getSheet(name) {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(name);
}

function _ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setValues([headers]);
    range.setFontWeight("bold");
    range.setBackground("#2d6a2d");
    range.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _appendRow(sheetName, rowData) {
  _getSheet(sheetName).appendRow(rowData);
}

function _findRowById(sheetName, id, idColumn) {
  const sheet = _getSheet(sheetName);
  const col   = idColumn || 1;
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][col - 1]) === String(id)) return { rowIndex: i + 1, rowData: data[i] };
  }
  return null;
}

function _updateCell(sheetName, rowIndex, colIndex, value) {
  _getSheet(sheetName).getRange(rowIndex, colIndex).setValue(value);
}

function _generateID(prefix) {
  return prefix + "_" + new Date().getTime() + "_" + Math.floor(Math.random() * 1000);
}


// ══════════════════════════════════════════════════════
//  DATE UTILITIES
// ══════════════════════════════════════════════════════

function _addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function _formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd-MMM-yyyy");
}

function _formatDateShort(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd-MM-yyyy");
}

function _parseDate(str) {
  if (!str) return null;
  const s = str.toString().trim();
  if (s.toLowerCase() === "today") return new Date();
  const ddmmyyyy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (ddmmyyyy) {
    const d = new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    if (!isNaN(d.getTime())) return d;
  }
  const yyyymmdd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    const d = new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]));
    if (!isNaN(d.getTime())) return d;
  }
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback;
  return null;
}


// ══════════════════════════════════════════════════════
//  CROP DATABASE LOOKUP & ADJUSTMENTS
// ══════════════════════════════════════════════════════



function _getAdjustedValue(cropKey, field, defaultValue, variety) {
  try {
    const sheet = _getSheet("CropDatabase_Adjustments");
    const data  = sheet.getDataRange().getValues();
    const vLow  = (variety || "").trim().toLowerCase();
    // First pass: variety-specific override (col 0=CropKey, 1=Variety, 2=Field, 6=UseCustom, 4=YourAvg)
    if (vLow) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]).toLowerCase() === cropKey.toLowerCase() &&
            String(data[i][1]).trim().toLowerCase() === vLow &&
            String(data[i][2]) === field &&
            String(data[i][6]).toLowerCase() === "yes") {
          const custom = parseFloat(data[i][4]);
          if (!isNaN(custom)) return custom;
        }
      }
    }
    // Second pass: general crop override (no variety specified in sheet)
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === cropKey.toLowerCase() &&
          !String(data[i][1]).trim() &&
          String(data[i][2]) === field &&
          String(data[i][6]).toLowerCase() === "yes") {
        const custom = parseFloat(data[i][4]);
        if (!isNaN(custom)) return custom;
      }
    }
  } catch (e) {}
  return defaultValue;
}

function _getPropagationRootingDays(plantKey, method) {
  try {
    const sheet = _getSheet("PropagationDatabase");
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === plantKey.toLowerCase() &&
          String(data[i][1]).toLowerCase() === method.toLowerCase()) {
        const useCustom = String(data[i][6]).toLowerCase() === "yes";
        if (useCustom && !isNaN(parseFloat(data[i][4])))
          return { min: parseFloat(data[i][4]), max: parseFloat(data[i][4]) };
        return { min: parseInt(data[i][2]) || 21, max: parseInt(data[i][3]) || 35 };
      }
    }
  } catch (e) {}
  const defaults = {
    "cutting": { min: 14, max: 28 }, "air layering": { min: 21, max: 45 },
    "grafting": { min: 21, max: 42 }, "division": { min: 7, max: 21 },
    "seed": { min: 7, max: 21 }, "layering": { min: 30, max: 60 },
  };
  for (const k in defaults) { if (method.toLowerCase().includes(k)) return defaults[k]; }
  return { min: 21, max: 35 };
}


// ══════════════════════════════════════════════════════
//  CALENDAR UTILITIES
// ══════════════════════════════════════════════════════

function _getCalendar() {
  if (CONFIG.CALENDAR_NAME) {
    const cals = CalendarApp.getCalendarsByName(CONFIG.CALENDAR_NAME);
    if (cals.length > 0) return cals[0];
    return CalendarApp.createCalendar(CONFIG.CALENDAR_NAME, { color: CalendarApp.Color.SAGE });
  }
  return CalendarApp.getDefaultCalendar();
}

function _createCalendarEvent(title, date, description) {
  const cal   = _getCalendar();
  const start = new Date(date);
  start.setHours(7, 0, 0, 0);
  const end = new Date(start);
  end.setHours(8, 0, 0, 0);
  const event = cal.createEvent(title, start, end, { description: description || "" });
  event.addPopupReminder(0);
  return event;
}

function _deleteCalendarEventsByTitle(title, fromDate, toDate) {
  try {
    const cal    = _getCalendar();
    const events = cal.getEvents(fromDate || new Date(2020, 0, 1), toDate || _addDays(new Date(), 730));
    let count = 0;
    events.forEach(function(ev) {
      if (ev.getTitle() === title) { ev.deleteEvent(); count++; }
    });
    return count;
  } catch(e) {
    Logger.log("_deleteCalendarEventsByTitle error: " + e.message);
    return 0;
  }
}


// ══════════════════════════════════════════════════════
//  PARSE HELPERS
// ══════════════════════════════════════════════════════

function _splitBatchBlocks(body) {
  if (!body) return [];
  const normalized = String(body).replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.split(/\n\s*---\s*\n/)
    .map(b => b.trim()).filter(b => b.length > 0);
}

function _parseFields(body) {
  const fields = {};
  if (!body) return fields;
  const lines  = String(body).replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  lines.forEach(function(line) {
    line = line.trim();
    if (!line) return;
    const match = line.match(/^(.+?)\s*[-:]\s*(.+)$/);
    if (match) fields[match[1].trim().toLowerCase().replace(/\s+/g, " ")] = match[2].trim();
  });
  return fields;
}

function _parseConsHarvest(fields, cropData) {
  const raw = (fields["cons harvest"] || fields["cons harvests"] || fields["consistent harvest"] || "").trim().toLowerCase();
  if (raw === "yes" || raw === "y" || raw === "true") return true;
  if (raw === "no"  || raw === "n" || raw === "false") return false;
  return (cropData && cropData.number_of_weeks_harvest > 1);
}

function _parseTreatment(raw) {
  if (!raw) return { type: "none", product: "No treatment applied" };
  const lower = raw.trim().toLowerCase();
  if (!lower || lower === "none") return { type: "none", product: "No treatment applied" };
  const m = lower.match(/^(fungicide|pesticide|herbicide|fertilizer|other)\s*[:]\s*(.+)$/);
  if (m) return { type: m[1], product: m[2].trim() };
  return { type: "other", product: raw.trim() };
}

function _normaliseStage(raw) {
  return (raw || "seed").trim().toLowerCase();
}

function _getConsistentPlantingDates(cropData, plantingDate, monthsAhead, variety) {
  const dates   = [];
  const endDate = _addDays(plantingDate, monthsAhead * 30);
  const cropKey = cropData.display_name.toLowerCase();
  const offset  = _getAdjustedValue(cropKey, "batch_offset_days", cropData.batch_offset_days || 14, variety);
  let nextDate  = _addDays(plantingDate, offset);
  while (nextDate <= endDate) {
    dates.push(new Date(nextDate));
    nextDate = _addDays(nextDate, offset);
  }
  return dates;
}


// ══════════════════════════════════════════════════════
//  SERPAPI ENRICHMENT  (unchanged from v8)
// ══════════════════════════════════════════════════════

function _cropAlreadySearched(cropKey) {
  const normalized = cropKey.trim().toLowerCase();
  if (CONFIG.SERP_EXCLUDE_CROPS.indexOf(normalized) !== -1) return true;
  try {
    const sheet = _getSheet(CONFIG.SEARCH_LOG_SHEET);
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() === normalized) return true;
    }
  } catch (e) {}
  return false;
}

function _serpApiSearchCrop(cropName) {
  try {
    const query = encodeURIComponent(cropName + " days to germinate grow time seed to harvest vegetable");
    const url   = "https://serpapi.com/search.json?q=" + query +
                  "&api_key=" + CONFIG.SERP_API_KEY + "&engine=google&num=5&gl=us&hl=en";
    const resp  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    const json    = JSON.parse(resp.getContentText());
    const results = (json.organic_results || []).slice(0, 5);
    if (results.length === 0) return null;
    let germMin = null, germMax = null, growMin = null, growMax = null, sourceSummary = "";
    results.forEach(function(r) {
      const text = ((r.snippet || "") + " " + (r.title || "")).toLowerCase();
      sourceSummary += (r.title || "") + "; ";
      const germMatch1 = text.match(/germinat\w*\s+in\s+(\d+)\s*(?:to|-)\s*(\d+)\s*days/);
      const germMatch2 = text.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*days\s+to\s+germinat/);
      if (germMatch1 && !germMin) { germMin = parseInt(germMatch1[1]); germMax = parseInt(germMatch1[2]); }
      else if (germMatch2 && !germMin) { germMin = parseInt(germMatch2[1]); germMax = parseInt(germMatch2[2]); }
      const growMatch1 = text.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*days\s+(?:from\s+seed|to\s+harvest|to\s+matur)/);
      const growMatch2 = text.match(/matur\w*\s+in\s+(\d+)\s*(?:to|-)\s*(\d+)\s*days/);
      if (growMatch1 && !growMin) { growMin = parseInt(growMatch1[1]); growMax = parseInt(growMatch1[2]); }
      else if (growMatch2 && !growMin) { growMin = parseInt(growMatch2[1]); growMax = parseInt(growMatch2[2]); }
    });
    return { germMin, germMax, growMin, growMax, sourceSummary: sourceSummary.substring(0, 300) };
  } catch (e) { return null; }
}

function _enrichCropData(cropName) {
  const cropKey = cropName.trim().toLowerCase();
  if (_cropAlreadySearched(cropKey)) return;
  const result = _serpApiSearchCrop(cropName);
  if (!result) {
    _appendRow(CONFIG.SEARCH_LOG_SHEET, [cropKey, _formatDateShort(new Date()), "", "", "", "No results", "No"]);
    return;
  }
  if (result.germMin !== null) {
    _logDeviation("CropDatabase_Adjustments", cropKey, "germination_days_min",
      (_lookupCrop(cropKey) || {}).germination_days_min || result.germMin, result.germMin);
    _logDeviation("CropDatabase_Adjustments", cropKey, "germination_days_max",
      (_lookupCrop(cropKey) || {}).germination_days_max || result.germMax, result.germMax);
  }
  if (result.growMin !== null) {
    const avgGrow = Math.round((result.growMin + result.growMax) / 2);
    _logDeviation("CropDatabase_Adjustments", cropKey, "growing_time_days",
      (_lookupCrop(cropKey) || {}).growing_time_days || avgGrow, avgGrow);
  }
  let trackerUpdated = false;
  try {
    const cropSheet = _getSheet("CropTracking");
    const cData     = cropSheet.getDataRange().getValues();
    for (let i = 1; i < cData.length; i++) {
      if (String(cData[i][1]).trim().toLowerCase().includes(cropKey) &&
          String(cData[i][13]) !== "Deleted" && String(cData[i][13]) !== "Complete") {
        if (result.growMin !== null) {
          const plantingDate = _parseDate(String(cData[i][4]));
          if (plantingDate) {
            cropSheet.getRange(i + 1, 8).setValue(_formatDateShort(
              _addDays(plantingDate, Math.round((result.growMin + result.growMax) / 2))));
            trackerUpdated = true;
          }
        }
      }
    }
  } catch (e) {}
  _appendRow(CONFIG.SEARCH_LOG_SHEET, [
    cropKey, _formatDateShort(new Date()),
    result.growMin !== null ? Math.round((result.growMin + result.growMax) / 2) : "",
    result.germMin || "", result.germMax || "",
    result.sourceSummary, trackerUpdated ? "Yes" : "No"
  ]);
}


// ══════════════════════════════════════════════════════
//  ★ NEW: BATCH PLANTING CONFIRMATION HANDLER
//
//  Message format (Telegram):
//    data type - crop
//    crop id - CROP_1234567_890
//    batch number - 2
//    status - planted
//    date - today          (optional, defaults to today)
//
//  What it does:
//  1. Finds the CropTracking row for that ID
//  2. Logs this batch in BatchPlantingLog
//  3. Deletes the old calendar event for that batch date
//  4. Calculates the NEXT batch date based on batch_offset_days
//  5. Creates a new calendar event + reminder for the next batch
//  6. Updates "Next Consistent Planting" column in CropTracking
//  7. Sends a Telegram confirmation with the new schedule
// ══════════════════════════════════════════════════════

function _processBatchPlantedUpdate(fields, chatId) {
  const cropID      = (fields["crop id"] || "").trim();
  const batchNumRaw = parseInt(fields["batch number"] || fields["batch"] || "0");
  const dateStr     = fields["date"] || "today";
  const plantedDate = _parseDate(dateStr) || new Date();

  if (!cropID) {
    _tgSend("❌ <b>Missing crop id.</b>\nPlease include <code>crop id - CROP_...</code>", chatId);
    return;
  }
  if (!batchNumRaw || batchNumRaw < 1) {
    _tgSend("❌ <b>Missing or invalid batch number.</b>\nE.g. <code>batch number - 2</code>", chatId);
    return;
  }

  const row = _findRowById("CropTracking", cropID, 1);
  if (!row) {
    _tgSend("❌ <b>Crop ID not found:</b> <code>" + cropID + "</code>", chatId);
    return;
  }

  const cropName      = String(row.rowData[1]);
  const originalPlant = _parseDate(String(row.rowData[4]));
  const cropData      = _lookupCrop(cropName);

  if (!cropData || !originalPlant) {
    _tgSend("❌ Could not find crop data for <b>" + cropName + "</b>.", chatId);
    return;
  }

  const cropKey = cropData.display_name.toLowerCase();
  const offset  = _getAdjustedValue(cropKey, "batch_offset_days", cropData.batch_offset_days || 14);

  // ── 1. Delete the old calendar event for this batch ──────────────────
  const oldBatchTitle = "📅 Plant Next Batch: " + cropData.display_name;
  // Delete all "Plant Next Batch" events for this crop from original plant date forward
  // We'll target a window around when batch N would have been
  const expectedOldDate = _addDays(originalPlant, offset * (batchNumRaw - 1));
  const windowStart = _addDays(expectedOldDate, -5);
  const windowEnd   = _addDays(expectedOldDate, 10);
  const deletedCount = _deleteCalendarEventsByTitle(oldBatchTitle, windowStart, windowEnd);
  Logger.log("Deleted " + deletedCount + " old calendar event(s) for batch #" + batchNumRaw);

  // ── 2. Calculate next batch date ─────────────────────────────────────
  const nextBatchNum  = batchNumRaw + 1;
  const nextBatchDate = _addDays(plantedDate, offset);

  // ── 3. Also calculate harvest estimate for this batch ─────────────────
  const growingTime      = _getAdjustedValue(cropKey, "growing_time_days", cropData.growing_time_days);
  const batchHarvestDate = _addDays(plantedDate, growingTime);

  // ── 4. Create new calendar event + reminder for next batch ────────────
  _createCalendarEvent(
    "📅 Plant Next Batch: " + cropData.display_name,
    nextBatchDate,
    "Batch #" + nextBatchNum + " of " + cropData.display_name +
    "\nTracking ID: " + cropID +
    "\n(Auto-scheduled from Batch #" + batchNumRaw + " planted on " + _formatDate(plantedDate) + ")"
  );
  _queueReminder(
    "next_planting", cropData.display_name, cropID,
    _addDays(nextBatchDate, -3),
    "📅 Time to Plant: " + cropData.display_name + " (Batch #" + nextBatchNum + ")",
    _buildNextPlantingReminderBody(cropData.display_name, nextBatchDate, nextBatchNum),
    chatId
  );

  // Also create harvest reminder for the newly planted batch
  _createCalendarEvent(
    "🥬 Harvest Batch #" + batchNumRaw + ": " + cropData.display_name,
    batchHarvestDate,
    "Harvest for batch #" + batchNumRaw + " of " + cropData.display_name +
    "\nTracking ID: " + cropID
  );
  _queueReminder(
    "harvest", cropData.display_name, cropID,
    _addDays(batchHarvestDate, -2),
    "🥬 Harvest Reminder: " + cropData.display_name + " (Batch #" + batchNumRaw + ")",
    _buildHarvestReminderBody(cropData, plantedDate, batchHarvestDate, cropID),
    chatId
  );

  // ── 5. Update CropTracking: next planting date + batch number ─────────
  // Col 10 = Next Consistent Planting, Col 11 = Batch Number
  _updateCell("CropTracking", row.rowIndex, 10, _formatDateShort(nextBatchDate));
  _updateCell("CropTracking", row.rowIndex, 11, batchNumRaw);

  // ── 6. Log to BatchPlantingLog ────────────────────────────────────────
  _appendRow("BatchPlantingLog", [
    cropID, cropData.display_name, batchNumRaw,
    _formatDateShort(expectedOldDate),
    _formatDateShort(plantedDate),
    _formatDateShort(nextBatchDate),
    "Planted",
    "Confirmed via Telegram on " + _formatDate(new Date())
  ]);

  // ── 7. Send Telegram confirmation ─────────────────────────────────────
  let msg = "✅ <b>BATCH #" + batchNumRaw + " CONFIRMED — " + cropData.display_name.toUpperCase() + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "🌱 <b>Planted:</b> " + _formatDate(plantedDate) + "\n";
  msg += "🥬 <b>Est. Harvest:</b> " + _formatDate(batchHarvestDate) + "\n\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
  msg += "📅 <b>NEXT BATCH SCHEDULED:</b>\n";
  msg += "  Batch #" + nextBatchNum + ": <b>" + _formatDate(nextBatchDate) + "</b>\n";
  msg += "  (every " + offset + " days)\n\n";
  msg += "📆 Calendar event created for Batch #" + nextBatchNum + "\n";
  msg += "⏰ You'll get a reminder 3 days before\n\n";
  msg += "🆔 <code>" + cropID + "</code>";

  _tgSend(msg, chatId);
  Logger.log("Batch #" + batchNumRaw + " planted for " + cropData.display_name + " | Next: " + _formatDate(nextBatchDate));
}


// ══════════════════════════════════════════════════════
//  FERTILIZER SCHEDULE FUNCTIONS
// ══════════════════════════════════════════════════════

/**
 * Build the full organic fertilizer schedule message for a crop.
 * Shows all 4 stages with foliar + drench + frequency + notes.
 * Based on Alex's 5-tea system: Cow, Chicken, Plant, Wood Ash, Yeast.
 */
function _buildFertScheduleMsg(cropName, variety, trackingID, germDate) {
  var profile  = _getFertProfile(cropName);
  var stages   = profile.stages;
  var varStr   = variety ? " (" + variety + ")" : "";
  var fromJson = profile.fromJson || false;
  var meta     = profile.meta    || {};
  var entry    = _lookupFertCrop(cropName);

  var msg  = "\uD83C\uDF31 <b>FERTILIZER SCHEDULE</b>\n";
  msg += "\uD83C\uDF3F <b>" + cropName + varStr + "</b>\n";
  msg += "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n";

  // ── REFERENCE GUIDE ──────────────────────────────────────────────
  msg += "\uD83D\uDCDA <b>YOUR 5 TEAS \u2014 WHAT EACH DOES:</b>\n";

  if (fromJson && meta.teas) {
    var teaNames = {
      cow_manure_tea:     "Cow manure tea",
      chicken_manure_tea: "Chicken manure tea",
      plant_based_tea:    "Plant-based tea",
      wood_ash_tea:       "Wood ash tea",
      yeast_fertilizer:   "Yeast fertilizer"
    };
    Object.keys(teaNames).forEach(function(k) {
      if (meta.teas[k]) {
        msg += "\u2022 <b>" + teaNames[k] + ":</b> " + meta.teas[k] + "\n";
      }
    });
  } else {
    msg += "\u2022 <b>Cow manure tea:</b> Balanced N + organic matter + microbes. Gentle, safe for seedlings.\n";
    msg += "\u2022 <b>Chicken manure tea:</b> High N + P. Powerful vegetative booster. Use sparingly.\n";
    msg += "\u2022 <b>Plant-based tea:</b> NPK + micronutrients + mild pest suppression. Safe for all stages.\n";
    msg += "\u2022 <b>Wood ash tea:</b> K + Ca + Mg. Flowering/fruiting booster. Avoid for potatoes and leafy greens.\n";
    msg += "\u2022 <b>Yeast fertilizer:</b> Microbial stimulant. B-vitamins + root growth hormones. Keep doses small.\n";
  }

  // ── YEAST PREPARATION ────────────────────────────────────────────
  msg += "\n\uD83E\uDDEC <b>YEAST PREP:</b>\n";
  if (fromJson && meta.yeast_preparation) {
    msg += meta.yeast_preparation + "\n";
  } else {
    msg += "Dissolve 1 packet (10g) baker\u2019s yeast + 1\u20132 tbsp sugar in 1L lukewarm water (~30\u00B0C). Ferment 12\u201324h until bubbling. Use within 24h.\n";
  }
  msg += "\uD83D\uDD04 <b>Dosing:</b> ";
  if (fromJson && meta.yeast_dosing) {
    msg += "Foliar: " + meta.yeast_dosing.foliar_spray + " \u2022 Drench: " + meta.yeast_dosing.soil_drench + "\n";
  } else {
    msg += "1 tsp/L for foliar spray \u2022 1 tbsp/5L for soil drench\n";
  }

  // ── DILUTION NOTE ────────────────────────────────────────────────
  msg += "\n\uD83D\uDCCF <b>HOW TO READ DILUTIONS:</b>\n";
  if (fromJson && meta.dilution_note) {
    msg += meta.dilution_note + "\n";
  } else {
    msg += "Ratio = tea concentrate : water. e.g. 1:20 = 1 cup tea + 20 cups water.\n";
  }

  // ── THYME OIL TIP ────────────────────────────────────────────────
  if (fromJson && meta.thyme_oil_mosquito_control) {
    msg += "\n\uD83E\uDEB4 <b>MOSQUITO CONTROL:</b> " + meta.thyme_oil_mosquito_control + "\n";
  } else {
    msg += "\n\uD83E\uDEB4 <b>MOSQUITO CONTROL:</b> Add 2\u20133 drops thyme oil per litre to stored teas. Add after brewing, just before use.\n";
  }

  msg += "\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n";

  // ── 4-STAGE SCHEDULE ─────────────────────────────────────────────
  msg += "\uD83D\uDDD3 <b>4-STAGE FEEDING PLAN:</b>\n\n";

  var stageKeys = ["seedling", "midVeg", "flowering", "fruiting"];
  var stageNums = ["1\uFE0F\u20E3", "2\uFE0F\u20E3", "3\uFE0F\u20E3", "4\uFE0F\u20E3"];

  for (var i = 0; i < stageKeys.length; i++) {
    var gk = stageKeys[i];
    var st = stages[gk];
    if (!st) continue;

    msg += stageNums[i] + " <b>" + st.label + "</b>\n";

    if (fromJson && st.raw_foliar) {
      // Use rich JSON data
      var rf = st.raw_foliar;
      var rd = st.raw_drench;
      msg += "  \uD83C\uDF3F <i>Foliar:</i> " + _fertMixStr(rf) + "\n";
      if (rf.mixing_example && rf.mixing_example.indexOf("Plain water") === -1) {
        msg += "  <i>\uD83D\uDCCB " + rf.mixing_example + "</i>\n";
      }
      msg += "  \uD83E\uDEA3 <i>Drench:</i> " + _fertMixStr(rd) + "\n";
      if (rd.mixing_example && rd.mixing_example.indexOf("Plain water") === -1) {
        msg += "  <i>\uD83D\uDCCB " + rd.mixing_example + "</i>\n";
      }
    } else {
      msg += "  \uD83C\uDF3F <i>Foliar:</i> " + st.foliar + "\n";
      msg += "  \uD83E\uDEA3 <i>Drench:</i> " + st.drench + "\n";
    }
    msg += "  \uD83D\uDD04 <i>Frequency:</i> " + st.freq + "\n";
    msg += "  \uD83D\uDCA1 " + st.note + "\n\n";
  }

  // ── APPLICATION RULES ────────────────────────────────────────────
  msg += "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n";
  msg += "\u26A0\uFE0F <b>APPLICATION RULES:</b>\n";

  var tips = (fromJson && meta.application_tips && meta.application_tips.length > 0)
    ? meta.application_tips
    : [
        "Foliar spray: early morning or late afternoon only",
        "Drench: at root zone, avoid stem contact",
        "Never mix teas with fungicides or pesticides — apply 3-5 days apart",
        "Never mix wood ash tea with chicken manure tea in the same application",
        "Stir teas daily to maintain aerobic conditions",
        "Use teas within 3-5 days of brewing for best microbial activity",
        "Always dilute before applying — never apply concentrate directly"
      ];
  tips.forEach(function(t) { msg += "\u2022 " + t + "\n"; });

  msg += "\n\uD83D\uDCCC Stage-by-stage reminders will be sent automatically.\n";
  msg += "\uD83C\uDD94 <code>" + trackingID + "</code>";
  return msg;
}

/**
 * Queue ALL fertilizer reminders for a crop — repeating within each stage.
 * Called once the true-leaf threshold is confirmed.
 *
 * Stage windows (estimated from germDate + crop DB timing):
 *   Seedling  → today until midVegStart (transDate - 5 days)
 *   Mid-Veg   → midVegStart until flowerDate
 *   Flowering → flowerDate until fruitDate
 *   Fruiting  → fruitDate until estimated harvest
 *
 * Within each window, one reminder is queued every freqDays.
 * Each reminder shows: application number, exact mix, next-due date.
 * The FIRST application in each stage also flags the stage transition.
 */
function _scheduleFertReminders(cropName, variety, trackingID, germDate, chatId) {
  var cropData = _lookupCrop(cropName);
  if (!cropData) return;

  var profile     = _getFertProfile(cropName);
  var transplantD = cropData.transplant_days || 21;
  var growTotal   = cropData.growing_time_days || 60;
  var growFromT   = cropData.growing_from_transplant || Math.max(growTotal - transplantD, 20);
  var varStr      = variety ? " (" + variety + ")" : "";

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── Stage boundary dates ──────────────────────────────────────────────
  var transDate   = _addDays(germDate, transplantD);
  var midVegStart = _addDays(transDate, -5);
  var flowerDate  = _addDays(transDate, Math.round(growFromT * 0.35));
  var fruitDate   = _addDays(transDate, Math.round(growFromT * 0.60));
  var harvestDate = _addDays(germDate, growTotal);

  // [stageKey, windowStart, windowEnd, reminderType, stageLabel]
  var stageWindows = [
    ["seedling",  today,       midVegStart, "fert_seedling",  "Seedling"],
    ["midVeg",    midVegStart, flowerDate,  "fert_midveg",    "Mid-Veg"],
    ["flowering", flowerDate,  fruitDate,   "fert_flowering", "Flowering"],
    ["fruiting",  fruitDate,   harvestDate, "fert_fruiting",  "Fruiting"]
  ];

  var stageIcons = {
    seedling:  "\uD83C\uDF31",
    midVeg:    "\uD83C\uDF3F",
    flowering: "\uD83C\uDF38",
    fruiting:  "\uD83C\uDF45"
  };

  var totalQueued = 0;

  for (var si = 0; si < stageWindows.length; si++) {
    var sw       = stageWindows[si];
    var stageKey = sw[0];
    var winStart = sw[1];
    var winEnd   = sw[2];
    var remType  = sw[3];
    var stageLbl = sw[4];
    var icon     = stageIcons[stageKey];

    var st       = profile.stages[stageKey];
    var freqDays = st.freqDays || 10;

    var winDays  = Math.round((winEnd - winStart) / 86400000);
    if (winDays < 1) continue;

    var estTotal = Math.max(1, Math.round(winDays / freqDays));
    var appNum   = 1;
    var appDate  = new Date(winStart.getTime());
    appDate.setHours(8, 0, 0, 0);

    while (appDate < winEnd) {
      if (appDate > today) {
        var nextDue = _addDays(appDate, freqDays);
        // Cap nextDue at stage end so it doesn't confuse
        if (nextDue > winEnd) nextDue = new Date(winEnd.getTime());

        var subject = icon + " Fert " + appNum + "/" + estTotal +
                      " \u2022 " + stageLbl + " \u2014 " + cropName + varStr;
        var body    = _buildFertApplicationMsg(
          cropName, variety, trackingID, stageKey,
          appDate, appNum, estTotal, nextDue, (appNum === 1)
        );
        _queueReminder(remType, cropName, trackingID, appDate, subject, body, chatId);
        totalQueued++;
      }
      appDate = _addDays(appDate, freqDays);
      appNum++;
    }
  }

  Logger.log("Fert reminders: " + totalQueued + " queued for " + cropName + " (" + trackingID + ")");
}

/**
 * Build one individual fertilizer application reminder message.
 * appNum/estTotal show progress within the stage (e.g. "2 of ~4").
 * isFirst=true adds a "you are entering this stage" transition header.
 * nextDue shows when the farmer should apply again.
 */
function _buildFertApplicationMsg(cropName, variety, trackingID, stageKey, appDate, appNum, estTotal, nextDue, isFirst) {
  var profile  = _getFertProfile(cropName);
  var st       = profile.stages[stageKey];
  var fromJson = profile.fromJson || false;
  var varStr   = variety ? " (" + variety + ")" : "";
  var tz       = Session.getScriptTimeZone();
  var dateStr  = Utilities.formatDate(appDate, tz, "EEE dd MMM yyyy");
  var nextStr  = Utilities.formatDate(nextDue, tz, "EEE dd MMM yyyy");

  var icons = { seedling:"\uD83C\uDF31", midVeg:"\uD83C\uDF3F", flowering:"\uD83C\uDF38", fruiting:"\uD83C\uDF45" };
  var icon  = icons[stageKey] || "\uD83C\uDF3F";

  var msg = icon + " <b>FERTILIZER APPLICATION " + appNum + " of ~" + estTotal + "</b>\n";
  msg += "\uD83C\uDF31 <b>" + cropName + varStr + "</b>\n";
  msg += "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n";

  if (isFirst) {
    msg += "\u2728 <b>" + st.label + "</b>\n";
    msg += "<i>New growth stage \u2014 switch to this mix from today.</i>\n\n";
  } else {
    msg += "<b>" + st.label + "</b> \u2022 Application " + appNum + "\n\n";
  }

  msg += "\uD83D\uDCC5 <b>Apply today:</b> " + dateStr + "\n";
  msg += "\uD83D\uDD04 <b>Next application:</b> " + nextStr + "\n\n";

  // ── FOLIAR SPRAY ─────────────────────────────────────────────────
  msg += "\uD83C\uDF3F <b>Foliar spray mix:</b>\n";
  if (fromJson && st.raw_foliar) {
    var rf = st.raw_foliar;
    var rfStr = _fertMixStr(rf);
    if (rfStr.indexOf("Plain water") === 0) {
      msg += rfStr + "\n";
    } else {
      msg += rfStr + "\n";
      if (rf.mixing_example) msg += "<i>" + rf.mixing_example + "</i>\n";
    }
  } else {
    msg += st.foliar + "\n";
  }

  msg += "\n";

  // ── SOIL DRENCH ──────────────────────────────────────────────────
  msg += "\uD83E\uDEA3 <b>Soil drench mix:</b>\n";
  if (fromJson && st.raw_drench) {
    var rd = st.raw_drench;
    var rdStr = _fertMixStr(rd);
    if (rdStr.indexOf("Plain water") === 0) {
      msg += rdStr + "\n";
    } else {
      msg += rdStr + "\n";
      if (rd.mixing_example) msg += "<i>" + rd.mixing_example + "</i>\n";
    }
  } else {
    msg += st.drench + "\n";
  }

  msg += "\n";
  msg += "\uD83D\uDCA1 <i>" + st.note + "</i>\n\n";

  // ── QUICK RULES ──────────────────────────────────────────────────
  msg += "\u26A0\uFE0F <b>Reminders:</b>\n";
  msg += "\u2022 Foliar: early morning or late afternoon only\n";
  msg += "\u2022 Drench: root zone only \u2014 avoid stem contact\n";
  msg += "\u2022 Never mix teas with fungicides/pesticides\n";
  msg += "\u2022 Alternate foliar and drench \u2014 not the same day\n";
  msg += "\u2022 Yeast: prepare fresh, use within 24h\n\n";

  msg += "\uD83C\uDD94 <code>" + trackingID + "</code>";
  return msg;
}

/**
 * Build a single-stage fertilizer stage-transition message.
 * Kept for backward compat in case called directly.
 */
function _buildFertStageMsg(cropName, variety, trackingID, stageKey, stageDate) {
  return _buildFertApplicationMsg(cropName, variety, trackingID, stageKey, stageDate, 1, 1, stageDate, true);
}

/**
 * Queue the initial true-leaf check reminder ~6 days after germination.
 */
function _queueTrueLeafCheck(cropName, variety, trackingID, germDate, chatId) {
  var profile   = _getFertProfile(cropName);
  var threshold = profile.trueLeafThreshold;
  var varStr    = variety ? " (" + variety + ")" : "";
  var checkDate = _addDays(germDate, 6);

  _queueReminder("true_leaf_check", cropName, trackingID, checkDate,
    "\uD83C\uDF43 True Leaf Check — " + cropName + varStr,
    _buildTrueLeafCheckMsg(cropName, variety, trackingID, threshold, 1),
    chatId);
  Logger.log("True-leaf check queued for " + cropName + " on " + _formatDateShort(checkDate));
}

/**
 * Build the true-leaf check reminder message (text fallback).
 */
function _buildTrueLeafCheckMsg(cropName, variety, trackingID, threshold, checkNum) {
  var varStr = variety ? " (" + variety + ")" : "";
  var prefix = checkNum > 1 ? "\uD83D\uDD01 <b>Follow-up: " : "\uD83C\uDF43 <b>";
  var msg  = prefix + "True Leaf Check — " + cropName + varStr + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "Your <b>" + cropName + "</b> seedlings should have true leaves by now!\n\n";
  msg += "\uD83C\uDF3F <b>How many true leaves</b> do your plants have?\n";
  msg += "<i>(Count the jagged/shaped leaves — not the round seed leaves)</i>\n\n";
  msg += "✅ Ready to start feeding at <b>" + threshold + " true leaves</b>.\n\n";
  msg += "Reply:\n<code>true leaves 3\n" + trackingID + "</code>\n\n";
  msg += "\uD83C\uDD94 <code>" + trackingID + "</code>";
  return msg;
}

/**
 * Handle "true leaves N CROP_xxx" text reply from farmer.
 */
function _handleTrueLeafReply(text, chatId) {
  var idMatch = text.match(/CROP_\d+_\d+/);
  if (!idMatch) {
    _tgSend("❓ Include the Crop ID.\nExample:\n<code>true leaves 3\nCROP_1234567_890</code>", chatId);
    return;
  }
  var trackingID = idMatch[0];

  var numMatch = text.match(/true\s+leaves?\s+(\d+)/i);
  if (!numMatch) {
    _tgSend("❓ Could not read leaf count. Try:\n<code>true leaves 3\n" + trackingID + "</code>", chatId);
    return;
  }
  var leafCount = parseInt(numMatch[1]);

  var row = _findRowById("CropTracking", trackingID, 1);
  if (!row) { _tgSend("❌ Crop ID not found: <code>" + trackingID + "</code>", chatId); return; }

  var cropName = row.rowData[1];
  var variety  = row.rowData[2];
  var germRaw  = row.rowData[8];  // Germination Date col
  var germDate = _parseDate(String(germRaw)) || new Date();
  var profile  = _getFertProfile(cropName);
  var threshold = profile.trueLeafThreshold;
  var varStr   = variety ? " (" + variety + ")" : "";

  if (leafCount >= threshold) {
    // Threshold reached — send full schedule and queue stage reminders
    _tgSend(
      "✅ <b>" + cropName + varStr + "</b> has <b>" + leafCount +
      " true leaf" + (leafCount === 1 ? "" : "s") + "</b> — ready to start feeding!\n\n" +
      "Here is your complete organic fertilizer schedule \uD83D\uDC47",
      chatId
    );
    _tgSend(_buildFertScheduleMsg(cropName, variety, trackingID, germDate), chatId);
    _scheduleFertReminders(cropName, variety, trackingID, germDate, chatId);
    _logStage(trackingID, cropName, variety, "Seedling", "Feeding Started",
      new Date(), leafCount + " true leaves", row.rowData[3], "Fertilizer schedule activated");
  } else {
    // Not enough leaves — re-check in 3 days
    var reCheckDate = _addDays(new Date(), 3);
    _queueReminder("true_leaf_check", cropName, trackingID, reCheckDate,
      "\uD83C\uDF43 Re-check: True Leaves — " + cropName + varStr,
      _buildTrueLeafCheckMsg(cropName, variety, trackingID, threshold, 2),
      chatId);
    _tgSend(
      "\uD83D\uDCCB <b>" + cropName + varStr + "</b> has <b>" + leafCount +
      " true leaf" + (leafCount === 1 ? "" : "s") + "</b>.\n\n" +
      "⏳ Needs <b>" + threshold + "</b> before first feeding.\n" +
      "I'll check back in <b>3 days</b>.\n\n" +
      "\uD83D\uDCA7 Use plain water for now — no fertilizer yet.",
      chatId
    );
  }
}

/**
 * Send the true-leaf check as inline tap buttons.
 * Called from sendPendingReminders when type === "true_leaf_check".
 */
function _sendTrueLeafCheckButtons(cropName, variety, trackingID, chatId) {
  var profile   = _getFertProfile(cropName);
  var threshold = profile.trueLeafThreshold;
  var varStr    = variety ? " (" + variety + ")" : "";

  _tgSendButtons(
    "\uD83C\uDF43 <b>True Leaf Check — " + cropName + varStr + "</b>\n\n" +
    "How many <b>true leaves</b> does your plant have?\n" +
    "<i>(Not the round seed leaves — the shaped/jagged ones)</i>\n\n" +
    "✅ Ready to feed at <b>" + threshold + " true leaves</b>\n" +
    "\uD83C\uDD94 <code>" + trackingID + "</code>",
    [
      [["1 leaf",   "tleaf:1:" + trackingID], ["2 leaves", "tleaf:2:" + trackingID]],
      [["3 leaves", "tleaf:3:" + trackingID], ["4 leaves", "tleaf:4:" + trackingID]],
      [["5 leaves", "tleaf:5:" + trackingID], ["6+ leaves","tleaf:6:" + trackingID]]
    ],
    chatId
  );
}

// ══════════════════════════════════════════════════════
//  CROP LOGGING — SINGLE CROP
// ══════════════════════════════════════════════════════

function _processCropEmail(fields, chatId) {
  const cropRaw = (fields["crop name"] || fields["crop"] || "").trim();
  if (!cropRaw) {
    _tgSend("❌ <b>No crop name found.</b>\nAdd: <code>crop name - Tomato</code>", chatId);
    return;
  }

  const dateStr      = fields["date"] || "today";
  const method       = (fields["planting method"] || fields["method"] || "Direct ground").trim();
  const stage        = _normaliseStage(fields["stage"] || fields["plant stage"]);
  const plantingDate = _parseDate(dateStr) || new Date();
  const cropData     = _lookupCrop(cropRaw);

  if (!cropData) {
    _tgSend("⚠️ <b>Crop Not Found:</b> " + cropRaw + "\n\nCheck the spelling and try again.", chatId);
    return;
  }

  _enrichCropData(cropRaw);

  const variety       = (fields["variety"] || "").trim();
  const graftHealDays = parseInt(fields["graft heal days"] || "0") || 0;
  const cropKey       = cropData.display_name.toLowerCase();
  const methodLower   = method.toLowerCase();
  const isGraftMethod = methodLower.includes("grafted");
  const isTransplantMethod = isGraftMethod || methodLower.includes("seed tray") ||
    methodLower.includes("seedbed") || methodLower.includes("nursery");
  const growingTime    = _getAdjustedValue(cropKey, "growing_time_days", cropData.growing_time_days, variety);
  const transplantDays = cropData.transplant_days
    ? _getAdjustedValue(cropKey, "transplant_days", cropData.transplant_days, variety) : null;

  let transplantDate = null, harvestDate;
  if (isTransplantMethod && transplantDays) {
    // For grafted crops add healing period on top of normal tray time
    const effectiveTransplantDays = transplantDays + (isGraftMethod ? graftHealDays : 0);
    transplantDate = _addDays(plantingDate, effectiveTransplantDays);
    const fromTransplant = _getAdjustedValue(cropKey, "growing_from_transplant",
      cropData.growing_from_transplant || (growingTime - transplantDays));
    harvestDate = _addDays(transplantDate, fromTransplant);
  } else {
    harvestDate = _addDays(plantingDate, growingTime);
  }

  const wantsConsHarvest = _parseConsHarvest(fields, cropData);
  const consistentDates  = wantsConsHarvest
    ? _getConsistentPlantingDates(cropData, plantingDate, CONFIG.MONTHS_OF_PLANTING_DATES, variety) : [];
  const fungusSprayDates = (cropData.fungus_spray_days || []).map(d => _addDays(plantingDate, d));
  const pestSprayDates   = (cropData.pest_spray_days   || []).map(d => _addDays(plantingDate, d));
  const trackingID       = _generateID("CROP");

  // Build notes: user notes + tray color tag
  const userNotes     = (fields["notes"] || "").trim();
  const trayColorRaw  = (fields["tray colors"] || fields["tray color"] || "").trim();
  const trayColorTag  = trayColorRaw ? "🎨 Tray: " + trayColorRaw : "";
  const notesField    = [userNotes, trayColorTag].filter(Boolean).join(" | ");

  _appendRow("CropTracking", [
    trackingID, cropData.display_name, variety || "", method, stage,
    _formatDateShort(plantingDate),
    transplantDate ? _formatDateShort(transplantDate) : "", "",
    "",  // Germination Date (actual) — filled when germination confirmed
    _formatDateShort(harvestDate), "",
    consistentDates.length > 0 ? _formatDateShort(consistentDates[0]) : "",
    1,  // Batch Number starts at 1
    fungusSprayDates.map(_formatDateShort).join(", "),
    pestSprayDates.map(_formatDateShort).join(", "),
    "Active", notesField,
    "", "", "",  // Days: Seed-Germ | Germ-Transplant | Transplant-Harvest
    chatId
  ]);

  // Germination reminder
  const germMin = _getAdjustedValue(cropKey, "germination_days_min", cropData.germination_days_min || 5);
  const germMax = _getAdjustedValue(cropKey, "germination_days_max", cropData.germination_days_max || germMin + 5);
  _queueReminder("germination_check", cropData.display_name, trackingID,
    _addDays(plantingDate, germMin),
    "🌱 Germination Check: " + cropData.display_name,
    _buildGerminationCheckBody(cropData.display_name, _addDays(plantingDate, germMin),
      _addDays(plantingDate, germMax), trackingID), chatId);

  if (transplantDate) {
    _createCalendarEvent("🌱 Transplant: " + cropData.display_name, transplantDate, "Tracking ID: " + trackingID);
    _queueReminder("transplant", cropData.display_name, trackingID, _addDays(transplantDate, -1),
      "🌱 Transplant Reminder: " + cropData.display_name,
      _buildTransplantReminderBody(cropData.display_name, transplantDate, trackingID), chatId);
  }

  _createCalendarEvent("🥬 Harvest: " + cropData.display_name, harvestDate, "Tracking ID: " + trackingID);
  _queueReminder("harvest", cropData.display_name, trackingID, _addDays(harvestDate, -2),
    "🥬 Harvest Reminder: " + cropData.display_name,
    _buildHarvestReminderBody(cropData, plantingDate, harvestDate, trackingID), chatId);

  fungusSprayDates.forEach(function(d, i) {
    _createCalendarEvent("🍄 Fungus Spray: " + cropData.display_name, d, "Spray #" + (i+1));
    _queueReminder("spray_fungus", cropData.display_name, trackingID, _addDays(d, -1),
      "🍄 Fungus Spray: " + cropData.display_name + " #" + (i+1),
      _buildSprayReminderBody(cropData.display_name, "fungus", d, i+1, cropData.diseases, cropData.pests), chatId);
  });

  pestSprayDates.forEach(function(d, i) {
    _createCalendarEvent("🐛 Pest Spray: " + cropData.display_name, d, "Spray #" + (i+1));
    _queueReminder("spray_pest", cropData.display_name, trackingID, _addDays(d, -1),
      "🐛 Pest Spray: " + cropData.display_name + " #" + (i+1),
      _buildSprayReminderBody(cropData.display_name, "pest", d, i+1, cropData.diseases, cropData.pests), chatId);
  });

  consistentDates.forEach(function(d, i) {
    _createCalendarEvent("📅 Plant Next Batch: " + cropData.display_name, d,
      "Batch #" + (i+2) + "\nTracking ID: " + trackingID);
    _queueReminder("next_planting", cropData.display_name, trackingID, _addDays(d, -3),
      "📅 Time to Plant: " + cropData.display_name + " (Batch " + (i+2) + ")",
      _buildNextPlantingReminderBody(cropData.display_name, d, i+2), chatId);
  });

  _tgSend(_buildCropConfirmationTg(
    cropData, plantingDate, method, stage, transplantDate,
    harvestDate, fungusSprayDates, pestSprayDates, consistentDates, trackingID, variety
  ), chatId);

  Logger.log("Crop logged: " + cropData.display_name + " | ID: " + trackingID);
  // Keep ID snapshot current so sheet-sync can detect future deletions
  try { const snap = _loadKnownCropIds(); if (snap) { snap[trackingID] = { name: cropData.display_name, variety: variety||"", plantingDate: _formatDateShort(plantingDate), status: "Active" }; _saveKnownCropIds(snap); } } catch(e) {}
}


// ══════════════════════════════════════════════════════
//  BATCH CROP PROCESSING
// ══════════════════════════════════════════════════════

function _processBatchCrops(blocks, chatId) {
  const results = [];
  blocks.forEach(function(block, idx) {
    const fields  = _parseFields(block);
    const cropRaw = (fields["crop name"] || fields["crop"] || "").trim();
    if (!cropRaw) { results.push({ cropName: "(block " + (idx+1) + ")", error: "No crop name." }); return; }
    const cropData = _lookupCrop(cropRaw);
    if (!cropData) { results.push({ cropName: cropRaw, error: "Crop not found." }); return; }

    _enrichCropData(cropRaw);

    const dateStr  = fields["date"] || "today";
    const method   = (fields["planting method"] || fields["method"] || "Direct ground").trim();
    const stage    = _normaliseStage(fields["stage"] || fields["plant stage"]);
    const plantingDate = _parseDate(dateStr) || new Date();
    const cropKey  = cropData.display_name.toLowerCase();
    const methodLower = method.toLowerCase();
    const isTransplantMethod = methodLower.includes("seed tray") || methodLower.includes("nursery");
    const growingTime    = _getAdjustedValue(cropKey, "growing_time_days", cropData.growing_time_days);
    const transplantDays = cropData.transplant_days ? _getAdjustedValue(cropKey, "transplant_days", cropData.transplant_days) : null;
    let transplantDate = null, harvestDate;
    if (isTransplantMethod && transplantDays) {
      transplantDate = _addDays(plantingDate, transplantDays);
      harvestDate = _addDays(transplantDate, _getAdjustedValue(cropKey, "growing_from_transplant", cropData.growing_from_transplant || growingTime - transplantDays));
    } else {
      harvestDate = _addDays(plantingDate, growingTime);
    }
    const wantsConsHarvest = _parseConsHarvest(fields, cropData);
    const consistentDates  = wantsConsHarvest ? _getConsistentPlantingDates(cropData, plantingDate, CONFIG.MONTHS_OF_PLANTING_DATES) : [];
    const fungusSprayDates = (cropData.fungus_spray_days || []).map(d => _addDays(plantingDate, d));
    const pestSprayDates   = (cropData.pest_spray_days   || []).map(d => _addDays(plantingDate, d));
    const trackingID       = _generateID("CROP");

    _appendRow("CropTracking", [
      trackingID, cropData.display_name, method, stage, _formatDateShort(plantingDate),
      transplantDate ? _formatDateShort(transplantDate) : "", "",
      _formatDateShort(harvestDate), "",
      consistentDates.length > 0 ? _formatDateShort(consistentDates[0]) : "",
      1, fungusSprayDates.map(_formatDateShort).join(", "),
      pestSprayDates.map(_formatDateShort).join(", "),
      "Active", "", chatId
    ]);

    const germMin = _getAdjustedValue(cropKey, "germination_days_min", cropData.germination_days_min || 5);
    const germMax = _getAdjustedValue(cropKey, "germination_days_max", cropData.germination_days_max || germMin + 5);
    _queueReminder("germination_check", cropData.display_name, trackingID, _addDays(plantingDate, germMin),
      "🌱 Germination Check: " + cropData.display_name,
      _buildGerminationCheckBody(cropData.display_name, _addDays(plantingDate, germMin), _addDays(plantingDate, germMax), trackingID), chatId);

    if (transplantDate) {
      _createCalendarEvent("🌱 Transplant: " + cropData.display_name, transplantDate, "Tracking ID: " + trackingID);
      _queueReminder("transplant", cropData.display_name, trackingID, _addDays(transplantDate, -1),
        "🌱 Transplant: " + cropData.display_name, _buildTransplantReminderBody(cropData.display_name, transplantDate, trackingID), chatId);
    }
    _createCalendarEvent("🥬 Harvest: " + cropData.display_name, harvestDate, "Tracking ID: " + trackingID);
    _queueReminder("harvest", cropData.display_name, trackingID, _addDays(harvestDate, -2),
      "🥬 Harvest: " + cropData.display_name, _buildHarvestReminderBody(cropData, plantingDate, harvestDate, trackingID), chatId);

    fungusSprayDates.forEach((d, i) => {
      _createCalendarEvent("🍄 Fungus Spray: " + cropData.display_name, d, "Spray #" + (i+1));
      _queueReminder("spray_fungus", cropData.display_name, trackingID, _addDays(d, -1),
        "🍄 Fungus Spray #" + (i+1) + ": " + cropData.display_name,
        _buildSprayReminderBody(cropData.display_name, "fungus", d, i+1, cropData.diseases, cropData.pests), chatId);
    });
    pestSprayDates.forEach((d, i) => {
      _createCalendarEvent("🐛 Pest Spray: " + cropData.display_name, d, "Spray #" + (i+1));
      _queueReminder("spray_pest", cropData.display_name, trackingID, _addDays(d, -1),
        "🐛 Pest Spray #" + (i+1) + ": " + cropData.display_name,
        _buildSprayReminderBody(cropData.display_name, "pest", d, i+1, cropData.diseases, cropData.pests), chatId);
    });
    consistentDates.forEach((d, i) => {
      _createCalendarEvent("📅 Plant Next Batch: " + cropData.display_name, d, "Batch #" + (i+2));
      _queueReminder("next_planting", cropData.display_name, trackingID, _addDays(d, -3),
        "📅 Plant Batch #" + (i+2) + ": " + cropData.display_name,
        _buildNextPlantingReminderBody(cropData.display_name, d, i+2), chatId);
    });

    results.push({ cropName: cropData.display_name, trackingID, plantingDate, harvestDate, transplantDate, consistentDates, method, stage, error: null });
  });

  _tgSend(_buildBatchCropConfirmationTg(results), chatId);
}


// ══════════════════════════════════════════════════════
//  PROPAGATION PROCESSING
// ══════════════════════════════════════════════════════

function _processPropagationEmail(fields, chatId) {
  const plantRaw = (fields["plant name"] || fields["plant"] || "").trim();
  if (!plantRaw) { _tgSend("❌ No plant name found.", chatId); return; }
  const dateStr   = fields["date"] || "today";
  const method    = fields["propagation method"] || fields["method"] || "Cutting";
  const notes     = fields["notes"] || "";
  const propDate  = _parseDate(dateStr) || new Date();
  const plantKey  = plantRaw.trim().toLowerCase();
  const rooting   = _getPropagationRootingDays(plantKey, method);
  const rootStart = _addDays(propDate, rooting.min);
  const rootEnd   = _addDays(propDate, rooting.max);
  const hasPriorData = _hasPriorPropagationData(plantKey, method);
  const trackingID   = _generateID("PROP");

  _appendRow("PropagationTracking", [
    trackingID, plantRaw, _formatDateShort(propDate), method, notes,
    _formatDateShort(rootStart), _formatDateShort(rootEnd), "", "", "Propagating", chatId
  ]);
  _createCalendarEvent("🌿 Check Roots: " + plantRaw, rootStart, "Tracking ID: " + trackingID);
  _queueReminder("rooting_check", plantRaw, trackingID, _addDays(rootStart, -1),
    "🌿 Check Rooting: " + plantRaw,
    _buildRootingCheckBody(plantRaw, method, rootStart, rootEnd, notes, hasPriorData, trackingID), chatId);

  _tgSend(_buildPropagationConfirmationTg(plantRaw, propDate, method, notes, rootStart, rootEnd, hasPriorData, trackingID), chatId);
}

function _processBatchPropagations(blocks, chatId) {
  const results = [];
  blocks.forEach(function(block, idx) {
    const fields   = _parseFields(block);
    const plantRaw = (fields["plant name"] || fields["plant"] || "").trim();
    if (!plantRaw) { results.push({ plantName: "(block " + (idx+1) + ")", error: "No plant name." }); return; }
    const method   = fields["propagation method"] || fields["method"] || "Cutting";
    const notes    = fields["notes"] || "";
    const propDate = _parseDate(fields["date"] || "today") || new Date();
    const plantKey = plantRaw.toLowerCase();
    const rooting  = _getPropagationRootingDays(plantKey, method);
    const rootStart = _addDays(propDate, rooting.min);
    const rootEnd   = _addDays(propDate, rooting.max);
    const hasPriorData = _hasPriorPropagationData(plantKey, method);
    const trackingID   = _generateID("PROP");
    _appendRow("PropagationTracking", [
      trackingID, plantRaw, _formatDateShort(propDate), method, notes,
      _formatDateShort(rootStart), _formatDateShort(rootEnd), "", "", "Propagating", chatId
    ]);
    _createCalendarEvent("🌿 Check Roots: " + plantRaw, rootStart, "Tracking ID: " + trackingID);
    _queueReminder("rooting_check", plantRaw, trackingID, _addDays(rootStart, -1),
      "🌿 Check Rooting: " + plantRaw,
      _buildRootingCheckBody(plantRaw, method, rootStart, rootEnd, notes, hasPriorData, trackingID), chatId);
    results.push({ plantName: plantRaw, trackingID, propDate, rootStart, rootEnd, method, notes, hasPriorData, error: null });
  });
  _tgSend(_buildBatchPropConfirmationTg(results), chatId);
}



// ══════════════════════════════════════════════════════
//  STAGE LOG HELPER
// ══════════════════════════════════════════════════════

/**
 * Append a row to StageLog whenever a crop moves between stages.
 * daysElapsed may be null if dates were unavailable.
 */
function _logStage(trackingID, cropName, variety, stageFrom, stageTo, date, daysElapsed, method, notes) {
  try {
    _appendRow("StageLog", [
      trackingID,
      cropName,
      variety || "",
      stageFrom,
      stageTo,
      _formatDateShort(date || new Date()),
      daysElapsed !== null && daysElapsed !== undefined ? daysElapsed : "",
      method || "",
      notes  || ""
    ]);
  } catch(e) {
    Logger.log("_logStage error: " + e.message);
  }
}

// ══════════════════════════════════════════════════════
//  UPDATE HANDLERS
// ══════════════════════════════════════════════════════

function _processCropUpdate(fields, chatId) {
  const cropID     = (fields["crop id"] || "").trim();
  const dateStr    = fields["date"] || "today";
  const stage      = _normaliseStage(fields["stage"] || fields["plant stage"] || "");
  const treatment  = _parseTreatment(fields["treatment"] || "");
  const updateDate = _parseDate(dateStr) || new Date();
  if (!cropID) { _tgSend("❌ No crop id provided.", chatId); return; }

  const row = _findRowById("CropTracking", cropID, 1);
  if (!row) {
    _tgSend("❌ <b>Crop ID not found:</b> <code>" + cropID + "</code>", chatId);
    return;
  }

  const cropName     = row.rowData[1];
  const plantingDate = _parseDate(row.rowData[4]);
  const daysFromPlanting = plantingDate
    ? Math.round((updateDate - plantingDate) / (1000 * 60 * 60 * 24)) : "?";

  const existingNotes = String(row.rowData[14] || "");
  let note = _formatDateShort(updateDate) + ": ";
  if (stage) note += "Stage → " + stage + ". ";
  if (treatment.type !== "none") note += "Treatment: " + treatment.type + " (" + treatment.product + "). ";
  _updateCell("CropTracking", row.rowIndex, 15, existingNotes ? existingNotes + " | " + note : note);

  const stageLower = stage.toLowerCase();
  let newStatus = String(row.rowData[13]);
  if (stageLower.includes("seedl") || stageLower.includes("germinated")) {
    newStatus = "Seedling";
    const cropData = _lookupCrop(cropName);
    if (cropData) _logDeviation("CropDatabase_Adjustments", cropName.toLowerCase(),
      "germination_days", 7, daysFromPlanting);
  } else if (stageLower.includes("transplant")) {
    newStatus = "Transplanted";
    _updateCell("CropTracking", row.rowIndex, 7, _formatDateShort(updateDate));
    const cropData = _lookupCrop(cropName);
    if (cropData && cropData.growing_from_transplant) {
      _updateCell("CropTracking", row.rowIndex, 8,
        _formatDateShort(_addDays(updateDate, _getAdjustedValue(cropName.toLowerCase(), "growing_from_transplant", cropData.growing_from_transplant))));
    }
  } else if (stageLower.includes("flower")) { newStatus = "Flowering"; }
    else if (stageLower.includes("harvest") || stageLower.includes("ready")) { newStatus = "Ready to Harvest"; }

  if (newStatus !== String(row.rowData[13])) _updateCell("CropTracking", row.rowIndex, 14, newStatus);
  if (treatment.type !== "none") _logTreatment(cropID, cropName, _formatDateShort(updateDate), treatment, daysFromPlanting);

  _notify("crop_updated", {
    cropName:        cropName,
    trackingID:      cropID,
    updateDate:      updateDate,
    daysFromPlanting: daysFromPlanting,
    stage:           stage,
    treatment:       treatment.type !== "none" ? treatment.type + ":" + treatment.product : "",
    oldStatus:       String(row.rowData[13]),
    newStatus:       newStatus
  }, chatId);
}

function _processPropUpdate(fields, chatId) {
  const propID = (fields["prop id"] || "").trim();
  if (!propID) { _tgSend("❌ No prop id provided.", chatId); return; }
  const dateStr    = fields["date"] || "today";
  const stage      = _normaliseStage(fields["stage"] || "");
  const notes      = fields["notes"] || "";
  const updateDate = _parseDate(dateStr) || new Date();

  const row = _findRowById("PropagationTracking", propID, 1);
  if (!row) { _tgSend("❌ <b>Propagation ID not found:</b> <code>" + propID + "</code>", chatId); return; }

  const plantName = row.rowData[1];
  const propDate  = _parseDate(row.rowData[2]);
  const method    = row.rowData[3];
  const daysFromProp = propDate ? Math.round((updateDate - propDate) / (1000*60*60*24)) : "?";

  const stageLower = stage.toLowerCase();
  let newStatus = String(row.rowData[9]);
  if (stageLower === "rooted" || stageLower.includes("root")) {
    _updateCell("PropagationTracking", row.rowIndex, 8, _formatDateShort(updateDate));
    _updateCell("PropagationTracking", row.rowIndex, 9, String(daysFromProp));
    newStatus = "Rooted";
    _updatePropDatabase(plantName.toLowerCase(), method, Number(daysFromProp));
  } else if (stageLower.includes("callus")) { newStatus = "Callusing"; }
    else if (stageLower.includes("potted") || stageLower.includes("transplant")) { newStatus = "Potted"; }
  _updateCell("PropagationTracking", row.rowIndex, 10, newStatus);

  _notify("prop_updated", {
    plantName:   plantName,
    trackingID:  propID,
    updateDate:  updateDate,
    daysFromProp: daysFromProp,
    stage:       stage,
    newStatus:   newStatus
  }, chatId);
}

function _processCropDelete(fields, chatId) {
  const cropID = (fields["crop id"] || "").trim();
  if (!cropID) { _tgSend("❌ No crop id provided.", chatId); return; }

  const cropSheet = _getSheet("CropTracking");
  const data = cropSheet.getDataRange().getValues();
  let cropRow = -1, cropName = "", plantingDateRaw = "";
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === cropID) {
      cropRow = i+1; cropName = String(data[i][1]); plantingDateRaw = String(data[i][4]); break;
    }
  }
  if (cropRow === -1) {
    _tgSend("❌ <b>Delete failed — ID not found:</b> <code>" + cropID + "</code>", chatId);
    return;
  }

  const deletedItems = [];
  const reminderSheet = _getSheet("ReminderQueue");
  if (reminderSheet) {
    const rData = reminderSheet.getDataRange().getValues();
    let count = 0;
    for (let r = rData.length-1; r >= 1; r--) {
      if (String(rData[r][3]) === cropID) { reminderSheet.deleteRow(r+1); count++; }
    }
    if (count > 0) deletedItems.push(count + " reminder(s) removed");
  }
  try {
    const cal = _getCalendar();
    const plantingDate = _parseDate(plantingDateRaw) || new Date(2020, 0, 1);
    const events = cal.getEvents(plantingDate, _addDays(plantingDate, 730));
    const titles = ["🌱 Transplant: "+cropName,"🥬 Harvest: "+cropName,"🍄 Fungus Spray: "+cropName,
                    "🐛 Pest Spray: "+cropName,"📅 Plant Next Batch: "+cropName];
    let count = 0;
    events.forEach(ev => { if (titles.some(t => ev.getTitle().startsWith(t.split(":")[0] + ":" ))) { ev.deleteEvent(); count++; } });
    if (count > 0) deletedItems.push(count + " calendar event(s) removed");
  } catch(e) {}

  _updateCell("CropTracking", cropRow, 14, "Deleted");
  _updateCell("CropTracking", cropRow, 15, "DELETED: " + _formatDateShort(new Date()));

  // Parse counts from deletedItems list
  const remCount = deletedItems.filter(x => x.includes("reminder")).length ? 
    parseInt((deletedItems.find(x => x.includes("reminder")) || "0").match(/\d+/) || [0]) : 0;
  const evCount  = deletedItems.filter(x => x.includes("calendar")).length ?
    parseInt((deletedItems.find(x => x.includes("calendar")) || "0").match(/\d+/) || [0]) : 0;
  _notify("crop_deleted", {
    cropName:          cropName,
    trackingID:        cropID,
    remindersRemoved:  remCount,
    eventsRemoved:     evCount
  }, chatId);
}


// ══════════════════════════════════════════════════════
//  REPLY HANDLERS (germinated / harvested / ready / rooted)
//  These are triggered by single-line keyword messages
// ══════════════════════════════════════════════════════

function _handleGerminationReply(text, chatId) {
  const lower = text.toLowerCase();
  // Find a crop ID in the message
  const idMatch = text.match(/CROP_\d+_\d+/);
  if (!idMatch) {
    _tgSend("❓ Please include the Crop ID.\nExample:\n<code>germinated - today\nCROP_1234567_890</code>", chatId);
    return;
  }
  const trackingID = idMatch[0];
  const dateStr    = text.match(/\d{2}-\d{2}-\d{4}/) ? text.match(/\d{2}-\d{2}-\d{4}/)[0] : "today";
  const germDate   = _parseDate(dateStr) || new Date();

  if (lower.includes("not germinated")) {
    _tgSend("📋 Noted — <b>no germination yet</b> for <code>" + trackingID + "</code>.\n\nSend again when germination is confirmed.", chatId);
    return;
  }

  const row = _findRowById("CropTracking", trackingID, 1);
  if (!row) { _tgSend("❌ Crop ID not found: <code>" + trackingID + "</code>", chatId); return; }

  const cropName     = row.rowData[1];
  const variety      = row.rowData[2];
  const plantingDate = _parseDate(row.rowData[5]);
  const daysToGerm   = plantingDate ? Math.round((germDate - plantingDate) / (1000*60*60*24)) : null;

  // Write germination date (col 9=1-based → col 8 0-based → setCell col 9)
  _updateCell("CropTracking", row.rowIndex, 9,  _formatDateShort(germDate));   // Germination Date
  _updateCell("CropTracking", row.rowIndex, 5,  String(row.rowData[4]).toLowerCase() === "seed" ? "Germinated" : row.rowData[4]);
  _updateCell("CropTracking", row.rowIndex, 16, "Seedling");                  // Status
  if (daysToGerm !== null) _updateCell("CropTracking", row.rowIndex, 18, daysToGerm); // Days: Seed-Germ
  _logStage(trackingID, cropName, variety, "Seed", "Seedling", germDate, daysToGerm, row.rowData[3], "");
  const daysFromPlanting = daysToGerm !== null ? daysToGerm : "?";
  const germCropData = _lookupCrop(cropName);
  if (daysToGerm !== null) {
    const germMinDb = germCropData ? (germCropData.germination_days_min || 5) : 5;
    _logDeviation("CropDatabase_Adjustments", cropName.toLowerCase(), "germination_days_min", germMinDb, daysToGerm, variety || "");
  }

  _notify("germinated", {
    cropName:        cropName,
    trackingID:      trackingID,
    daysToGerminate: daysFromPlanting,
    germDate:        germDate
  }, chatId);

  // Queue true-leaf check 6 days from now to determine feeding readiness
  try { _queueTrueLeafCheck(cropName, variety, trackingID, germDate, chatId); } catch(e) {
    Logger.log("_queueTrueLeafCheck error: " + e.message);
  }
}

function _handleHarvestReply(text, chatId) {
  const idMatch = text.match(/CROP_\d+_\d+/);
  if (!idMatch) {
    _tgSend("❓ Please include the Crop ID.\nExample:\n<code>harvested - today\nCROP_1234567_890</code>", chatId);
    return;
  }
  const trackingID  = idMatch[0];
  const dateStr     = text.match(/\d{2}-\d{2}-\d{4}/) ? text.match(/\d{2}-\d{2}-\d{4}/)[0] : "today";
  const harvestDate = _parseDate(dateStr) || new Date();

  const row = _findRowById("CropTracking", trackingID, 1);
  if (!row) { _tgSend("❌ Crop ID not found: <code>" + trackingID + "</code>", chatId); return; }

  const cropName         = row.rowData[1];
  const variety          = row.rowData[2];
  const estimatedHarvest = _parseDate(row.rowData[9]);   // col 9 = HarvestEst
  const plantingDate     = _parseDate(row.rowData[5]);   // col 5 = PlantingDate
  const transplantActual = _parseDate(row.rowData[7]);   // col 7 = TransplantActual
  const germDate2        = _parseDate(row.rowData[8]);   // col 8 = GerminationDate
  const daysDiff         = estimatedHarvest ? Math.round((harvestDate - estimatedHarvest) / (1000*60*60*24)) : 0;
  const daysFromPlanting = plantingDate ? Math.round((harvestDate - plantingDate) / (1000*60*60*24)) : 0;
  const daysTransToHarv  = transplantActual ? Math.round((harvestDate - transplantActual) / (1000*60*60*24)) : null;

  const harvestLog  = _getSheet("HarvestLog");
  const harvestData = harvestLog ? harvestLog.getDataRange().getValues() : [];
  let harvestCount  = 0;
  for (let i = 1; i < harvestData.length; i++) {
    if (String(harvestData[i][0]) === trackingID) harvestCount++;
  }
  harvestCount++;
  _appendRow("HarvestLog", [trackingID, cropName, harvestCount, _formatDateShort(harvestDate), daysFromPlanting, daysDiff, ""]);
  _updateCell("CropTracking", row.rowIndex, 11, _formatDateShort(harvestDate)); // HarvestActual = col 11 (1-based)
  _updateCell("CropTracking", row.rowIndex, 16, "Harvested");                  // Status = col 16
  if (daysTransToHarv !== null) _updateCell("CropTracking", row.rowIndex, 20, daysTransToHarv); // Days: Transplant-Harvest
  _logStage(trackingID, cropName, variety, "Transplanted", "Harvested", harvestDate, daysTransToHarv, row.rowData[3], "");

  if (Math.abs(daysDiff) >= 2) {
    const cropData2h = _lookupCrop(cropName);
    if (cropData2h) _logDeviation("CropDatabase_Adjustments", cropName.toLowerCase(), "growing_time_days", cropData2h.growing_time_days, daysFromPlanting, variety);
  }

  _notify("harvested", {
    cropName:       cropName,
    trackingID:     trackingID,
    harvestCount:   harvestCount,
    daysFromPlanting: daysFromPlanting,
    daysDiff:       daysDiff,
    harvestDate:    harvestDate
  }, chatId);
}

function _handleReadyReply(text, chatId) {
  const idMatch = text.match(/CROP_\d+_\d+/);
  if (!idMatch) {
    _tgSend("❓ Please include the Crop ID.\nExample:\n<code>ready - today\nCROP_1234567_890</code>", chatId);
    return;
  }
  const trackingID    = idMatch[0];
  const dateStr       = text.match(/\d{2}-\d{2}-\d{4}/) ? text.match(/\d{2}-\d{2}-\d{4}/)[0] : "today";
  const confirmedDate = _parseDate(dateStr) || new Date();

  const row = _findRowById("CropTracking", trackingID, 1);
  if (!row) { _tgSend("❌ Crop ID not found: <code>" + trackingID + "</code>", chatId); return; }

  const cropName  = row.rowData[1];
  const variety   = row.rowData[2];
  const cropData  = _lookupCrop(cropName);
  const scheduledTransplant = _parseDate(row.rowData[6]); // col 6 = TransplantSched
  const germDate3 = _parseDate(row.rowData[8]);           // col 8 = GerminationDate
  const plantDate3 = _parseDate(row.rowData[5]);          // col 5 = PlantingDate
  const daysDiff  = scheduledTransplant ? Math.round((confirmedDate - scheduledTransplant) / (1000*60*60*24)) : 0;
  const daysGermToTrans = germDate3 ? Math.round((confirmedDate - germDate3) / (1000*60*60*24))
                         : (plantDate3 ? Math.round((confirmedDate - plantDate3) / (1000*60*60*24)) : null);

  _updateCell("CropTracking", row.rowIndex, 8,  _formatDateShort(confirmedDate)); // TransplantActual = col 8 (1-based)
  _updateCell("CropTracking", row.rowIndex, 16, "Transplanted");                  // Status
  if (daysGermToTrans !== null) _updateCell("CropTracking", row.rowIndex, 19, daysGermToTrans); // Days: Germ-Transplant

  _logStage(trackingID, cropName, variety, "Seedling", "Transplanted", confirmedDate, daysGermToTrans, row.rowData[3], "");

  let newHarvestDate = null;
  if (cropData && cropData.growing_from_transplant) {
    newHarvestDate = _addDays(confirmedDate,
      _getAdjustedValue(cropName.toLowerCase(), "growing_from_transplant", cropData.growing_from_transplant));
    _updateCell("CropTracking", row.rowIndex, 10, _formatDateShort(newHarvestDate)); // HarvestEst = col 10 (1-based)
    _createCalendarEvent("🥬 Harvest: " + cropName, newHarvestDate, "Revised harvest date.\nTracking ID: " + trackingID);
  }

  _notify("transplanted", {
    cropName:       cropName,
    trackingID:     trackingID,
    confirmedDate:  confirmedDate,
    daysDiff:       daysDiff,
    newHarvestDate: newHarvestDate
  }, chatId);
}

function _handleRootedReply(text, chatId) {
  const idMatch = text.match(/PROP_\d+_\d+/);
  if (!idMatch) {
    _tgSend("❓ Please include the Propagation ID.\nExample:\n<code>rooted - today\nPROP_1234567_890</code>", chatId);
    return;
  }
  const trackingID   = idMatch[0];
  const dateStr      = text.match(/\d{2}-\d{2}-\d{4}/) ? text.match(/\d{2}-\d{2}-\d{4}/)[0] : "today";
  const confirmedDate = _parseDate(dateStr) || new Date();

  const row = _findRowById("PropagationTracking", trackingID, 1);
  if (!row) { _tgSend("❌ Propagation ID not found: <code>" + trackingID + "</code>", chatId); return; }

  const plantName  = row.rowData[1];
  const propDate   = _parseDate(row.rowData[2]);
  const method     = row.rowData[3];
  const daysToRoot = propDate ? Math.round((confirmedDate - propDate) / (1000*60*60*24)) : 0;
  const expectedStart = _parseDate(row.rowData[5]);
  const daysDiff = expectedStart ? Math.round((confirmedDate - expectedStart) / (1000*60*60*24)) : 0;

  _updateCell("PropagationTracking", row.rowIndex, 8, _formatDateShort(confirmedDate));
  _updateCell("PropagationTracking", row.rowIndex, 9, daysToRoot);
  _updateCell("PropagationTracking", row.rowIndex, 10, "Rooted");
  _updatePropDatabase(plantName.toLowerCase(), method, daysToRoot);

  _notify("rooted", {
    plantName:    plantName,
    trackingID:   trackingID,
    daysToRoot:   daysToRoot,
    daysDiff:     daysDiff,
    confirmedDate: confirmedDate
  }, chatId);
}


// ══════════════════════════════════════════════════════
//  REMINDER QUEUE — SENDS VIA TELEGRAM
// ══════════════════════════════════════════════════════

function _queueReminder(type, cropName, trackingID, sendDate, subject, body, chatId) {
  _appendRow("ReminderQueue", [
    _generateID("REM"), type, cropName, trackingID,
    _formatDateShort(sendDate), subject, body, "No", chatId || CONFIG.TELEGRAM_CHAT_ID
  ]);
}

/**
 * sendPendingReminders — runs every 30 min via trigger.
 * Sends due reminders via Telegram instead of email.
 * Germination reminders sent individually; others consolidated by type.
 */
function sendPendingReminders() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.length < 10) return;
  const sheet = _getSheet("ReminderQueue");
  if (!sheet) return;
  const data  = sheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueRows = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][7]) === "Yes") continue;
    const sendDate = _parseDate(data[i][4]);
    if (!sendDate) continue;
    sendDate.setHours(0, 0, 0, 0);
    if (sendDate <= today) dueRows.push({ sheetRow: i + 1, data: data[i] });
  }
  if (dueRows.length === 0) return;

  // Germination reminders: individual (need per-crop reply)
  const germRows     = dueRows.filter(r => String(r.data[1]) === "germination_check");
  const trueLeafRows = dueRows.filter(r => String(r.data[1]) === "true_leaf_check");
  const fertRows     = dueRows.filter(r => ["fert_seedling","fert_midveg","fert_flowering","fert_fruiting"].includes(String(r.data[1])));
  const otherRows    = dueRows.filter(r => !["germination_check","true_leaf_check","fert_seedling","fert_midveg","fert_flowering","fert_fruiting"].includes(String(r.data[1])));

  germRows.forEach(function(r) {
    const chatId = String(r.data[8]) || CONFIG.TELEGRAM_CHAT_ID;
    _tgSend(String(r.data[5]) + "\n\n" + String(r.data[6]), chatId);
    sheet.getRange(r.sheetRow, 8).setValue("Yes");
  });

  // True-leaf checks: send as inline tap-buttons
  trueLeafRows.forEach(function(r) {
    const chatIdR  = String(r.data[8]) || CONFIG.TELEGRAM_CHAT_ID;
    const cropNameR = String(r.data[2]);
    const trackIdR  = String(r.data[3]);
    var rowRef = _findRowById("CropTracking", trackIdR, 1);
    var varRef = rowRef ? String(rowRef.rowData[2]) : "";
    _sendTrueLeafCheckButtons(cropNameR, varRef, trackIdR, chatIdR);
    sheet.getRange(r.sheetRow, 8).setValue("Yes");
  });

  // Fertilizer reminders: send with ✅ Applied / ❌ Not Yet confirm buttons
  fertRows.forEach(function(r) {
    _sendFertReminderWithConfirm(r, sheet);
  });

  // Other reminders: consolidated by type
  const byType = {};
  otherRows.forEach(function(r) {
    const type = String(r.data[1]);
    if (!byType[type]) byType[type] = [];
    byType[type].push(r);
  });

  Object.keys(byType).forEach(function(type) {
    const group = byType[type];
    const chatId = String(group[0].data[8]) || CONFIG.TELEGRAM_CHAT_ID;
    let msg;
    if (group.length === 1) {
      msg = String(group[0].data[5]) + "\n\n" + String(group[0].data[6]);
    } else {
      msg = _buildConsolidatedReminderTg(type, group);
    }
    _tgSend(msg, chatId);
    group.forEach(r => sheet.getRange(r.sheetRow, 8).setValue("Yes"));
  });
}

function _buildConsolidatedReminderTg(type, group) {
  const typeLabels = {
    harvest: "🥬 HARVEST", transplant: "🌱 TRANSPLANT",
    spray_fungus: "🍄 FUNGUS SPRAY", spray_pest: "🐛 PEST SPRAY",
    next_planting: "📅 BATCH PLANTING", rooting_check: "🌿 ROOTING CHECK",
  };
  const label = typeLabels[type] || type.toUpperCase();
  let msg = "<b>" + label + " — " + group.length + " CROPS DUE</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  group.forEach(function(r, i) {
    msg += (i+1) + ". <b>" + String(r.data[2]).toUpperCase() + "</b>\n";
    msg += "   🆔 <code>" + String(r.data[3]) + "</code>\n\n";
  });
  return msg;
}


// ══════════════════════════════════════════════════════
//  TELEGRAM MESSAGE BUILDERS
// ══════════════════════════════════════════════════════

function _buildCropConfirmationTg(
  cropData, plantingDate, method, stage,
  transplantDate, harvestDate,
  fungusSprayDates, pestSprayDates,
  consistentDates, trackingID, variety
) {
  let msg = "✅ <b>CROP LOGGED: " + cropData.display_name.toUpperCase() + (variety ? " — " + variety.toUpperCase() : "") + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "🆔 <b>Your Crop ID (save this!):</b>\n<code>" + trackingID + "</code>\n\n";
  msg += "🌱 <b>Crop:</b> " + cropData.display_name + "\n";
  if (variety) msg += "🌿 <b>Variety:</b> " + variety + "\n";
  if (method && method.toLowerCase().includes("grafted")) {
    msg += "🔗 <b>Method:</b> Grafted onto Pumpkin Rootstock\n";
    msg += "<i>Stage timeline: Seed → Germination → Graft Healing → Transplant → Harvest</i>\n";
  }
  msg += "📅 <b>Planted:</b> " + _formatDate(plantingDate) + "\n";
  msg += "🔧 <b>Method:</b> " + method + "\n";
  msg += "🌿 <b>Stage:</b> " + stage + "\n\n";

  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
  msg += "<b>SCHEDULE</b>\n\n";

  const germMin = cropData.germination_days_min || 5;
  const germMax = cropData.germination_days_max || germMin + 5;
  msg += "🌱 <b>Germination window:</b>\n   " + _formatDate(_addDays(plantingDate, germMin)) +
         " – " + _formatDate(_addDays(plantingDate, germMax)) + "\n\n";

  if (transplantDate) {
    msg += "📦 <b>Transplant date:</b> " + _formatDate(transplantDate) + "\n";
    msg += "   Reply: <code>ready - today\nCROP_ID</code>\n\n";
  }
  msg += "🥬 <b>Estimated first harvest:</b> " + _formatDate(harvestDate) + "\n";
  msg += "   Harvest weeks: " + (cropData.number_of_weeks_harvest || 1) + " weeks\n";
  if (cropData.harvest_interval) msg += "   Every ~" + cropData.harvest_interval + " days\n";
  msg += "\n";

  if (fungusSprayDates.length > 0) {
    msg += "🍄 <b>Fungus spray dates:</b>\n";
    fungusSprayDates.forEach((d, i) => { msg += "   Spray #" + (i+1) + ": " + _formatDate(d) + "\n"; });
    msg += "\n";
  }
  if (pestSprayDates.length > 0) {
    msg += "🐛 <b>Pest spray dates:</b>\n";
    pestSprayDates.forEach((d, i) => { msg += "   Spray #" + (i+1) + ": " + _formatDate(d) + "\n"; });
    msg += "\n";
  }

  if (consistentDates.length > 0) {
    msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
    msg += "<b>BATCH SCHEDULE</b>\n";
    consistentDates.forEach((d, i) => { msg += "   Batch #" + (i+2) + ": " + _formatDate(d) + "\n"; });
    msg += "\n";
  }

  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
  msg += "<b>WATCH FOR:</b>\n";
  msg += "🍄 " + (cropData.diseases || []).slice(0, 3).join(", ") + "\n";
  msg += "🐛 " + (cropData.pests || []).slice(0, 3).join(", ") + "\n\n";
  msg += "📆 All events added to 🌱 Crop Manager calendar";
  return msg;
}

function _buildBatchCropConfirmationTg(results) {
  const ok  = results.filter(r => !r.error).length;
  const bad = results.filter(r =>  r.error).length;
  let msg = "✅ <b>BATCH CROP LOG — " + results.length + " CROPS</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
  msg += "Logged: " + ok + (bad > 0 ? " | ❌ Errors: " + bad : "") + "\n\n";
  results.forEach(function(r, i) {
    msg += "<b>" + (i+1) + ". " + (r.cropName || "Unknown").toUpperCase() + "</b>\n";
    if (r.error) { msg += "   ❌ " + r.error + "\n\n"; return; }
    msg += "   🆔 <code>" + r.trackingID + "</code>\n";
    msg += "   📅 Planted: " + _formatDate(r.plantingDate) + "\n";
    msg += "   🥬 Harvest: " + _formatDate(r.harvestDate) + "\n";
    if (r.transplantDate) msg += "   📦 Transplant: " + _formatDate(r.transplantDate) + "\n";
    msg += "\n";
  });
  return msg;
}

function _buildPropagationConfirmationTg(plantName, propDate, method, notes, rootStart, rootEnd, hasPriorData, trackingID) {
  let msg = "✅ <b>PROPAGATION LOGGED: " + plantName.toUpperCase() + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "🆔 <b>Propagation ID:</b>\n<code>" + trackingID + "</code>\n\n";
  msg += "🌿 <b>Plant:</b> " + plantName + "\n";
  msg += "📅 <b>Date:</b> " + _formatDate(propDate) + "\n";
  msg += "🔧 <b>Method:</b> " + method + "\n";
  if (notes) msg += "📝 <b>Notes:</b> " + notes + "\n";
  msg += "\n" + (hasPriorData ? "📊 Based on YOUR history:\n" : "📊 General database:\n");
  msg += "🌱 <b>Expected rooting:</b> " + _formatDate(rootStart) + " – " + _formatDate(rootEnd) + "\n\n";
  msg += "When rooted, send:\n<code>rooted - today\n" + trackingID + "</code>";
  return msg;
}

function _buildBatchPropConfirmationTg(results) {
  let msg = "✅ <b>BATCH PROPAGATION — " + results.length + " PLANTS</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  results.forEach(function(r, i) {
    msg += "<b>" + (i+1) + ". " + (r.plantName || "Unknown").toUpperCase() + "</b>\n";
    if (r.error) { msg += "   ❌ " + r.error + "\n\n"; return; }
    msg += "   🆔 <code>" + r.trackingID + "</code>\n";
    msg += "   📅 Date: " + _formatDate(r.propDate) + " | " + r.method + "\n";
    msg += "   🌱 Root expected: " + _formatDate(r.rootStart) + " – " + _formatDate(r.rootEnd) + "\n\n";
  });
  return msg;
}

function _buildGerminationCheckBody(cropName, germCheckDate, germEndDate, trackingID) {
  let msg = "🌱 <b>GERMINATION CHECK — " + cropName.toUpperCase() + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "Your <b>" + cropName + "</b> should be germinating now!\n\n";
  msg += "📅 Window: " + _formatDate(germCheckDate) + " – " + _formatDate(germEndDate) + "\n\n";
  msg += "Reply with one of:\n\n";
  msg += "✅ Germinated today:\n<code>germinated - today\n" + trackingID + "</code>\n\n";
  msg += "✅ Germinated on a date:\n<code>germinated - DD-MM-YYYY\n" + trackingID + "</code>\n\n";
  msg += "❌ Not yet:\n<code>not germinated\n" + trackingID + "</code>\n\n";
  msg += "🆔 <code>" + trackingID + "</code>";
  return msg;
}

function _buildTransplantReminderBody(cropName, transplantDate, trackingID) {
  let msg = "🌱 <b>TRANSPLANT REMINDER — " + cropName.toUpperCase() + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "📅 Transplant date: <b>" + _formatDate(transplantDate) + "</b>\n\n";
  msg += "When done, reply:\n<code>ready - today\n" + trackingID + "</code>\n\n";
  msg += "🆔 <code>" + trackingID + "</code>";
  return msg;
}

function _buildHarvestReminderBody(cropData, plantingDate, harvestDate, trackingID) {
  let msg = "🥬 <b>HARVEST REMINDER — " + cropData.display_name.toUpperCase() + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "Your <b>" + cropData.display_name + "</b> (planted " + _formatDate(plantingDate) + ")\n";
  msg += "is ready for harvest soon!\n\n";
  msg += "📅 Est. harvest: <b>" + _formatDate(harvestDate) + "</b>\n";
  msg += "🔢 Harvest duration: " + (cropData.number_of_weeks_harvest || 1) + " week(s)\n\n";
  msg += "When harvested, reply:\n<code>harvested - today\n" + trackingID + "</code>\n\n";
  msg += "🆔 <code>" + trackingID + "</code>";
  return msg;
}

function _buildSprayReminderBody(cropName, type, sprayDate, sprayNum, diseases, pests) {
  const icon  = type === "fungus" ? "🍄" : "🐛";
  const label = type === "fungus" ? "FUNGUS" : "PEST";
  const list  = type === "fungus" ? diseases : pests;
  let msg = icon + " <b>" + label + " SPRAY — " + cropName + " (#" + sprayNum + ")</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "📅 Spray date: " + _formatDate(sprayDate) + "\n\n";
  msg += "Watch for:\n" + (list || []).slice(0, 4).map(d => "• " + d).join("\n") + "\n\n";
  msg += "Tip: Spray early morning or late afternoon.";
  return msg;
}

function _buildNextPlantingReminderBody(cropName, plantDate, batchNum) {
  let msg = "📅 <b>TIME TO PLANT: " + cropName.toUpperCase() + " — Batch #" + batchNum + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "📅 <b>Plant date: " + _formatDate(plantDate) + "</b>\n\n";
  msg += "Plant Batch #" + batchNum + " now for continuous harvest.\n\n";
  msg += "After planting, confirm with:\n<code>data type - crop\ncrop name - " + cropName + "\nbatch number - " + batchNum + "\nstatus - planted\ndate - " + _formatDateShort(plantDate) + "\ncrop id - YOUR_CROP_ID</code>";
  return msg;
}

function _buildRootingCheckBody(plantName, method, rootStart, rootEnd, notes, hasPriorData, trackingID) {
  let msg = "🌿 <b>ROOTING CHECK — " + plantName + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "📅 Expected: " + _formatDate(rootStart) + " – " + _formatDate(rootEnd) + "\n";
  if (notes) msg += "📝 Notes: " + notes + "\n";
  msg += "\n" + (hasPriorData ? "📊 Based on YOUR history.\n\n" : "📊 General guidelines.\n\n");
  msg += "When rooted, reply:\n<code>rooted - today\n" + trackingID + "</code>\n\n";
  msg += "🆔 <code>" + trackingID + "</code>";
  return msg;
}

function _buildHelpMessage() {
  // Sent as multiple messages so each stays under Telegram's 4096 char limit
  return null; // signals _handleHelp to send multi-part guide
}

function _sendFullHelp(chatId) {

  // ── Part 1: How to start ─────────────────────────────
  var p1 = "\uD83C\uDF31 <b>CropManager " + CONFIG.SCRIPT_VERSION + " \u2014 How It Works</b>\n";
  p1 += "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n";
  p1 += "<b>STEP 1 \u2014 Always start with a date:</b>\n";
  p1 += "<code>today</code>  \u2022  <code>yesterday</code>  \u2022  <code>mar 12</code>  \u2022  <code>12-03-2026</code>\n\n";
  p1 += "\u2192 Bot asks: <i>What did you work on?</i>\n";
  p1 += "\u2192 You tap: <b>[\uD83C\uDF31 Crop]</b> or <b>[\uD83C\uDF3F Propagation]</b>\n\n";
  p1 += "<b>STEP 2 \u2014 Pick your action:</b>\n";
  p1 += "\u2022 \uD83C\uDF31 Log New Crop\n";
  p1 += "\u2022 \uD83D\uDCE6 Log Batch Crops\n";
  p1 += "\u2022 \u270F\uFE0F Update Crop\n";
  p1 += "\u2022 \uD83D\uDCCA Change Status\n";
  p1 += "\u2022 \uD83D\uDEAE Mark Germinated\n";
  p1 += "\u2022 \uD83D\uDE9C Mark Transplanted\n";
  p1 += "\u2022 \uD83E\uDD47 Log Harvest\n";
  p1 += "\u2022 \uD83D\uDDD1\uFE0F Delete Crop\n\n";
  p1 += "<b>STEP 3 \u2014 Follow the button prompts.</b>\n";
  p1 += "The date is automatically carried through every step.\n\n";
  p1 += "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n";
  p1 += "\uD83D\uDCCB <b>QUICK COMMANDS (type any time):</b>\n";
  p1 += "<code>today</code> \u2014 start logging for today\n";
  p1 += "<code>yesterday</code> \u2014 log for yesterday\n";
  p1 += "<code>crop</code> \u2014 open crop menu (no date required)\n";
  p1 += "<code>prop</code> \u2014 open propagation menu\n";
  p1 += "<code>menu</code> \u2014 main menu\n";
  p1 += "<code>cancel</code> \u2014 cancel any active flow\n";
  _tgSend(p1, chatId);

  // ── Part 2: Reports & views ──────────────────────────
  var p2 = "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n";
  p2 += "\uD83D\uDCCA <b>REPORTS &amp; VIEWS:</b>\n\n";
  p2 += "<code>status</code> \u2014 all active crops &amp; propagations\n";
  p2 += "<code>today</code> \u2014 date-first entry \u2192 tap Crop or Propagation\n";
  p2 += "<code>/today</code> \u2014 today's briefing (weather + due tasks)\n";
  p2 += "<code>week</code> \u2014 7-day calendar with weather\n";
  p2 += "<code>crops</code> \u2014 all active crops with days remaining\n";
  p2 += "<code>weather</code> \u2014 7-day forecast + spray warnings\n";
  p2 += "<code>harvest report</code> \u2014 yield totals &amp; timing averages\n";
  p2 += "<code>gaps</code> \u2014 succession planting gap analysis\n";
  p2 += "<code>pin</code> \u2014 pin manager\n";
  p2 += "<code>fert</code> \u2014 fertilizer schedule for any active crop\n\n";

  p2 += "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n";
  p2 += "\u2705 <b>QUICK-EVENT BUTTONS</b> (available in crop &amp; prop menus):\n\n";
  p2 += "\uD83D\uDEAE <b>Mark Germinated</b> \u2014 records germination date, sets status to Seedling\n";
  p2 += "\uD83D\uDE9C <b>Mark Transplanted</b> \u2014 records transplant date, updates status\n";
  p2 += "\uD83E\uDD47 <b>Log Harvest</b> \u2014 logs harvest date; continuous crops stay Active\n";
  p2 += "\u2705 <b>Mark Rooted</b> (prop) \u2014 records rooted date on a propagation\n\n";
  p2 += "All events ask for a <b>Crop/Prop ID</b> then show a confirm screen.\n\n";

  p2 += "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n";
  p2 += "\uD83D\uDCA1 <b>TIPS:</b>\n";
  p2 += "\u2022 Crop IDs look like: <code>CROP_1234567_890</code>\n";
  p2 += "\u2022 Prop IDs look like: <code>PROP_1234567_890</code>\n";
  p2 += "\u2022 IDs are shown in every confirmation message and in <code>crops</code>\n";
  p2 += "\u2022 Dates accepted: <code>today</code>, <code>yesterday</code>, <code>Mar 12</code>, <code>12-03-2026</code>\n";
  p2 += "\u2022 Send <code>cancel</code> at any time to stop a flow\n";
  _tgSend(p2, chatId);
}


// ══════════════════════════════════════════════════════
//  STATUS REPORT  (Telegram version)
// ══════════════════════════════════════════════════════

function _sendStatusReport(chatId) {
  const cropSheet = _getSheet("CropTracking");
  const propSheet = _getSheet("PropagationTracking");
  let msg = "🌱 <b>CROP & PROPAGATION STATUS</b>\n";
  msg += "📅 " + _formatDate(new Date()) + "\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "<b>ACTIVE CROPS</b>\n\n";
  if (cropSheet) {
    const data = cropSheet.getDataRange().getValues();
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][15]);   // col 15 = Status
      if (status === "Active" || status === "Transplanted" || status === "Seedling") {
        count++;
        msg += "🌱 <b>" + data[i][1] + "</b> (planted " + data[i][5] + ")\n";
        msg += "   Status: " + status + " | Harvest: " + data[i][9] + "\n";
        msg += "   🆔 <code>" + data[i][0] + "</code>\n\n";
      }
    }
    if (count === 0) msg += "No active crops.\n\n";
  }
  msg += "<b>ACTIVE PROPAGATIONS</b>\n\n";
  if (propSheet) {
    const data = propSheet.getDataRange().getValues();
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][10]) === "Propagating") {
        count++;
        msg += "🌿 <b>" + data[i][1] + "</b> (" + data[i][3] + ")\n";
        msg += "   Root: " + data[i][5] + " – " + data[i][6] + "\n";
        msg += "   🆔 <code>" + data[i][0] + "</code>\n\n";
      }
    }
    if (count === 0) msg += "No active propagations.\n";
  }
  _tgSend(msg, chatId);
}

// Also keep the manual email fallback for system alerts
function sendStatusReport() {
  _sendStatusReport(CONFIG.TELEGRAM_CHAT_ID);
}


// ══════════════════════════════════════════════════════
//  SMART LEARNING + DAILY CHECKS  (unchanged from v8)
// ══════════════════════════════════════════════════════

function runDailyLearningCheck() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.length < 10) return;

  // Collect results from each sub-check before notifying
  const learningUpdates = _runLearningReview();   // returns array of strings
  _runMissedDateCleanup();
  const overdueAlerts   = _runOverdueHarvestCheck(); // returns array of alert objects
  _runTrackerMissedDateScan();

  _runBatchGapNudge();
  _refreshPinnedMessages();  // silently update any pinned messages

  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "h:mm a");
  const checks = ["✅ All checks completed at " + now];

  _notify("background", {
    checks: checks,
    learningUpdates: learningUpdates || [],
    overdueAlerts:   overdueAlerts   || []
  }, CONFIG.TELEGRAM_CHAT_ID);
}

function _runLearningReview() {
  const cropSheet = _getSheet("CropDatabase_Adjustments");
  const updates   = [];
  if (cropSheet) {
    const data = cropSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][5]).toLowerCase() === "yes") {
        updates.push(data[i][0] + " · " + data[i][1] + ": DB=" + data[i][2] + " → Avg=" + data[i][3]);
      }
    }
  }
  Logger.log(updates.length ? "Learning: " + updates.join(", ") : "Learning review — no custom values.");
  return updates;
}

function _logDeviation(sheetName, cropKey, field, dbDefault, actualValue, variety) {
  // Sheet columns (0-indexed): CropKey | Variety | Field | DB Default | Your Average | Sample Count | Use Custom | Last Updated
  const sheet = _getSheet(sheetName);
  if (!sheet) return;
  const data  = sheet.getDataRange().getValues();
  const vStr  = (variety || "").trim();
  let existingRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === cropKey.toLowerCase() &&
        String(data[i][1]).trim().toLowerCase() === vStr.toLowerCase() &&
        String(data[i][2]) === field) {
      existingRow = i + 1; break;
    }
  }
  if (existingRow === -1) {
    sheet.appendRow([cropKey, vStr, field, dbDefault, actualValue, 1, "No", _formatDateShort(new Date())]);
  } else {
    const sampleCount = parseInt(data[existingRow-1][5]) + 1;
    const newAvg = ((parseFloat(data[existingRow-1][4]) * (sampleCount-1)) + actualValue) / sampleCount;
    sheet.getRange(existingRow, 5).setValue(newAvg.toFixed(1));
    sheet.getRange(existingRow, 6).setValue(sampleCount);
    sheet.getRange(existingRow, 8).setValue(_formatDateShort(new Date()));
    const justReachedThreshold = sampleCount === CONFIG.LEARNING_THRESHOLD;
    if (sampleCount >= CONFIG.LEARNING_THRESHOLD) {
      sheet.getRange(existingRow, 7).setValue("Yes");
      if (justReachedThreshold) {
        _notify("learning", {
          cropKey:     cropKey + (vStr ? " (" + vStr + ")" : ""),
          field:       field,
          dbDefault:   dbDefault,
          newAvg:      newAvg.toFixed(1),
          sampleCount: sampleCount
        }, CONFIG.TELEGRAM_CHAT_ID);
      }
    }
  }
}

function _updatePropDatabase(plantKey, method, daysToRoot) {
  const sheet = _getSheet("PropagationDatabase");
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  let existingRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === plantKey.toLowerCase() &&
        String(data[i][1]).toLowerCase() === method.toLowerCase()) { existingRow = i+1; break; }
  }
  if (existingRow === -1) {
    const defaults = _getPropagationRootingDays(plantKey, method);
    sheet.appendRow([plantKey, method, defaults.min, defaults.max, daysToRoot, 1, _formatDateShort(new Date())]);
  } else {
    const sampleCount = parseInt(data[existingRow-1][5]) + 1;
    const newAvg = ((parseFloat(data[existingRow-1][4]) * (sampleCount-1)) + daysToRoot) / sampleCount;
    sheet.getRange(existingRow, 5).setValue(newAvg.toFixed(1));
    sheet.getRange(existingRow, 6).setValue(sampleCount);
    sheet.getRange(existingRow, 7).setValue(_formatDateShort(new Date()));
  }
}

function _logTreatment(cropID, cropName, dateStr, treatment, daysFromPlanting) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName("TreatmentLog");
  if (!sheet) {
    sheet = ss.insertSheet("TreatmentLog");
    const h = ["Crop ID","Crop Name","Date","Days From Planting","Type","Product","Notes"];
    const r = sheet.getRange(1,1,1,h.length);
    r.setValues([h]); r.setFontWeight("bold"); r.setBackground("#2d6a2d"); r.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([cropID, cropName, dateStr, daysFromPlanting, treatment.type, treatment.product, ""]);
}

function _hasPriorPropagationData(plantKey, method) {
  const sheet = _getSheet("PropagationTracking");
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).toLowerCase().includes(plantKey) &&
        String(data[i][3]).toLowerCase().includes(method.toLowerCase()) &&
        data[i][7] !== "") return true;
  }
  return false;
}


// ══════════════════════════════════════════════════════
//  MISSED DATE CLEANUP  (sends via Telegram instead of email)
// ══════════════════════════════════════════════════════

function _runMissedDateCleanup() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reminderSheet = _getSheet("ReminderQueue");
  const cropSheet     = _getSheet("CropTracking");
  const cal           = _getCalendar();
  if (!reminderSheet || !cropSheet) return;

  const rData = reminderSheet.getDataRange().getValues();
  const cData = cropSheet.getDataRange().getValues();
  const cropRowIndex = {};
  for (let i = 1; i < cData.length; i++) cropRowIndex[String(cData[i][0])] = { rowIndex: i+1, rowData: cData[i] };

  const missedItems = [], toDelete = [];

  for (let r = rData.length - 1; r >= 1; r--) {
    if (String(rData[r][7]) === "Yes") continue;
    const sendDate = _parseDate(String(rData[r][4]));
    if (!sendDate) continue;
    sendDate.setHours(0, 0, 0, 0);
    if (sendDate >= today) continue;

    const type       = String(rData[r][1]);
    const cropName   = String(rData[r][2]);
    const trackingID = String(rData[r][3]);
    const chatId     = String(rData[r][8]) || CONFIG.TELEGRAM_CHAT_ID;
    const daysLate   = Math.round((today - sendDate) / (1000*60*60*24));
    const cropRow    = cropRowIndex[trackingID];

    if (!cropRow) { toDelete.push(r+1); continue; }
    const status = String(cropRow.rowData[13]);
    if (status === "Deleted" || status === "Complete" || status === "Harvested") { toDelete.push(r+1); continue; }

    const plantingDate = _parseDate(String(cropRow.rowData[4]));
    const cropData     = _lookupCrop(cropName);
    let rescheduled    = null;

    if (type === "next_planting" && cropData && plantingDate) {
      const offset = _getAdjustedValue(cropName.toLowerCase(), "batch_offset_days", cropData.batch_offset_days || 14);
      let batchDate = _addDays(plantingDate, offset), batchNum = 2;
      while (batchDate < today) { batchDate = _addDays(batchDate, offset); batchNum++; }
      _updateCell("CropTracking", cropRow.rowIndex, 10, _formatDateShort(batchDate));
      _createCalendarEvent("📅 Plant Next Batch: " + cropName, batchDate, "Batch #" + batchNum + " — rescheduled.\nID: " + trackingID);
      _queueReminder("next_planting", cropName, trackingID, _addDays(batchDate, -3),
        "📅 Time to Plant: " + cropName + " (Batch #" + batchNum + ")",
        _buildNextPlantingReminderBody(cropName, batchDate, batchNum), chatId);
      rescheduled = "Next batch: " + _formatDate(batchDate) + " (Batch #" + batchNum + ")";
    } else if (type === "transplant") {
      _queueReminder("transplant", cropName, trackingID, today,
        "🌱 URGENT Transplant Overdue: " + cropName,
        _buildTransplantReminderBody(cropName, _addDays(today, 3), trackingID), chatId);
      rescheduled = "Urgent reminder queued";
    } else if (type === "spray_fungus" || type === "spray_pest") {
      const sprayNum = String(rData[r][5]).match(/#(\d+)/);
      const num = sprayNum ? parseInt(sprayNum[1]) : 1;
      _queueReminder(type, cropName, trackingID, today,
        (type === "spray_fungus" ? "🍄 Missed Fungus Spray: " : "🐛 Missed Pest Spray: ") + cropName,
        _buildSprayReminderBody(cropName, type === "spray_fungus" ? "fungus" : "pest",
          _addDays(today, 2), num, (cropData || {}).diseases, (cropData || {}).pests), chatId);
      rescheduled = "Spray reminder queued";
    } else if (type === "germination_check") {
      _queueReminder("germination_check", cropName, trackingID, today,
        "🌱 Missed Germination Check: " + cropName,
        _buildGerminationCheckBody(cropName, today, _addDays(today, 3), trackingID), chatId);
      rescheduled = "Urgent germination check queued";
    } else if (type === "rooting_check") {
      _queueReminder("rooting_check", cropName, trackingID, today,
        "🌿 Missed Rooting Check: " + cropName,
        _buildRootingCheckBody(cropName, "", today, _addDays(today, 7), "", false, trackingID), chatId);
      rescheduled = "Urgent rooting check queued";
    } else {
      rescheduled = "No reschedule needed";
    }

    missedItems.push({ type, cropName, trackingID, daysLate, originalDate: _formatDate(sendDate), rescheduled, chatId });
    toDelete.push(r+1);
  }

  toDelete.sort((a, b) => b - a).forEach(function(rowNum) {
    try { reminderSheet.deleteRow(rowNum); } catch(e) {}
  });

  if (missedItems.length > 0) {
    // Group by chat
    const byChat = {};
    missedItems.forEach(function(item) {
      const cid = item.chatId || CONFIG.TELEGRAM_CHAT_ID;
      if (!byChat[cid]) byChat[cid] = [];
      byChat[cid].push(item);
    });
    Object.keys(byChat).forEach(function(cid) {
      const items = byChat[cid];
      let msg = "🔄 <b>MISSED DATE CLEANUP</b>\n";
      msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
      msg += items.length + " item(s) cleaned up\n\n";
      const byCrop = {};
      items.forEach(i => { if (!byCrop[i.cropName]) byCrop[i.cropName] = []; byCrop[i.cropName].push(i); });
      Object.keys(byCrop).forEach(function(cropName) {
        msg += "🌱 <b>" + cropName.toUpperCase() + "</b>\n";
        byCrop[cropName].forEach(function(item) {
          msg += "  ❌ " + item.type.replace(/_/g, " ") + " (was " + item.originalDate + ", " + item.daysLate + " days late)\n";
          msg += "  ✅ " + (item.rescheduled || "cleaned") + "\n";
        });
        msg += "\n";
      });
      _tgSend(msg, cid);
    });
  }
}

function _runTrackerMissedDateScan() {
  const cropSheet = _getSheet("CropTracking");
  if (!cropSheet) return;
  const data  = cropSheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const allMissed = [];

  for (let i = 1; i < data.length; i++) {
    const trackingID = String(data[i][0]);
    const cropName   = String(data[i][1]);
    const status     = String(data[i][13]);
    if (!trackingID || !cropName) continue;
    if (status === "Deleted" || status === "Complete" || status === "Harvested") continue;
    const plantingDate = _parseDate(String(data[i][4]));
    if (!plantingDate) continue;
    const cropData = _lookupCrop(cropName);
    const chatId   = String(data[i][15]) || CONFIG.TELEGRAM_CHAT_ID;

    const transplantSched  = _parseDate(String(data[i][5]));
    const transplantActual = String(data[i][6]);
    if (transplantSched && !transplantActual && transplantSched < today)
      allMissed.push({ cropName, trackingID, type: "transplant", dateWas: _formatDate(transplantSched), chatId });

    const harvestEst    = _parseDate(String(data[i][7]));
    const harvestActual = String(data[i][8]);
    if (harvestEst && !harvestActual && harvestEst < today) {
      const daysOver = Math.round((today - harvestEst) / (1000*60*60*24));
      if (daysOver > 3) allMissed.push({ cropName, trackingID, type: "harvest", dateWas: _formatDate(harvestEst), daysOver, chatId });
    }

    String(data[i][11] || "").split(",").forEach(function(ds) {
      const d = _parseDate(ds.trim());
      if (d && d < today && !_treatmentLoggedForDate(trackingID, "fungicide", d))
        allMissed.push({ cropName, trackingID, type: "spray_fungus", dateWas: _formatDate(d), chatId });
    });

    String(data[i][12] || "").split(",").forEach(function(ds) {
      const d = _parseDate(ds.trim());
      if (d && d < today && !_treatmentLoggedForDate(trackingID, "pesticide", d))
        allMissed.push({ cropName, trackingID, type: "spray_pest", dateWas: _formatDate(d), chatId });
    });

    const nextPlantDate = _parseDate(String(data[i][9] || ""));
    if (nextPlantDate && nextPlantDate < today) {
      allMissed.push({ cropName, trackingID, type: "next_planting", dateWas: _formatDate(nextPlantDate), chatId });
      if (cropData) {
        const offset = _getAdjustedValue(cropName.toLowerCase(), "batch_offset_days", cropData.batch_offset_days || 14);
        let batchDate = _addDays(plantingDate, offset);
        while (batchDate < today) batchDate = _addDays(batchDate, offset);
        cropSheet.getRange(i+1, 10).setValue(_formatDateShort(batchDate));
      }
    }
  }

  if (allMissed.length === 0) { Logger.log("TrackerMissedDateScan: all clear."); return; }

  const byChat = {};
  allMissed.forEach(function(item) {
    const cid = item.chatId || CONFIG.TELEGRAM_CHAT_ID;
    if (!byChat[cid]) byChat[cid] = [];
    byChat[cid].push(item);
  });

  Object.keys(byChat).forEach(function(cid) {
    const items = byChat[cid];
    let msg = "📋 <b>TRACKER MISSED DATES: " + items.length + " item(s)</b>\n";
    msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
    const byCrop = {};
    items.forEach(i => { if (!byCrop[i.cropName]) byCrop[i.cropName] = []; byCrop[i.cropName].push(i); });
    Object.keys(byCrop).sort().forEach(function(cropName) {
      msg += "🌱 <b>" + cropName.toUpperCase() + "</b>\n";
      msg += "   🆔 <code>" + byCrop[cropName][0].trackingID + "</code>\n";
      byCrop[cropName].forEach(function(item) {
        const icons = { transplant:"🌱", harvest:"🥬", spray_fungus:"🍄", spray_pest:"🐛", next_planting:"📅" };
        msg += "   " + (icons[item.type] || "📋") + " " + item.type.replace(/_/g, " ") + " — was due " + item.dateWas + "\n";
        if (item.daysOver) msg += "      " + item.daysOver + " days overdue\n";
      });
      msg += "\n";
    });
    _tgSend(msg, cid);
  });
}

function _treatmentLoggedForDate(trackingID, treatmentType, targetDate) {
  try {
    const sheet = _getSheet("TreatmentLog");
    if (!sheet) return false;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== trackingID) continue;
      if (!String(data[i][4]).toLowerCase().includes(treatmentType)) continue;
      const logDate = _parseDate(String(data[i][2]));
      if (logDate && Math.abs(logDate - targetDate) / (1000*60*60*24) <= 7) return true;
    }
  } catch(e) {}
  return false;
}

function _runOverdueHarvestCheck() {
  const cropSheet = _getSheet("CropTracking");
  if (!cropSheet) return [];
  const data  = cropSheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueAlerts = [];

  for (let i = 1; i < data.length; i++) {
    const status = String(data[i][13]);
    if (!["Active","Transplanted","Flowering","Seedling"].includes(status)) continue;
    const harvestEstimate = _parseDate(String(data[i][7]));
    if (!harvestEstimate) continue;
    harvestEstimate.setHours(0, 0, 0, 0);
    const daysOverdue = Math.round((today - harvestEstimate) / (1000*60*60*24));
    const notes = String(data[i][14] || "");
    if (daysOverdue > 7 && !notes.includes("HARVEST_ALERT_SENT")) {
      overdueAlerts.push({
        cropName: String(data[i][1]), trackingID: String(data[i][0]),
        harvestEstimate, daysOverdue, rowIndex: i+1, currentNotes: notes,
        chatId: String(data[i][15]) || CONFIG.TELEGRAM_CHAT_ID
      });
    }
  }

  if (overdueAlerts.length === 0) return [];

  // Send individual overdue alerts per-crop (separate from daily summary)
  overdueAlerts.forEach(function(alert) {
    let msg  = "⚠️ <b>Overdue Harvest Alert</b>\n";
    msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
    msg += "🌿 Crop: <b>" + alert.cropName + "</b>\n";
    msg += "📅 Est. harvest: " + _formatDate(alert.harvestEstimate) + "\n";
    msg += "⏰ <b>" + alert.daysOverdue + " days overdue</b>\n";
    msg += "\nTo log harvest:\n<code>harvested - today\n" + alert.trackingID + "</code>\n";
    msg += "\n🆔 <code>" + alert.trackingID + "</code>";
    _tgSend(msg, alert.chatId);

    const updated = alert.currentNotes
      ? alert.currentNotes + " | HARVEST_ALERT_SENT:" + _formatDateShort(today)
      : "HARVEST_ALERT_SENT:" + _formatDateShort(today);
    _updateCell("CropTracking", alert.rowIndex, 15, updated);
  });

  return overdueAlerts;
}

// Keep old name as alias so nothing breaks if called directly
function _runOverdueHarvestAlerts() { return _runOverdueHarvestCheck(); }


// ══════════════════════════════════════════════════════
//  MANUAL UTILITIES
// ══════════════════════════════════════════════════════

function stopSystem() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log("All triggers deleted.");
}

function runMissedDateScanNow() {
  Logger.log("Running manual missed-date scan...");
  _runMissedDateCleanup();
  _runTrackerMissedDateScan();
  Logger.log("Done.");
}

function testSendTelegramMessage() {
  _tgSend("🌱 CropManager v9 is connected!\n\nYour bot is working. Send /help to see all commands.", CONFIG.TELEGRAM_CHAT_ID);
  Logger.log("Test message sent.");
}

function testSerpApiSearch() {
  const result = _serpApiSearchCrop("cabbage");
  Logger.log("SerpAPI result: " + JSON.stringify(result));
}

function testCropParsing() {
  const fields = _parseFields(
    "data type - crop\ncrop name - Tomatoes\ndate - 2026-03-01\nplanting method - Seed tray\nstage - Seed");
  Logger.log("Fields: " + JSON.stringify(fields));
  const cropData = _lookupCrop(fields["crop name"] || "");
  Logger.log(cropData ? "Found: " + cropData.display_name : "Not found.");
}


// ══════════════════════════════════════════════════════
//  DATE FORMAT UTILITY
// ══════════════════════════════════════════════════════

/**
 * ★ Run this ONCE to fix all date formats across all sheets.
 * Converts any date value to display as "January 3, 2026" (MMMM d, yyyy).
 * Skips header rows, empty cells, and non-date values.
 * Fixes "1899-12-31" sentinel values by clearing them.
 */
function fixAllDateFormats() {
  const ss      = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheets  = ss.getSheets();
  const fmt     = 'mmmm d, yyyy';   // e.g. January 3, 2026
  const EPOCH   = new Date(1899, 11, 30).getTime(); // GAS date epoch base

  let totalFixed = 0;
  let totalCleared = 0;

  sheets.forEach(function(sheet) {
    const name    = sheet.getName();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return;

    // Get all data values and display values
    const dataRange    = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const values       = dataRange.getValues();
    const displayVals  = dataRange.getDisplayValues();
    let sheetFixed = 0, sheetCleared = 0;

    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        const val     = values[r][c];
        const display = displayVals[r][c];

        // Skip empty
        if (val === '' || val === null || val === undefined) continue;

        const cell = sheet.getRange(r + 2, c + 1);

        // Case 1: Already a proper JS Date object
        if (val instanceof Date) {
          const yr = val.getFullYear();
          // Sentinel: 1899 or 1900 = broken/empty date stored as date
          if (yr <= 1900) {
            cell.clearContent();
            sheetCleared++;
            continue;
          }
          // Valid date — apply format
          cell.setNumberFormat(fmt);
          sheetFixed++;
          continue;
        }

        // Case 2: String that looks like a date
        if (typeof val === 'string' && val.trim() !== '') {
          const str = val.trim();

          // "1899-12-31" or "12-31-1899" sentinel strings → clear
          if (str.startsWith('1899') || str.endsWith('1899') ||
              str.startsWith('1900') || str.endsWith('1900')) {
            cell.clearContent();
            sheetCleared++;
            continue;
          }

          // Try parsing: handles DD-MM-YYYY, YYYY-MM-DD, MM/DD/YYYY etc.
          let parsed = null;

          // DD-MM-YYYY or DD-MM-YY
          let m = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
          if (m) {
            const day = parseInt(m[1],10), mon = parseInt(m[2],10), yr = parseInt(m[3],10);
            const fullYr = yr < 100 ? 2000 + yr : yr;
            if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
              parsed = new Date(fullYr, mon - 1, day);
            }
          }

          // YYYY-MM-DD
          if (!parsed) {
            m = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
            if (m) {
              const yr = parseInt(m[1],10), mon = parseInt(m[2],10), day = parseInt(m[3],10);
              if (yr > 1900 && mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
                parsed = new Date(yr, mon - 1, day);
              }
            }
          }

          // "Month D, YYYY" already formatted — just apply format
          if (!parsed) {
            const already = new Date(str);
            if (!isNaN(already.getTime()) && already.getFullYear() > 1900) {
              parsed = already;
            }
          }

          if (parsed && !isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
            cell.setValue(parsed).setNumberFormat(fmt);
            sheetFixed++;
          }
        }
      }
    }

    if (sheetFixed + sheetCleared > 0) {
      Logger.log(name + ': fixed ' + sheetFixed + ' dates, cleared ' + sheetCleared + ' sentinel values');
    }
    totalFixed   += sheetFixed;
    totalCleared += sheetCleared;
  });

  Logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  Logger.log('✅ Done! ' + totalFixed + ' dates reformatted, ' + totalCleared + ' bad values cleared.');
  Logger.log('All dates now display as "January 3, 2026"');
}



// ══════════════════════════════════════════════════════
//  DATABASE EDIT FLOW
//  Triggered by "edit db" or "edit database" message, or menu button.
//  Lets you change number_of_weeks_harvest, growing_time_days,
//  batch_offset_days, harvest_interval, transplant_days, or
//  growing_from_transplant for any crop — stored in
//  CropDatabase_Adjustments sheet (no code changes needed).
//  Optional: set per-variety overrides.
// ══════════════════════════════════════════════════════

const DB_EDIT_FIELDS = [
  { key: "growing_time_days",        label: "Growing time (days to harvest)" },
  { key: "batch_offset_days",        label: "Batch offset (days between plantings)" },
  { key: "number_of_weeks_harvest",  label: "Weeks of harvest" },
  { key: "harvest_interval",         label: "Harvest interval (days between picks)" },
  { key: "transplant_days",          label: "Transplant days (days in seed tray)" },
  { key: "growing_from_transplant",  label: "Growing days after transplant" },
  { key: "germination_days_min",     label: "Germination min days" },
  { key: "germination_days_max",     label: "Germination max days" },
];

function _startDbEditFlow(chatId) {
  _setSession(chatId, { type: "db_edit", step: "crop_name" });
  _tgSend(
    "🗄️ <b>Edit Crop Database</b>\n\n" +
    "Which <b>crop</b> do you want to adjust?\n" +
    "<i>e.g. Tomato, Kale, Okra</i>\n\n" +
    "Send /cancel to quit.",
    chatId
  );
}

function _continueDbEditFlow(session, input, chatId) {
  switch (session.step) {

    case "crop_name": {
      const cropData = _lookupCrop(input.trim());
      if (!cropData) {
        _tgSend("❌ Crop not found: <i>" + input + "</i>. Try again.", chatId);
        return;
      }
      session.editCropName = cropData.display_name;
      session.editCropKey  = cropData.display_name.toLowerCase();
      session.editCropData = cropData;
      session.step         = "variety_opt";
      _setSession(chatId, session);

      const varieties = cropData.varieties || [];
      if (varieties.length > 0) {
        const rows = [];
        for (let i = 0; i < varieties.length; i += 2) {
          const row = [["🌿 " + varieties[i], "dbedit:var:" + varieties[i]]];
          if (varieties[i+1]) row.push(["🌿 " + varieties[i+1], "dbedit:var:" + varieties[i+1]]);
          rows.push(row);
        }
        rows.push([["📋 All varieties (general)", "dbedit:var:_all"]]);
        _tgSendButtons(
          "🌿 Adjust for a specific <b>variety</b> of <b>" + cropData.display_name + "</b> or for all?",
          rows, chatId
        );
      } else {
        session.editVariety = null;
        session.step        = "field";
        _setSession(chatId, session);
        _askDbEditField(session, chatId);
      }
      break;
    }

    case "variety_opt": {
      // text fallback
      const v = input.trim();
      session.editVariety = (v.toLowerCase() === "all" || v.toLowerCase() === "none") ? null : v;
      session.step        = "field";
      _setSession(chatId, session);
      _askDbEditField(session, chatId);
      break;
    }

    case "field": {
      // text fallback: accept field number or name
      const idx = parseInt(input.trim()) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < DB_EDIT_FIELDS.length) {
        session.editField = DB_EDIT_FIELDS[idx].key;
        session.step      = "new_value";
        _setSession(chatId, session);
        _askDbEditValue(session, chatId);
      } else {
        _tgSend("❌ Please tap a button or type a number (1-" + DB_EDIT_FIELDS.length + ").", chatId);
      }
      break;
    }

    case "new_value": {
      const num = parseFloat(input.trim());
      if (isNaN(num) || num <= 0) {
        _tgSend("❌ Please enter a positive number.", chatId);
        return;
      }
      session.editNewValue = num;
      session.step         = "confirm";
      _setSession(chatId, session);

      const fieldLabel = (DB_EDIT_FIELDS.find(f => f.key === session.editField) || {}).label || session.editField;
      const cropData2  = session.editCropData;
      const oldVal     = cropData2[session.editField] || "not set";
      let msg  = "📋 <b>Confirm Change</b>\n\n";
      msg += "🌿 Crop: <b>" + session.editCropName + "</b>\n";
      if (session.editVariety) msg += "🌱 Variety: <b>" + session.editVariety + "</b>\n";
      msg += "📊 Field: <b>" + fieldLabel + "</b>\n";
      msg += "📉 Current (DB default): <b>" + oldVal + "</b>\n";
      msg += "📈 New value: <b>" + num + "</b>\n\n";
      msg += "Save this change?";
      _tgSendButtons(msg,
        [[["✅ Yes, Save", "dbedit:confirm"], ["❌ Cancel", "dbedit:cancel"]]],
        chatId
      );
      break;
    }

    case "confirm": {
      if (input.trim().toLowerCase() === "yes") {
        _saveDbEdit(session, chatId);
      } else {
        _clearSession(chatId);
        _tgSend("❌ Edit cancelled.", chatId);
      }
      break;
    }
  }
}

function _askDbEditField(session, chatId) {
  const rows = [];
  for (let i = 0; i < DB_EDIT_FIELDS.length; i += 2) {
    const row = [[(i+1) + ". " + DB_EDIT_FIELDS[i].label, "dbedit:field:" + DB_EDIT_FIELDS[i].key]];
    if (DB_EDIT_FIELDS[i+1]) row.push([(i+2) + ". " + DB_EDIT_FIELDS[i+1].label, "dbedit:field:" + DB_EDIT_FIELDS[i+1].key]);
    rows.push(row);
  }
  _tgSendButtons(
    "📊 <b>Which field to edit for " + session.editCropName +
    (session.editVariety ? " (" + session.editVariety + ")" : "") + "?</b>",
    rows, chatId
  );
}

function _askDbEditValue(session, chatId) {
  const fieldLabel = (DB_EDIT_FIELDS.find(f => f.key === session.editField) || {}).label || session.editField;
  const cropData   = session.editCropData;
  const current    = cropData[session.editField] || "not set";
  _tgSend(
    "✏️ <b>" + fieldLabel + "</b> for <b>" + session.editCropName + "</b>" +
    (session.editVariety ? " (" + session.editVariety + ")" : "") + "\n\n" +
    "Current DB value: <b>" + current + "</b>\n\n" +
    "Enter the new value (number):",
    chatId
  );
}

function _saveDbEdit(session, chatId) {
  const sheet = _getSheet("CropDatabase_Adjustments");
  if (!sheet) { _tgSend("❌ CropDatabase_Adjustments sheet not found.", chatId); return; }

  const data   = sheet.getDataRange().getValues();
  const cropKey = session.editCropKey;
  const variety = (session.editVariety || "").trim();
  const field   = session.editField;
  const newVal  = session.editNewValue;
  const oldDb   = session.editCropData[field] || 0;

  // Check for existing row
  let existingRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === cropKey.toLowerCase() &&
        String(data[i][1]).trim().toLowerCase() === variety.toLowerCase() &&
        String(data[i][2]) === field) {
      existingRow = i + 1; break;
    }
  }

  if (existingRow === -1) {
    // New row: CropKey | Variety | Field | DB Default | Your Average | Sample Count | Use Custom | Last Updated
    sheet.appendRow([cropKey, variety, field, oldDb, newVal, 1, "Yes", _formatDateShort(new Date())]);
  } else {
    sheet.getRange(existingRow, 5).setValue(newVal);
    sheet.getRange(existingRow, 7).setValue("Yes");
    sheet.getRange(existingRow, 8).setValue(_formatDateShort(new Date()));
  }

  _clearSession(chatId);
  const fieldLabel = (DB_EDIT_FIELDS.find(f => f.key === field) || {}).label || field;
  let reply  = "✅ <b>Database Updated</b>\n\n";
  reply += "🌿 Crop: <b>" + session.editCropName + "</b>\n";
  if (variety) reply += "🌱 Variety: <b>" + variety + "</b>\n";
  reply += "📊 " + fieldLabel + ": <b>" + oldDb + " → " + newVal + "</b>\n";
  reply += "\n<i>New plantings of this crop will use your custom value.</i>\n";
  reply += "<i>To remove it, delete the row in CropDatabase_Adjustments sheet.</i>";
  _tgSend(reply, chatId);
}


// ══════════════════════════════════════════════════════
//  WEATHER — Open-Meteo (free, no API key)
// ══════════════════════════════════════════════════════

/**
 * Fetch 7-day daily forecast from Open-Meteo.
 * Returns array of { date, maxTemp, minTemp, precipitation, weatherCode, description }
 * or null on error.
 */
function _fetchWeather(days) {
  days = days || 7;
  try {
    const url = "https://api.open-meteo.com/v1/forecast" +
      "?latitude="  + CONFIG.WEATHER_LAT +
      "&longitude=" + CONFIG.WEATHER_LON +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode" +
      "&timezone=America%2FJamaica" +
      "&forecast_days=" + days;
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    const json = JSON.parse(resp.getContentText());
    if (!json.daily) return null;
    const d = json.daily;
    return d.time.map(function(t, i) {
      return {
        date:          new Date(t + "T12:00:00"),
        dateStr:       t,
        maxTemp:       d.temperature_2m_max[i],
        minTemp:       d.temperature_2m_min[i],
        precipitation: d.precipitation_sum[i],
        weatherCode:   d.weathercode[i],
        description:   _weatherCodeLabel(d.weathercode[i]),
        emoji:         _weatherCodeEmoji(d.weathercode[i])
      };
    });
  } catch(e) {
    Logger.log("_fetchWeather error: " + e.message);
    return null;
  }
}

function _weatherCodeLabel(code) {
  if (code === 0)              return "Clear sky";
  if (code <= 3)               return "Partly cloudy";
  if (code <= 49)              return "Foggy / hazy";
  if (code <= 59)              return "Drizzle";
  if (code <= 69)              return "Rain";
  if (code <= 79)              return "Snow / sleet";
  if (code <= 82)              return "Rain showers";
  if (code <= 84)              return "Snow showers";
  if (code <= 99)              return "Thunderstorm";
  return "Unknown";
}

function _weatherCodeEmoji(code) {
  if (code === 0)              return "☀️";
  if (code <= 2)               return "🌤️";
  if (code === 3)              return "☁️";
  if (code <= 49)              return "🌫️";
  if (code <= 59)              return "🌦️";
  if (code <= 69)              return "🌧️";
  if (code <= 79)              return "🌨️";
  if (code <= 82)              return "🌦️";
  if (code <= 99)              return "⛈️";
  return "🌡️";
}

/**
 * Send a 7-day weather forecast to Telegram.
 */
function _sendWeatherForecast(chatId) {
  const forecast = _fetchWeather(7);
  if (!forecast) {
    _tgSend("⚠️ Could not fetch weather data right now. Try again in a moment.", chatId);
    return;
  }

  const tz   = Session.getScriptTimeZone();
  let msg    = "🌦️ <b>7-Day Forecast — " + CONFIG.WEATHER_LOCATION + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  forecast.forEach(function(day) {
    const dayName = Utilities.formatDate(day.date, tz, "EEE dd MMM");
    const rain    = day.precipitation > 0 ? " 🌧️ " + day.precipitation.toFixed(1) + "mm" : "";
    const warn    = day.precipitation >= CONFIG.RAIN_THRESHOLD_MM ? " ⚠️" : "";
    msg += day.emoji + " <b>" + dayName + "</b>  " +
           Math.round(day.maxTemp) + "°/" + Math.round(day.minTemp) + "°C" +
           rain + warn + "\n";
    msg += "   " + day.description + "\n\n";
  });

  // Spray warnings
  const sprayWarnings = _getSprayWeatherWarnings(forecast);
  if (sprayWarnings.length > 0) {
    msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
    msg += "⚠️ <b>Spray Schedule Conflicts:</b>\n";
    sprayWarnings.forEach(function(w) { msg += "  • " + w + "\n"; });
  }

  _tgSend(msg, chatId);
}

/**
 * Check if any upcoming spray reminders fall on rainy days.
 * Returns array of warning strings.
 */
function _getSprayWeatherWarnings(forecast) {
  if (!forecast) return [];
  const rainyDates = {};
  forecast.forEach(function(day) {
    if (day.precipitation >= CONFIG.RAIN_THRESHOLD_MM) {
      rainyDates[day.dateStr] = day.precipitation;
    }
  });
  if (Object.keys(rainyDates).length === 0) return [];

  const warnings = [];
  try {
    const sheet = _getSheet("ReminderQueue");
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][7]) === "Yes") continue;  // already sent
      const type = String(data[i][1]);
      if (!type.includes("spray")) continue;
      const sendDate = _formatDateISO(data[i][4]);
      if (sendDate && rainyDates[sendDate]) {
        warnings.push(data[i][2] + " " + type.replace("_"," ") +
          " on " + data[i][4] + " — " + rainyDates[sendDate].toFixed(1) + "mm rain expected. Consider rescheduling.");
      }
    }
  } catch(e) {}
  return warnings;
}

/**
 * Daily trigger: check weather + send spray conflict warnings.
 */
function checkWeatherAndWarnSprays() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.length < 10) return;
  const forecast = _fetchWeather(7);
  if (!forecast) return;

  const warnings = _getSprayWeatherWarnings(forecast);
  if (warnings.length === 0) return;

  let msg = "⛈️ <b>Weather Spray Warning</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "Rain is forecast on days when you have sprays scheduled:\n\n";
  warnings.forEach(function(w) { msg += "⚠️ " + w + "\n\n"; });
  msg += "<i>Tip: spray after rain passes, or at least 4 hours before rain starts.</i>";
  _tgSend(msg, CONFIG.TELEGRAM_CHAT_ID);
}

function _formatDateISO(val) {
  try {
    const d = _parseDate(String(val));
    if (!d) return null;
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch(e) { return null; }
}


// ══════════════════════════════════════════════════════
//  TODAY BRIEFING — /today
// ══════════════════════════════════════════════════════

function _sendTodayBriefing(chatId) {
  const today    = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = Utilities.formatDate(today, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const tz       = Session.getScriptTimeZone();

  let msg  = "📅 <b>Today's Briefing — " + _formatDate(today) + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  // ── 1. Weather snippet ─────────────────────────────
  const forecast = _fetchWeather(1);
  if (forecast && forecast[0]) {
    const w = forecast[0];
    msg += w.emoji + " <b>Weather:</b> " + w.description + "  " +
           Math.round(w.maxTemp) + "°/" + Math.round(w.minTemp) + "°C";
    if (w.precipitation > 0) msg += "  🌧️ " + w.precipitation.toFixed(1) + "mm";
    msg += "\n\n";
  }

  // ── 2. Due reminders ──────────────────────────────
  const dueItems = _getDueRemindersToday();
  if (dueItems.length > 0) {
    msg += "🔔 <b>Due Today (" + dueItems.length + ")</b>\n";
    dueItems.forEach(function(r) {
      msg += "  • " + _reminderTypeEmoji(r.type) + " " + r.cropName + " — " + r.subject + "\n";
    });
    msg += "\n";
  }

  // ── 3. Crops ready to harvest ────────────────────
  const harvestReady = _getCropsReadyToday();
  if (harvestReady.length > 0) {
    msg += "🥬 <b>Ready to Harvest</b>\n";
    harvestReady.forEach(function(r) {
      msg += "  🌿 " + r.cropName + (r.variety ? " (" + r.variety + ")" : "") +
             "  🆔 <code>" + r.id + "</code>\n";
    });
    msg += "\n";
  }

  // ── 4. Transplant due ────────────────────────────
  const transplantDue = _getCropsTransplantDueToday();
  if (transplantDue.length > 0) {
    msg += "🌱 <b>Transplant Due</b>\n";
    transplantDue.forEach(function(r) {
      msg += "  🌿 " + r.cropName + "  🆔 <code>" + r.id + "</code>\n";
    });
    msg += "\n";
  }

  // ── 5. Planting reminders ────────────────────────
  const plantingDue = _getNewBatchDueToday();
  if (plantingDue.length > 0) {
    msg += "📅 <b>Plant New Batch Today</b>\n";
    plantingDue.forEach(function(r) {
      msg += "  🌱 " + r.cropName + " (Batch " + r.batch + ")\n";
    });
    msg += "\n";
  }

  // ── 6. Nothing on? ───────────────────────────────
  if (!forecast && dueItems.length === 0 && harvestReady.length === 0 &&
      transplantDue.length === 0 && plantingDue.length === 0) {
    msg += "✅ Nothing due today. Your crops are happy!\n";
  }

  _tgSend(msg, chatId);
}

function _getDueRemindersToday() {
  const results = [];
  const today = new Date(); today.setHours(0,0,0,0);
  try {
    const sheet = _getSheet("ReminderQueue");
    if (!sheet) return results;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][7]) === "Yes") continue;
      const d = _parseDate(String(data[i][4]));
      if (!d) continue;
      d.setHours(0,0,0,0);
      if (d.getTime() === today.getTime()) {
        results.push({ type: String(data[i][1]), cropName: String(data[i][2]),
                       trackingID: String(data[i][3]), subject: String(data[i][5]) });
      }
    }
  } catch(e) {}
  return results;
}

function _reminderTypeEmoji(type) {
  const map = { germination_check:"🌱", harvest:"🥬", transplant:"🌱",
                spray_fungus:"🍄", spray_pest:"🐛", next_planting:"📅",
                rooting_check:"🌿" };
  return map[type] || "🔔";
}

function _getCropsReadyToday() {
  const results = [];
  const today = new Date(); today.setHours(0,0,0,0);
  try {
    const sheet = _getSheet("CropTracking");
    if (!sheet) return results;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][13]);
      if (!["Active","Transplanted","Flowering","Seedling"].includes(status)) continue;
      const hd = _parseDate(String(data[i][9]));  // col 9 = HarvestEst
      if (!hd) continue;
      hd.setHours(0,0,0,0);
      if (hd.getTime() === today.getTime()) {
        results.push({ id: String(data[i][0]), cropName: String(data[i][1]),
                       variety: String(data[i][2]) });
      }
    }
  } catch(e) {}
  return results;
}

function _getCropsTransplantDueToday() {
  const results = [];
  const today = new Date(); today.setHours(0,0,0,0);
  try {
    const sheet = _getSheet("CropTracking");
    if (!sheet) return results;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][15]) !== "Active") continue;  // Status col 15
      const td = _parseDate(String(data[i][6]));       // TransplantSched col 6
      if (!td) continue;
      td.setHours(0,0,0,0);
      if (td.getTime() === today.getTime()) {
        results.push({ id: String(data[i][0]), cropName: String(data[i][1]) });
      }
    }
  } catch(e) {}
  return results;
}

function _getNewBatchDueToday() {
  const results = [];
  const today = new Date(); today.setHours(0,0,0,0);
  try {
    const sheet = _getSheet("ReminderQueue");
    if (!sheet) return results;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) !== "next_planting") continue;
      if (String(data[i][7]) === "Yes") continue;
      const d = _parseDate(String(data[i][4]));
      if (!d) continue;
      d.setHours(0,0,0,0);
      if (d.getTime() === today.getTime()) {
        const batchMatch = String(data[i][5]).match(/Batch (\d+)/);
        results.push({ cropName: String(data[i][2]),
                       batch: batchMatch ? batchMatch[1] : "?" });
      }
    }
  } catch(e) {}
  return results;
}


// ══════════════════════════════════════════════════════
//  WEEK AHEAD — /week
// ══════════════════════════════════════════════════════

function _sendWeekAhead(chatId) {
  const tz    = Session.getScriptTimeZone();
  const today = new Date(); today.setHours(0,0,0,0);

  // Build a map of what's happening each day this week
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    days.push({ date: d, iso: Utilities.formatDate(d, tz, "yyyy-MM-dd"),
                label: Utilities.formatDate(d, tz, "EEE dd MMM"), events: [] });
  }
  const dayMap = {};
  days.forEach(function(d) { dayMap[d.iso] = d; });

  // Pull reminders
  try {
    const sheet = _getSheet("ReminderQueue");
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][7]) === "Yes") continue;
        const iso = _formatDateISO(data[i][4]);
        if (iso && dayMap[iso]) {
          dayMap[iso].events.push(_reminderTypeEmoji(String(data[i][1])) +
            " " + String(data[i][2]) + ": " + _reminderTypeLabel(String(data[i][1])));
        }
      }
    }
  } catch(e) {}

  // Pull harvest dates
  try {
    const sheet = _getSheet("CropTracking");
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        const status = String(data[i][13]);
        if (!["Active","Transplanted","Flowering","Seedling"].includes(status)) continue;
        const iso = _formatDateISO(data[i][7]);
        if (iso && dayMap[iso]) {
          dayMap[iso].events.push("🥬 " + String(data[i][1]) + ": Harvest ready");
        }
      }
    }
  } catch(e) {}

  // Fetch weather
  const forecast = _fetchWeather(7);
  const weatherMap = {};
  if (forecast) {
    forecast.forEach(function(w) { weatherMap[w.dateStr] = w; });
  }

  let msg = "📆 <b>Week Ahead — " + days[0].label + " → " + days[6].label + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  days.forEach(function(day) {
    const w = weatherMap[day.iso];
    const weatherSnip = w
      ? w.emoji + " " + Math.round(w.maxTemp) + "°" + (w.precipitation >= CONFIG.RAIN_THRESHOLD_MM ? " 🌧️" : "")
      : "";
    msg += "<b>" + day.label + "</b>  " + weatherSnip + "\n";
    if (day.events.length === 0) {
      msg += "  — Nothing scheduled\n";
    } else {
      day.events.forEach(function(e) { msg += "  • " + e + "\n"; });
    }
    msg += "\n";
  });

  _tgSend(msg, chatId);
}

function _reminderTypeLabel(type) {
  const map = { germination_check:"Germination check", harvest:"Harvest",
                transplant:"Transplant", spray_fungus:"Fungus spray",
                spray_pest:"Pest spray", next_planting:"Plant new batch",
                rooting_check:"Rooting check" };
  return map[type] || type;
}


// ══════════════════════════════════════════════════════
//  ACTIVE CROPS LIST — /crops
// ══════════════════════════════════════════════════════

function _sendActiveCropsList(chatId) {
  const today = new Date(); today.setHours(0,0,0,0);
  let msg = "🌿 <b>Active Crops</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  try {
    const sheet = _getSheet("CropTracking");
    if (!sheet) { _tgSend("No CropTracking sheet found.", chatId); return; }
    const data = sheet.getDataRange().getValues();
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][15]);   // col 15 = Status
      const active = ["Active","Transplanted","Seedling","Flowering","Ready to Harvest"];
      if (!active.includes(status)) continue;
      count++;
      const planted  = _parseDate(String(data[i][5]));  // col 5 = PlantingDate
      const harvest  = _parseDate(String(data[i][9]));  // col 9 = HarvestEst
      const dayAge   = planted ? Math.round((today - planted) / 86400000) : "?";
      const daysLeft = harvest ? Math.round((harvest - today) / 86400000) : null;
      const variety  = String(data[i][2]) ? " (" + data[i][2] + ")" : "";  // col 2 = Variety

      msg += "🌱 <b>" + data[i][1] + variety + "</b>  [" + status + "]\n";
      msg += "   Day <b>" + dayAge + "</b>";
      if (daysLeft !== null) {
        if (daysLeft < 0)       msg += "  ⏰ <b>" + Math.abs(daysLeft) + " days overdue</b>";
        else if (daysLeft === 0) msg += "  🥬 <b>Ready today!</b>";
        else                     msg += "  🥬 " + daysLeft + " days to harvest";
      }
      msg += "\n   🆔 <code>" + data[i][0] + "</code>\n\n";
    }
    if (count === 0) msg += "No active crops.\n";
    else msg += "<i>" + count + " active crop(s) total.</i>";
  } catch(e) {
    msg += "❌ Error reading crops: " + e.message;
  }
  _tgSend(msg, chatId);
}


// ══════════════════════════════════════════════════════
//  HARVEST REPORT — /harvest report
// ══════════════════════════════════════════════════════

function _sendHarvestReport(chatId) {
  let msg = "📈 <b>Harvest Report</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  try {
    const sheet = _getSheet("HarvestLog");
    if (!sheet) { _tgSend("No HarvestLog found — log your first harvest to start tracking.", chatId); return; }
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) { _tgSend("No harvests logged yet.", chatId); return; }

    // Group by crop name
    const byName = {};
    for (let i = 1; i < data.length; i++) {
      const name = String(data[i][1]);
      if (!byName[name]) byName[name] = { count: 0, days: [], deviations: [] };
      byName[name].count++;
      if (data[i][4]) byName[name].days.push(parseFloat(data[i][4]));
      if (data[i][5]) byName[name].deviations.push(parseFloat(data[i][5]));
    }

    const names = Object.keys(byName).sort();
    names.forEach(function(name) {
      const d = byName[name];
      const avgDays = d.days.length
        ? (d.days.reduce(function(a,b){return a+b;},0) / d.days.length).toFixed(0) : "?";
      const avgDev  = d.deviations.length
        ? (d.deviations.reduce(function(a,b){return a+b;},0) / d.deviations.length).toFixed(0) : "?";
      const devLabel = avgDev === "?" ? "" :
        (parseFloat(avgDev) > 0 ? "  ⏰ avg " + avgDev + "d late" :
         parseFloat(avgDev) < 0 ? "  🚀 avg " + Math.abs(avgDev) + "d early" : "  ✅ on time");

      msg += "🌿 <b>" + name + "</b>  ×" + d.count + " harvest(s)\n";
      msg += "   Avg days to harvest: <b>" + avgDays + "</b>" + devLabel + "\n\n";
    });

    // Total
    const total = Object.values(byName).reduce(function(s, d) { return s + d.count; }, 0);
    msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n";
    msg += "Total logged harvests: <b>" + total + "</b>\n";
    msg += "Crop types harvested: <b>" + names.length + "</b>";
  } catch(e) {
    msg += "❌ Error: " + e.message;
  }
  _tgSend(msg, chatId);
}


// ══════════════════════════════════════════════════════
//  SUCCESSION GAP ANALYSIS — /gaps
// ══════════════════════════════════════════════════════

function _sendSuccessionGapAnalysis(chatId) {
  const today = new Date(); today.setHours(0,0,0,0);
  const tz    = Session.getScriptTimeZone();

  // Build a 12-week calendar of harvest coverage
  const weeks = [];
  for (let w = 0; w < 12; w++) {
    const start = new Date(today); start.setDate(today.getDate() + w * 7);
    const end   = new Date(start); end.setDate(start.getDate() + 6);
    weeks.push({ start, end, crops: [] });
  }

  try {
    const sheet = _getSheet("CropTracking");
    if (!sheet) { _tgSend("No CropTracking data found.", chatId); return; }
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][13]);
      if (["Deleted","Harvested","Failed"].includes(status)) continue;

      const harvestDate  = _parseDate(String(data[i][9]));  // col 9 = HarvestEst
      if (!harvestDate) continue;
      harvestDate.setHours(0,0,0,0);

      // Lookup weeks_harvest from DB
      const cropData = _lookupCrop(String(data[i][1]));
      const weeksH   = cropData ? (cropData.number_of_weeks_harvest || 1) : 1;
      const harvestEnd = new Date(harvestDate);
      harvestEnd.setDate(harvestDate.getDate() + weeksH * 7);

      const cropName2 = String(data[i][1]) + (String(data[i][2]) ? " (" + data[i][2] + ")" : "");

      weeks.forEach(function(week) {
        // Crop covers this week if its harvest window overlaps
        if (harvestDate <= week.end && harvestEnd >= week.start) {
          if (!week.crops.includes(cropName2)) week.crops.push(cropName2);
        }
      });
    }
  } catch(e) {}

  let msg = "📉 <b>Succession Gap Analysis — Next 12 Weeks</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  let gapCount = 0;

  weeks.forEach(function(week, idx) {
    const wLabel = Utilities.formatDate(week.start, tz, "dd MMM") +
                   " – " + Utilities.formatDate(week.end, tz, "dd MMM");
    if (week.crops.length === 0) {
      gapCount++;
      msg += "🔴 <b>Wk " + (idx+1) + " " + wLabel + "</b> — NO harvest\n";
    } else {
      msg += "🟢 Wk " + (idx+1) + " " + wLabel + " — " + week.crops.join(", ") + "\n";
    }
  });

  msg += "\n━━━━━━━━━━━━━━━━━━━━━━━━\n";
  if (gapCount === 0) {
    msg += "✅ No gaps — continuous harvest coverage for 12 weeks!";
  } else {
    msg += "⚠️ " + gapCount + " week(s) with no harvest.\n";
    msg += "<i>Send <code>crop</code> to fill the gaps.</i>";
  }
  _tgSend(msg, chatId);
}


// ══════════════════════════════════════════════════════
//  WEEKLY DIGEST — runs every Monday 6 AM
// ══════════════════════════════════════════════════════

function sendWeeklyDigest() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.length < 10) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const tz    = Session.getScriptTimeZone();

  let msg = "🌿 <b>Weekly Digest — w/c " + Utilities.formatDate(today, tz, "dd MMM yyyy") + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  // ── 1. Weather this week ───────────────────────────
  const forecast = _fetchWeather(7);
  if (forecast) {
    msg += "🌦️ <b>Weather This Week</b>\n";
    let rainyDays = 0;
    forecast.forEach(function(day) {
      const dayLabel = Utilities.formatDate(day.date, tz, "EEE");
      const rain = day.precipitation > 0 ? " " + day.precipitation.toFixed(0) + "mm" : "";
      if (day.precipitation >= CONFIG.RAIN_THRESHOLD_MM) rainyDays++;
      msg += day.emoji + " " + dayLabel + ": " + Math.round(day.maxTemp) + "°" + rain + "  ";
    });
    msg += "\n";
    if (rainyDays > 0) msg += "⚠️ " + rainyDays + " rainy day(s) — check spray schedule!\n";
    msg += "\n";
  }

  // ── 2. Upcoming actions this week ─────────────────
  const endOfWeek = new Date(today); endOfWeek.setDate(today.getDate() + 7);
  const upcoming = [];
  try {
    const sheet = _getSheet("ReminderQueue");
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][7]) === "Yes") continue;
        const d = _parseDate(String(data[i][4]));
        if (!d) continue;
        d.setHours(0,0,0,0);
        if (d >= today && d <= endOfWeek) {
          upcoming.push({ date: d, type: String(data[i][1]),
                          crop: String(data[i][2]), subject: String(data[i][5]) });
        }
      }
    }
  } catch(e) {}

  if (upcoming.length > 0) {
    upcoming.sort(function(a,b){return a.date-b.date;});
    msg += "🔔 <b>This Week's Actions (" + upcoming.length + ")</b>\n";
    upcoming.forEach(function(u) {
      msg += "  " + _reminderTypeEmoji(u.type) + " " +
             Utilities.formatDate(u.date, tz, "EEE dd") + " — " +
             u.crop + ": " + _reminderTypeLabel(u.type) + "\n";
    });
    msg += "\n";
  } else {
    msg += "📭 No reminders this week.\n\n";
  }

  // ── 3. Crops with no upcoming batch (gap warning) ─
  const gapWarnings = _checkBatchGaps();
  if (gapWarnings.length > 0) {
    msg += "⚠️ <b>Batch Planting Overdue</b>\n";
    gapWarnings.forEach(function(g) {
      msg += "  🌱 " + g.cropName + " — batch " + g.nextBatch + " was due " + g.daysLate + " day(s) ago\n";
    });
    msg += "\n";
  }

  // ── 4. Active crop count summary ──────────────────
  try {
    const sheet = _getSheet("CropTracking");
    if (sheet) {
      const data  = sheet.getDataRange().getValues();
      let active  = 0, ready = 0;
      for (let i = 1; i < data.length; i++) {
        const s = String(data[i][13]);
        if (["Active","Transplanted","Seedling","Flowering"].includes(s)) active++;
        if (s === "Ready to Harvest") ready++;
      }
      msg += "🌿 Active crops: <b>" + active + "</b>";
      if (ready > 0) msg += "  🥬 Ready to harvest: <b>" + ready + "</b>";
      msg += "\n";
    }
  } catch(e) {}

  _refreshWeeklyPin();    // refresh pinned week view
  _tgSend(msg, CONFIG.TELEGRAM_CHAT_ID);
}

/**
 * Returns crops where the next batch planting date has passed but no new batch was logged.
 */
function _checkBatchGaps() {
  const gaps  = [];
  const today = new Date(); today.setHours(0,0,0,0);
  try {
    const sheet = _getSheet("CropTracking");
    if (!sheet) return gaps;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][15]);  // col 15 = Status
      if (!["Active","Transplanted","Seedling","Flowering"].includes(status)) continue;
      const nextPlant = _parseDate(String(data[i][9]));
      if (!nextPlant) continue;
      nextPlant.setHours(0,0,0,0);
      const daysLate = Math.round((today - nextPlant) / 86400000);
      if (daysLate > 3) {  // 3-day grace
        const batchNum = parseInt(data[i][12]) || 1;  // col 12 = BatchNum
        // Check if a batch 2+ with same crop name exists already
        let nextExists = false;
        for (let j = 1; j < data.length; j++) {
          if (j === i) continue;
          if (String(data[j][1]).toLowerCase() === String(data[i][1]).toLowerCase() &&
              parseInt(data[j][12]) === batchNum + 1) { nextExists = true; break; }  // col 12 = BatchNum
        }
        if (!nextExists) {
          gaps.push({ cropName: String(data[i][1]), nextBatch: batchNum + 1, daysLate });
        }
      }
    }
  } catch(e) {}
  return gaps;
}


// ══════════════════════════════════════════════════════
//  GAP NUDGE — runs as part of daily check
// ══════════════════════════════════════════════════════

function _runBatchGapNudge() {
  const gaps = _checkBatchGaps();
  if (gaps.length === 0) return;
  let msg = "📅 <b>Batch Planting Reminder</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "These crops are past their next planting date but no new batch has been logged:\n\n";
  gaps.forEach(function(g) {
    msg += "🌱 <b>" + g.cropName + "</b> — Batch " + g.nextBatch +
           " was due <b>" + g.daysLate + " day(s) ago</b>\n";
  });
  msg += "\nSend <code>crop</code> to log a new batch.";
  _tgSend(msg, CONFIG.TELEGRAM_CHAT_ID);
}


// ══════════════════════════════════════════════════════
//  PIN MANAGEMENT FLOW
//  "pin status"  — pin a live status report (auto-refreshes daily)
//  "pin weekly"  — pin the weekly digest (auto-replaces Monday)
//  "pin custom"  — start a flow to pin any custom message you type
//  "pin today"   — pin today's briefing
//  "unpin all"   — unpin everything
//  "/pin"        — show pin menu
// ══════════════════════════════════════════════════════

function _sendPinMenu(chatId) {
  _tgSendButtons(
    "📌 <b>Pin Manager</b>\n\n" +
    "Choose what to pin in this chat:\n" +
    "<i>Pinned messages replace the previous one in each slot automatically.</i>",
    [
      [["📊 Pin Status Report",   "pin:status"],  ["📅 Pin Today's Briefing", "pin:today"]],
      [["📆 Pin Week Ahead",      "pin:week"],    ["🌦️ Pin Weather",          "pin:weather"]],
      [["📈 Pin Harvest Report",  "pin:harvest"], ["✏️ Pin Custom Message",   "pin:custom"]],
      [["🗑️ Unpin All",           "pin:unpin_all"]]
    ],
    chatId
  );
}

function _handlePinAction(action, chatId) {
  switch(action) {
    case "status": {
      const txt = _buildStatusText(chatId);
      const id  = _sendAndReplace(txt, chatId, "status");
      if (id) _tgSend("📌 Status report pinned! It will auto-refresh daily.", chatId);
      else _tgSend("❌ Could not pin — check bot permissions.", chatId);
      break;
    }
    case "today": {
      const txt2 = _buildTodayText(chatId);
      const id2  = _sendAndReplace(txt2, chatId, "today");
      if (id2) _tgSend("📌 Today's briefing pinned!", chatId);
      else     _tgSend("❌ Could not pin.", chatId);
      break;
    }
    case "week": {
      const txt3 = _buildWeekText(chatId);
      const id3  = _sendAndReplace(txt3, chatId, "week");
      if (id3) _tgSend("📌 Week Ahead pinned! It will auto-refresh every Monday.", chatId);
      else     _tgSend("❌ Could not pin.", chatId);
      break;
    }
    case "weather": {
      const txt4 = _buildWeatherText(chatId);
      const id4  = _sendAndReplace(txt4, chatId, "weather");
      if (id4) _tgSend("📌 Weather forecast pinned! It will auto-refresh daily.", chatId);
      else     _tgSend("❌ Could not pin.", chatId);
      break;
    }
    case "harvest": {
      const txt5 = _buildHarvestReportText();
      const id5  = _sendAndReplace(txt5, chatId, "harvest");
      if (id5) _tgSend("📌 Harvest report pinned!", chatId);
      else     _tgSend("❌ Could not pin.", chatId);
      break;
    }
    case "custom": {
      _setSession(chatId, { type: "pin_custom", step: "text" });
      _tgSend(
        "✏️ <b>Pin Custom Message</b>\n\n" +
        "Type the message you want pinned:\n" +
        "<i>You can use basic HTML: <b>bold</b>, <i>italic</i>, <code>code</code></i>\n\n" +
        "Send /cancel to quit.",
        chatId
      );
      break;
    }
    case "unpin_all": {
      _tgSendButtons(
        "🗑️ <b>Unpin All?</b>\n\nThis will unpin every pinned message in this chat.",
        [[["✅ Yes, unpin all", "pin:confirm_unpin_all"], ["❌ Cancel", "pin:cancel"]]],
        chatId
      );
      break;
    }
    case "confirm_unpin_all": {
      const ok = _tgUnpinAll(chatId);
      // Clear all stored pin IDs
      ["status","today","week","weather","harvest","custom"].forEach(function(s) { _clearPinnedId(s); });
      _tgSend(ok ? "✅ All messages unpinned." : "❌ Could not unpin — check bot permissions.", chatId);
      break;
    }
    case "cancel":
      _tgSend("❌ Cancelled.", chatId);
      break;
  }
}

function _continuePinCustom(session, input, chatId) {
  if (session.step === "text") {
    const id = _sendAndReplace(input, chatId, "custom");
    _clearSession(chatId);
    if (id) _tgSend("📌 Your custom message has been pinned!", chatId);
    else    _tgSend("❌ Message sent but could not be pinned — check bot permissions.", chatId);
  }
}

// ── Text builders (return string, used both for sending and for auto-refresh) ──

function _buildStatusText() {
  const today    = new Date();
  const cropSheet = _getSheet("CropTracking");
  const propSheet = _getSheet("PropagationTracking");
  let msg = "📊 <b>LIVE STATUS — " + _formatDate(today) + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += "<b>ACTIVE CROPS</b>\n\n";
  if (cropSheet) {
    const data = cropSheet.getDataRange().getValues();
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      const status = String(data[i][15]);  // col 15 = Status
      if (!["Active","Transplanted","Seedling","Flowering"].includes(status)) continue;
      count++;
      const hd = _parseDate(String(data[i][7]));
      const daysLeft = hd ? Math.round((hd - today) / 86400000) : null;
      const variety  = String(data[i][2]) ? " (" + data[i][2] + ")" : "";  // col 2 = Variety
      msg += "🌱 <b>" + data[i][1] + variety + "</b> [" + status + "]";
      if (daysLeft !== null) {
        if (daysLeft < 0) msg += "  ⏰ " + Math.abs(daysLeft) + "d overdue";
        else if (daysLeft === 0) msg += "  🥬 Ready today!";
        else msg += "  🥬 " + daysLeft + "d";
      }
      msg += "\n";
    }
    if (count === 0) msg += "No active crops.\n";
  }
  msg += "\n<b>PROPAGATIONS</b>\n\n";
  if (propSheet) {
    const data2 = propSheet.getDataRange().getValues();
    let count2  = 0;
    for (let i = 1; i < data2.length; i++) {
      if (String(data2[i][9]) !== "Propagating") continue;
      count2++;
      msg += "🌿 <b>" + data2[i][1] + "</b> (" + data2[i][3] + ") — roots: " + data2[i][5] + "–" + data2[i][6] + "\n";
    }
    if (count2 === 0) msg += "No active propagations.\n";
  }
  msg += "\n<i>Last updated: " + Utilities.formatDate(today, Session.getScriptTimeZone(), "h:mm a") + "</i>";
  return msg;
}

function _buildTodayText() {
  // Reuse logic from _sendTodayBriefing but return string
  const today    = new Date(); today.setHours(0,0,0,0);
  const tz       = Session.getScriptTimeZone();
  let msg  = "📅 <b>TODAY — " + _formatDate(today) + "</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  const forecast = _fetchWeather(1);
  if (forecast && forecast[0]) {
    const w = forecast[0];
    msg += w.emoji + " " + w.description + "  " + Math.round(w.maxTemp) + "°/" + Math.round(w.minTemp) + "°C";
    if (w.precipitation > 0) msg += "  🌧️ " + w.precipitation.toFixed(1) + "mm";
    msg += "\n\n";
  }
  const due = _getDueRemindersToday();
  if (due.length > 0) {
    msg += "🔔 <b>Due today:</b>\n";
    due.forEach(function(r) { msg += "  " + _reminderTypeEmoji(r.type) + " " + r.cropName + "\n"; });
    msg += "\n";
  }
  const ready = _getCropsReadyToday();
  if (ready.length > 0) {
    msg += "🥬 <b>Ready to harvest:</b>\n";
    ready.forEach(function(r) { msg += "  🌿 " + r.cropName + "  <code>" + r.id + "</code>\n"; });
  }
  if (!forecast && due.length === 0 && ready.length === 0) msg += "✅ Nothing due today.\n";
  msg += "\n<i>Updated " + Utilities.formatDate(new Date(), tz, "h:mm a") + "</i>";
  return msg;
}

function _buildWeekText() {
  // Compact version of _sendWeekAhead
  const tz    = Session.getScriptTimeZone();
  const today = new Date(); today.setHours(0,0,0,0);
  const forecast = _fetchWeather(7);
  const weatherMap = {};
  if (forecast) forecast.forEach(function(w) { weatherMap[w.dateStr] = w; });
  let msg = "📆 <b>WEEK AHEAD</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const iso = Utilities.formatDate(d, tz, "yyyy-MM-dd");
    const label = Utilities.formatDate(d, tz, "EEE dd");
    const w = weatherMap[iso];
    const wSnip = w ? w.emoji + " " + Math.round(w.maxTemp) + "°" + (w.precipitation >= CONFIG.RAIN_THRESHOLD_MM ? "🌧️" : "") : "";
    msg += "<b>" + label + "</b>  " + wSnip + "\n";
  }
  msg += "\n<i>Updated " + Utilities.formatDate(new Date(), tz, "h:mm a") + "</i>";
  return msg;
}

function _buildWeatherText() {
  const forecast = _fetchWeather(7);
  if (!forecast) return "⚠️ Weather data unavailable.";
  const tz = Session.getScriptTimeZone();
  let msg = "🌦️ <b>FORECAST — " + CONFIG.WEATHER_LOCATION + "</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  forecast.forEach(function(day) {
    const rain = day.precipitation > 0 ? "  🌧️ " + day.precipitation.toFixed(1) + "mm" : "";
    msg += day.emoji + " <b>" + Utilities.formatDate(day.date, tz, "EEE dd") + "</b>  " +
           Math.round(day.maxTemp) + "°/" + Math.round(day.minTemp) + "°C" + rain + "\n";
  });
  msg += "\n<i>Updated " + Utilities.formatDate(new Date(), tz, "h:mm a") + "</i>";
  return msg;
}

function _buildHarvestReportText() {
  try {
    const sheet = _getSheet("HarvestLog");
    if (!sheet) return "No harvest data yet.";
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return "No harvests logged yet.";
    const byName = {};
    for (let i = 1; i < data.length; i++) {
      const name = String(data[i][1]);
      if (!byName[name]) byName[name] = { count: 0, days: [] };
      byName[name].count++;
      if (data[i][4]) byName[name].days.push(parseFloat(data[i][4]));
    }
    let msg = "📈 <b>HARVEST REPORT</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
    Object.keys(byName).sort().forEach(function(name) {
      const d = byName[name];
      const avg = d.days.length ? (d.days.reduce(function(a,b){return a+b;},0)/d.days.length).toFixed(0) : "?";
      msg += "🌿 <b>" + name + "</b>  ×" + d.count + "  avg " + avg + "d\n";
    });
    msg += "\n<i>Updated " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMM h:mm a") + "</i>";
    return msg;
  } catch(e) { return "❌ Error building harvest report."; }
}

// ── Auto-refresh pinned messages (called from daily check + weekly digest) ──

function _refreshPinnedMessages() {
  const props = PropertiesService.getScriptProperties();
  // Refresh status pin
  if (props.getProperty("pinned_status")) {
    const oldId = parseInt(props.getProperty("pinned_status"));
    _tgUnpin(oldId, CONFIG.TELEGRAM_CHAT_ID);
    const newId = _tgSendAndGetId(_buildStatusText(), CONFIG.TELEGRAM_CHAT_ID);
    if (newId) { _tgPin(newId, CONFIG.TELEGRAM_CHAT_ID, true); _savePinnedId("status", newId); }
  }
  // Refresh today pin
  if (props.getProperty("pinned_today")) {
    const oldId2 = parseInt(props.getProperty("pinned_today"));
    _tgUnpin(oldId2, CONFIG.TELEGRAM_CHAT_ID);
    const newId2 = _tgSendAndGetId(_buildTodayText(), CONFIG.TELEGRAM_CHAT_ID);
    if (newId2) { _tgPin(newId2, CONFIG.TELEGRAM_CHAT_ID, true); _savePinnedId("today", newId2); }
  }
  // Refresh weather pin
  if (props.getProperty("pinned_weather")) {
    const oldId3 = parseInt(props.getProperty("pinned_weather"));
    _tgUnpin(oldId3, CONFIG.TELEGRAM_CHAT_ID);
    const newId3 = _tgSendAndGetId(_buildWeatherText(), CONFIG.TELEGRAM_CHAT_ID);
    if (newId3) { _tgPin(newId3, CONFIG.TELEGRAM_CHAT_ID, true); _savePinnedId("weather", newId3); }
  }
}

function _refreshWeeklyPin() {
  if (!PropertiesService.getScriptProperties().getProperty("pinned_week")) return;
  const oldId = _getPinnedId("week");
  if (oldId) _tgUnpin(oldId, CONFIG.TELEGRAM_CHAT_ID);
  const newId = _tgSendAndGetId(_buildWeekText(), CONFIG.TELEGRAM_CHAT_ID);
  if (newId) { _tgPin(newId, CONFIG.TELEGRAM_CHAT_ID, true); _savePinnedId("week", newId); }
}


// ══════════════════════════════════════════════════════
//  SHEET-DELETE SYNC
//  syncDeletedCrops() runs every 10 minutes via trigger.
//  Compares the IDs currently in CropTracking against
//  a stored snapshot. Any ID that has disappeared from the
//  sheet (physically deleted row) gets full cleanup:
//    • Calendar events removed
//    • ReminderQueue entries purged
//    • Telegram notification sent
//
//  Also callable manually from the Apps Script editor
//  via runSyncDeletedCropsNow().
// ══════════════════════════════════════════════════════

/**
 * Read every Tracking ID currently present in CropTracking sheet.
 * Returns an object  { id: { name, variety, plantingDate, status } }
 */
function _readCurrentCropIds() {
  const sheet = _getSheet("CropTracking");
  if (!sheet) return {};
  const data   = sheet.getDataRange().getValues();
  const result = {};
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0]).trim();
    if (!id) continue;
    result[id] = {
      name:         String(data[i][1]),
      variety:      String(data[i][2]),
      plantingDate: String(data[i][5]),   // col 5 = Planting Date
      status:       String(data[i][15])   // col 15 = Status
    };
  }
  return result;
}

/**
 * Load the last-known set of crop IDs from ScriptProperties.
 * Returns an object  { id: { name, variety, plantingDate, status } }
 */
function _loadKnownCropIds() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty("known_crop_ids");
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
}

/**
 * Save current crop IDs to ScriptProperties so next run can diff against them.
 */
function _saveKnownCropIds(ids) {
  PropertiesService.getScriptProperties()
    .setProperty("known_crop_ids", JSON.stringify(ids));
}

/**
 * Main sync function — called by trigger every 10 minutes.
 * Detects rows deleted directly in the sheet and cleans up.
 */
function syncDeletedCrops() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.length < 10) return;

  const current = _readCurrentCropIds();
  const known   = _loadKnownCropIds();

  // First run — just take a snapshot, nothing to diff yet
  if (!known) {
    _saveKnownCropIds(current);
    Logger.log("syncDeletedCrops: first run — snapshot taken (" + Object.keys(current).length + " crop IDs stored).");
    return;
  }

  // Find IDs in snapshot that are now gone from the sheet
  const deletedIds = Object.keys(known).filter(id => !current[id]);

  if (deletedIds.length === 0) {
    // Nothing deleted — update snapshot to catch any new additions
    _saveKnownCropIds(current);
    return;
  }

  // Process each deleted crop
  const report = [];
  deletedIds.forEach(function(cropID) {
    const meta   = known[cropID];
    const result = _cleanupDeletedCrop(cropID, meta);
    report.push({ cropID, meta, result });
  });

  // Update snapshot
  _saveKnownCropIds(current);

  // Send Telegram summary
  _notifySheetDeletedCrops(report);
}

/**
 * Clean up all traces of a crop that was deleted from the sheet.
 * Returns { remindersRemoved, eventsRemoved }
 */
function _cleanupDeletedCrop(cropID, meta) {
  const cropName    = (meta && meta.name)         || "Unknown";
  const plantingRaw = (meta && meta.plantingDate) || "";
  let remindersRemoved = 0;
  let eventsRemoved    = 0;

  // ── 1. ReminderQueue: delete all rows with this Tracking ID ─────────
  try {
    const sheet = _getSheet("ReminderQueue");
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      // Iterate bottom-up so row deletions don't shift indices
      for (let r = data.length - 1; r >= 1; r--) {
        if (String(data[r][3]).trim() === cropID) {
          sheet.deleteRow(r + 1);
          remindersRemoved++;
        }
      }
    }
  } catch(e) {
    Logger.log("syncDeletedCrops — ReminderQueue error for " + cropID + ": " + e.message);
  }

  // ── 2. Calendar: delete all events referencing this crop ────────────
  try {
    const cal         = _getCalendar();
    const plantDate   = _parseDate(plantingRaw) || new Date(2020, 0, 1);
    const windowEnd   = _addDays(plantDate, 1095);   // 3 years forward
    const windowStart = _addDays(plantDate, -7);     // 1 week back (safety)
    const events      = cal.getEvents(windowStart, windowEnd);

    // Match any event whose title contains the crop name and one of our emoji prefixes
    const prefixes = ["🌱", "🥬", "🍄", "🐛", "📅", "🌿"];
    events.forEach(function(ev) {
      const title = ev.getTitle();
      const hasPrefix  = prefixes.some(p => title.startsWith(p));
      const hasCropName = title.toLowerCase().includes(cropName.toLowerCase());
      const hasID       = ev.getDescription && ev.getDescription().includes(cropID);
      if (hasPrefix && (hasCropName || hasID)) {
        ev.deleteEvent();
        eventsRemoved++;
      }
    });
  } catch(e) {
    Logger.log("syncDeletedCrops — Calendar error for " + cropID + ": " + e.message);
  }

  Logger.log("syncDeletedCrops — Cleaned up " + cropID + " (" + cropName + "): " +
    remindersRemoved + " reminders, " + eventsRemoved + " calendar events removed.");

  return { remindersRemoved, eventsRemoved };
}

/**
 * Build and send a Telegram message summarising all sheet-deleted crops.
 */
function _notifySheetDeletedCrops(report) {
  let msg  = "🗑️ <b>Sheet Cleanup Complete</b>\n";
  msg += "━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  msg += report.length + " crop" + (report.length > 1 ? "s" : "") + " removed directly from the sheet:\n\n";

  report.forEach(function(r) {
    const variety = (r.meta && r.meta.variety) ? " (" + r.meta.variety + ")" : "";
    const name    = (r.meta && r.meta.name) || r.cropID;
    msg += "🌱 <b>" + name + variety + "</b>  <code>" + r.cropID + "</code>\n";
    msg += "   🔔 Reminders removed: <b>" + r.result.remindersRemoved + "</b>\n";
    msg += "   📅 Calendar events removed: <b>" + r.result.eventsRemoved + "</b>\n\n";
  });

  msg += "<i>Tip: to delete via bot (with confirmation), send <code>delete crop</code> instead.</i>";
  _tgSend(msg, CONFIG.TELEGRAM_CHAT_ID);
}

/**
 * ★ Run this manually in the editor to force an immediate sync check.
 *   Useful after bulk-deleting rows from the sheet.
 */
function runSyncDeletedCropsNow() {
  syncDeletedCrops();
  Logger.log("runSyncDeletedCropsNow — done.");
}

/**
 * ★ Run this once to seed the initial snapshot.
 *   Required on first deploy, or after manual bulk changes.
 */
function seedCropIdSnapshot() {
  const current = _readCurrentCropIds();
  _saveKnownCropIds(current);
  Logger.log("seedCropIdSnapshot — " + Object.keys(current).length + " crop IDs stored.");
  Logger.log("IDs: " + Object.keys(current).join(", "));
}


// ══════════════════════════════════════════════════════
//  FERTILIZER APPLICATION CONFIRMATION FLOW
//  When a fert reminder fires the message arrives with
//  [✅ Applied!] [❌ Not Yet] inline buttons.
//  ✅ → logs to TreatmentLog and confirms in chat.
//  ❌ → offers [⏰ In 2–3 Hours] [📅 Next Day] snooze.
//  After the snooze elapses the question re-appears.
//
//  Callback formats:
//    fertdone:yes:TRACKID:STAGE:APPNUM:TOTAL
//    fertdone:no:TRACKID:STAGE:APPNUM:TOTAL
//    fertsnooze:2H:TRACKID:STAGE:APPNUM:TOTAL
//    fertsnooze:1D:TRACKID:STAGE:APPNUM:TOTAL
// ══════════════════════════════════════════════════════

/**
 * Send a fert application reminder with confirm buttons.
 * Called from sendPendingReminders for every fert reminder row.
 */
function _sendFertReminderWithConfirm(r, sheet) {
  var chatId   = String(r.data[8]) || CONFIG.TELEGRAM_CHAT_ID;
  var body     = String(r.data[6]);
  var cropName = String(r.data[2]);
  var trackId  = String(r.data[3]);
  var remType  = String(r.data[1]);

  // Parse appNum / estTotal from subject: "🌱 Fert 2/4 • Seedling — Tomato"
  var subject  = String(r.data[5]);
  var numMatch = subject.match(/Fert\s+(\d+)\/~?(\d+)/);
  var appNum   = numMatch ? numMatch[1] : "1";
  var estTotal = numMatch ? numMatch[2] : "1";

  var stageMap = {
    fert_seedling:  "seedling",
    fert_midveg:    "midVeg",
    fert_flowering: "flowering",
    fert_fruiting:  "fruiting"
  };
  var stageKey = stageMap[remType] || "seedling";
  var cbBase   = trackId + ":" + stageKey + ":" + appNum + ":" + estTotal;

  _tgSendButtons(
    body,
    [
      [
        ["\u2705 Applied!", "fertdone:yes:" + cbBase],
        ["\u274C Not Yet",  "fertdone:no:"  + cbBase]
      ]
    ],
    chatId
  );
  sheet.getRange(r.sheetRow, 8).setValue("Yes");
}

/**
 * Handle ✅ Applied / ❌ Not Yet tap.
 */
function _handleFertConfirm(data, chatId, qid) {
  var parts    = data.split(":");
  // parts[0]=fertdone  [1]=yes|no  [2]=trackId  [3]=stageKey  [4]=appNum  [5]=estTotal
  var answer   = parts[1];
  var trackId  = parts[2];
  var stageKey = parts[3];
  var appNum   = parts[4] || "1";
  var estTotal = parts[5] || "1";

  var row = _findRowById("CropTracking", trackId, 1);
  if (!row) {
    _tgAnswerCallback(qid, "Crop not found");
    _tgSend("\u274C Crop not found: <code>" + trackId + "</code>", chatId);
    return;
  }
  var cropName = row.rowData[1];
  var variety  = row.rowData[2];
  var varStr   = variety ? " (" + variety + ")" : "";

  var stageLabels = {
    seedling:  "\uD83C\uDF31 Seedling",
    midVeg:    "\uD83C\uDF3F Mid-Veg",
    flowering: "\uD83C\uDF38 Flowering",
    fruiting:  "\uD83C\uDF45 Fruiting"
  };
  var stageLabel = stageLabels[stageKey] || stageKey;

  if (answer === "yes") {
    _tgAnswerCallback(qid, "\u2705 Logged!");

    var today         = new Date();
    var plantDate     = _parseDate(String(row.rowData[5]));
    var daysFromPlant = plantDate ? Math.round((today - plantDate) / 86400000) : "?";

    _logTreatment(trackId, cropName, _formatDateShort(today),
      { type: "fertilizer", product: "Organic Tea \u2014 " + stageLabel },
      daysFromPlant
    );

    _tgSend(
      "\u2705 <b>Fertilizer Applied \u2014 Logged!</b>\n" +
      "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n" +
      "\uD83C\uDF31 <b>" + cropName + varStr + "</b>\n" +
      "\uD83D\uDCC5 Date: " + _formatDate(today) + "\n" +
      "\uD83C\uDF3F Stage: " + stageLabel + "\n" +
      "\uD83D\uDCCA Application " + appNum + " of ~" + estTotal + " \u2014 logged to TreatmentLog \u2705\n\n" +
      "<i>Your next fertilizer reminder will arrive automatically.</i>",
      chatId
    );

  } else {
    // Not done yet — show snooze options
    _tgAnswerCallback(qid, "No problem \u2014 snooze?");
    _tgSendButtons(
      "\u23F0 <b>Reschedule Fertilizer Reminder</b>\n\n" +
      "\uD83C\uDF31 <b>" + cropName + varStr + "</b>\n" +
      stageLabel + " \u2022 Application " + appNum + " of ~" + estTotal + "\n\n" +
      "When would you like to be reminded again?",
      [
        [
          ["\u23F0 In 2\u20133 Hours", "fertsnooze:2H:" + trackId + ":" + stageKey + ":" + appNum + ":" + estTotal],
          ["\uD83D\uDCC5 Next Day",    "fertsnooze:1D:" + trackId + ":" + stageKey + ":" + appNum + ":" + estTotal]
        ]
      ],
      chatId
    );
  }
}

/**
 * Handle snooze choice — re-queue the same application reminder.
 */
function _handleFertSnooze(data, chatId, qid) {
  var parts    = data.split(":");
  // parts[0]=fertsnooze  [1]=2H|1D  [2]=trackId  [3]=stageKey  [4]=appNum  [5]=estTotal
  var delay    = parts[1];
  var trackId  = parts[2];
  var stageKey = parts[3];
  var appNum   = parseInt(parts[4] || "1");
  var estTotal = parseInt(parts[5] || "1");

  var row = _findRowById("CropTracking", trackId, 1);
  if (!row) { _tgAnswerCallback(qid, "Crop not found"); return; }

  var cropName = row.rowData[1];
  var variety  = row.rowData[2];
  var varStr   = variety ? " (" + variety + ")" : "";

  var now        = new Date();
  var snoozeDate;
  if (delay === "2H") {
    snoozeDate = new Date(now.getTime() + 3 * 60 * 60 * 1000);  // 3 hours
  } else {
    snoozeDate = _addDays(now, 1);
    snoozeDate.setHours(8, 0, 0, 0);
  }

  var typeMap = {
    seedling:  "fert_seedling",
    midVeg:    "fert_midveg",
    flowering: "fert_flowering",
    fruiting:  "fert_fruiting"
  };
  var remType  = typeMap[stageKey] || "fert_seedling";
  var profile  = _getFertProfile(cropName);
  var st       = profile.stages[stageKey];
  var freqDays = st ? (st.freqDays || 10) : 10;

  var stageIcons = { seedling: "\uD83C\uDF31", midVeg: "\uD83C\uDF3F", flowering: "\uD83C\uDF38", fruiting: "\uD83C\uDF45" };
  var icon       = stageIcons[stageKey] || "\uD83C\uDF3F";

  var subject = icon + " Fert " + appNum + "/" + estTotal +
                " \u2022 " + stageKey + " \u2014 " + cropName + varStr;
  var nextDue = _addDays(snoozeDate, freqDays);
  var body    = _buildFertApplicationMsg(
    cropName, variety, trackId, stageKey,
    snoozeDate, appNum, estTotal, nextDue, false
  );

  _queueReminder(remType, cropName, trackId, snoozeDate, subject, body, chatId);

  var tz        = Session.getScriptTimeZone();
  var snoozeStr = Utilities.formatDate(snoozeDate, tz,
    delay === "2H" ? "EEE dd MMM 'at' HH:mm" : "EEE dd MMM"
  );

  _tgAnswerCallback(qid, "Snoozed \u2714");
  _tgSend(
    "\u23F0 <b>Reminder Snoozed</b>\n\n" +
    "\uD83C\uDF31 <b>" + cropName + varStr + "</b>\n" +
    "I\u2019ll remind you again on <b>" + snoozeStr + "</b>.\n\n" +
    "<i>No fertilizer logged for today.</i>",
    chatId
  );
}


function _sendFertScheduleMenu(chatId) {
  var sheet = _getSheet("CropTracking");
  if (!sheet) { _tgSend("No crops logged yet.", chatId); return; }
  var data  = sheet.getDataRange().getValues();
  var active = [];
  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][15]);
    if (!["Active","Seedling","Transplanted","Flowering"].includes(status)) continue;
    active.push({ id: String(data[i][0]), name: String(data[i][1]), variety: String(data[i][2]) });
  }
  if (active.length === 0) {
    _tgSend("No active crops found.", chatId);
    return;
  }
  var rows = [];
  var row  = [];
  active.forEach(function(crop, idx) {
    var label = crop.name + (crop.variety ? " (" + crop.variety + ")" : "");
    row.push([label.substring(0,30), "fertview:" + crop.id]);
    if (row.length === 2 || idx === active.length - 1) {
      rows.push(row);
      row = [];
    }
  });
  _tgSendButtons("🌿 <b>Fertilizer Schedule</b>\n\nWhich crop?", rows, chatId);
}

/**
 * ★ Run this to verify crop_database.json is found and readable.
 */
function testCropDatabase() {
  _cropDbCache = null; // force fresh reload
  const db = _loadCropDb();
  const count = Object.keys(db).length;
  if (count === 0) {
    Logger.log("❌ Database empty or not found. Check crop_database.json is in My Drive root.");
    return;
  }
  Logger.log("✅ Loaded " + count + " entries from crop_database.json");
  // Test a known crop
  const test = _lookupCrop("tomato");
  if (test) {
    Logger.log("✅ Lookup test: " + test.display_name + " found — grows in " + test.growing_time_days + " days");
  } else {
    Logger.log("⚠️ Tomato not found — check the JSON file has the expected entries");
  }
  // List all crop names (non-alias)
  const crops = Object.keys(db).filter(k => !db[k].alias);
  Logger.log("Crops in database (" + crops.length + "): " + crops.join(", "));
}

// END OF FILE
/**
 * QazTracker — приём заявок в Google-таблицу + уведомление в Telegram.
 *
 * Один скрипт на два источника:
 *   • квиз-лендинг (как раньше) → лист «Заявки»;
 *   • сайт QazTracker Vision (поле source=site) → лист «Заявки с сайта».
 * Каждая заявка сразу приходит в Telegram аккаунту с номером TELEGRAM_PHONE.
 *
 * Куда вставлять: Таблица → Расширения → Apps Script → Code.gs (заменить весь код).
 * Пошагово — FORM-SETUP.md в репозитории сайта.
 */

const SPREADSHEET_ID = "1oMbvWGo9T6YfosZ69qHDpCfRpBj8AorBOaruh3uzbKE";
const TIMEZONE = "Asia/Almaty";

// ---------------------------------------------------------------- квиз (без изменений)
const SHEET_NAME = "Заявки";       // лист создастся автоматически
const HEADERS = [
  "Дата и время", "Имя", "Телефон", "Кто в хозяйстве", "Поголовье", "Привес сейчас",
  "Приоритет", "Язык", "utm_source", "utm_campaign", "utm_content",
];
const PRIORITY_ROLES = ["Владелец хозяйства", "Управляющий или зоотехник"];
const PRIORITY_HERDS = ["100–500", "500–1 000", "Более 1 000"];

// ---------------------------------------------------------------- сайт
const SITE_SHEET_NAME = "Заявки с сайта";
const SITE_HEADERS = [
  "Дата и время", "Имя", "Телефон", "Голов", "Язык", "Страница",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "Telegram",
];

// ---------------------------------------------------------------- Telegram
// Токен от @BotFather, вида 1234567890:AAH…  Никому его не пересылайте.
const BOT_TOKEN = "ВСТАВЬТЕ_ТОКЕН_БОТА";
// Telegram-аккаунт, которому приходят заявки (только цифры, с 7 в начале).
const TELEGRAM_PHONE = "77766285882";
// Присылать в Telegram и заявки из квиза (false — только с сайта).
const NOTIFY_QUIZ = true;

function doPost(e) {
  const p = (e && e.parameter) || {};
  return p.source === "site" ? siteLead_(p) : quizLead_(p);
}

function doGet() {
  return ContentService.createTextOutput("QazTracker endpoint OK");
}

// ---------------------------------------------------------------- квиз

function quizLead_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(SHEET_NAME, HEADERS);
    const isPriority = PRIORITY_ROLES.indexOf(p.role) !== -1 && PRIORITY_HERDS.indexOf(p.herd) !== -1;
    const phone = String(p.phone || "").replace(/[^\d+]/g, "").slice(0, 16);

    sheet.appendRow([
      now_(),
      clean_(p.name, 60),
      "'" + phone, // как текст, чтобы не потерять +
      clean_(p.role),
      clean_(p.herd),
      clean_(p.gain),
      isPriority ? "Приоритет" : "",
      clean_(p.lang, 4),
      clean_(p.utm_source),
      clean_(p.utm_campaign),
      clean_(p.utm_content),
    ]);
    if (isPriority) {
      sheet.getRange(sheet.getLastRow(), 1, 1, HEADERS.length).setBackground("#FCEFC7");
    }

    if (NOTIFY_QUIZ) {
      try {
        sendTelegram_(formatLead_({
          title: (isPriority ? "🔥 " : "🟡 ") + "Новая заявка из квиза",
          name: p.name, phone: phone, lang: p.lang,
          lines: [
            p.role ? "🧑‍🌾 " + plain_(p.role, 100) : "",
            p.herd ? "🐄 Поголовье: " + plain_(p.herd, 60) : "",
            p.gain ? "📈 Привес: " + plain_(p.gain, 60) : "",
          ],
          utm: p.utm_source,
        }));
      } catch (err) { console.error(err); }
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- сайт

function siteLead_(p) {
  if (p.website) return json_({ ok: true }); // скрытое поле заполняют только боты

  const name = plain_(p.name, 80);
  const phoneDigits = String(p.phone || "").replace(/\D/g, "").slice(0, 15);
  const heads = String(p.heads || "").replace(/\D/g, "").slice(0, 7);
  const lang = p.lang === "kz" ? "KZ" : "RU";
  if (name.length < 2 || phoneDigits.length < 10) return json_({ ok: false, error: "bad input" });

  // двойной клик по кнопке — не дублируем заявку
  const cache = CacheService.getScriptCache();
  const key = "site_" + phoneDigits + "_" + heads;
  if (cache.get(key)) return json_({ ok: true, duplicate: true });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let saved = false;
    let row = 0;
    let sheet = null;
    try {
      sheet = getSheet_(SITE_SHEET_NAME, SITE_HEADERS);
      sheet.appendRow([
        now_(),
        clean_(name, 80),
        "'+" + phoneDigits,
        heads,
        lang,
        clean_(p.page, 300),
        clean_(p.utm_source),
        clean_(p.utm_medium),
        clean_(p.utm_campaign),
        clean_(p.utm_content),
        "…",
      ]);
      row = sheet.getLastRow();
      saved = true;
    } catch (err) { console.error("Таблица: " + err); }

    let sent = false;
    try {
      sent = sendTelegram_(formatLead_({
        title: "🟢 Новая заявка с сайта",
        name: name, phone: phoneDigits, lang: lang,
        lines: ["🐄 Голов: " + (heads || "—")],
        utm: p.utm_source,
      }));
    } catch (err) { console.error("Telegram: " + err); }

    if (saved) sheet.getRange(row, SITE_HEADERS.length).setValue(sent ? "отправлено" : "ошибка");

    const ok = saved || sent; // заявка не потерялась, если дошла хотя бы в одно место
    if (ok) cache.put(key, "1", 120);
    return json_({ ok: ok });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- настройка Telegram

/**
 * Запустите один раз после того, как владелец номера TELEGRAM_PHONE
 * открыл бота и нажал «Запустить» (/start). Найдёт этот чат и запомнит его.
 * Чтобы бот проверил номер, владелец может ещё отправить боту свой контакт
 * (скрепка → Контакт → свой номер).
 */
function connectTelegram() {
  const res = UrlFetchApp.fetch(api_("getUpdates"), { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText() || "{}");
  if (!data.ok) throw new Error("Telegram не принял токен. Проверьте BOT_TOKEN. Ответ: " + res.getContentText());

  const want = TELEGRAM_PHONE.replace(/\D/g, "").slice(-10);
  let byPhone = null;
  const privates = [];
  (data.result || []).forEach(function (u) {
    const m = u.message;
    if (!m || !m.chat || m.chat.type !== "private") return;
    privates.push(m.chat);
    const c = m.contact;
    if (c && String(c.phone_number || "").replace(/\D/g, "").slice(-10) === want &&
        (!c.user_id || c.user_id === m.from.id)) {
      byPhone = m.chat;
    }
  });

  const chat = byPhone || privates[privates.length - 1];
  if (!chat) {
    throw new Error("Бот пока никто не запускал. С аккаунта +" + TELEGRAM_PHONE +
      " откройте бота, нажмите «Запустить» и запустите connectTelegram ещё раз.");
  }
  PropertiesService.getScriptProperties().setProperty("CHAT_ID", String(chat.id));
  const who = [chat.first_name, chat.last_name].filter(Boolean).join(" ") +
    (chat.username ? " (@" + chat.username + ")" : "");
  console.log(byPhone
    ? "Готово: номер +" + TELEGRAM_PHONE + " подтверждён, заявки будут приходить: " + who
    : "Готово: заявки будут приходить: " + who + ". Номер не проверен — убедитесь, что это аккаунт +" + TELEGRAM_PHONE + ".");
  sendTelegram_("✅ Бот подключён. Сюда будут приходить заявки QazTracker.");
}

/** Тест: запишет тестовую заявку с сайта в таблицу и пришлёт её в Telegram. */
function testSiteLead() {
  const out = siteLead_({ source: "site", name: "Тестовая заявка", phone: "+7 (701) 000-00-00", heads: "100", lang: "ru", page: "test" });
  console.log(out.getContent());
}

/** Тест квиза (как раньше). */
function testInsert() {
  quizLead_({
    name: "Асхат", phone: "+77010000000", role: "Владелец хозяйства",
    herd: "100–500", gain: "1,2–1,4 кг", lang: "RU",
  });
}

// ---------------------------------------------------------------- служебное

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold").setBackground("#0E4D55").setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sendTelegram_(text) {
  if (!BOT_TOKEN || BOT_TOKEN.indexOf(":") === -1) { console.error("Не вставлен BOT_TOKEN"); return false; }
  const chatId = PropertiesService.getScriptProperties().getProperty("CHAT_ID");
  if (!chatId) { console.error("Telegram не подключён: запустите connectTelegram"); return false; }
  const res = UrlFetchApp.fetch(api_("sendMessage"), {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  const body = JSON.parse(res.getContentText() || "{}");
  if (!body.ok) console.error("Telegram: " + res.getContentText());
  return !!body.ok;
}

function formatLead_(o) {
  const d = String(o.phone || "").replace(/\D/g, "");
  const phone = d.length === 11
    ? "+" + d[0] + " " + d.slice(1, 4) + " " + d.slice(4, 7) + " " + d.slice(7, 9) + " " + d.slice(9)
    : "+" + d;
  const lines = ["<b>" + esc_(o.title) + "</b>", "", "👤 " + esc_(plain_(o.name, 80)), "📞 " + phone];
  (o.lines || []).forEach(function (l) { if (l) lines.push(esc_(l)); });
  lines.push("🌐 Язык: " + esc_(String(o.lang || "").toUpperCase() || "—"));
  if (o.utm) lines.push("🔗 Источник: " + esc_(plain_(o.utm, 60)));
  lines.push("", '<a href="https://wa.me/' + d + '">Написать в WhatsApp</a> · ' + now_());
  return lines.join("\n");
}

function now_() {
  return Utilities.formatDate(new Date(), TIMEZONE, "dd.MM.yyyy HH:mm");
}

function api_(method) {
  return "https://api.telegram.org/bot" + BOT_TOKEN + "/" + method;
}

// для сообщений: убирает переносы строк и обрезает длину
function plain_(v, max) {
  return String(v || "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max || 200);
}

// для таблицы: то же + не даёт принять текст за формулу
function clean_(v, max) {
  return plain_(v, 1000).replace(/^[=+\-@]/, "'$&").slice(0, max || 200);
}

function esc_(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * QazTracker Vision — заявки с сайта → Telegram.
 *
 * Как подключить — FORM-SETUP.md в репозитории сайта, коротко:
 *  1. Вставьте токен бота в BOT_TOKEN и сохраните.
 *  2. Добавьте бота в группу Telegram, напишите там /start, запустите findChatId.
 *  3. Запустите testLead — в группе появится тестовая заявка.
 *  4. Развернуть → Новое развертывание → Веб-приложение
 *     (Запуск от имени: Я; У кого есть доступ: Все) и пришлите ссылку …/exec.
 */

// Токен от @BotFather, вида 1234567890:AAH…  Никому его не пересылайте.
const BOT_TOKEN = 'ВСТАВЬТЕ_ТОКЕН_БОТА';

// ID группы. Можно оставить пустым: findChatId найдёт и запомнит его сам.
const CHAT_ID = '';

// Необязательно: ID Google-таблицы, куда дублировать заявки (кусок ссылки между /d/ и /edit).
const SHEET_ID = '';
const SHEET_NAME = 'Заявки с сайта';
const TIMEZONE = 'Asia/Almaty';

function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.website) return json_({ ok: true }); // скрытое поле заполняют только боты

  const name = clean_(p.name, 80);
  const phoneDigits = String(p.phone || '').replace(/\D/g, '').slice(0, 15);
  const heads = String(p.heads || '').replace(/\D/g, '').slice(0, 7);
  const lang = p.lang === 'kz' ? 'KZ' : 'RU';
  if (!name || phoneDigits.length < 10) return json_({ ok: false, error: 'bad input' });

  // двойной клик по кнопке — не дублируем заявку
  const cache = CacheService.getScriptCache();
  const key = 'lead_' + phoneDigits + '_' + heads;
  if (cache.get(key)) return json_({ ok: true, duplicate: true });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ok = sendTelegram_(formatLead_(name, phoneDigits, heads, lang));
    if (SHEET_ID) {
      try { saveToSheet_(name, phoneDigits, heads, lang, ok); } catch (err) { console.error(err); }
    }
    if (ok) cache.put(key, '1', 120);
    return json_({ ok: ok });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput('QazTracker Vision: приём заявок работает');
}

/** Запустите один раз: найдёт группу, куда добавлен бот, и запомнит её ID. */
function findChatId() {
  const res = UrlFetchApp.fetch(api_('getUpdates'), { muteHttpExceptions: true });
  const data = JSON.parse(res.getContentText() || '{}');
  if (!data.ok) throw new Error('Telegram не принял токен. Проверьте BOT_TOKEN. Ответ: ' + res.getContentText());
  const chats = [];
  (data.result || []).forEach(function (u) {
    const m = u.message || u.my_chat_member || u.channel_post || u.edited_message;
    if (m && m.chat) chats.push(m.chat);
  });
  const groups = chats.filter(function (c) { return c.type === 'group' || c.type === 'supergroup'; });
  const chat = groups.length ? groups[groups.length - 1] : chats[chats.length - 1];
  if (!chat) throw new Error('Бот пока не видел ни одного чата: добавьте его в группу, напишите там /start и запустите ещё раз.');
  PropertiesService.getScriptProperties().setProperty('CHAT_ID', String(chat.id));
  console.log('Готово, заявки будут приходить в: ' + (chat.title || chat.first_name || '') + ' (ID ' + chat.id + ')');
}

/** Отправляет тестовую заявку в группу. */
function testLead() {
  const ok = sendTelegram_(formatLead_('Тестовая заявка', '77010000000', '100', 'RU'));
  console.log(ok ? 'Отправлено — проверьте группу в Telegram' : 'Не отправилось — смотрите ошибку выше');
}

// ---------------------------------------------------------------- служебное

function sendTelegram_(text) {
  const props = PropertiesService.getScriptProperties();
  let chatId = props.getProperty('CHAT_ID') || CHAT_ID;
  if (!chatId) { console.error('Нет ID группы: запустите findChatId'); return false; }
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = UrlFetchApp.fetch(api_('sendMessage'), {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const body = JSON.parse(res.getContentText() || '{}');
    if (body.ok) return true;
    const moved = body.parameters && body.parameters.migrate_to_chat_id;
    if (moved) { // группа стала супергруппой — у неё новый ID
      chatId = String(moved);
      props.setProperty('CHAT_ID', chatId);
      continue;
    }
    console.error('Telegram: ' + res.getContentText());
    return false;
  }
  return false;
}

function formatLead_(name, phoneDigits, heads, lang) {
  const d = phoneDigits;
  const phone = d.length === 11
    ? '+' + d[0] + ' ' + d.slice(1, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 9) + ' ' + d.slice(9)
    : '+' + d;
  const when = Utilities.formatDate(new Date(), TIMEZONE, 'dd.MM.yyyy HH:mm');
  return [
    '🟢 <b>Новая заявка с сайта</b>',
    '',
    '👤 ' + esc_(name),
    '📞 ' + phone,
    '🐄 Голов: ' + (heads || '—'),
    '🌐 Язык: ' + lang,
    '',
    '<a href="https://wa.me/' + d + '">Написать в WhatsApp</a> · ' + when,
  ].join('\n');
}

function saveToSheet_(name, phoneDigits, heads, lang, sent) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Дата', 'Имя', 'Телефон', 'Голов', 'Язык', 'Telegram']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([
    Utilities.formatDate(new Date(), TIMEZONE, 'dd.MM.yyyy HH:mm'),
    String(name).replace(/^[=+\-@]/, "'$&"),
    "'+" + phoneDigits,
    heads,
    lang,
    sent ? 'отправлено' : 'ошибка',
  ]);
}

function api_(method) {
  return 'https://api.telegram.org/bot' + BOT_TOKEN + '/' + method;
}

function clean_(v, max) {
  return String(v || '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

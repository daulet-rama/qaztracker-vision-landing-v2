/* QazTracker Vision — отправка заявки с сайта.
 *
 * Заявка (имя, телефон, мал басы) уходит в Google Apps Script:
 * он пишет её в Google-таблицу и сразу присылает в Telegram — см. FORM-SETUP.md.
 * WhatsApp при отправке не открывается.
 */
(function () {
  'use strict';

  // URL веб-приложения Apps Script (тот же, что у квиза)
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbxfHUBOUF2CgZtdUUYKTugCHbIEPsxnEoLaHB7FSAZX0mcYXAKl7cdDknxrcPE_1Yuzjw/exec';
  // Яндекс Метрика: цель, которая уже настроена в квизе
  var YM_GOAL = 'lead';

  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  function normPhone(raw, pasted) {
    var d = digits(raw);
    if (pasted && d.length > 11 && /^7[78]/.test(d)) d = d.slice(1); // вставили полный номер после «+7»
    if (!/^\s*\+/.test(raw) && d.length === 10) d = '7' + d; // номер без кода страны
    if (d.charAt(0) === '8') d = '7' + d.slice(1);
    if (d.charAt(0) !== '7') d = '7' + d;
    return d.slice(0, 11);
  }

  function formatPhone(d) {
    var out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ')';
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    if (d.length > 9) out += '-' + d.slice(9, 11);
    return out;
  }

  function fields(form) {
    return {
      name: form.querySelector('[name="name"]'),
      phone: form.querySelector('[name="phone"]'),
      heads: form.querySelector('[name="heads"]'),
      website: form.querySelector('[name="website"]'),
      button: form.querySelector('button[type="submit"]'),
      error: form.querySelector('.form__error')
    };
  }

  function setFieldError(input, msg) {
    var box = input.parentNode.querySelector('.field__error');
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (!box) return;
    box.textContent = msg || '';
    box.hidden = !msg;
  }

  function validate(form, f) {
    var bad = null;
    var name = f.name.value.trim();
    var phone = normPhone(f.phone.value);
    var heads = digits(f.heads.value);
    function fail(input, msg) { setFieldError(input, msg); if (!bad) bad = input; }

    if (name.length < 2) fail(f.name, form.dataset.msgRequired); else setFieldError(f.name, '');
    if (phone.length !== 11) fail(f.phone, form.dataset.msgPhone); else setFieldError(f.phone, '');
    if (!heads || Number(heads) < 1) fail(f.heads, heads ? form.dataset.msgHeads : form.dataset.msgRequired);
    else setFieldError(f.heads, '');

    if (bad) bad.focus();
    return !bad;
  }

  function track(name, params) {
    var w = window;
    var p = Object.assign({}, params, { hero_variant: w.__qtHero || 'default' });
    (w.__qtEvents = w.__qtEvents || []).push({ event: name, params: p, t: Date.now() });
    try { if (w.gtag) w.gtag('event', name, p); } catch (e) { /* аналитика не обязательна */ }
    try { if (w.__qtYm && w.ym) w.ym(Number(w.__qtYm), 'reachGoal', name, p); } catch (e) { /* — */ }
    try { if (w.fbq) w.fbq('track', 'Lead', p); } catch (e) { /* — */ }
  }

  function setBusy(form, f, busy) {
    var label = f.button.querySelector('.btn__label');
    if (busy) {
      form.dataset.busy = '1';
      if (label) { label.dataset.idle = label.textContent; label.textContent = form.dataset.msgSending; }
    } else {
      delete form.dataset.busy;
      if (label && label.dataset.idle) label.textContent = label.dataset.idle;
    }
    f.button.disabled = busy;
  }

  function showDone(form) {
    var done = document.getElementById('lead-done');
    form.hidden = true;
    if (!done) return;
    done.hidden = false;
    try { done.focus({ preventScroll: true }); } catch (e) { done.focus(); }
    done.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showError(f) {
    if (!f.error) { window.alert(f.button.form.dataset.msgError || 'Не получилось отправить заявку. Попробуйте ещё раз.'); return; }
    f.error.hidden = false;
  }

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.form || el.form.id !== 'lead-form') return;
    if (el.name === 'phone') {
      var type = e.inputType || '';
      var d = normPhone(el.value, type === 'insertFromPaste' || type === 'insertFromDrop');
      if (type.indexOf('delete') === 0 && d === el.dataset.d && d.length > 1) d = d.slice(0, -1);
      el.dataset.d = d;
      el.value = formatPhone(d);
    } else if (el.name === 'heads') {
      var h = digits(el.value).slice(0, 6);
      if (h !== el.value) el.value = h;
    }
    if (el.getAttribute('aria-invalid') === 'true') setFieldError(el, '');
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.id !== 'lead-form') return;
    e.preventDefault();
    if (form.dataset.busy) return;

    var f = fields(form);
    if (f.error) f.error.hidden = true;
    if (!validate(form, f)) return;

    // в таблицу уходят только имя, телефон и мал басы
    var lead = {
      name: f.name.value.trim().slice(0, 80),
      phone: formatPhone(normPhone(f.phone.value)),
      heads: digits(f.heads.value),
      website: f.website ? f.website.value : '', // скрытое поле-ловушка для ботов
      source: 'site'
    };
    if (lead.website) { showDone(form); return; } // бот заполнил скрытое поле

    var meta = { heads: lead.heads, lang: document.documentElement.lang === 'kk' ? 'kz' : 'ru' };

    setBusy(form, f, true);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    var body = new URLSearchParams();
    Object.keys(lead).forEach(function (k) { body.append(k, lead[k]); });

    fetch(ENDPOINT, { method: 'POST', body: body, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw new Error('not ok');
        track('generate_lead', Object.assign({ via: 'sheet' }, meta));
        try { if (window.__qtYm && window.ym) window.ym(Number(window.__qtYm), 'reachGoal', YM_GOAL); } catch (e) { /* — */ }
        showDone(form);
      })
      .catch(function () {
        track('lead_error', meta);
        showError(f);
      })
      .then(function () {
        clearTimeout(timer);
        setBusy(form, f, false);
      });
  });
})();

# QazTracker Vision — лендинг ИИ-взвешивания КРС

Статическая копия продающего лендинга: https://weight.qaztracker.com (RU) и …/kz (KZ).
Та же копия открывается на https://daulet-rama.github.io/qaztracker-vision-landing-v2/.

- Исходники лендинга (Next.js + Payload CMS + Three.js) — не в этом репозитории:
  здесь собранные страницы, их правят прямо в HTML.
- Заявки: форма (имя, телефон, количество голов) → Google Apps Script (тот же, что у квиза)
  → Google-таблица (лист «Заявки с сайта») + сразу сообщение в Telegram. WhatsApp при отправке
  не открывается. Настройка — [FORM-SETUP.md](FORM-SETUP.md), код скрипта — [`apps-script/Code.gs`](apps-script/Code.gs).
- Аналитика: Яндекс Метрика 114168785 (как в квизе) на всех страницах; при отправке заявки — цели `lead` и `generate_lead`.
- Свои стили и скрипты поверх сборки: [`custom.css`](custom.css) (зелёные кнопки,
  карточки «весы → камера», форма) и [`lead.js`](lead.js) (отправка заявки).
- Страницы закрыты от поисковиков (noindex, robots.txt).
- [`Caddyfile`](Caddyfile) — раздача сайта на Railway (weight.qaztracker.com).

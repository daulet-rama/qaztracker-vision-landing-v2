# QazTracker Vision — лендинг ИИ-взвешивания КРС

Статическая копия продающего лендинга: https://weight.qaztracker.com (RU) и …/kz (KZ).
Та же копия открывается на https://daulet-rama.github.io/qaztracker-vision-landing-v2/.

- Исходники лендинга (Next.js + Payload CMS + Three.js) — не в этом репозитории:
  здесь собранные страницы, их правят прямо в HTML.
- Заявки: форма (имя, телефон, количество голов) → Google Apps Script → Telegram.
  Как подключить — [FORM-SETUP.md](FORM-SETUP.md). Пока не подключено,
  заявка открывается в WhatsApp готовым сообщением.
- Свои стили и скрипты поверх сборки: [`custom.css`](custom.css) (зелёные кнопки,
  карточки «весы → камера», форма) и [`lead.js`](lead.js) (отправка заявки).
- Страницы закрыты от поисковиков (noindex, robots.txt).
- [`Caddyfile`](Caddyfile) — раздача сайта на Railway (weight.qaztracker.com).

# Фактична архітектура HromadaHR

Документ описує версію 0.1.0 після етапу 2.1 (IPC та архітектура даних). Погоджені майбутні механізми наведено окремо в [DECISIONS.md](DECISIONS.md).

## Стек та структура

Цільова платформа — Windows 10/11, локальний настільний застосунок без окремого сервера. Середовище розробки: Node.js 24.22.1, pnpm 11.25.0. Використано Electron 44.7.1, React/React DOM 19.2.9, TypeScript 5.9.3, Vite 8.3.4, @vitejs/plugin-react 6.1.2 та lucide-react 0.577.0. Фактичні версії залежностей зафіксовано в `package.json` і `pnpm-lock.yaml`.

| Шлях | Призначення |
| --- | --- |
| `electron/main.ts` | Життєвий цикл, вікно, профілі, правила безпеки та завантаження renderer |
| `electron/preload.cts` | Обмежений contextBridge API |
| `electron/ipc.ts` | Реєстрація IPC, перевірки відправника, аргументів і результату |
| `shared/ipc.ts` | Allowlist каналів, типи аргументів, результатів і публічного API |
| `src/env.d.ts` | Тип `window.hromadaHR` для renderer |
| `vite.preload.config.ts`, `tsconfig.preload.json` | Окремі bundling і typecheck sandboxed preload |
| `tests/ipc.test.mjs` | Цільові тести IPC-безпеки через Node test runner |
| `src/main.tsx` | Вхід React із StrictMode та імпорт стилів |
| `src/App.tsx` | Сім розділів, локальна навігація, головна та інформаційні стани |
| `src/components/` | Універсальні Alert та DataState |
| `src/styles.css`, `src/styles/` | Точка входу CSS та чотири групи стилів |
| `assets/community-coat.png` | Герб пілотної установи, імпортований у renderer |
| `docs/` | Архітектура, рішення та передавання контексту |
| `tsconfig*.json`, `vite.config.ts`, `index.html` | Компіляція, Vite та HTML/CSP |
| `dist/`, `dist-electron/` | Генеровані результати збірки; не входять до Git |
| `reference/` | Локальні довідкові матеріали; ігноруються Git, застосунок від них не залежить |

Це один пакет, без серверного workspace. `pnpm-workspace.yaml` містить лише дозвіл build-скриптів Electron. Кореневий `postinstall` викликає штатний `install-electron`, щоб підготувати бінарний Electron під час встановлення залежностей.

## Electron та межа безпеки

Ідентичність: package `hromada-hr`, product HromadaHR, версія 0.1.0. Main задає назву HromadaHR та Windows AppUserModelId `local.hromadahr`. Створюється звичайне вікно 1000 × 700 без власного меню.

BrowserWindow використовує `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; стандартна web security не вимикається. Main блокує навігацію та перенаправлення через `will-navigate`/`will-redirect`, приєднання webview і створення сторонніх вікон. Запити дозволів відхиляються.

Ланцюжок виклику: React Renderer → `window.hromadaHR.system.getInfo()` → preload/contextBridge → `ipcRenderer.invoke('system:getInfo')` → Main. Це єдиний зареєстрований канал. Публічний API не містить універсального invoke/send/on, ipcRenderer, файлових операцій чи привілейованих об'єктів Electron. Renderer не має прямого доступу до Node.js, Electron чи файлової системи.

`shared/ipc.ts` містить allowlist та контракти; Zod 4.6.7 використовується лише в Main. Реєстратор викликається один раз на життєвий цикл застосунку, а актуальне вікно визначається для кожного запиту. Перевіряються наявність і стан вікна/WebContents, тотожність `event.sender` його WebContents, тотожність `event.senderFrame` актуальному `mainFrame`, точний URL дозволеного dev або built документа. Самого URL недостатньо. Після цього Zod tuple відхиляє будь-які аргументи, включно з явним undefined; strict object перевіряє відповідь.

Успіх має форму `{ ok: true, data: { name, version, mode } }`, помилка — `{ ok: false, error: { code } }`. Main повертає FORBIDDEN, INVALID_ARGUMENTS або INTERNAL_ERROR без тексту винятку; preload перетворює відмову транспорту на UNAVAILABLE. Невідомі канали не мають обробників і відхиляються транспортом Electron. Публічний метод завжди викликає лише свій канал без аргументів. Версія і назва походять з Electron app; режим — dev/built. Шляхи, користувацькі дані та секрети не повертаються.

Місце для майбутньої перевірки доступу — в Main після перевірки відправника/аргументів і перед виконанням захищеної операції. Зараз існує лише публічна діагностика; немає сеансів, авторизації або заглушки, що автоматично дозволяє доступ. Для 2.2 можна додати окремі типізовані методи й обробники на цій межі; SQLite не реалізовано.

Vite збирає `.cts` разом зі спільними константами в один CommonJS `dist-electron/preload.cjs`, залишаючи зовнішнім лише Electron. Це потрібно через [обмеження require у sandboxed preload](https://www.electronjs.org/docs/latest/tutorial/sandbox). Окремий TS-конфіг перевіряє preload без emit; NodeNext компілює Main і shared зі збереженням структури каталогів.

Production CSP у `index.html` задає `default-src 'none'`, власні scripts/styles/images/fonts, `connect-src 'none'`, заборону base/form/object. Лише Vite serve-плагін дозволяє inline React refresh/styles і локальний HMR WebSocket. Це не послаблює built-CSP.

## Dev, built та профілі

Dev обирається лише коли застосунок не запакований і передано `--dev`; сама відсутність пакування не вмикає Vite. `pnpm dev` спочатку компілює Main/preload, далі запускає Vite та Electron через concurrently/wait-on. Адреса — `http://127.0.0.1:5176/`, `strictPort: true`. Немає логіки примусового звільнення порту. Після змін Main/preload потрібен перезапуск dev; renderer використовує HMR.

`package.json.main` веде до `dist-electron/electron/main.js`; preload — `dist-electron/preload.cjs`. Built завантажує `../../dist/index.html` від каталогу Main через `loadFile`. Vite має `base: './'`, тому JS/CSS і зображення завантажуються з локальної збірки без Vite та інтернету. `start:built` не виконує збірку й потребує встановленого Electron.

Main обирає userData до single-instance lock:

- dev: `%APPDATA%\HromadaHR-dev`;
- built і майбутній packaged-режим: `%APPDATA%\HromadaHR`.

Профілі незалежні від HromadaAID. Повторний запуск одного режиму фокусує його наявне вікно; dev і built можуть працювати паралельно. На Windows закриття останнього вікна завершує застосунок. Це профілі Electron, а не реалізоване сховище кадрових даних.

## Renderer та стилі

`App.tsx` використовує один `useState<SectionId>`, без React Router, глобального сховища або збереження вибраного розділу. Розділи: Головна, Огляд, Працівники, Відпустки, Стаж і ранги, Документи, Налаштування. Заголовок, breadcrumbs та активний пункт походять з одного опису розділів. Налаштування розміщено внизу sidebar.

Головна містить ідентичність пілотної установи й стан розробки без KPI та кнопок удаваних операцій. Решта розділів використовує `DataState kind="planned"` з тематичним поясненням. Цей стан відрізняється від `empty`; підтримка loading/empty/search у компоненті не означає наявності запитів чи реєстрів. Alert показує локальні інформаційні повідомлення.

У налаштуваннях footer через IPC показує реальну версію застосунку, стан завантаження або повідомлення про недоступність. Сім розділів та дизайн-система збережені.

`src/styles.css` імпортує:

- `tokens.css`: семантичні кольори, відступи, радіуси, висоти й тривалість переходів;
- `base.css`: Segoe UI, базові правила, видимий focus, skip-link і reduced motion;
- `components.css`: кнопки, Alert, DataState;
- `shell.css`: sidebar, topbar, breadcrumbs, головний блок і адаптивність.

Використано відібрані універсальні правила HromadaAID на [коміті 16582ce](https://github.com/Anatol1ch/HromadaAID/tree/16582ce252086bb39d2276ac3c1de90e4895f21f), без залежності від його коду або історії. Власна палітра HromadaHR: акцент `#6F5AA5`, темний `#594681`, світлий `#EFEAF7`, фон `#F7F6FA`, межі `#E4DFEC`, текст `#252738`, допоміжний текст `#687084`, картки `#FFFFFF`. Кольори success/error/warning відокремлені від акценту.

Збережено sidebar 258 px (244 px до 1280 px; піктограми 68 px до 1100 px), topbar 68 px, контент до 1500 px, стандартний контроль 44 px і шкалу 4/8/12/16/20/24/32 px. За ширини до 760 px topbar має 58 px, до 600 px головний блок стає одноколонковим, topbar — автоматичної висоти з мінімумом 68 px. Окремої мобільної версії немає.

Розрахунки палітри на етапі 1.2.1: білий текст кнопки 5,70:1 (hover 8,02:1), основний текст на фоні 13,69:1, допоміжний на білому 4,95:1 і на робочому фоні 4,60:1, темний акцент на світлому 6,79:1. Це не замінює ручного приймання всього інтерфейсу.

## Герб і діагностика старого вікна

`App.tsx` імпортує `../assets/community-coat.png`. PNG 1488 × 1996, SHA256 `ca93bd8920cffa188ef2dbce9ecc276c553c4c80bf0b5716b4fdae2662e1456f`. Vite копіює його з хешованою назвою до `dist/assets`; URL формується відносно JS-бандла і працює з `file://`. Розмір області зображення — 128 × 168 із `max-width: 100%` та `object-fit: contain`, без обрізання або спотворення пропорцій.

Герб ліворуч і назва Вишнівської селищної територіальної громади праворуч — пілотна ідентичність установи. Основний бренд HromadaHR у sidebar зберігає UsersRound. Завантаження або зміни герба через налаштування немає.

На етапі 1.3 старе відкрите dev-вікно ще показувало UsersRound у блоці установи; нове built-вікно коректно показало герб. Змін PNG, CSS, CSP чи шляхів для виправлення не знадобилося. Якщо видно старий екран, закрийте відповідний екземпляр, зупиніть старий dev-сеанс Ctrl+C у його терміналі та виконайте `pnpm build`, потім `pnpm start:built`. Повторний запуск без закриття може лише сфокусувати старе вікно.

## Команди

| Команда | Результат |
| --- | --- |
| `pnpm install --frozen-lockfile` | Встановлення за lockfile та підготовка Electron; для першого встановлення потрібен інтернет |
| `pnpm dev` | Компіляція Main/preload, Vite й Electron у dev-профілі |
| `pnpm typecheck` | Перевірка renderer, Vite-конфігурації та Electron без emit |
| `pnpm test` | Збірка Main/preload й дев'ять цільових тестів IPC |
| `pnpm build:electron` | Emit Main/shared і один CommonJS preload-бандл |
| `pnpm build` | Typecheck, emit Main/preload, production renderer і ресурси |
| `pnpm start:built` | Відкриття вже зібраного застосунку через локальний Electron |

TS-конфігурація спільно задає strict-перевірки. Renderer має DOM/react-jsx, Bundler resolution і noEmit; Vite-конфігурації — окрему node-перевірку; Electron — NodeNext і rootDir `.` для Main/shared; preload — окрему Bundler-перевірку. Встановлені залежності не містять серверного runtime, SQLite або пакувальника.

Тести запускають реальний скомпільований реєстратор із doubles Electron-об'єктів і реальний preload-бандл у Node VM із контрольованим transport/contextBridge. Перевіряються дозволений виклик, Zod-валідація, allowlist, сторонній sender, підфрейм, URL, закриття/заміна вікна, контрольовані помилки й точна поверхня API. Це не запуск справжнього Electron або GUI-приймання; інтеграцію contextBridge у Windows користувач перевіряє вручну.

## Ще не реалізовано

SQLite, міграції, локальна авторизація, майстер першого запуску, кадрові IPC, реєстри й операції, відпустки, стаж, ранги, документообіг, резервування, оновлення та інсталятор відсутні. Це межі етапу 2.1. Не слід трактувати каталоги профілів, навігаційні кнопки або інформаційні стани як реалізацію цих механізмів.

# Реєстр повторного використання HromadaAID

Етап 03 (3.1–3.4.3.8) завершено в реалізації; інтеграцію погоджено, стан — [HANDOFF.md](HANDOFF.md). Основні GUI-сценарії перевіряв користувач, повне формальне приймання всіх сценаріїв не підтверджено. Рядки таблиці нижче актуальні; датовані уточнення зберігають історію без позначення непроведених перевірок виконаними.

Політика діє для всієї розробки HromadaHR, незалежно від етапу. Перед новою функцією чи суттєвою зміною оцінюється відповідний аналог AID; перевага — фактичному перенесенню або адаптації. Надійніші чинні механізми HR зберігаються. Джерело read-only; fork, submodule, subtree й об’єднання Git-історій заборонені. Несумісні серверні, предметні та безпекові механізми не переносяться.

Перевірений source HEAD на 03.11.2026: **33eca10733caaf73b1a99e75a24ff35e706a0afb** (далі **S1**). Усі рядки з S1 стосуються файлів, прочитаних саме за цим ref. «Не перевірено» не означає відсутність аналога. Реєстр розширюється цільово, а не внаслідок необмеженого аудиту.

| Можливість / джерело AID | SHA | Рішення та обґрунтування | Стан у HR |
| --- | --- | --- | --- |
| Токени, оболонка, навігація: `src/App.tsx`, `src/styles.css` | S1 | Адаптувати геометрію й навігацію; HR має власну сиренево-фіолетову палітру, сім розділів, герб і бренд | Основа перенесена 3.4.1; кадрові сценарії — 3.4.2; сиреневі токени/банер/футер — 3.4.2.1 |
| Modal, ConfirmDialog, closeConfirmation: `src/components/` | S1 | Перенести стек, trap/restore focus, busy, підтвердження втрати змін | Інтегровано; OS beforeunload поки синхронний, див. UI-TRANSFER |
| SystemToast/Host, Alert, DataState: `src/components/` | S1 | Перенести сповіщення й стани; вилучити access-denied | Інтегровано |
| DatePicker/DateField, `src/lib/dates.ts`, `calendar.ts` | S1 | Адаптувати календар, ручне введення, межі; UI ДД.ММ.РРРР, IPC ISO | Інтегровано й покрито цільовими тестами |
| Select, SearchField, DictionaryTable, Skeleton, ValidatedInput: `src/components/` | S1 | Перенести придатні готові контроли | Інтегровано; точні адаптації в UI-TRANSFER |
| KeyboardNavigation, `src/lib/keyboardNavigation.ts`, `tabNavigation.ts` | S1 | Адаптувати Enter/Tab/Ctrl+Enter/focus; без password та адресних hooks | Інтегровано |
| Налаштування, «Про програму»: `src/SettingsPage.tsx`, `src/styles.css` | S1 | Адаптувати секційну навігацію й about-картки; замість account/server — чинний BackupSettings; без updates runtime | Інтегровано в продовженні 3.4.1; основні GUI-сценарії переглядав користувач; повне формальне приймання не підтверджено |
| «Потрібна допомога?»: `src/App.tsx` help-card / support-contact-card | S1 | Адаптувати кнопку й Modal підтримки; контакти з джерела; чотири дозволені ID через захищений Main IPC та окреме копіювання | Інтегровано в продовженні 3.4.1; ручне GUI-приймання ще не виконано |
| Кадрові реєстр/форми/історія/модальна картка: `src/RecipientRegistry.tsx`, `src/AidRegistry.tsx`, модальні форми | S1 | Адаптувати RecipientFormModal/RecipientDetails, DecisionFormModal і registry-row-actions; без допомог/виплат | Реалізовано 3.4.2; на 3.4.2.2 — дві групи DictionaryTable, спільні filters/незалежні sorts; на 3.5 картка містить актуальні поля, а спільна форма створює й редагує працівника |
| Стартовий екран/анімації: `src/App.tsx` StartupScreen, `src/lib/startup-timing.ts`, `src/styles.css`, `src/main.tsx` | S1 | Адаптувати заставку, helper і boundary до HR/UsersRound/сиреневих токенів та SQLite; без auth/welcome/network/update gates | Реалізовано 3.4.3–3.4.3.1; мінімум 3500 мс, раннє Main-вікно/одна ініціалізація, reduced-motion, RecoveryScreen при помилці |
| Резервування й відновлення: server-manager/src/BackupManagement.tsx, server-manager/electron/main.ts | S1 | Адаптувати сумісні summary/cards/table/ID-action/open-folder патерни; зберегти власний локальний SQLite/recovery, без серверної архівної/auth логіки | Реалізовано до 3.4.3.8: один SHA-256-образ/два місця, каталог/журнал, захищений restore; runtime HR розширено цільово |
| Автоматичні оновлення | S1 лише для UI `src/SettingsPage.tsx`; технічний механізм не перевірено | Відкласти до відповідного етапу; не переносити клієнт-серверні залежності | Не реалізовано |
| Інсталятор, пакування, релізи та інші технічні механізми | Не визначено, цільова оцінка ще не проводилася | Відкласти; на початку відповідного завдання перевірити актуальне джерело й зафіксувати SHA | Не реалізовано |

Детальна provenance-таблиця UI-файлів, відмінності від оригіналу та ручне приймання: [UI-TRANSFER.md](UI-TRANSFER.md). Політика сама по собі не дозволяє змінювати SQLite/кадрову модель чи Electron security. Фактично схема — v8, дев’ять кадрових та дванадцять leave IPC; Інтерфейс підтверджених залишків додано в 4.2.

## Підетап 4.1 — облікові періоди

Read-only перевірено `src/lib/calendar.ts` та `src/lib/dates.ts` HromadaAID на SHA `33eca10733caaf73b1a99e75a24ff35e706a0afb`. Є загальний календарний helper (включно з `daysInMonth`), але немає leave/period/balance реалізації; цільовий пошук також не виявив модуля періодів відпусток. HR зберігає власні чинні ISO/date utilities й реалізує окремі чисті функції періодів із календарними перевірками, тому код AID не копіювався. Жодної предметної логіки матеріальної допомоги, серверних API чи нарахувань не переносили. Реалізовано 4.1 Main/SQLite/IPC; UI-компоненти не змінювалися.

## Уточнення 3.4.2.1

AID First означає повторне використання компонентів/геометрії/поведінки, а HR зберігає власну сиренево-фіолетову ідентичність через один комплект семантичних токенів. Зелена палітра 3.4.1 більше не чинна. Джерело S1: App.tsx/styles.css — банер/футер; SettingsPage.tsx/styles.css — settings card composition. Ці джерела адаптовано 3.4.2.1 для головної й BackupSettings. Реалізацію локального backup/recovery HR збережено без змін; технічне вдосконалення AID backup лишається окремою майбутньою оцінкою. CategoryField повторно використовує вже перенесений Select, без правової автоматизації. Деталі адаптацій/тестів/ручних обмежень — секція 3.4.2.1 UI-TRANSFER.md.

## Уточнення 3.4.2.2

UI composition повторно адаптовано з S1 RecipientRegistry; filters/toggle/reset/sort controls та їхні стилі — з S1 AidRegistry/styles. Реалізовано одну панель для двох DictionaryTable wrappers з незалежними сортами, без дублювання логіки або нової grid-бібліотеки. Home counts — локальна адаптація з реальних personnel.listEmployees, без AID фінансових показників.

Попередній CategoryField/enum choices вилучено: category read-only у картці/історії, UI payload визначає консервативна assignmentPolicy. Note видалено з усієї актуальної моделі та БД через HR migration 4 із чинною verified protection; це власна предметна зміна, не перенесення несумісної AID моделі. Source копії v3 не змінюються, їхнє відновлення мігрує active дані без note.

Backup UI більше не дублює sameVolume у summary; runtime HR збережено. Стартові анімації/3.4.3, майбутні модулі, installer/updates лишаються відкладеними. Детальна provenance, тести й невиконаний ручний чекліст — UI-TRANSFER 3.4.2.2.


## Цільове продовження 3.4.2.3

| Можливість / джерело | SHA | Рішення / обґрунтування | Фактичний стан |
| --- | --- | --- | --- |
| Щоденна робота: src/App.tsx workspace-actions/workspace-shortcuts; src/styles.css | S1 | Адаптувати реальні JSX/геометрію/hover/responsive до 5 HR карток і сиреневих токенів; без ролей | Інтегровано; тільки employees/settings активні, старий summary вилучено |
| Контакти: src/App.tsx help Modal tel/mailto/Telegram | S1 | Адаптувати поведінку відкриття; замість URL з renderer — 4 ID з Main allowlist; fallback copy | Інтегровано, system.openContact, без довільного openExternal |
| Історія: server-manager/src/App.tsx EventTable; server-manager/src/BackupManagement.tsx таблиця станів | S1 | Адаптувати компактні рядки часу/операції/статусу через вже перенесений DictionaryTable. Demo events, auth, API, encryption не переносити | Реальний Main-only журнал HR, backup.getHistory; ніякої вигаданої історії |

Зберігання/обмеження/невтручання діагностичного журналу — HR-only рішення, описане в ARCHITECTURE/HANDOFF. Це не перенесення серверного backup backend AID.


## Startup 3.4.3

За S1 повторно прочитано src/App.tsx (StartupScreen/послідовність), src/lib/startup-timing.ts, src/styles.css (app-startup/keyframes/reduced-motion), src/main.tsx (StartupBoundary). Фактично адаптовано до src/components/StartupScreen.tsx, src/lib/startup-timing.ts, src/styles/startup.css, src/bootstrap.tsx/main.tsx та gate App. Збережено JSX/геометрію/анімації/helper; змінено бренд/іконку/семантичні кольори й мінімум 5000→2000.

Main createStartup — HR-only узгодження з наявним SQLite: вікно до initializeSafely, once Promise, ready перед auto-backup, retry guard і завершення startup до close. AuthenticatedUser/Login/Welcome/session/connection/ClientUpdateGate та серверні механізми не перенесено як несумісні. П'ять цільових перевірок/наявний Electron Main smoke/typecheck/build/diff пройшли; ручний підсумковий чекліст 3.4 в UI-TRANSFER невиконаний.


3.4.3.2: за S1 цільово повторно звірено src/components/Select.tsx, src/RecipientRegistry.tsx і src/styles.css. Збережено перенесені Select/Modal/recipient-form-actions/history/icon-action патерни; HR-адаптації — порядок кадрових полів/колонок, 44px Plus, 40px history icons і спільний footer картки. Локально виправлено конфлікт search focus-within із загальними keyboard/input focus стилями, без переписування Select або keyboard logic. Деталі/невиконаний GUI-чекліст — UI-TRANSFER, секція 3.4.3.2.


## 3.4.3.3 — іконки, продуктовий About і компактні контакти

Джерело S1 (33eca10733caaf73b1a99e75a24ff35e706a0afb), цільово перевірене read-only:

| Джерело AID | Рішення | Фактичний стан HR |
| --- | --- | --- |
| assets/hromadaaid.svg/png/ico; assets/README.md | Адаптувати підхід SVG як джерела та багаторозмірного ICO, не бренд AID | Власні hromadahr.svg/png/ico: UsersRound, #6F5AA5, rx=12; PNG 512, ICO 16–256 |
| scripts/generate-manager-icons.mjs | Адаптувати наявний Electron offscreen renderer без нових залежностей | scripts/generate-icons.mjs, ізольовані temp profile/session/logs/crashes, контроль шляху очищення; генерація лише під час розробки |
| electron/copy-assets.mjs; electron/main.ts | Перенести тільки копіювання іконок і BrowserWindow.icon; зайві server/financial/reference копії не переносити | Build копіює три готові ресурси в dist-electron/electron/assets, dev/built ICO; packaged resources/assets потребує окремого майбутнього пакування |
| src/SettingsPage.tsx hromadaAidLogo | Перенести принцип продуктового логотипа About | About показує власний SVG, головна лишається з гербом |
| src/App.tsx Help Modal | Адаптувати наявні contact cards і Modal, зберегти HR ID-only external IPC | Спільна візуальна картка/сусідні open+Copy buttons, wide/2→1 container grid, toast копіювання; без вкладених кнопок |

Пакування/NSIS, чужі EXE/ярлики/зелений бренд не переносилися. Деталі Windows-обмежень, генерації та built paths — assets/README.md; невиконане ручне приймання — UI-TRANSFER 3.4.3.3.


## 3.4.3.4 — presentation резервування

S1: повторно цільово звірено src/SettingsPage.tsx (cards/heading/Modal) та server-manager/src/BackupManagement.tsx (короткі статуси/restore preview, busy/error та footer). Рішення — адаптувати наявну візуальну мову через вже перенесені HR Modal/Alert/DictionaryTable/Select/Toast: п'ять компактних зон, common technical details, модальний restore. Server auth/API/архівний backend/шифрування/демонстраційні дані не переносилися; власний надійніший HR backend збережено. Фактично змінені тільки BackupSettings/BackupHistory/settings.css, а guarantees одноразового токена/нативного підтвердження/rollback чинні. Ручне приймання передано замовнику, ще не виконане; деталі — UI-TRANSFER 3.4.3.4.


3.4.3.5: S1 electron/main.ts і src/SettingsPage.tsx цільово перевірено — zoom-аналога у цих файлах немає (це не повний аудит інших модулів). Рішення: власний мінімальний Main ZoomController, вузький get/set IPC, наявний Select у settings heading; native setZoomFactor і окремі Electron-profile preferences. Чинна сітка форми адаптована subgrid без нового компонента; продуктовий SVG збережений, Vite inline вимкнено для сумісності з незмінною CSP. Стан — реалізовано, ручне приймання очікується.


3.4.3.6: S1 server-manager/src/BackupManagement.tsx та server-manager/electron/main.ts (manager:backup-open-folder) повторно прочитано read-only. Адаптовано принцип server-owned saved directory + shell.openPath до двох HR слотів, strict typed IPC і повторної directory-перевірки; серверні gates/auth/довільний path API не переносилися. Повна ширина, контекстні Save/Cancel й selectable path links лишаються в чинній дизайн-системі. BackupHistory/restore/backend policy збережені. Реалізовано, програмна перевірка нового IPC пройшла з mock OS opener; ручне відкриття/компонування очікує замовника.


3.4.3.7: S1 (33eca10733caaf73b1a99e75a24ff35e706a0afb) server-manager/src/BackupManagement.tsx повторно прочитано read-only: адаптовано таблицю архівів/ID-дiю/розділення доступності та перевірки, через HR DictionaryTable і спільний Modal. Серверні архіви/auth/API/шифрування не переносилися; власний HR restore lifecycle збережено. Новий Main каталог — лише namespace поточної SQLite-lineage у двох активних теках з обмеженням і identity guards. Стан: реалізовано й цільово перевірено програмно, GUI-приймання очікується.


3.4.3.8: source 33eca10733caaf73b1a99e75a24ff35e706a0afb, server-manager/src/BackupManagement.tsx (summary/cards/table) повторно цільово перевірено. Адаптовано композицію чинними HR card/controls, із сиреневою палітрою, inline warning, однією primary та logical rows. Власний SQLite backup розширено до одного образу/двох публікацій, без копіювання серверного AID алгоритму/auth. Реалізовано; цільова перевірка/Windows GUI-приймання — HANDOFF 3.4.3.8.

### Спрощення реєстру 3.5

За S1 цільово звірено `src/RecipientRegistry.tsx` для поточних полів форми й модальної композиції. Повторно використано вже перенесені Modal, ConfirmDialog, DateField, Select, DictionaryTable та сповіщення. Предметні поля джерела відрізняються, тому модель v5 і її дев’ять IPC належать HromadaHR.

## 4.2 — Панель залишків

На SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb звірено src/RecipientRegistry.tsx (DictionaryTable і стани завантаження) та src/AidRegistry.tsx (Select працівника за аналогією з отримувачем, DateField, Modal, форма зі збереженням і захистом чернетки). У HromadaHR використано чинні спільні компоненти й семантичні стилі. Предметний сценарій використовує власні контракти leave.

## 4.2.1 — Компактний редактор і таблиця

На SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb перевірено src/RecipientRegistry.tsx та src/AidRegistry.tsx. Реалізовано адаптацію дій рядка, спільних полів та футера через наявні компоненти HR. Деталі композиції зафіксовано в UI-TRANSFER.

## 4.3 — Реєстрація та журнал

Read-only SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb. Цільово звірено src/AidRegistry.tsx — Modal wide, Select, DateField, ValidatedInput, recipient-form-actions, явне підтвердження й оновлення реєстру після збереження. Адаптовано композицію через чинні компоненти HR. Календарне ядро, FIFO, транзакції й ідемпотентність є предметною реалізацією HR. Серверна/фінансова логіка джерела не переносилася.

## 4.4 — Дії корекції

Read-only джерело SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb, src/RecipientRegistry.tsx (beginEdit, expectedUpdatedAt, іконкові дії) та src/AidRegistry.tsx (оновлення реєстру й форми). У HR повторно використано чинні Modal/ConfirmDialog/ValidatedTextarea і форму реєстрації. expectedUpdatedAt адаптовано до предметної revision, запитів updateLeave/cancelLeave та перевірки фактичного результату. Серверні механізми джерела не переносилися.

## 4.5 — Подієві відпустки

Цільово перевірено src/RecipientRegistry.tsx (RecipientFormModal, Select умовних полів, recipient-field/fieldset, editing/expectedUpdatedAt) і src/components/ValidatedInput.tsx у read-only HromadaAID за S1 = 33eca10733caaf73b1a99e75a24ff35e706a0afb. Рішення: повторно використати вже адаптовані Modal/Select/DateField/ValidatedTextarea/ConfirmDialog, умовне компонування чинної LeaveRegistrationForm, наявний refresh/revision і дії журналу. Реального leave-модуля в цільовому переліку src AID не виявлено; загальний аудит і перенесення матеріальних допомог не проводилися. Облікові перевірки, SQLite/IPC та v9 залишаються власною Main-only реалізацією HR. Нових залежностей, дизайну чи runtime-зв’язку з AID немає.

## 4.6.2 — Перекомпонування відпусток

Джерело read-only: src/AidRegistry.tsx, SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb. Цільова оцінка реєстру/фільтрів і вкладеного вибору отримувача; сумісні патерни адаптовано через чинні HR-компоненти. Періодні підсумки, details та короткі пояснення спроєктовано під задачі кадровика; предметні моделі AID не переносилися. Фактичні адаптації й відкладене GUI-приймання — UI-TRANSFER 4.6.2.

## 4.6.3 — Горизонтальні секції

Джерело src/SettingsPage.tsx HromadaAID, SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb: read-only звірка горизонтальних секцій. Повторно використано чинну HR-адаптацію settings-section-nav/current з локальними вкладками журналу/залишків, без акаунтів чи серверної логіки. Форми використовують уже перенесені Modal/поля/ConfirmDialog і HelpTip HR; адаптивні зміни локальні в leave.css. Стан ручного приймання — HANDOFF 4.6.3.

## 4.6.4 — Журнал за кадровим реєстром

Прочитано src/RecipientRegistry.tsx AID, SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb; джерело read-only. Використано надійніші чинні HR-компоненти EmployeeRegistry/EmployeeGroupTable, а не серверні запити AID. Адаптації toolbar/filter/sort/table, секцій картки й модалок зафіксовано в UI-TRANSFER. Ручні права — мінімальне розширення Main/SQLite HR, жодного перенесення фінансової моделі AID.

## 4.6.5

Read-only src/SettingsPage.tsx AID, SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb: звірено три горизонтальні секції. Застосовано чинні HR-контроли, інформаційні секції особової картки та реєстр; специфічні акаунтні/серверні функції AID не переносилися. Адаптації й ручне приймання — UI-TRANSFER/HANDOFF 4.6.5.

## 4.6.6 – Вибір контексту й компактні реєстрові рядки

Перевірено read-only src/RecipientRegistry.tsx, SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb: DictionarySearch/DictionaryTable, явне відкриття/вибір запису, іконкові дії. Рішення – адаптувати чинні HR SearchField/DictionaryTable і секції картки, не переносити предметну модель отримувачів. Фактично: EmployeeChooser з guard та native keyboard buttons; LeaveRights з native radio й одним збереженням; LeaveTypeIcon для шести видів. Нових залежностей/універсальної бібліотеки немає. Геометрія Windows і масштабування залишаються ручним прийманням.

## 4.8.2 – Контекстний редактор залишків

Звірено read-only `src/AidRegistry.tsx` HromadaAID на SHA `33eca10733caaf73b1a99e75a24ff35e706a0afb`. Адаптовано принцип локальної чернетки й явного завершення контекстної дії. Реалізація повторно використовує наявні форми й захист HromadaHR.

## 4.8.3 – Спільна дата в редакторі

Звірено `src/Dictionaries.tsx` HromadaAID на SHA `33eca10733caaf73b1a99e75a24ff35e706a0afb`. Застосовано наявний DateField у формі та спільні компоненти HromadaHR. Послідовність записів і календарні правила належать HromadaHR.

## 4.8.4 – Контекстні фільтри чинного журналу

Звірено `src/AidRegistry.tsx` HromadaAID на SHA `33eca10733caaf73b1a99e75a24ff35e706a0afb`. Адаптовано ідею відкриття чинного реєстру із зовнішнім контекстом і редагованими фільтрами. Використано таблицю, фільтри та чернетку HromadaHR.

## 4.9.1 – Підсумок підтвердження

Звірено `src/components/ConfirmDialog.tsx` і застосування в `src/Dictionaries.tsx` HromadaAID на SHA `33eca10733caaf73b1a99e75a24ff35e706a0afb`. Використано чинні ConfirmDialog і Modal HromadaHR. Додано опційне компонування зі штатним футером і структурованим підсумком.

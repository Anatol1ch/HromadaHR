# Перенесення UI HromadaAID → HromadaHR (3.4.1–3.4.3.8)

Джерело: `Anatol1ch/HromadaAID`, commit **33eca10733caaf73b1a99e75a24ff35e706a0afb**. HEAD перевірено через read-only Git та GitHub connector 03.11.2026; він збігався з погодженим SHA. Файли прочитано за фіксованим ref, не з рухомої гілки. Локального checkout HromadaAID не було: потрібні текстові файли збережено в окремому тимчасовому каталозі без `.git` для аналізу. Джерело, його історія/налаштування та `reference/` не змінювалися.

Цільова база перенесення: HromadaHR c479d23577e1f61cf16f6c732476a64ef487b2e1; робоча гілка codex/3.4.1-aid-ui-foundation. Реалізацію 3.4.1–3.4.3.8 завершено, фінальну інтеграцію в main погоджено; Git-стан фіксує [HANDOFF.md](HANDOFF.md).

**Чинний UI:** AID — компоненти, геометрія та поведінка; HR — власна сиренево-фіолетова палітра. Постійний реєстр має дві таблиці й модальні кадрові сценарії. Після 3.5 спільна модальна форма працює з актуальними полями працівника, а картка показує окрему дату прийняття, поточну посаду й підрозділ. Для цієї адаптації звірено src/RecipientRegistry.tsx за тим самим SHA та повторно використано перенесені компоненти. Є StartupScreen (мінімум 3500 мс), бренд/About/help, дати ДД.ММ.РРРР, keyboard zoom без видимого selector, summary резервування та один рядок на новий SHA-256-знімок у двох місцях.

Основні GUI-сценарії перевіряв користувач. Повне формальне приймання всіх сценаріїв, зокрема аварійного відновлення, не підтверджено. Нижчі секції зберігають історію адаптацій і результати на момент підетапу; «не виконано» та старі заборони переходів не є новою оцінкою вже переглянутого GUI чи поточною забороною merge. Непідтверджені чеклісти лишаються незаповненими.

## Походження компонентів і підтримувальних модулів

Шляхи джерела й призначення однакові, якщо не вказано інше. Перенесено реальну реалізацію, а не стилістичну імітацію.

| Оригінальний файл | Адаптація / використання в HR |
| --- | --- |
| `src/components/Modal.tsx` | Реалізацію збережено: portal, стек, busy/dismissible, Tab trap, Escape, body scroll lock, inert попередньої модалки, повернення фокусу. |
| `src/components/ConfirmDialog.tsx` | Реалізацію збережено разом із UnsavedChangesConfirmation та внутрішнім async/ref-guard. Адаптер кадрового DeleteConfirmation передає Promise операції, помилку й предметний текст. |
| `src/components/closeConfirmation.ts` | Збережено store, один pending request, subscribe/cancel/finish і перевірку підключеного owner. NavigationGuard HR тепер приймає callback переходу, щоб чекати спільний асинхронний діалог. |
| `src/components/SystemToast.tsx` | Збережено ролі/live regions, ручне закриття, 3500 ms та 180 ms closing. Видалено тільки access-denied/LockKeyhole. |
| `src/components/SystemToastHost.tsx` | Збережено чергу та перевірку повідомлення; namespace події змінено на hromadahr:system-toast, вилучено access-denied. Host змонтовано один раз у root. |
| `src/components/DatePicker.tsx` | Збережено календар/popover, українські місяці, рік/стрілки/PageUp/PageDown/Home/End, min/max та ISO onChange. Додано onDraftChange для dirty невалідного тексту; validationMessage винесено в dates.dateInputError; валідний ISO з clipboard відразу показується як ДД.ММ.РРРР; Tab із portal продовжує рух від поля через джерельний tabFromPopup. |
| `src/components/DateField.tsx` | Оригінальний alias DatePicker; усі кадрові дати використовують його. Native date inputs видалено. |
| `src/components/Select.tsx` | Реалізацію збережено: combobox, пошук, top-layer popup, стрілки, Tab/Escape, validation, clear та advanceOnSelect. Підключено до довідників, типу працівника й фільтра. |
| `src/components/SearchField.tsx` | Реалізацію збережено, підключено до реєстру зі збереженням кадрової пошукової логіки. |
| `src/components/DictionaryTable.tsx` | Реалізацію збережено; label колонки розширено до ReactNode, додано aria-sort для чинного сортування ПІБ. Таблицю реєстру підключено без змін listEmployees/фільтрації. |
| `src/components/Skeleton.tsx` | Збережено delayed-loading 180 ms і table/content/metric варіанти. TableSkeleton підключено до реєстру. |
| `src/components/KeyboardNavigation.tsx` | Збережено React event boundary, Enter/Tab/highlight, Ctrl+Enter і focus-first-invalid; password вилучено з переліку полів. Не перехоплює звичайний Enter textarea/popups/IME. |
| `src/components/ValidatedInput.tsx` | Збережено native validation, blur/touched та ValidatedTextarea; підключено до персональних/кадрових і швидких довідникових полів. Предметна перевірка залишається у HR. |
| `src/components/Alert.tsx` | Уже збігався з оригіналом; звірено й залишено одну реалізацію. Контекстні помилки/попередження залишаються persistent. |
| `src/components/DataState.tsx` | Збережено source presentation; retained planned/Info для ще не реалізованих функцій HR. |
| `src/lib/dates.ts` | Реальні source parsing/leap/ISO helpers; formatDate/formatDateInput посилено перевіркою календарної дати; додано formatDateTime для локальних timestamps та спільний dateInputError. |
| `src/lib/calendar.ts` | Математика джерела збережена: 6 тижнів, понеділок, межі 0001–9999, clamp дня при зміні місяця. Імпорт dates.ts має розширення для прямих Node TS-тестів; app noEmit дозволяє TS import extensions. |
| `src/lib/keyboardNavigation.ts` | Збережено focus helpers/popup owner. Прибрано адресний data-address-edit; Ctrl+Enter на основній сторінці дозволений лише всередині відповідної форми, не з sidebar. |
| `src/lib/tabNavigation.ts` | Реалізацію збережено, замінено дубльовані обробники вкладок особової картки. |

## Стилі та оболонка

`src/styles.css` джерела (2420 рядків) проаналізовано як CSS AST через вже наявний у Vite PostCSS, без додавання залежностей. Перенесено декларації токенів, base, shell, сімейства `.app-modal*`, `.confirm-dialog*`, `.calendar-*`, `.date-field-control`, `.app-select*`, `.ui-search*`/`.registry-search`, `.dictionary-table*`/toolbar/search, `.ui-alert*`, `.ui-data-state*`, `.ui-skeleton*`, `.system-toast*`, загальні кнопки/поля, focus/keyboard states, відповідні media rules й keyframes. Збережено порядок каскаду, включно з пізніми зеленими override та compact modal gutter. Для змішаних селекторів відібрано лише потрібні частини; не копіювався весь монолітний CSS.

Результат розділено між наявними `src/styles/{tokens,base,components,shell}.css`. Токени основної палітри: source `--accent-green=#286343`, soft/strong, нейтральні поверхні, радіуси, тіні та durations. Старі `--accent/--accent-soft/--accent-strong` — aliases тих самих токенів для тимчасових кадрових макетів, без окремої палітри. `--program-*` та report/financial tokens не перенесено. Print/report rules не переносилися. Старі дублікати спільних кнопок/контролів видалено; поля повноекранних HR-форм тимчасово отримують source `.recipient-field` і той самий стиль контролів через scoped `.employee-form-panel` alias. Source назва CSS-класу не означає перенесення моделі отримувачів.

`App.tsx` HromadaAID проаналізовано для структури shell/topbar/brand/page transitions. React App HR збережено (сім власних розділів, breadcrumbs, бренд HromadaHR, `assets/community-coat.png`). Скопійовано придатні shell-стилі з source й підключено спільні hosts/keyboard boundary в main.tsx. Auth/річний контекст/фінансові сторінки з source App не переносилися.

RecipientRegistry.tsx та AidRegistry.tsx джерела проаналізовано для таблиць, toolbar, полів, вкладених modal, validity та async-save патернів. RecipientFormModal і assignment modal реалізовані всередині цих файлів. Також цільово прочитано BankFormModal.tsx, DecisionFormModal.tsx та source DeleteConfirmation.tsx. Предметні форми/валідація/репозиторії/фінансове видалення не переносилися: вони пов’язані з отримувачами, банками, рішеннями, виплатами, accounting year та серверними контрактами. Їхні спільні Modal/ConfirmDialog/DateField/Select вже перенесено окремо.

## Дати та межа UI

Усі видимі кадрові дати, історія, діалоги й autoDay копій проходять один formatDate; необхідний час у backup settings — formatDateTime, строго ДД.ММ.РРРР ГГ:ХХ, без залежності від locale-rendering native date input. Порожні дати — «—» або контекстне «Ще немає». Службові filenames, ISO IPC/SQLite, checksum і технічні timestamps не змінені.

DatePicker зберігає невалідний ручний текст локально, ISO onChange викликає тільки для коректної дати в межах min/max. Форми перед IPC додатково перевіряють checkValidity/reportValidity та focusFirstInvalid: старе коректне ISO не можна зберегти замість невалідного видимого draft. onDraftChange враховує цей текст у попередженні про незбережені зміни. Валідний clipboard ДД.ММ.РРРР або ISO нормалізується відразу, blur також синхронізує dirty відформатованого draft; у IPC ніколи не передається відформатована дата. Календарна математика не використовує локальний DST для зміщення днів.

## Історична межа 3.4.1 і 3.4.2

На завершення 3.4.1 кадрові форми ще були повноекранними (згодом замінені модальними в 3.4.2), картка/toolbar/layout мають тимчасові scoped HR-правила. Їх не розвивати як іншу систему: у 3.4.2 перенести композицію цих форм у source Modal, quick dictionaries у вкладені modal, уніфікувати картку/дії та прибрати непотрібні legacy selectors. Синхронний beforeunload поки зберігає native confirmation: він не може очікувати React-діалог без зміни Electron close lifecycle. Внутрішні переходи/cancel/breadcrumbs/sidebar вже використовують source UnsavedChangesConfirmation. Electron у 3.4.1 не змінювався.

SystemToastHost використовується для короткого успіху кадрових операцій/довідників і feedback резервування, підтримує success/error/warning/info. Контекстні Alert залишені для помилок форми, стану SQLite, важливих backup/restore попереджень. Черга, close, durations та ARIA повторюють source; auth access-denied немає.

## Перевірки та ручне приймання

`pnpm typecheck`, `pnpm test` (104/104 + реальний Electron Main smoke), `pnpm build`, `git diff --check`. Вісім нових ризик-орієнтованих тестів охоплюють parsing/formatting, leap/invalid/min/max, роки 0001/9999, month grid/movement, local timestamp format, ISO payload у чинних Zod-контрактах і close-confirmation store. Наявні SQLite/кадрові/backup тести без регресій, лише temp БД/профілі. GUI snapshot і звичайні кліки не автоматизувалися; візуальна тотожність та поведінка у справжньому вікні ще потребують ручного приймання.

- [ ] Зіставити shell, зелену палітру, контролі, таблицю й focus states із HromadaAID на тому самому масштабі Windows.
- [ ] Ввести/вставити ДД.ММ.РРРР, вставити ISO, очистити необов’язкову дату, перевірити невалідну дату після коректної, 29.02.1900/2000, min/max і стару майбутню дату.
- [ ] Відкрити календар: стрілки, PageUp/PageDown, Shift+PageUp/PageDown, місяць/рік, межі 0001/9999, Tab/Shift+Tab/Escape та повернення фокусу.
- [ ] Перевірити Select пошук/стрілки/Enter/Tab/Escape, Enter між полями, звичайний Enter textarea, Ctrl+Enter у формі та його відсутність на sidebar/confirm dialog.
- [ ] Перевірити втрату змін на cancel/breadcrumbs/sidebar, busy, DeleteConfirmation із ПІБ/кількістю/помилкою, закриття й повернення фокусу. Вкладені кадрові форми — ще 3.4.2.
- [ ] Перевірити чергу toast, ручне закриття/таймер, error/success/warning/info, reduced motion, вузьке вікно й масштаб 125–200%.
- [ ] У налаштуваннях копій перевірити autoDay ДД.ММ.РРРР та timestamps ДД.ММ.РРРР ГГ:ХХ; технічні імена файлів лишаються оригінальними.

Ручний чекліст не виконано. До 3.4.2 не переходили; main не зливався.

## Продовження 3.4.1 — налаштування, about, help

На тому самому source SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb додатково цільово прочитано `src/SettingsPage.tsx`, help-card/support-contact-card у `src/App.tsx` та їхні правила `src/styles.css`.

- `src/components/SettingsPage.tsx`: адаптовано реальне компонування секцій і about-карток AID. Збережено бренд/герб HR; версія надходить через чинний system.getInfo. Account/password/server/clientUpdates виключені. Замість них — наявний BackupSettings, який не демонтується при перемиканні до about, щоб не втратити вибір тек.
- `src/components/HelpDialog.tsx`: адаптовано джерельні Modal, структуру підтримки, іконки й контакти. Посилання замінено доступним для виділення/копіювання текстом: HR не має external-opening IPC, і додавати такий контракт лише заради цих посилань не потрібно. У вузькій sidebar кнопка лишається доступною як іконка з назвою.
- `src/styles/settings.css`: тільки використані сімейства settings/about/origin/help/support, включно з responsive; без account/security/server/client-update стилів. Селектор контактних посилань адаптовано під текстові картки.
- `src/App.tsx`: інтеграція SettingsPage та help-card; прибрано дубльований footer версії, відомості тепер на сторінці about. Сім розділів і кадрові контракти без змін.

Глобальна політика й реєстр усіх напрямів: [HROMADAAID_REUSE.md](HROMADAAID_REUSE.md). Це не перебудова кадрових екранів 3.4.2.

Додатковий ручний чекліст (не виконано):

- [ ] Налаштування: обидві секції доступні з клавіатури; about показує версію/герб/призначення/локальний режим.
- [ ] Вибрати тестову теку без збереження, перейти до about і назад: вибір не втрачено. Не запускати restore на продукційному профілі.
- [ ] «Потрібна допомога?» у широкій/вузькій sidebar: відкриття Modal, Tab/Shift+Tab/Escape, повернення фокусу, копіювання контактів, масштабування Windows.

## Етап 3.4.2 — кадровий модуль поверх постійного реєстру

База HR: `85548b1218455d3679ec0d66009c4b1507ce769f`; та сама робоча гілка `codex/3.4.1-aid-ui-foundation`. Source AID: **33eca10733caaf73b1a99e75a24ff35e706a0afb**, прочитано за pinned ref через read-only GitHub connector. Загального аудиту AID не було.

### Цільова адаптація джерела

| Джерело AID | Фактичне використання 3.4.2 |
| --- | --- |
| `src/RecipientRegistry.tsx`: registry, exported RecipientFormModal, RecipientDetails | Реєстр з іконками Eye/Pencil/Trash2 і registry-row-actions; Modal над постійним реєстром; recipient-fieldset/form-grid/form-actions у EmployeeForm; recipient-details/detail-section/detail-grid та history table в EmployeeCard. RecipientFormModal визначено всередині цього файлу, не окремим компонентом у src/components. |
| `src/AidRegistry.tsx` | Компактна композиція пошуку/фільтрів, вкладені форми та оновлення реєстру без route-переходу. Предметна/серверна логіка не переносилася. |
| `src/components/DecisionFormModal.tsx` | Композиція компактної кадрової/довідникової форми, ref guard, контекстна помилка, source footer із cancel/save та toast після успіху. |
| `src/styles.css`: recipient details/history, dictionary-tabs, registry-row-actions/danger-action | Перенесено тільки потрібні правила в employees.css; назви source класів збережено. Header h2 адаптовано до h3 усередині Modal; кадрові колонки та горизонтальний scroll історії — предметна адаптація. Без status/amount/payment/auth CSS. |
| Уже перенесені компоненти 3.4.1 | Modal, ConfirmDialog/UnsavedChangesConfirmation, DateField, Select, ValidatedInput/Textarea, SearchField, DictionaryTable, Skeleton, Alert/DataState, KeyboardNavigation, SystemToastHost, dates/calendar/tabNavigation повторно не копіювалися й не замінювалися. |

### Реалізовані сценарії та відмінності

Реєстр завжди змонтований; search/filter/sort зберігаються у workspaceReducer, основні крихти показують «Працівники». Всі індивідуальні операції — modal overlays. Створення відкриває картку; персональне редагування та призначення зберігають змонтовану картку/її вкладку, оновлюють реєстр відповіддю Main і запускають перечитування картки/історії/довідників. Вибрані вкладки майбутніх модулів лишаються заглушками. Особова картка має власний scroll у app-modal-content. Таблиця історії показує start/end/current; end тільки presentation з наявним захистом року 0001.

DirectoryForm — окремий компактний вкладений Modal: draft/помилка не належать батьківській формі; втрата змін підтверджується тільки відповідним власником. Parent form не демонтується. Submit з portal зупиняє React bubbling, щоб не відправити батьківську форму. Довідник зберігається відразу, оновлюється/вибирається, CONFLICT перечитує перелік, фокус повертається до Select. Додавання не означає дозволу редагувати/видаляти довідники.

Для дій із реєстру EmployeeActionDialog читає актуальні employee/history; повне видалення заблоковано до завантаження. ConfirmDialog показує ПІБ, кількість, незворотність та помилки. Для призначень ConfirmDialog використовується прямо в картці. Compatibility adapter DeleteConfirmation видалено. Busy/ref guards блокують дублікати й випадкове закриття. Відповідь backend залишається джерелом кадрових обчислень; локальне збереження даних не додано.

useUnsavedChanges більше не шукає `.employees-workspace form`. Owner refs передаються явно; closeGuards координує тільки dirty/busy дозволи зверху вниз і один source pending confirmation. Cancel/хрестик/Escape/backdrop проходять через ту саму функцію. Власне visual stack, inert, focus trap/restore, scroll lock та анімації — незмінний Modal AID. Перед переходом sidebar перевіряються всі форми, зміна стеку анулює відкладений перехід. Один синхронний beforeunload listener зберігає попереднє обмеження, не змінюючи Electron lifecycle. Для видаленого opener фокус повертається до заголовка реєстру, для решти — до попередньої кнопки без scroll.

Вилучено legacy CSS повноекранних форм, старих вкладок і timeline; прибрано тимчасові employee-form-panel aliases у shared components.css. Залишені employee-* правила пов’язують source композиції з кадровими полями, не створюють альтернативного комплекту контролів. Відмінності від AID обґрунтовані предметними полями HR, локальними IPC і відсутністю auth/server/financial функцій.

### Перевірки та обмеження

`pnpm typecheck`; цільові `employees-ui`, `employees-modals`, `ui-foundation` — **22/22**; `pnpm test` — **110/110** + Electron Main smoke; `pnpm build`; `git diff --check`. Шість нових тестів перевіряють reducer/параметри реєстру, відповіді мутацій, явних owners/один pending confirm, sidebar top-down, busy/зміну стеку/disconnected owner, ISO/null payload та невалідні дати. GUI snapshot/click automation не додавалися. Чинні SQL/IPC/backup тести використовують лише temp БД/профілі; реальні кадрові дані не відкривалися.

Ручна оцінка точності зовнішнього вигляду, focus/inert у справжньому Electron та масштабування Windows **ще не виконана**. Нативне beforeunload залишається синхронним. Початкове createEmployee сумісно з попередньою моделлю допускає майбутню дату прийняття; нові кадрові зміни — ні. Параметри реєстру зберігаються при модальних операціях, а не між перезапусками/виходом із розділу. Стартовий сценарій, settings/about, SQLite/13 IPC/security/backup не змінено. 3.4.3 не розпочато.

### Наскрізне ручне приймання 3.4.2 — не виконано

Лише ізольований тестовий Windows-профіль і синтетичні записи. `start:built` без ізоляції відкриває продукційну БД.

- [ ] Задати пошук, підрозділ, зворотне сортування та прокрутити таблицю. Відкрити/закрити картку й редагування іконками: параметри й положення реєстру збережені, крихти не змінюються на ПІБ. Перевірити no-results/error/retry/empty.
- [ ] Створити працівника: nullable поля, тип, початкове призначення; вставити ДД.ММ.РРРР/ISO, очистити необов’язкову дату. Ввести невалідну дату після валідної — submit блокується, перша помилка отримує фокус. Успіх відкриває нову картку й toast; повторний submit під час запиту недоступний.
- [ ] У формі створення → нова посада/підрозділ: autofocus, Enter/Tab/Ctrl+Enter, українська назва й Unicode-дублікат, contextual error, збережені поля parent. Успіх вибирає запис, фокус на Select; скасування parent не видаляє запис довідника.
- [ ] Картка → персональне редагування → скасування зі змінами: cancel/X/Escape/backdrop показують одне підтвердження, «Продовжити» зберігає draft. Збереження nullable полів оновлює картку й таблицю; кадрові відомості не редагуються цією формою.
- [ ] Вибрати вкладку «Ранги», відкрити редагування, закрити: лишається та сама вкладка. Перевірити Tab/Shift+Tab і стрілки вкладок, inert батьківської модалки, повернення фокусу, власний scroll картки, відсутність scroll основної сторінки.
- [ ] Картка → кадрова зміна → новий довідник → підтвердження втрати draft. Escape закриває лише верхнє вікно; усі батьківські дані залишаються. Перевірити calendar/Select popup Escape перед Escape форми.
- [ ] Додати історичну зміну, виправити перше/проміжне призначення; перевірити дублі дати/сусідніх станів, майбутню/до народження дату. Успіх оновлює hire/current/category/history/реєстр; помилка зберігає draft. Видалити проміжний запис через confirm; єдиний запис видалити не можна.
- [ ] Видалити працівника з картки та окремо з реєстру: актуальні ПІБ/кількість, cancel autofocus, незворотність, busy, помилка лишає confirm, успіх закриває картку/прибирає рядок. Довідники залишаються. Фокус після видалення — заголовок реєстру.
- [ ] Вихід sidebar із dirty/вкладеними формами (коли навігація доступна): підтвердження зверху вниз, скасування не виконує перехід, busy блокує вихід. Окремо перевірити закриття вікна Electron із dirty/busy без зависання.
- [ ] Зіставити геометрію таблиці/форм/вкладок/футерів із AID; вузьке вікно, Windows 125–200%, reduced motion, видимий фокус і черга сповіщень. Не позначати приймання виконаним без фактичної перевірки.

## Етап 3.4.2.1 — межа кольорової адаптації та UX

AID лишається еталоном компонентів/геометрії/поведінки. HR має власну сиреневу тему; твердження про зелену палітру у попередніх секціях є історією 3.4.1. Поточний source SHA: **33eca10733caaf73b1a99e75a24ff35e706a0afb**. Цільово перечитано `src/App.tsx`, `src/SettingsPage.tsx`, `src/styles.css`, джерело read-only.

- `App.tsx`, `shell.css`: адаптовано source workspace-coat-area та home footer (copyright/year, council, hr, Code2/credit); використано чинний герб без заміни. Робочий блок веде до реального кадрового реєстру без фіктивних KPI. Sticky topbar не змінює Electron/startup lifecycle.
- `tokens.css`, `components.css`, `shell.css`, `employees.css`, `settings.css`, `base.css`: brand/interactive кольори через accent/hover/soft, text/surface/border/focus токени; green імена прибрані. Success/warning/danger збережено. Контрастні нейтральні тексти на світлих поверхнях. Геометрія контролів/анімації/stack не переписані.
- `BackupSettings.tsx`: реальне компонування settings-card-heading/settings-icon та about-grid принципів `SettingsPage.tsx` AID адаптовано до двох місць локального резервування. Новий presentation helper працює тільки з Main статусом. Same-volume Alert біля summary; помилки/lastAttempt видимі; filename у details; restore окремо. Жодна технічна реалізація backup AID не копіювалася. Polling/паралельні блокування/tokens/підтвердження HR незмінні.
- `EmployeeForm`, `AssignmentForm`, новий `CategoryField`, `categories.ts`: source Select використовується для I–VII та nullable; legacy значення додається дослівно без зіставлення/перезапису. Категорія — у додаткових кадрових реквізитах, без автозаповнення. Початкова форма без note/category валідна. Note details у create закрито; наявна примітка в edit відкрита, значення не скидається. Дубль кадрових readonly-фактів у персональній формі прибрано. `EmployeeCard` не показує порожню note-секцію/дубль ПІБ у description.
- Header icons у звичайних Modal вирівняно через grid :has; ConfirmDialog зберігає свій layout. Відступи кадрових форм ущільнено. Red validation залежить від aria-invalid/touched/submit, а не CSS :user-invalid; валідація й перший invalid focus лишилися.

Автоматично: `pnpm typecheck`; цільові UI **26/26**; `pnpm test` **114/114** + справжній Electron Main smoke; `pnpm build`; `git diff --check`. Нові чотири тести охоплюють optional/null, legacy category/note, overview backup без неправдивого захисту, AA токенів. Немає GUI snapshot-тестів. Геометрія/focus/scroll на Windows та піксельна відповідність не перевірені вручну; числа контрасту стосуються перевірених токенових пар, не сертифікації всього UI.

### Ручне приймання 3.4.2.1 — не виконано

У кожному потрібному режимі: 1600×900, 1366×768, вузьке вікно, Windows 125%, 150%, 200%. Копії/restore — лише ізольований тестовий профіль, не start:built із продукційною БД.

- [ ] Головна: герб центрований/не обрізається, текстова шапка пропорційна, кнопка відкриває працівників, footer унизу без накладання, рік/рада/credit наявні.
- [ ] Sidebar fixed і topbar sticky не перекривають вміст; сторінки мають один вертикальний scroll, таблиці — тільки власний горизонтальний. Сім розділів збережено.
- [ ] Палітра сиренева для logo/nav/buttons/tabs/Select/calendar/focus/help/about; успіх зелений, видалення червоне, warning бурштиновий. Keyboard focus видимий на всіх діях.
- [ ] Backup: дві картки → одна колонка на вузькому вікні; довгий шлях читається/копіюється, filename у details; доступність/lastSuccess/lastAttempt/error зрозумілі. Same-volume warning біля summary не обіцяє захисту диска.
- [ ] Змінити тестову теку, перейти about/back: draft збережений, old success позначений як попередня тека. Зберегти; ручні копії/часткова помилка/недоступний носій/busy дають правильні результати без повторної операції.
- [ ] Restore: вибір/cancel, details filename/schema, окрема небезпечна дія, native підтвердження з cancel, protective copy, очікуване перезавантаження. Помилка не видається за успіх. Лише temp профіль.
- [ ] Нова кадрова форма спочатку без червоного оформлення; note/category закриті й необов’язкові. Submit порожньої/невалідної форми фокусує першу помилку; помилка дати після валідної не дозволяє stale ISO.
- [ ] Створити працівника без note/category; у edit наявна note відкрита. Згорнути/розгорнути й зберегти: текст не губиться. Порожня note-секція картки відсутня.
- [ ] I–VII/не зазначено й історичний довільний рядок: початковий вибір не встановлюється автоматично, staff не вимагає category, personal edit не змінює кадрову історію. У кадровій зміні Select зберігає legacy значення, доки користувач явно не обере інше.
- [ ] Вкладені Modal/довідник/confirm: Escape лише верхнього, focus restore, Tab/Shift+Tab/Ctrl+Enter, dirty/busy guards, видимі футери дій і внутрішнє прокручування. Відступи й іконки не створюють зайвих порожніх блоків.

3.4.3 не розпочато. Main не зливати без окремого погодження.

## Етап 3.4.2.2 — реєстр за групами й остаточне спрощення

База HR — 1797284d372ef6cc33192aecaeed4d16f48f6443, та сама гілка codex/3.4.1-aid-ui-foundation. Source AID — 33eca10733caaf73b1a99e75a24ff35e706a0afb, прочитаний за pinned ref без змін джерела.

| Джерело | Фактична адаптація |
| --- | --- |
| src/RecipientRegistry.tsx | Компактне компонування реєстру, SearchField/DictionaryTable і registry-row-actions з Eye/Pencil/Trash2. EmployeeGroupTable повторно використовує DictionaryTable для двох типів, не реалізує нову таблицю. |
| src/AidRegistry.tsx | filtersOpen, SlidersHorizontal toggle з aria-expanded/controls та count badge, Clear/FilterX, Reset/ListRestart, registry-sort-button з індикаторами ↑/↓/↕. Поля HR — тільки підрозділ/посада, sort FIO/position/department/hireDate. |
| src/styles.css | Перенесено потрібні aid-toolbar, aid-filter-toggle/count/panel/grid, registry-sort-button; прив’язано до чинних сиреневих токенів, 2 filter columns замість 3, responsive wrap. Financial/status filters, auth та server logic не копіювалися. |

Одна спільна панель працює для official/staff, розділених за employeeType. Обидва розділи мають власний заголовок/count/table/empty та незалежне сортування; типова порожня група не ховається. Колонку типу вилучено. Пошук нормалізує NFC/пробіли/український регістр, терміни ПІБ можуть бути в різному порядку. Фільтри перетинаються; badge рахує підрозділ і посаду. Загальний count та filtered result count різні. Clear очищує search/обидва filters, Reset sort — обидві таблиці, але не фільтри. Стан panel/search/filter/sort у workspaceReducer переживає всі модальні операції. Сортування не змінює масив: uk/base Collator, перевірений ISO для dates, tie ПІБ/id; inactive ↕, active aria-sort тільки відповідного стовпця.

Міграція 4/remove_employee_note — тільки DROP COLUMN note з requiresBackup=true. Примітку вилучено з shared types/Zod/service/UI/актуальної БД; старі note-аргументи strict IPC відхиляє. SQL/імена/checksum 1–3 не змінено. Verified pre-v4 snapshot зберігає note перед транзакцією. Fresh та v2/v3 upgrade, відмова snapshot, rollback після DROP, restore v3 перевірені автоматично. Source backup не змінюється; restored active DB має v4 без note. Це остаточне вилучення функції, не згорнутий або прихований UI.

CategoryField та categories choices видалено. Category лишається в Assignment/історії/SQLite/IPC і read-only відомостях, якщо задана. В employee create — null. У correction — точна category редагованого запису. New assignment читає history та визначає baseline за startDate: останній рядок <= дати або перший відомий рядок для найдавнішої вставки. Той самий positionId — inherit, інший — null. Це не юридична класифікація; correction не переоцінює доречність legacy category навіть при виправленні посади. Повноцінне керування — окремий майбутній модуль рангів. Main chronology/сусідні дублікати/дата прийняття/current/atomicity не змінені; тест перевіряє відмову фіктивного category-only переходу.

Home EmployeeSummary рахує total/official/staff із listEmployees, не показує нулі замість помилки. Є loading/empty/error/retry. Банер/герб/footer/тема збережені. Backup presentation показує config/availability/latest-attempt success окремо; sameVolume — тільки один warning. Старий lastSuccess при новій помилці не збільшує latest success count. Дві копії не прирівнюються до незалежності дисків. Backup/recovery runtime й IPC без змін.

Перевірки: pnpm typecheck; нові цільові 8/8; pnpm test 121/121 та Electron Main smoke; pnpm build; git diff --check. Понад наявні тести додано employee-registry.test.mjs та remove-notes.test.mjs; тести фіксованих migration versions адаптовано до 4, а старі checksum/protection/rollback/FK перевірки збережено. Тільки temp БД/профілі, без реальних персональних даних. GUI snapshot/click automation не створювалися. Візуальне приймання ще не виконано.

### Ручне приймання 3.4.2.2 — не виконано

Вікна 1600×900, 1366×768, вузьке вікно; Windows 125–200%. Міграція/restore — тільки ізольована копія тестової БД та профіль.

- [ ] Обидві групи завжди видимі, зокрема одна/обидві порожні; однакові п’ять колонок, доступні дії, окремі count/empty. Пошук без результатів не приховує секції.
- [ ] ПІБ із різним регістром/пробілами/комбінаціями; department + position filters разом впливають на дві групи, badge правильний, toggle/clear/reset доступні з клавіатури.
- [ ] У кожній таблиці клацнути всі 4 sortable headers двічі; перевірити arrows/aria-sort і незалежність другої таблиці; Reset повертає обидві FIO asc без очищення filters.
- [ ] Відкрити/закрити картку, дочірні форми, змінити тип official↔staff: рядок переходить до правильної групи, параметри реєстру й modal guards зберігаються.
- [ ] Немає note чи CategoryField у жодній формі. Create — category null; correction історичного рядка не стирає category; новий same-position transfer зберігає її, different position — null. Беззмістовний перехід відхиляється.
- [ ] На копії v3 виконати startup→v4: pre-v4 snapshot доступний, note більше немає в активній БД, решта даних/історія/довідники збережені. Restore старої копії не змінює файл-джерело й не повертає note-функцію.
- [ ] Home counts відповідають реєстру, зокрема після зміни типу; loading/error/retry відрізняються від реального нуля. Немає фіктивних показників.
- [ ] Same-volume warning тільки один; config/availability/latest success різні стани. Невдалий останній backup не показаний успішним через старий lastSuccess; шляхи/details/restore збережені.
- [ ] Довгі ПІБ/назви/шляхи, toolbar wrap, row heights/іконки, видимий focus, внутрішній scroll таблиць і модалок; немає горизонтального scroll всього вікна. Вкладені cancel/Escape/dirty/busy не втратили поведінки.

3.4.3 не розпочато, main не зливати без окремого погодження.


## Етап 3.4.2.3 — завершальні UX-правки та журнал резервування

База 1c0c707353dfcc55be6949118c06d99b84731127; гілка codex/3.4.1-aid-ui-foundation, початкове дерево чисте. Main не змінюється, 3.4.3 не розпочато. AID read-only, pinned SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb.

- Головна: workspace-actions/workspace-shortcuts з App AID; п'ять карток «Щоденна робота», активні лише працівники й налаштування. Майбутні модулі позначені «У розробці». EmployeeSummary та читання кадрових даних на головній вилучено; герб/банер/футер збережено.
- Реєстр: звичайний виразний ПІБ, відкриття через Eye; створення останнім у aid-toolbar; Дії центровані; зайвого загального підсумку немає. Дві таблиці, фільтри, незалежне сортування й modal state без змін. З історії картки прибрано тільки відображення колонки category; дані/контракти незмінні.
- Контакти: кнопки відкриття та копіювання, помилка з ручним fallback. system.openContact приймає тільки phone/workEmail/personalEmail/telegram, Main визначає фіксований tel/mailto/HTTPS і викликає shell.openExternal. Довільного URL IPC немає; sender/frame/URL та Zod збережені.
- Backup UI: короткий стан/останній успіх, політика в details, компактні картки/дії, окреме небезпечне відновлення, без приховування помилок чи warning одного тому. Історія в DictionaryTable за структурою EventTable/BackupManagement AID: час/операція/місце/результат, останні 5 або всі, фільтр усі/успіх/помилки. Demo events та серверна/auth-логіка не переносилися.
- Main-only backup-history.json поряд з активною БД: %LOCALAPPDATA%/HromadaHR/data/backup-history.json (dev — HromadaHR-dev). Окремо від SQLite й recovery journal, не замінюється при restore. JSON із Zod strict schema; максимум 200 подій і 64 КіБ; запис через тимчасовий файл та rename. Немає ПІБ, шляхів, вмісту БД чи довільного тексту помилок. Читання тільки backup.getHistory без аргументів.
- Фактичні результати auto/manual окремо за slot, успішний config, restore success/cancel/error та відхилена підготовка restore. Статус і пропущені цикли не журналюються. Старі події не вигадуються; порожній стан прямо пояснює початок накопичення після оновлення. Збій читання/запису — available=false, основні операції продовжуються. Невідомий результат при аварійному завершенні не видається за успіх; цей діагностичний журнал не замінює recovery journal і не гарантує фінального запису при падінні процесу/живлення.

Перевірки: pnpm typecheck, pnpm build, git diff --check; 4 нові цільові тести IPC/history, 18 наявних backup і 18 IPC тестів пройшли (40 загалом). Повний pnpm test не запускався — для UI змін немає технічної необхідності. Нових GUI-тестів немає; всі руйнівні тестові операції лише в mkdtemp профілях. Ручне GUI-приймання не виконувалося. Міграції 1–4, кадрова модель/13 IPC, файли snapshot/recovery/WAL, політика резервування та залежності незмінні.

### Ручне приймання 3.4.2.3 — не виконано

- [ ] Щоденна робота: працівники/налаштування відкриваються; три майбутні картки мають «У розробці» й не виконують дій.
- [ ] Дві таблиці: ПІБ без посилання; Eye/Edit/Delete працюють, Дії вирівняні; Plus у toolbar; фільтри/сорти збережені після модалок.
- [ ] Картка: історія без колонки категорії, решта даних та кадрові зміни збережені.
- [ ] Кожен контакт відкриває системний обробник; без обробника — помилка, копіювання або Ctrl+C. Tab/Enter/focus.
- [ ] Backup: короткий огляд, один same-volume warning, помилки видимі; політика/технічні деталі розгортаються. Тільки тестовий профіль: manual/auto/config/restore створюють реальні рядки, без рядків від status/skipped tick; 5/усі та фільтри працюють, після restart/restore історія залишається.
- [ ] 1600×900, 1366×768, вузьке вікно, Windows 125–200%: toolbar/cards/шляхи/таблиці/модалки/focus/scroll без перекриття.


## Етап 3.4.3 — джерела startup та фактичні адаптації

Pinned AID SHA **33eca10733caaf73b1a99e75a24ff35e706a0afb**, read-only.

| Джерело | Реалізація HR | Адаптація |
| --- | --- | --- |
| src/App.tsx StartupScreen і startup sequence | src/components/StartupScreen.tsx, src/App.tsx | JSX/UsersRound/HR та локальний status замість auth/connection; gate лише один раз на монтування |
| src/lib/startup-timing.ts | src/lib/startup-timing.ts | Оригінальні waitForMinimumDisplay/waitForStartupGate; єдина константа 2000 мс замість 5000 |
| src/styles.css app-startup, startup-enter/loader, reduced-motion | src/styles/startup.css | Оригінальна геометрія й keyframes; green/direct text colors замінені HR semantic tokens; welcome styles не потрібні |
| src/main.tsx StartupBoundary | src/bootstrap.tsx, src/main.tsx | Render boundary + guarded dynamic import для ранніх JS/CSS помилок; без ClientUpdateGate, auth чи sessions |

Main раннє вікно/одноразовий createStartup, retry guard і очікування shutdown — автономна адаптація HR, не перенесення server lifecycle AID. Readiness SQLite та її critical snapshots/recovery незмінні. Нова заставка не запускається від кадрового IPC або модалок; повний renderer reload запускає її знову. Наявні page/modal/calendar/skeleton/transition правила залишено.

Перевірено програмно: typecheck/build/diff; 5 startup gate/lifecycle перевірок і реальний наявний Electron Main storage/recovery smoke. Нових GUI-тестів немає, повної регресії не запускали. Візуальне приймання, Windows scaling/focus/анімації вручну не виконувалися. Sync integrity/migration можуть затримувати status IPC; немає відсотків або обіцянки фіксованої загальної тривалості. Мінімум від App mount. Error boundary не охоплює відсутність самого JS entry чи падіння renderer-процесу; помилка документа loadFile/loadURL має native dialog Main.

### Єдиний підсумковий чекліст GUI-приймання 3.4 — НЕ ВИКОНАНО

Цей список є актуальним наскрізним прийманням; попередні чеклісти вище — історичні. Усі зміни даних — лише синтетичні дані/ізольований тестовий Windows-профіль. Built без Vite використовує власний профіль даних, а не dev; не перевіряти відновлення на продукційній БД.

- [ ] Холодний dev через pnpm dev (Vite лише для dev); окремо built через pnpm build / pnpm start:built із вимкненим Vite. Повторний екземпляр фокусує наявне вікно, профілі не змішуються.
- [ ] Startup: світла сиренева заставка/UsersRound/назва/підпис/loader, мінімум 2 с, потім головна. На ізольованій копії: тривала ініціалізація чекає readiness; CORRUPT/MISSING_DATABASE показує Recovery без таймерної затримки й без порожньої заміни. Вихід під час startup не пошкоджує тестові дані.
- [ ] Оболонка: герб/банер/футер, «Щоденна робота», працівники/налаштування активні, три майбутні модулі явно «У розробці»; немає миготіння оболонки чи повторної заставки при навігації/IPC/закритті модалок.
- [ ] Дві таблиці: ПІБ/дії, пошук, обидва фільтри/очищення, незалежне сортування чотирьох колонок/скидання, лічильники/empty/error. Параметри зберігаються при модалках.
- [ ] Тільки тестовий працівник: створити, відредагувати персональні дані/тип, додати й виправити призначення; історія/current/hire оновлюються. Видалення призначення/працівника — РУЙНІВНЕ, лише синтетичні дані.
- [ ] Вкладені модалки/довідники: фокус повертається до батьківського вікна, Escape закриває верхнє, Tab/Shift+Tab/Ctrl+Enter, збереження не дублюється, вихід із dirty форми/навігація потребує одного підтвердження.
- [ ] DateField: вручну/вставлення/календар/високосні/невалідні дати, усі видимі дати ДД.ММ.РРРР, час ДД.ММ.РРРР ГГ:ХХ. Календар/селектор із клавіатури.
- [ ] Допомога: чотири системні обробники контактів, зрозуміла помилка без обробника, копіювання або Ctrl+C; налаштування/about.
- [ ] Лише ізольований профіль/тестові носії: зміна двох тек, один same-volume warning, manual/auto та їхні помилки, технічні details, журнал 5/усі/фільтри/restart. ВІДНОВЛЕННЯ РУЙНІВНЕ — тільки тестова БД/копії, cancel/native confirmation/protection/reload; історія журналу залишається.
- [ ] 1366×768, 1600×900, вузьке вікно, Windows 125–200% і reduced-motion: sidebar/topbar, прокручування/футер/довгі назви, видимі дії модалок, focus після відкриття workspace. Необов'язкові анімації вимкнені за reduced-motion.

Merge main, автооновлення, installer і наступні предметні модулі не виконуються без окремого завдання.

Уточнення startup/recovery 3.4.3: успішний BackupController.confirmRestore викликає Main onRestored callback. Той запускає наявний scheduler тільки за ready та !closing; це відновлює auto-backup після початкової помилки, коли startup його не запускав. Cancel/error callback не викликають. Формат/підтвердження/атомарність restore незмінні. Цей callback додатково перевірено в наявному справжньому Electron Main smoke без GUI-діалогів.

Перший кадр та renderer-ready: openWindow очікує і ready-to-show, і перше довірене storage.getStatus із змонтованого App effect (чинний IPC, без нового каналу). Це не дає почати SQLite до завантаження динамічних React/CSS залежностей і появи заставки. Закриття вікна завершує очікування без ініціалізації; при помилці bootstrap видно fallback, а SQLite ще не відкривається.


## Етап 3.4.3.1 — оболонка, заставка й навігація

База d3fd0534e276cf0d4df9a812a18f62becb02e0a0, гілка codex/3.4.1-aid-ui-foundation, початкове дерево чисте. Цільово звірено read-only electron/main.ts і src/styles.css HromadaAID за SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb.

- Вікно: AID maximize() перед show() у ready-to-show при show=false. Звичайна максимізація, без fullscreen/kiosk і ручного обчислення пікселів; робочу область/DPI визначає Windows/Electron. Відновлення/resize/minimize/close штатні; 1000×700 лишається розміром відновленого вікна.
- Єдина STARTUP_MINIMUM_MS тепер 3500 мс від App mount; helper решти часу, пріоритет RecoveryScreen, анімації/reduced-motion та Main coordinator незмінні.
- На головній чотири картки: працівники активні, відпустки/стаж і ранги/документи — «У розробці». Settings-картку вилучено, налаштування доступні в sidebar. Геометрія/токени AID/HR збережені. Container query workspace-actions: <520 CSS px — 1 колонка, від 520 — 2, від 1040 — 4; це внутрішня доступна ширина контейнера, не роздільність монітора.
- Help перенесено над СИСТЕМА/Налаштування в sidebar-bottom. Margin-top:auto та чинні overflow/narrow sidebar правила збережені; налаштування тепер останні внизу. Герб/банер/футер незмінні.
- Чинний startup-тест лише підтримано: очікування залишку залежить від константи замість старих 1500 мс; нових тестів немає. Виконано тільки pnpm typecheck, pnpm build, git diff --check. Тести/ Electron smoke не запускалися: критичну послідовність ініціалізації не змінено. SQLite/кадровий backend/backup/restore/IPC не змінені.

Ручний GUI-чекліст — НЕ ВИКОНАНО:

- [ ] Dev та built: перший видимий кадр максимізований, без малого вікна; Відновити/resize/minimize/close працюють, taskbar не перекритий. Перевірити різні монітори й Windows 125–200%.
- [ ] Успішний старт: мінімум 3,5 с від App mount, довша SQLite без додаткової затримки; помилка на тестовому профілі одразу відкриває RecoveryScreen.
- [ ] Full HD/2K за достатньої ширини: чотири картки в ряд; звуження контейнера дає 2/1 без обрізання та горизонтального overflow сторінки. Settings-картки немає.
- [ ] Help над системним блоком, settings унизу; вузький sidebar/коротке вікно: focus/click/внутрішній scroll доступні.

Історичні описи 3.4.3 вище з 2000 мс не переписуються; актуальна тривалість — 3500 мс. Main не зливати; 3.4.3.2 не починати без завдання.


## Етап 3.4.3.2 — кадрові форми, реєстр і картка

База b3b8758729b20dc891e058f42784b3559d7f31d4, гілка codex/3.4.1-aid-ui-foundation; початкове дерево чисте. Цільово звірено read-only AID SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb: src/components/Select.tsx, src/RecipientRegistry.tsx і відповідні src/styles.css (Select search, recipient history/footer, icon actions). Чинні компоненти повторно використано; нової UI-системи немає.

- EmployeeGroupTable: ПІБ → підрозділ → посада → дата прийняття → дії; sort keys department/position та клітинки відповідають назвам, ширини 28/24/26% і чинні фіксовані дата/дії. Фільтри, official/staff та логіка сортування незмінні.
- EmployeeForm/AssignmentForm: спочатку два селектори, дата нижче у повноширинному рядку з компактним полем до 260 px. DOM-порядок відповідає візуальному, без ручних tabIndex. Payload/DateField validity/drafts незмінні. DirectoryFields використовує спільні secondary-button з Plus (44×44), title/aria-label і попередні disabled/pending/створення/повернення фокусу.
- Select: причина подвійного фокусу — наявний зовнішній app-select-search:focus-within плюс загальні input:focus-visible та data-keyboard-active shadow. Локальне правило лише для focused input усередині app-select-popup/app-select-search прибирає внутрішні outline/shadow/border/background; зовнішня focus-within рамка з shadow залишається. Select JSX, keyboard attributes/навігація та інші поля не змінені.
- Картка: історія має 5 колонок початок/завершення/підрозділ/посада/дії, назви з чинних dictionary ID maps. Ширини 16/16/25/27/16%, fixed layout, min-width 760 px, прокручування wrapper. Pencil/Trash2 — кнопки 40×40 з hover/focus, aria-label/title та збереженим confirm/забороною видалення єдиного запису. Прибрано технічне пояснення.
- Видалення працівника перенесено поруч із редагуванням, без нижнього дубля; використовує той самий EmployeeActionDialog/ConfirmDialog з актуальними ПІБ/кількістю/попередженням/блокуванням. Нижній стандартний recipient-form-actions footer має «Скасувати» й той самий guarded close, що хрестик (також при loading/error). Parent/modal stack не змінено.

Перевірки: pnpm typecheck, pnpm build, git diff --check. Нових тестів немає, чисті функції не змінювалися, повну регресію/GUI-тести не запускали. SQLite/міграції/PersonnelService/IPC/category/history/delete policy/backup/restore незмінні.

Ручне приймання — НЕ ВИКОНАНО:

- [ ] Обидві таблиці: підрозділ перед посадою, заголовок сортує саме свій стовпець; пошук/фільтри/дії збережені.
- [ ] Створення й кадрова зміна: селектори вгорі, компактна дата окремо, Tab/Enter/Ctrl+Enter, дати/validation/payload без втрати даних.
- [ ] Обидва Plus: tooltip/назва, вкладена форма збереження/CONFLICT/повернення фокусу; поточна форма не втрачає даних.
- [ ] Пошуковий Select мишею й клавіатурою: одна видима рамка без внутрішнього зсуву; ввід/стрілки/Tab/Escape працюють.
- [ ] Історія: 5 колонок, довгі назви переносяться; Дії відцентровані, Pencil/Trash2 доступні, єдиний запис не видаляється.
- [ ] Верхнє видалення працівника — тільки синтетичний запис, із підтвердженням. «Скасувати»/хрестик закривають ту саму картку; вкладені модалки/dirty guard/pending не обходяться. Видалення — РУЙНІВНЕ, лише тестові дані.
- [ ] Вузьке вікно/Windows 125–200%: scroll лише таблиці, не всього modal; footer та дії доступні.

Main не зливати; 3.4.3.3 не починати без окремого завдання.


## Етап 3.4.3.3 — бренд, About і підтримка

База 0d46bb28dd46d2b2962adbae4f1a5e0f5863b953, гілка codex/3.4.1-aid-ui-foundation, початкове дерево чисте. Джерело AID read-only SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb: цільово прочитано assets/hromadaaid.svg/png/ico, assets/README.md, electron/copy-assets.mjs, electron/main.ts, src/SettingsPage.tsx, App Help Modal і scripts/generate-manager-icons.mjs.

- Власний комплект assets/hromadahr.svg/png/ico: знак чинного UsersRound із встановленого lucide-react, 22×22 у квадраті 42×42, rx=12, stroke 2.1, білий на #6F5AA5. SVG — джерело, PNG 512×512, ICO 16/24/32/48/64/128/256 із PNG-кадрами. Ліцензія геометрії — assets/LUCIDE-LICENSE.txt. Герб community-coat.png незмінний.
- Генератор scripts/generate-icons.mjs адаптовано з AID: тільки наявний Electron offscreen, перевірений mkdtemp profile/session/log/crash, без продукційної БД і нових залежностей. Команда розробника node scripts/generate-icons.mjs; готові PNG/ICO в Git. Build і запуск не генерують зображення.
- electron/copy-assets.mjs копіює готові три ресурси до dist-electron/electron/assets через build:electron. BrowserWindow.icon — ICO у Windows, PNG поза Windows; однаковий шлях для dev/built без Vite, бо обидва запускають скомпільований Main. Packaged lookup, за AID, очікує resources/assets поза ASAR; фактичний packager/extraResources має бути налаштований в окремому етапі. NSIS/EXE/реліз не створюються. App ID/AppUserModelID/назва/профілі/startup coordinator незмінні.
- SettingsPage About тепер імпортує продуктовий SVG, як AID hromadaAidLogo; версія з IPC, технічні дані, розробник/громада збережені. Головна лишається з гербом.
- Help: wide Modal; одна візуальна картка контакту з двома сусідніми button (open і Copy), без вкладених button/великих написів «Скопіювати». Container width >=600 px — дві колонки, нижче одна, довгі адреси переносяться. Copy має aria-label/title, hover/focus і success SystemToast; чинні помилки й Ctrl+C fallback збережені. Чотири ID та Main external IPC незмінні. Нижня примітка тільки про версію.

Перевірки: pnpm typecheck, pnpm build, git diff --check; SVG розібраний XML-парсером, PNG IHDR=512×512, ICO directory/межі/сім PNG frame sizes перевірені одноразово, ICO також відкрився Windows System.Drawing decoder (32×32). Всі три built-ресурси побайтово збігаються з вихідними. PNG переглянуто як окремий ресурс; GUI/панель завдань/About/контакти вручну не приймалися. Нових UI-тестів/системи перевірки іконок/повної регресії немає.

Межа Windows: незапакований electron . може показувати іконку executable Electron у taskbar/Explorer/старому закріпленні. BrowserWindow.icon налаштований; фірмові EXE/ярлик/інсталятор потребують майбутнього пакування, конфігурації ICO й extraResources. Кеш Windows і персональні ярлики не змінюємо.

Ручне приймання — НЕ ВИКОНАНО:

- [ ] Dev і built без Vite: іконка вікна/Alt+Tab; окремо зафіксувати можливу стандартну taskbar-іконку незапакованого Electron, не плутати з майбутнім EXE.
- [ ] About: продуктовий логотип/реальна версія/відомості; на головній лишився герб громади.
- [ ] Контакти: дві/одна колонки, цілісні картки, адреси без неприродного перенесення; open і Copy виконують різні дії.
- [ ] Copy: tooltip/Tab/Enter, один success toast або зрозуміла помилка; tel/mailto/Telegram та fallback Ctrl+C працюють.
- [ ] Вузьке вікно/масштаб Windows 125–200%: немає горизонтального overflow чи надмірно вузького тексту.

Main не зливати, 3.4.3.4 не починати без окремого завдання.


## Етап 3.4.3.4 — нове компонування резервування

База d33887191f655f45f04d7cdb04367fa197bfc487, гілка codex/3.4.1-aid-ui-foundation, початкове дерево чисте. Read-only AID SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb: цільово звірено src/SettingsPage.tsx і server-manager/src/BackupManagement.tsx (settings cards, компактні заголовки/статуси, preview/running/error modal та footer). Повторно використано чинні HR Modal/Alert/DictionaryTable/Select/Toast, без нової UI-системи або backend AID.

Фактичні п'ять зон:

1. Короткий заголовок, стан і час останньої успішної копії без великого кольорового panel. Стан визначається з поточних availability/error/config, а не зі старого lastSuccess. Помилка читання статусу показується окремо; невідомі дані не підміняються нулями або відсутністю копій. Same-volume — один короткий видимий Alert.
2. Дві рівновисокі компактні картки тек (на вузькій ширині одна): availability, path/title, lastSuccess і зміна теки. Draft позначено «Не збережено», час попередньої копії явно належить активній конфігурації. Помилки тек видимі, технічні коди не замінюють зрозумілого тексту.
3. Один toolbar: головна ручна копія для налаштованих тек; інакше головна дія — збереження. Save disabled без draft або неповної конфігурації. choices/FolderSelection.token лишаються в тому самому стані змонтованого BackupSettings; SettingsPage продовжує ховати backup tab через hidden, не демонтувати. Автозбереження немає; ручна копія використовує активні теки, про draft є коротке нагадування.
4. Історія: чинний Main-only журнал, 5/усі, фільтр, та сама хронологія/дані/опитування. Порожній стан — невеликий текст; недоступна/неповна історія — error Alert, не порожній успіх. Коди подій доступні через title результату без постійного технічного рядка.
5. Відновлення: короткий підпис і одна кнопка, без старого backup-restore panel/вкладених details/великого Alert. Спільні «Технічні відомості» нижче згорнуті: політика/інтервал/ліміти й обидві теки з active path, lastAttempt, kind, autoDay (UI-формат), fileName та error code.

Restore UI: chooseRestore відкриває штатний picker; cancel тихо повертає settings. Успішний вибір показує Modal із fileName/schemaVersion, попередженням про заміну та protective copy, footer Cancel/Continue. Безпечний початковий фокус на Cancel. Continue передає лише чинний token у confirmRestore; обов'язковий native Electron confirmation лишається в незміненому Main. Реф-guard/busy блокують дублювання та закриття; після success Modal блокується до чинного reload. Native cancel закриває preview без помилкового success. Після будь-якої спроби confirm UI консервативно не використовує token повторно; при помилці Modal лишається з Cancel/новим вибором (також для expired token). Транспортна невизначеність після confirm чесно позначена як непідтверджений результат. Повторний picker інвалідовує старий вибір за чинною Main-політикою; його cancel закриває preview.

Межі збережено: BackupService/Controller, recovery/Win32/mutex, staged snapshot/protection/rollback, SQLite/міграції, backup-history.json, IPC, auto cycles/two targets/rotation не змінені. src/backup/presentation.ts та чисті функції незмінні. Сторінка max-width 1100px; адаптація двох карток/technical grid від ширини backup-container 640px, toolbar переноситься; нових nested scroll-панелей немає.

Перевірки: pnpm typecheck, pnpm build, git diff --check — успішні. Нових GUI/текстових/модальних тестів немає; повні/backup тести не запускалися: змінено тільки React presentation/інтеракцію, яку приймає замовник вручну; критичний backend і чисті моделі незмінні. Застосунок/продукційна БД та реальні резервні копії для перевірок не запускалися.

Ручне GUI-приймання — ПЕРЕДАНО ЗАМОВНИКУ, НЕ ВИКОНАНО:

- [ ] Дві теки: первинний вибір, зміна однієї/обох, draft badge; About і назад/перерендер не губить вибір; Save зберігає лише явно. Ручна копія до Save використовує активну конфігурацію.
- [ ] Ручна копія: немає подвійного запуску, окремі результати обох тек; на тестовому профілі часткова недоступність показує конкретну помилку й не видає старий lastSuccess за поточний успіх. Same-volume warning лише один.
- [ ] Журнал: 5/усі/фільтр, маленький empty; недоступність — помилка, без вигаданих подій. Технічний details відкриває всі службові дані, без ISO дат у UI.
- [ ] Restore picker cancel — тихе повернення; preview показує правильний файл/schema, Cancel/хрестик/Escape/backdrop повертають settings.
- [ ] ТІЛЬКИ ІЗОЛЬОВАНИЙ ПРОФІЛЬ: native confirm cancel, expired token/повторний вибір; busy не дозволяє повторне підтвердження/закриття. Помилка лишає preview з безпечним Cancel.
- [ ] ВІДНОВЛЕННЯ РУЙНІВНЕ: лише тестова БД/копія; Continue → обов'язковий native confirmation → protective copy/reload. Не виконувати на продукційних даних.
- [ ] 1366×768, Full HD, вузьке вікно/Windows 125–200%: компактні зони, довгі шляхи, toolbar, modal footer і фокус без накладання/горизонтального overflow сторінки.

Main не зливати. Наступні кадрові модулі без окремого завдання не реалізовувати.


## 3.4.3.5 — zoom, сітка дат і CSP логотипа

База d51e2fb79696b1d8a88acf4fd12a1f0f90782f2f, та сама робоча гілка; початкове дерево чисте. У read-only AID S1 (33eca10733caaf73b1a99e75a24ff35e706a0afb) цільово перевірено electron/main.ts і src/SettingsPage.tsx: у цих файлах zoom-аналога немає; HR використовує власний вузький Main-механізм і чинний Select.

- ZoomController — єдиний стан 80/90/100/110/125/150%; before-input-event перехоплює тільки Ctrl Plus/Equal/Minus/0 та NumPad +/-, ігнорує Alt/Meta/composition, не чіпає Ctrl+Enter. Межі 80–150%, кроки за тим самим переліком. Викликається setZoomFactor; значення застосовується перед show та після load. Menu/DevTools не повертаються, startup coordinator незмінний.
- interface-settings.json у app.getPath('userData'): %APPDATA%/HromadaHR[-dev], незалежні dev/built, без SQLite/нових залежностей. Strict дозволені числа, обмежене читання, запис через .tmp/rename. Некоректний файл дає 100% і saved=false; збій запису не приховується, UI попереджає про можливу втрату масштабу після перезапуску.
- Явні system.getZoom/setZoom у типізованому preload/IPC з наявними sender/frame/URL guards, Zod args/results. SettingsPage показує компактний Select праворуч у heading; читає Main після resize/focus та раз на секунду, не має окремого джерела масштабу/localStorage.
- employee-date-row — subgrid: дата займає повну ширину першої колонки й автоматично єдину колонку вузької форми. DirectoryFields постійна підказка вилучена. DateField/значення/dirty/validation/payload/кадровий backend незмінні.
- Підтверджено старий data:image/svg+xml у bundle. About import svg?no-inline примусово створює dist/assets/hromadahr-*.svg; посилання у built bundle перевірено, img-src 'self' не послаблено. Продуктовий логотип і головний герб незмінні.

Перевірки: pnpm typecheck, pnpm build, git diff --check; одна tests/zoom.test.mjs перевірка — allowed IPC/sender/URL, клавіші без перехоплення Ctrl+Enter, фактичний виклик ZoomFactor через double, persistence/профілі/некоректні значення/помилка запису, лише mkdtemp. Наявне preload allowlist очікування підтримано для get/set; повний набір/GUI/snapshots не запускали. Фактичне Windows GUI-приймання не виконано.

Ручний чекліст: Ctrl +/Shift+=/−/0 і NumPad у формі; відсоток у Settings, шість варіантів, restart і незалежні dev/built; Ctrl+Enter форм збережений; дата за сіткою/вузьке вікно; About логотип у dev та built/file://. При збої збереження zoom — видиме повідомлення. Main не зливати, наступний підетап без завдання не починати.


## 3.4.3.6 — остаточне компонування резервування

База a03bcaac776a6db81b446e30fdd480540ec93422, гілка codex/3.4.1-aid-ui-foundation, початкове дерево чисте. AID S1 33eca10733caaf73b1a99e75a24ff35e706a0afb: цільово повторно звірено server-manager/src/BackupManagement.tsx та server-manager/electron/main.ts — патерн відкриття збереженого резервного каталогу.

- Прибрано max-width 1100px: root та історія заповнюють доступний .content, дві рівні колонки лишаються responsive 2→1 за шириною container. BackupHistory і фільтри не змінені.
- Збережена конфігурація без draft: лише «Створити резервну копію». З draft: компактна панель «Зберегти зміни / Скасувати зміни» з нагадуванням про старі auto-шляхи; cancel відкидає тільки локальний вибір, не змінює активний backend. Початкове налаштування пропонує дві теки, Save доступний після двох виборів; ручної копії до збереження немає. Busy/ref, toast, явні часткові помилки збережені.
- Активний доступний шлях — selectable текстова button-link із ArrowUpRight, title/aria-label/focus. Мишаче виділення не відкриває каталог, Ctrl+C зберігається; Enter активує дію. Draft/недоступний шлях — лише текст без open.
- Новий єдиний Main operation backup.openBackupFolder(slot): strict tuple 1|2, чинні sender/mainFrame/URL та result=null Zod. Controller читає збережений path через BackupService.getStatus, відхиляє busy/відсутність/недоступність, повторно виконує directory (absolute/directory/realpath/access) та shell.openPath; shell errors нормалізуються FOLDER_UNAVAILABLE, без технічних деталей. Renderer не передає path. У тесті OS opener ін'єктується лише в Main-конструктор; production використовує Electron shell. BackupService не змінено.
- Технічний details і його CSS повністю вилучені з BackupSettings. Поля BackupStatus/БД/журналу, 14 auto/два місця/retry policy збережені. Restore picker/Modal/token/native confirm/algorithm, RecoveryScreen та історія не змінені.

Перевірки: pnpm typecheck, pnpm build, git diff --check; одна цільова tests/open-backup-folder.test.mjs перевірка в Electron Main із mock shell.openPath та temp профілем — пройшла (slot allowlist, extra/path args, sender/frame/URL, повторна перевірка missing/unavailable/not-configured, shell error без витоку, busy). Перший запуск test harness мав timeout через top-level await app.whenReady в ESM; виправлено лише тестовий запуск на whenReady().then, повторний запуск успішний. Провідник реально не відкривався, продукційні дані не використовувалися. Нових GUI-тестів/повної регресії немає. Наявне preload allowlist очікування оновлено для одного нового методу.

Ручне GUI-приймання — НЕ ВИКОНАНО:

- [ ] Full HD/1366×768/вузький container/zoom: дві рівні картки та історія на всю доступну ширину, 2→1 без overflow сторінки.
- [ ] Active path: клік/Enter відкриває саме відповідну теку; виділення + Ctrl+C не відкриває її. Недоступний і draft шляхи без дії; OS-відмова дає зрозумілу помилку.
- [ ] Після збереження — одна ручна дія; зміна теки показує Save/Cancel, старі auto-шляхи лишаються активними. Cancel повертає активні шляхи, Save явний; перемикання About не губить draft.
- [ ] З нуля: вибір однієї/двох тек, Save disabled/available, ручної копії до Save немає. Ручний partial failure й same-volume warning видимі; технічної секції немає.
- [ ] Історія/фільтри та чинний restore без регресій; відновлення — РУЙНІВНЕ, лише в ізольованому тестовому профілі.

Один коміт/push у робочу гілку, без merge main; 3.4.3.7 не починати без завдання.


## 3.4.3.7 — конкретні копії та операції

Read-only джерело AID S1 33eca10733caaf73b1a99e75a24ff35e706a0afb: server-manager/src/BackupManagement.tsx, архівна таблиця з вибором за id, відмінність «Доступна»/«Перевірена», дія відновлення та ручний вибір. Адаптовано через вже перенесені DictionaryTable/Modal/Alert і settings-section-nav; серверний API/auth/шифрування/архівний формат не копіюються.

BackupCopies — одна панель «Наявні копії» (default) / «Операції». Реальний обмежений перелік із двох активних тек, явний Refresh, час у ДД.ММ.РРРР ГГ:ХХ, auto/manual, slot, доступність, RotateCcw «Відновити». Доступність не названа повною перевіркою. Ліміт/недоступність/помилка/empty явні. Чинний BackupHistory і фільтри не переписані та залишаються змонтованими. Немає нижнього restore-блоку; вторинна «Вибрати файл…» у heading використовує чинний системний picker. Обидва шляхи ведуть до попереднього RestoreSelection Modal та обов'язкового native confirmation. Сиренева тема збережена.

Main listCopies/selectCopy не приймають path; UUID вибору прив'язано до namespace/lineage/config/file identity, із захопленням точного source через чинний Win32 handle та подальшим старим staged restore. Ліміти й автоматичне оновлення — HANDOFF/ARCHITECTURE 3.4.3.7. Read-only журнал операцій не став каталогом копій.

Реалізовано; typecheck/build/diff-check та цільові backend/IPC перевірки пройшли. GUI вручну НЕ перевірено. Чекліст: обидві теки/offline/Refresh; сегменти й фільтри; конкретний файл/застарілий ID; picker cancel/інший носій; Modal/busy/native Cancel; restore/reload/історія тільки на ізольованому тестовому профілі; вузьке вікно й масштаб.


## 3.4.3.8 — summary та два місця одного знімка

AID source 33eca10733caaf73b1a99e75a24ff35e706a0afb, server-manager/src/BackupManagement.tsx повторно звірено read-only для summary/card/table патернів. У HR адаптовано чинні dashboard-panel/semantic tokens/controls: цілісний верхній card із title+badge, lastSuccess та м'яким inline same-volume warning ліворуч і єдиною primary-дією праворуч; responsive перенос. Шляхи — read-only controls з окремими квадратними Open та secondary Change, назви — основне/додаткове місце, остання копія одним рядком. Видимий zoom/polling/CSS вилучено; Main zoom незмінний.

Нові copy rows відображають один SHA-256-знімок і 2/1 із 2, legacy не групуються за часом. Operations — один новий запис циклу з результатами двох місць; partial попадає до чинного фільтра Помилки, repair позначено доповненням дубліката. Старі події читаються, 5/усі збережено. Slot-based folder IPC, opaque copy ID, picker/Modal/native confirmation/protection/rollback збережені. Серверний AID backend/auth не переносилися. GUI-чекліст і фактичні програмні перевірки — HANDOFF 3.4.3.8, вручну ще не прийнято.

## 4.2 — Залишки відпусток

За SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb звірено src/RecipientRegistry.tsx та src/AidRegistry.tsx. Спільна панель HR повторно використовує DictionaryTable, Select, Modal, ConfirmDialog, DateField, спільні стани й повідомлення. Адаптація полягає в компактному редагуванні кількох періодів у таблиці та використанні вже перенесеного захисту чернетки.

## 4.2.1 — Компонування залишків

За SHA 33eca10733caaf73b1a99e75a24ff35e706a0afb звірено src/RecipientRegistry.tsx (DictionaryTable, registry-row-actions і Trash2) та src/AidRegistry.tsx (ValidatedInput, recipient-field, recipient-form-actions і вкладені діалоги). Адаптовано через чинні компоненти HR та локальні стилі leave.css. Дві колонки редактора звільняють місце для дат і чисел. Закріплені дії доступні при довгому переліку, а групування в режимі перегляду прибирає повторювані підписи. Геометрія інших екранів і механізми запису лишаються як у 4.2. Чекліст Windows у HANDOFF.

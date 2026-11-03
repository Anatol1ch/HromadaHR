# Перенесення UI HromadaAID → HromadaHR (3.4.1–3.4.2.1)

Джерело: `Anatol1ch/HromadaAID`, commit **33eca10733caaf73b1a99e75a24ff35e706a0afb**. HEAD перевірено через read-only Git та GitHub connector 03.11.2026; він збігався з погодженим SHA. Файли прочитано за фіксованим ref, не з рухомої гілки. Локального checkout HromadaAID не було: потрібні текстові файли збережено в окремому тимчасовому каталозі без `.git` для аналізу. Джерело, його історія/налаштування та `reference/` не змінювалися.

Цільова база: HromadaHR `c479d23577e1f61cf16f6c732476a64ef487b2e1`. Робоча гілка: `codex/3.4.1-aid-ui-foundation`. Це перенесення спільної основи; повна перебудова кадрових макетів/форм у модальні вікна залишається окремим завданням 3.4.2. Гілку не зливати в main до завершення й перевірки міграції та окремої вказівки.

**Чинна межа політики після 3.4.2.1:** AID визначає компоненти/геометрію/поведінку; HR має власну сиренево-фіолетову палітру. Зелена брендова палітра в історичному описі 3.4.1 нижче більше не є поточним рішенням.

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

## Межі 3.4.1 і 3.4.2

Кадрові форми поки повноекранні, картка/toolbar/layout мають тимчасові scoped HR-правила. Їх не розвивати як іншу систему: у 3.4.2 перенести композицію цих форм у source Modal, quick dictionaries у вкладені modal, уніфікувати картку/дії та прибрати непотрібні legacy selectors. Синхронний beforeunload поки зберігає native confirmation: він не може очікувати React-діалог без зміни Electron close lifecycle. Внутрішні переходи/cancel/breadcrumbs/sidebar вже використовують source UnsavedChangesConfirmation. Electron у 3.4.1 не змінювався.

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

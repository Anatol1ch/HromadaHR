# Перенесення UI HromadaAID → HromadaHR (3.4.1)

Джерело: `Anatol1ch/HromadaAID`, commit **33eca10733caaf73b1a99e75a24ff35e706a0afb**. HEAD перевірено через read-only Git та GitHub connector 03.11.2026; він збігався з погодженим SHA. Файли прочитано за фіксованим ref, не з рухомої гілки. Локального checkout HromadaAID не було: потрібні текстові файли збережено в окремому тимчасовому каталозі без `.git` для аналізу. Джерело, його історія/налаштування та `reference/` не змінювалися.

Цільова база: HromadaHR `c479d23577e1f61cf16f6c732476a64ef487b2e1`. Робоча гілка: `codex/3.4.1-aid-ui-foundation`. Це перенесення спільної основи; повна перебудова кадрових макетів/форм у модальні вікна залишається окремим завданням 3.4.2. Гілку не зливати в main до завершення й перевірки міграції та окремої вказівки.

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

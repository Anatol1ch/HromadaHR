# Реєстр повторного використання HromadaAID

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
| Налаштування, «Про програму»: `src/SettingsPage.tsx`, `src/styles.css` | S1 | Адаптувати секційну навігацію й about-картки; замість account/server — чинний BackupSettings; без updates runtime | Інтегровано в продовженні 3.4.1; ручне GUI-приймання ще не виконано |
| «Потрібна допомога?»: `src/App.tsx` help-card / support-contact-card | S1 | Адаптувати кнопку й Modal підтримки; контакти з джерела, без нового external IPC | Інтегровано в продовженні 3.4.1; ручне GUI-приймання ще не виконано |
| Кадрові реєстр/форми/історія/модальна картка: `src/RecipientRegistry.tsx`, `src/AidRegistry.tsx`, модальні форми | S1 | Адаптувати RecipientFormModal/RecipientDetails, DecisionFormModal і registry-row-actions; без допомог/виплат | Реалізовано 3.4.2; на 3.4.2.2 — дві групи DictionaryTable, спільні filters/незалежні sorts; note вилучено, category read-only; GUI-приймання відкрите |
| Стартовий екран/анімації: `src/App.tsx` StartupScreen/StartPage | S1 | Відкласти предметну адаптацію запуску; auth/welcome-сеанси не потрібні HR | Лише source page-transition використано; стартовий сценарій не перебудований |
| Резервування й відновлення | Не визначено: відповідні технічні файли AID ще не оцінювалися | Зберегти чинний перевірений локальний SQLite online backup/recovery. Сумісні вдосконалення оцінити окремо за конкретною потребою | HR runtime без змін; формат дат UI вже адаптовано |
| Автоматичні оновлення | S1 лише для UI `src/SettingsPage.tsx`; технічний механізм не перевірено | Відкласти до відповідного етапу; не переносити клієнт-серверні залежності | Не реалізовано |
| Інсталятор, пакування, релізи та інші технічні механізми | Не визначено, цільова оцінка ще не проводилася | Відкласти; на початку відповідного завдання перевірити актуальне джерело й зафіксувати SHA | Не реалізовано |

Детальна provenance-таблиця UI-файлів, відмінності від оригіналу та ручне приймання: [UI-TRANSFER.md](UI-TRANSFER.md). SQLite, міграції 1–3, кадрові дані, 13 IPC-операцій і Electron security не змінюються через цю політику.

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

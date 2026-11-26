# Автоматичні перевірки після функціонального завершення

SQLite v25 (current; 9.12.9): migration adds full-duration guards for new special leave records and preserves existing records. Earlier migration coverage remains: seniority tests cover v22→v23 allowance cleanup and v23→v24 rank cleanup, preserving active facts, legacy origins and unrelated records while removing retired fields. Rank projection/control tests verify assignment-based scheduling and no manual date source. `service-baseline` verifies v21→v22 service-data migration policy and unrelated-data retention. `service-calculations`, `service-leave-calculations`, `personnel-control-calculations` cover service modes, calendar boundaries, accrual and projections. `pnpm test` also runs the Electron storage smoke.

Користувач підтвердив основні функціональні сценарії 16.11.2026. Етап 8 завершено. Наступна фаза — окреме погоджене вікно UI/UX за раз. Тести захищають ризики, не замінюють узгодження вікна й не створюють нового комплексного приймання.

## Запуск

```powershell
pnpm test                  # весь набір + Electron storage smoke
pnpm test all              # те саме явно
pnpm test documents        # тільки документальний модуль
pnpm test leaves seniority # кілька потрібних модулів
pnpm test ui               # спільні дати/guard, не CSS/скриншоти
node tests/run-tests.mjs --list
```

Один pnpm script, без нового framework/dependencies. Перед тестами pnpm збирає актуальний Main/preload. Node runner передає exit code справжнього node:test і не підміняє результат. Без аргументів виконується кожний *.test.mjs, потім чинний tests/run-electron-storage.mjs. Цільовий infrastructure також включає smoke; інші модулі не запускають його повторно. За потреби лише smoke після build: node tests/run-electron-storage.mjs.

Manifest у run-tests.mjs має містити кожний наявний *.test.mjs рівно один раз. Новий неприв’язаний файл, дубль/відсутній файл або невідоме ім’я модуля — помилка, навіть для цільового запуску. Немає прихованих skip/only/виключених сценаріїв; видалені нижче тести фізично вилучено з репозиторію.

## Вісім модулів і критичні гарантії

| Модуль | Файлів | Гарантії / збережені тести |
|---|---:|---|
| infrastructure | 5 | storage/remove-notes: STRICT, FK, ledger/checksum, захисні міграції; ipc: sender/frame/URL, strict args/results, preload allowlist, безпечні помилки; startup: один Main lifecycle, ready/error/close; zoom: guarded persistence |
| backup | 6 | backup/catalog/history/reliability/paired/open-folder: WAL snapshots, publication failures, mutex/retry/rotation, immutable restore source, захисна копія, rollback/recovery, токени/шляхи, безпечна незалежна діагностика |
| personnel | 3 | personnel/dictionaries/current-appointment: CRUD/nullable, migrations/FK, in-use/appointment guards, атомарний порядок/revisions, відсутність побічних кадрових мутацій |
| seniority | 8 | seniority-ranks/model, service-baseline/accounting-form/calculations, rank-projection/ipc, profile-indicators: пороги/календарі, 0/missing/not_applicable, усі джерела стажу та чернетки редактора, спеціальні ранги, readonly прогнози, focused read failure/stale async, чинні Main save/clear |
| leaves | 12 | leave/ipc/rights/registration/corrections/special: періоди/нуль/право, тривалість, explicit FIFO/manual allocation, overspend/overlap, транзакції, idempotency, edit/cancel/revision; service-leave: strict thresholds/readonly; draft/confirmation/presentation/usage: partial-write retry, stale allocation, employee isolation, фактичні річні суми |
| documents | 5 | documents-core: idempotency/references/revisions/rollback; numbering: annual claims, 2 worker connections, rollback/delete no reuse/backup restore; leave-links: same worker/requisites, immutable identity/FK, cancel/unlink/revision; documents-ui/links-ui: transport uncertainty, pending gate, immutable payload, legacy links без truncation, read verification |
| control | 2 | personnel-control/calculations: projected allowance and rank review/deduplication, read-only, fingerprint/due phase, snooze/review/persistence/restore, stale responses й duplicate mutation gate |
| ui | 2 | ui-foundation/contracts: валідна дата до IPC, leap/range/stale ISO, узгодження client/Main validation; shared layered close guards, cancellation/owner/busy/unload, одна pending confirmation |

Кожний модуль фізично залишає предметні fixtures поруч із поточними тестами. Зберігаємо окремі SQLite/міграційні файли, бо вони перевіряють різні опубліковані checksum та ризики. Не зливаємо їх у непрозорий мегатест заради цифри.

## Реальне скорочення 8.2

Початкова точна кількість: **52 *.test.mjs / 287 виконаних сценаріїв + Electron smoke** (helpers/fixtures/runner/smoke не враховані як test-файли). Після: **42 *.test.mjs / 234 сценарії + незмінний smoke**. Видалено **53 сценарії (18,5%)**, test-файлів на 10 менше. Перенесення збережених ризикових кейсів не рахуємо як видалення.

| Що вилучено/скорочено | Чому / де лишився захист |
|---|---|
| documents-navigation, employee-profile, leave-navigation | TSX regex про імпорти, назви розділів, retired files, структуру редакторів; контракти виконання/guard/employee scope збережені у ui-contracts, links-ui, leave-presentation й реальних Main tests |
| employee-registry, leave-registry, leave-journal | Перетин фільтрів/ПІБ, підсумки та текстові plural forms, сортування/групування; простий UI уже перевірений користувачем. Розподіли, календарна тривалість, річний облік та employee isolation лишилися |
| ui-polish | CSS-контраст/класи/другорядні текстові summary; не автоматизуємо геометрію та косметику |
| documents-ui / links-ui | Прибрані source boundaries, простий singleton Select/filter sort, повторний shared guard. Legacy multi-link truncation, uncertain create/update, pending й deep-link accept/cancel лишилися |
| document-numbering-intent | Збережений auto transport/pending кейс перенесено в documents-ui; seriesId read-verification assertions також збережені. Прибрані лише пошук/рядок label; SQL numbering/claims не чіпали |
| employees-ui / employees-modals | Прибрані пошук/sort/просте merge/reducer-card shape; єдиний client/Main validation кейс перенесено у ui-foundation; shared close guards лишилися в ui-contracts |
| profile-leave / profile-indicators | Вилучені повтори guard/source markup; персональна ізоляція перенесена у leave-presentation. Свіжі target reads, read failure/late response та реальні Main показники збережені |
| leave-usage/presentation/confirmation | Вилучені списки років, UI actions regex, дубль summary після cancel, selection indicators/інформаційні props. Allocation limits/stale periods, totals, active/cancelled isolation та confirmation payload лишилися |
| seniority-ranks-model | Вилучені route/Select labels/копіювання дати/чисті відображувані labels. Не змінено rank/allowance Main validation, null/0/not_applicable payloads, date/required validations і нормативні модулі |
| personnel-dictionaries / ui-foundation | Прибрана UI permutation (повноту ID вже гарантує Main) та дубль date-to-schema/timestamp presentation. Client/Main validity і дата до IPC збережені |

Не досягали 30–50% ціною видалення критичних перевірок. Майже всі очевидні UI/source-shape дублікати прибрані; подальше механічне скорочення зачепило б різні backup/recovery, міграційні або предметні інваріанти. Повний набір не обіцяє пропорційного прискорення — його час визначають реальні SQLite/Electron backup fixtures; для одного вікна потрібен цільовий модуль.

## Правило для подальших змін

Невелике вікно: typecheck/build/diff, наявні цільові тести лише для торкнутої поведінки. Shared UI/Main/SQLite/IPC/розрахунки або значуща інтеграція: повний pnpm test. Новий тест — для підтвердженого дефекту/істотного ризику; не 5–10 сценаріїв на підпис або відступ. Не послаблювати предметну модель для тестів, не створювати GUI snapshots/source regex для очевидного компонування. Дані лише синтетичні/ізольовані, production-профілі не відкривати.

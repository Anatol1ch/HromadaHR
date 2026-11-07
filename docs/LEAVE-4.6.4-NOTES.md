# Структура реалізації 4.6.4

До реалізації зафіксовано композицію:

- Картка: секції як персональні/кадрові відомості → шість видів зі станом права/датою перевірки та окремим числом залишку → останні записи → єдина кнопка переходу. Мутацій немає.
- Журнал: повна ширина → toolbar реєстру працівників (пошук, фільтри, очистити, сортування, створити) → шість фільтрів → таблиця з сортуванням/кількістю/переглядом/діями.
- Залишки: ліворуч пошук/список працівників; праворуч ПІБ/контекст → права шести видів → три компактні вкладки → підсумок/зміна → відкрита таблиця.
- Реєстрація: одразу фінальна форма, працівник першим; вид/підвид → дати/дні → підстава → відкрита таблиця FIFO → постійні реквізити → sticky footer. Валідація після submit/взаємодії.
- Редактор: початок/завершення/дні/дії; пропозиції календарних років ОМС є лише чернеткою з явним попередженням і редагованими датами.
- Права: окрема мінімальна v10; останній ручний статус/час Main, жодних автонарахувань, блокувань реєстрації чи зміни історії.

## Фактичний склад змін

- docs/ARCHITECTURE.md
- docs/DECISIONS.md
- docs/HANDOFF.md
- docs/HROMADAAID_REUSE.md
- docs/LEAVE-4.6.4-NOTES.md
- docs/UI-TRANSFER.md
- electron/ipc.ts
- electron/leave/schemas.ts
- electron/leave/service.ts
- electron/preload.cts
- electron/storage/leave-rights-migration.ts
- electron/storage/migrations.ts
- shared/ipc.ts
- shared/leave.ts
- src/App.tsx
- src/components/BackupHistory.tsx
- src/components/SettingsPage.tsx
- src/components/employees/EmployeeCard.tsx
- src/components/employees/EmployeesWorkspace.tsx
- src/components/leave/BalanceEditor.tsx
- src/components/leave/LeaveBalances.tsx
- src/components/leave/LeaveJournal.tsx
- src/components/leave/LeaveOverview.tsx
- src/components/leave/LeaveRecordAction.tsx
- src/components/leave/LeaveRegistrationForm.tsx
- src/components/leave/LeaveRights.tsx
- src/components/leave/LeaveWorkspace.tsx
- src/components/leave/registry.ts
- src/components/leave/summary.ts
- src/employees/registry.ts
- src/lib/dates.ts
- src/styles/leave.css
- tests/backup-catalog.test.mjs
- tests/backup.test.mjs
- tests/electron-storage-smoke.cjs
- tests/leave-corrections.test.mjs
- tests/leave-ipc.test.mjs
- tests/leave-navigation.test.mjs
- tests/leave-registration.test.mjs
- tests/leave-registry.test.mjs
- tests/leave-rights.test.mjs
- tests/leave.test.mjs
- tests/personnel.test.mjs
- tests/special-leaves.test.mjs
- tests/ui-foundation.test.mjs

Звірка критеріїв і ручний чекліст: HANDOFF 4.6.4.

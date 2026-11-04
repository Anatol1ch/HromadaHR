# Ресурси HromadaHR

`hromadahr.svg` — основне векторне джерело бренду програмного продукту.
Воно відтворює погоджений sidebar brand-mark: квадрат 42×42, радіус 12,
фон `#6F5AA5`, білий UsersRound 22×22 зі stroke-width 2.1, без написів.
Геометрія UsersRound взята з уже встановленого `lucide-react` 0.577.0;
ліцензія Lucide/Feather міститься в `LUCIDE-LICENSE.txt`.

- `hromadahr.png`: 512×512, прозорі кути, пропорції SVG збережені.
- `hromadahr.ico`: PNG-кадри 16, 24, 32, 48, 64, 128 і 256 px (32-bit RGBA).
- `community-coat.png`: окремий чинний герб громади для головної сторінки;
  він не замінюється логотипом програми.

## Відтворення іконок

Після цілеспрямованої зміни SVG виконайте з кореня репозиторію:

```powershell
node scripts/generate-icons.mjs
```

Генератор адаптований із HromadaAID
`33eca10733caaf73b1a99e75a24ff35e706a0afb`,
`scripts/generate-manager-icons.mjs`. Він використовує тільки наявний Electron
для offscreen-рендерингу SVG та формує багаторозмірний ICO без нових залежностей.
Electron-профіль, session, logs і crashDumps ізольовані в тимчасовій теці;
перед очищенням перевіряється її розташування. Продукційна БД не відкривається.
PNG/ICO готові, зберігаються в Git і не генеруються під час запуску або build.

## Build та нативне вікно

`pnpm build:electron` викликає `electron/copy-assets.mjs` і копіює готові
SVG/PNG/ICO до `dist-electron/electron/assets`. Повний `pnpm build` і `pnpm dev`
включають цей крок. Обидва незапаковані режими, dev та built без Vite, виконують
Main із `dist-electron/electron/main.js`, тому мають один коректний відносний шлях
до цих ресурсів. BrowserWindow використовує ICO у Windows, PNG на інших ОС.
About імпортує SVG через Vite; на головній лишається герб громади.

Підхід копіювання, `BrowserWindow.icon` та продуктового логотипа About узятий
із `electron/copy-assets.mjs`, `electron/main.ts`, `src/SettingsPage.tsx` AID
за тим самим SHA. Бренд AID, його серверні/фінансові файли та compatibility-копії
ресурсів, непотрібні HR, не переносяться.

## Межі Windows та майбутнє пакування

`electron .` використовує незапакований Electron EXE. Його іконка у Провіднику,
на панелі завдань або в закріпленому ярлику може залишатися стандартною Electron,
попри налаштовану іконку BrowserWindow. Кеш Windows/особисті ярлики не змінюємо.

Під час окремого майбутнього пакування потрібно задати `assets/hromadahr.ico`
для EXE/ярликів/інсталятора та скопіювати комплект у `resources/assets` поза ASAR:
саме туди вказує packaged-гілка Main, за підходом AID. Пакувальник і NSIS зараз
не налаштовані, EXE/інсталятор/реліз не створюються. App ID/AppUserModelID
`local.hromadahr`, назва й каталоги профілів не змінені.

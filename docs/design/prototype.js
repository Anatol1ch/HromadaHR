// Synthetic data and local navigation for the design review.
(function prototype() {
  'use strict'
  const screens = {
    card: 'Особова картка', journal: 'Журнал', register: 'Реєстрація',
    record: 'Перегляд запису', balances: 'Залишки за періодами',
    annual: 'Використання за рік', rights: 'Права на відпустки',
  }
  const samples = {
    card: [['filled', 'Останні записи'], ['empty', 'Без реєстрацій']],
    register: [['period', 'Періодна відпустка'], ['special', 'Спеціальна відпустка'], ['error', 'Помилка введення']],
    record: [['active', 'Зареєстровано'], ['cancelled', 'Скасовано'], ['special', 'З документальною підставою']],
    balances: [['full', 'Повний облік'], ['partial', 'Неповний облік'], ['zero', 'Підтверджено нуль'], ['empty', 'Залишки не внесено']],
    annual: [['2027', '2027'], ['2028', '2028 без записів']],
  }
  const types = [
    ['Щорічна основна', 'sun', 'has', '25 днів'],
    ['Додаткова за стаж', 'landmark', 'has', '0 днів'],
    ['Додаткова на дітей', 'baby', 'unknown', 'Не внесено'],
    ['Додаткова на навчання', 'graduation', 'unknown'],
    ['Для УБД та інших категорій за статтею 16-2', 'shield-check', 'has'],
    ['Для постраждалих унаслідок Чорнобильської катастрофи', 'ribbon', 'no'],
  ]
  const employee = 'Коваль Марія Олександрівна'
  const role = 'Головна спеціалістка'
  const department = 'Відділ організаційної роботи'
  const icon = name => `<svg class="icon" aria-hidden="true" focusable="false"><use href="#${name}"></use></svg>`
  const tile = (name, variant = 'icon-tile') => `<span class="${variant}">${icon(name)}</span>`
  const badge = (text, kind = '') => `<span class="badge ${kind}">${text}</span>`
  const rightsBadge = status => status === 'has' ? badge('Право підтверджено', 'good') : status === 'no' ? badge('Права немає', 'warn') : badge('Не перевірено')
  const metric = (label, value, hero = false) => `<div class="item${hero ? ' hero-value' : ''}"><dt>${label}</dt><dd>${value}</dd></div>`
  const btn = (text, symbol = '', classes = '', route = '', disabled = false) =>
    `<button type="button" class="btn ${classes}" ${route ? `data-route="${route}"` : 'data-demo-action'} ${disabled ? 'disabled' : ''}>${symbol ? icon(symbol) : ''}${text}</button>`
  const iconBtn = (symbol, label, route = '') =>
    `<button type="button" class="icon-button" title="${label}" aria-label="${label}" ${route ? `data-route="${route}"` : 'data-demo-action'}>${icon(symbol)}</button>`
  const heading = (title, symbol, action = '') =>
    `<header class="section-head"><div class="title">${symbol ? icon(symbol) : ''}<h2>${title}</h2></div>${action}</header>`
  const info = (title, symbol, content, action = '') =>
    `<section class="info">${heading(title, symbol, action)}${content}</section>`
  const note = (text, kind = '') => `<p class="notice ${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${icon(kind === 'success' ? 'check' : 'triangle-alert')}<span>${text}</span></p>`
  const empty = text => `<p class="empty" role="status">${icon('inbox')}<span>${text}</span></p>`
  const help = (id, label, text) =>
    `<span class="tip"><button type="button" class="icon-button" aria-label="${label}" aria-describedby="${id}">${icon('circle-help')}</button><span role="tooltip" id="${id}">${text}</span></span>`
  const row = (values, classes = '') => `<tr class="${classes}">${values.map(value => {
    const cell = typeof value === 'string' ? { text: value } : value
    return `<td${cell.num ? ' class="num"' : ''}>${cell.text}</td>`
  }).join('')}</tr>`
  const num = text => ({ text, num: true })
  const table = (label, headings, rows, css = '') =>
    `<div class="table-wrap" tabindex="0" role="region" aria-label="${label}"><table class="${css}"><thead><tr>${headings.map(value => {
      const cell = typeof value === 'string' ? { text: value } : value
      return `<th scope="col"${cell.num ? ' class="num"' : ''}>${cell.text}</th>`
    }).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`

  const state = { screen: 'balances', sample: 'full', type: 0, filters: false, rights: types.map(type => type[2]), registrationType: 'period' }
  const screenControl = document.querySelector('#screen')
  const sampleControl = document.querySelector('#sample')
  const sampleWrap = document.querySelector('#sample-control')
  const preview = document.querySelector('#preview')
  const options = items => items.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')
  screenControl.innerHTML = options(Object.entries(screens))

  function personPanel() {
    return `<div class="panel person"><div class="identity">${tile('user', 'avatar')}<div><strong>${employee}</strong><small>${role} · ${department}</small></div></div>
      ${btn('Змінити працівника', 'search')}</div>`
  }

  function shell(content) {
    const active = state.screen === 'annual' ? 'balances' : state.screen
    const nav = [['journal', 'Журнал відпусток', 'list'], ['balances', 'Залишки відпусток', 'wallet'], ['rights', 'Права на відпустки', 'shield-check']]
    const sidebar = [['Головна', 'house'], ['Працівники', 'users'], ['Відпустки', 'calendar'], ['Налаштування', 'settings']]
    return `<div class="shell"><aside class="sidebar" aria-label="Контекст застосунку"><p>Робочий простір</p><ul>${sidebar.map(([label, symbol]) =>
      `<li class="shell-link" aria-label="${label}" ${label === 'Відпустки' ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></li>`).join('')}</ul></aside>
      <div class="workspace"><header><p class="eyebrow">Кадровий облік</p><h1>Відпустки</h1></header>
      <nav class="module-nav" aria-label="Розділи відпусток">${nav.map(([key, label, symbol]) =>
        `<button type="button" class="tab" data-route="${key}" ${active === key ? 'aria-current="page"' : ''}>${icon(symbol)}${label}</button>`).join('')}</nav>${content}</div></div>`
  }

  function dialog(title, subtitle, body, footer, css = '') {
    return `<div class="overlay"><section class="dialog ${css}" role="dialog" aria-labelledby="dialog-title">
      <header class="dialog-title"><div><h1 id="dialog-title">${title}</h1>${subtitle ? `<small>${subtitle}</small>` : ''}</div>${iconBtn('x', 'Закрити', 'journal')}</header>
      <div class="dialog-body" tabindex="0" aria-label="Вміст вікна">${body}</div>
      <footer class="dialog-footer">${footer}</footer></section></div>`
  }

  function card() {
    const tiles = types.map(([name, symbol, status, balance]) =>
      `<article class="item leave-tile"><div class="identity">${tile(symbol)}<div><strong>${name}</strong><div>${rightsBadge(status)}</div></div></div>
        ${balance ? (balance === 'Не внесено' ? `<small class="push">${balance}</small>` : `<span class="tile-balance" aria-label="Залишок ${balance}">${balance}</span>`) : ''}</article>`)
    const recent = state.sample === 'empty' ? empty('Відпусток ще не зареєстровано.') : table('Останні відпустки', ['Вид', 'Дати', num('Днів'), 'Статус', 'Розпорядження'], [
      row([types[0][0], '10.06.2027–14.06.2027', num('5'), badge('Зареєстровано', 'good'), '№ 45-к']),
      row([types[4][0], '12.03.2027–25.03.2027', num('14'), badge('Зареєстровано', 'good'), '№ 17-к']),
    ])
    return dialog('Особова картка', '', `<div class="identity">${tile('user', 'avatar')}<div><h2>${employee}</h2><small>${role} · ${department}</small></div></div>
      <nav class="card-tabs" aria-label="Вкладки особової картки"><span class="tab">Загальна інформація</span><span class="tab" aria-current="page">Відпустки</span></nav>
      ${info('Права та залишки відпусток', 'wallet', `<div class="card-grid">${tiles.join('')}</div>`)}
      ${info('Останні зареєстровані відпустки', 'history', recent)}`, btn('Перейти до відпусток', 'arrow-right', 'primary', 'balances'))
  }

  function journal() {
    const filters = state.filters ? `<div class="field-grid">${['Підрозділ', 'Посада', 'Працівник', 'Вид відпустки', 'Календарний рік', 'Статус'].map(label =>
      `<label class="field"><span class="field-label">${label}</span><select><option>Усі</option></select></label>`).join('')}</div>` : ''
    const registryRows = [
      [types[0][0], '10.06.2027', '14.06.2027', '5', '45-к', false],
      [types[4][0], '12.03.2027', '25.03.2027', '14', '17-к', false],
      [types[0][0], '18.02.2027', '22.02.2027', '5', '09-к', true],
    ].map(([type, start, end, days, order, cancelled]) => row([
      `<strong>${employee}</strong>`, department, role, type, start, end, num(days), `№ ${order}`,
      cancelled ? badge('Скасовано', 'warn') : badge('Зареєстровано', 'good'),
      `<div class="row-actions">${iconBtn('eye', 'Переглянути', cancelled ? 'record:cancelled' : type === types[4][0] ? 'record:special' : 'record')}${cancelled ? '' : iconBtn('pencil', 'Редагування поза сценарієм прототипу') + iconBtn('ban', 'Скасування поза сценарієм прототипу')}</div>`,
    ], cancelled ? 'cancelled' : ''))
    return shell(`<section class="panel detail-stack"><div class="toolbar">
      <input type="search" aria-label="Пошук за ПІБ або розпорядженням" placeholder="ПІБ або номер розпорядження">
      <button class="btn" type="button" data-filters aria-expanded="${state.filters}">${icon('sliders')}Фільтри</button>
      ${btn('Очистити фільтри', 'filter-x', '', '', true)}${btn('Скинути сортування', 'list-restart', '', '', true)}
      ${btn('Зареєструвати відпустку', 'plus', 'primary', 'register')}</div>${filters}</section>
      <section class="panel table-section">${heading('Журнал відпусток', '', '<small class="push">3 записи</small>')}
      ${table('Журнал відпусток', ['Працівник', 'Підрозділ', 'Посада', 'Вид відпустки', 'Початок ↓', 'Завершення', num('Днів'), 'Розпорядження', 'Статус', 'Дії'], registryRows, 'journal-table')}</section>`)
  }

  function typeNav() {
    const sections = [[0, 3, 'Залишки за періодами'], [3, 6, 'Використання за рік']]
    const picker = `<label class="field type-picker"><span class="field-label">Вид відпустки</span><select data-type-picker>${sections.map(([start, end, title]) =>
      `<optgroup label="${title}">${types.slice(start, end).map(([name], index) =>
        `<option value="${start + index}" ${state.type === start + index ? 'selected' : ''}>${name}</option>`).join('')}</optgroup>`).join('')}</select></label>`
    return `<nav class="type-nav" aria-label="Види відпусток">${picker}${sections.map(([start, end, title]) =>
      `<div class="type-group"><p class="group-title">${title}</p>${types.slice(start, end).map(([name, symbol], index) =>
        `<button type="button" class="type-link" data-type="${start + index}" aria-pressed="${state.type === start + index}">${icon(symbol)}<span>${name}</span></button>`).join('')}</div>`).join('')}</nav>`
  }

  function periodContent() {
    const [name, symbol, status] = types[state.type]
    const mode = state.sample
    const isEmpty = mode === 'empty'
    const isPartial = mode === 'partial'
    const isZero = mode === 'zero'
    const remaining = isZero ? '0 днів' : isPartial ? '10 днів' : '25 днів'
    const totals = isZero ? ['5 днів', '5 днів'] : isPartial ? ['15 днів', '5 днів'] : ['30 днів', '5 днів']
    const groups = ['<tr class="subgroup"><th colspan="5">Початкові залишки</th></tr>',
      row(['01.09.2026–31.08.2027', num(isEmpty ? 'Не внесено' : isZero ? '5 днів' : '15 днів'), num(isEmpty ? '–' : '5'), num(isEmpty ? '–' : isZero ? '0' : '10'), isEmpty ? '–' : iconBtn('trash', 'Вилучення поза сценарієм прототипу')]),
      '<tr class="subgroup"><th colspan="5">Права за новими періодами</th></tr>',
      row(['01.09.2027–31.08.2028 <small>Майбутній період</small>', num(isEmpty || isPartial ? 'Не внесено' : isZero ? '0 днів' : '15 днів'), num(isEmpty || isPartial ? '–' : '0'), num(isEmpty || isPartial ? '–' : isZero ? '0' : '15'), isEmpty || isPartial ? '–' : iconBtn('trash', 'Вилучення поза сценарієм прототипу')])]
    const content = isEmpty ? empty('Підтверджених залишків за цим видом ще немає.') :
      `<dl class="metrics balance-metrics two-details">${metric(isPartial ? 'Доступно за внесеними періодами' : 'Доступно', remaining, true)}${metric('Внесено до обліку', totals[0])}${metric('Враховано у відпустках', totals[1])}</dl>`
    return `${info(name, symbol, content + (isPartial ? note('Залишки внесено лише за частиною періодів.') : ''),
      `<span class="push">${rightsBadge(status)}</span>${btn(isEmpty ? 'Внести залишки' : 'Редагувати залишки', 'pencil')}`)}
      <section class="table-section">${heading('Облікові періоди', 'calendar')}${table('Облікові періоди', ['Обліковий період', num('Внесено днів'), num('Враховано у відпустках'), num('Залишилося'), 'Дії'], groups)}</section>`
  }

  function annualContent() {
    const [name, symbol] = types[state.type]
    const year = state.sample
    const study = state.type === 3
    const limit = state.type === 4 ? 14 : 16
    const filled = year === '2027'
    const days = study ? '10 днів' : `${limit} днів`
    const yearSelect = `<label class="preview-select push">Рік <select data-year aria-label="Календарний рік">${options(samples.annual.map(([value]) => [value, value]))}</select></label>`
    const tip = help('annual-tip', 'Як рахуються дні за рік', 'Відпустка належить до року початку, навіть якщо завершується наступного року. Дні не накопичуються. Для спеціальних видів допускається одна активна реєстрація на рік.')
    const metrics = filled ? `<dl class="metrics balance-metrics${study ? '' : ' three-details'}">${metric(`Зареєстровано за ${year} рік`, days, true)}${metric('Активні реєстрації', '1')}${study ? '' :
      metric('Межа тривалості', `${limit} днів`) + metric('Повторне надання', 'Недоступне')}</dl>` :
      `${empty('За обраний рік реєстрацій цього виду немає.')}${study ? '' : `<dl class="metrics two">${metric('Межа тривалості', `${limit} днів`)}${metric('Активна реєстрація', 'Відсутня')}</dl>`}`
    return `${info(name, symbol, metrics + (!study && filled ? note(`За ${year} рік уже є активна реєстрація.`) : ''), tip + yearSelect)}
      ${filled ? `<section class="table-section">${heading('Реєстрації за роком початку', 'history')}${table('Реєстрації', ['Дати', num('Днів'), 'Розпорядження', 'Статус'], [
        row([study ? '05.04.2027–14.04.2027' : state.type === 4 ? '12.03.2027–25.03.2027' : '12.03.2027–27.03.2027', num(study ? '10' : String(limit)), '№ 17-к <small>09.03.2027</small>', badge('Зареєстровано', 'good')]),
        row(['09.02.2027–13.02.2027', num('5'), '№ 08-к', badge('Скасовано · у сумі не враховано', 'warn')], 'cancelled'),
      ])}</section>` : ''}`
  }

  const textField = (label, value, attrs = '') => `<label class="field"><span class="field-label">${label}</span><input value="${value}" ${attrs}></label>`
  const dateField = (label, value) => `<label class="field"><span class="field-label">${label}</span><span class="date-wrap"><input value="${value}" inputmode="numeric">${icon('calendar')}</span></label>`
  function register() {
    const special = state.registrationType === 'special'
    const error = state.sample === 'error'
    const formType = special ? 'special' : 'period'
    const selectType = `<label class="field"><span class="field-label">Вид відпустки</span><select data-registration-type>${options([['period', types[0][0]], ['special', 'Соціальні та інші']])}</select></label>`
    const fields = `<div class="field-grid two">${'<label class="field"><span class="field-label">Працівник</span><select><option>' + employee + '</option></select></label>'}${selectType}</div>
      ${special ? `<label class="field"><span class="field-label">Уточніть підвид</span><select><option>${types[4][0]}</option></select></label>` : ''}
      <p class="muted">Облік відпусток із 01.01.2027.</p>
      <div class="field-grid">${dateField('Початок', special ? '12.03.2027' : '10.06.2027')}${dateField('Завершення', special ? '25.03.2027' : error ? '08.06.2027' : '14.06.2027')}${textField('Кількість днів', special ? '14' : '5', 'inputmode="numeric"')}</div>
      ${error ? note('Завершення має бути не раніше початку.', 'error') : ''}
      ${special ? '<label class="field"><span class="field-label">Підстава надання</span><textarea rows="2">Заява працівниці та документ, що підтверджує право.</textarea></label>' + note('До 14 календарних днів. Одне активне надання за рік початку.') : ''}`
    const allocation = !special && !error ? info('Розподіл днів', 'list', table('Розподіл днів', ['Обліковий період', num('Доступно'), num('Списати')], [
      row(['01.09.2026–31.08.2027', num('15'), num('<input class="allocation-input" inputmode="numeric" aria-label="Списати днів за період 01.09.2026–31.08.2027" value="5">')]),
    ]) + `<div class="toolbar"><span class="muted">5 днів розподілено автоматично</span>${btn('Автоматично розподілити', '', 'push')}</div>`, help('allocation-tip', 'Як розподіляються дні', 'Спочатку використовуються найстаріші доступні залишки. Розподіл можна змінити.')) : ''
    return dialog('Реєстрація відпустки', 'Демонстраційна форма', info('Відомості про відпустку', 'calendar', fields) + allocation +
      info('Розпорядження (необов’язково)', 'file', `<div class="field-grid two">${textField('Номер', special ? '17-к' : '45-к')}${dateField('Дата', special ? '09.03.2027' : '07.06.2027')}</div>`,
        help('order-tip', 'Реквізити розпорядження', 'Номер і дату можна додати пізніше через редагування реєстрації.')),
      btn('Скасувати', '', '', 'journal') + btn('Зареєструвати', 'check', 'primary', '', error), `form-dialog ${formType}`)
  }

  function record() {
    const cancelled = state.sample === 'cancelled'
    const special = state.sample === 'special'
    const [name, symbol] = types[special ? 4 : 0]
    const summary = `<dl class="metrics record-fields">
      ${metric('Працівник', employee)}${metric('Підрозділ', department)}${metric('Посада', role)}
      ${metric('Початок', special ? '12.03.2027' : cancelled ? '18.02.2027' : '10.06.2027')}
      ${metric('Завершення', special ? '25.03.2027' : cancelled ? '22.02.2027' : '14.06.2027')}
      ${metric('Днів', special ? '14 днів' : '5 днів', true)}
    </dl>`
    const documentFields = `<dl class="metrics two">${metric('Номер розпорядження', special ? '№ 17-к' : cancelled ? '№ 09-к' : '№ 45-к')}${metric('Дата розпорядження', special ? '09.03.2027' : cancelled ? '15.02.2027' : '07.06.2027')}${special ? '<div class="item wide-item"><dt>Підстава надання</dt><dd>Заява працівниці та документ, що підтверджує право.</dd></div>' : ''}</dl>`
    return dialog('Перегляд відпустки', '', info(name, symbol, summary, `<span class="push">${cancelled ? badge('Скасовано', 'warn') : badge('Зареєстровано', 'good')}</span>`) +
      (cancelled ? note('Скасовано 16.02.2027 о 10:30. Причина – зміна погоджених дат.') : '') +
      info('Документальні відомості', 'file', documentFields) +
      (special ? '' : info('Розподіл днів', 'list', table('Розподіл днів', ['Період', num('Днів')], [row(['01.09.2026–31.08.2027', num('5')])]))), btn('Закрити', '', '', 'journal'), 'record-dialog')
  }

  function rights() {
    const choices = [['unknown', 'Не перевірено', 'circle-help'], ['has', 'Право є', 'circle-check'], ['no', 'Права немає', 'circle-x']]
    const dirty = state.rights.some((value, index) => value !== types[index][2])
    return shell(`${personPanel()}<section class="panel">
      ${heading('Права на відпустки', '')}${types.map(([name, symbol, status], index) =>
      `<div class="right-row"><div class="identity">${tile(symbol)}<div><strong id="right-${index}">${name}</strong>
      ${state.rights[index] !== status ? `<small>Збережений стан – ${choices.find(item => item[0] === status)[1]}</small>` : ''}
      ${status !== 'unknown' ? '<small>Попередня перевірка – 02.06.2027 09:30</small>' : ''}</div></div>
      <div class="switch" role="radiogroup" aria-labelledby="right-${index}">${choices.map(([value, text, glyph]) =>
        `<label><input type="radio" name="right-${index}" data-right="${index}" value="${value}" ${state.rights[index] === value ? 'checked' : ''}><span>${icon(glyph)}${text}</span></label>`).join('')}</div></div>`).join('')}
      <footer class="rights-footer"><span class="muted" role="status">${dirty ? 'Є незбережені зміни' : ''}</span>${btn('Зберегти перевірку', 'check', 'push primary', '', !dirty)}</footer></section>`)
  }

  function render() {
    const views = {
      card, journal, register, record, rights,
      balances: () => shell(`${personPanel()}<div class="workbench">${typeNav()}<div class="detail-stack">${periodContent()}</div></div>`),
      annual: () => shell(`${personPanel()}<div class="workbench">${typeNav()}<div class="detail-stack">${annualContent()}</div></div>`),
    }
    document.body.dataset.screen = state.screen
    preview.innerHTML = views[state.screen]()
    screenControl.value = state.screen
    const modes = samples[state.screen]
    sampleWrap.hidden = !modes
    if (modes) {
      sampleControl.innerHTML = options(modes)
      sampleControl.value = state.sample
    }
    const year = preview.querySelector('[data-year]')
    if (year) year.value = state.sample
    const registrationType = preview.querySelector('[data-registration-type]')
    if (registrationType) registrationType.value = state.registrationType
  }

  function navigate(screen, sample, type) {
    if (!(screen in screens)) return
    state.screen = screen
    state.type = type ?? (screen === 'annual' ? 4 : 0)
    state.sample = sample ?? (screen === 'balances' && state.type === 1 ? 'zero' : screen === 'balances' && state.type === 2 ? 'empty' : samples[screen]?.[0][0] ?? '')
    state.registrationType = state.sample === 'special' ? 'special' : 'period'
    render()
    window.scrollTo(0, 0)
  }

  screenControl.addEventListener('change', () => navigate(screenControl.value))
  sampleControl.addEventListener('change', () => navigate(state.screen, sampleControl.value, state.type))
  preview.addEventListener('click', event => {
    const target = event.target.closest('button')
    if (!target) return
    if (target.dataset.route) {
      navigate(...target.dataset.route.split(':'))
      screenControl.focus({ preventScroll: true })
    } else if (target.dataset.type !== undefined) {
      const type = Number(target.dataset.type)
      navigate(type < 3 ? 'balances' : 'annual', type >= 3 && state.screen === 'annual' ? state.sample : undefined, type)
      preview.querySelector(`[data-type="${type}"]`)?.focus({ preventScroll: true })
    } else if (target.hasAttribute('data-filters')) {
      state.filters = !state.filters
      render()
      preview.querySelector('[data-filters]').focus()
    } else if (target.hasAttribute('data-dismiss')) {
      target.closest('.demo-toast').remove()
    } else if (target.hasAttribute('data-demo-action')) {
      preview.querySelector('.demo-toast')?.remove()
      preview.insertAdjacentHTML('beforeend', `<div class="demo-toast" role="status">${icon('circle-help')}<span>У прототипі ця дія показана для оцінки вигляду.</span><button type="button" class="icon-button" aria-label="Закрити повідомлення" data-dismiss>${icon('x')}</button></div>`)
    }
  })
  preview.addEventListener('change', event => {
    const target = event.target
    if (target.hasAttribute('data-type-picker')) {
      const type = Number(target.value)
      navigate(type < 3 ? 'balances' : 'annual', type >= 3 && state.screen === 'annual' ? state.sample : undefined, type)
      preview.querySelector('[data-type-picker]').focus({ preventScroll: true })
    } else if (target.hasAttribute('data-year')) {
      navigate('annual', target.value, state.type)
      preview.querySelector('[data-year]').focus()
    } else if (target.hasAttribute('data-registration-type')) {
      navigate('register', target.value)
      preview.querySelector('[data-registration-type]').focus()
    } else if (target.dataset.right !== undefined) {
      const index = Number(target.dataset.right)
      const value = target.value
      state.rights[index] = value
      const scrollTop = window.scrollY
      render()
      preview.querySelector(`[name="right-${index}"][value="${value}"]`).focus({ preventScroll: true })
      window.scrollTo(0, scrollTop)
    }
  })

  const [initialScreen, initialSample, initialType] = location.hash.slice(1).split(':')
  navigate(initialScreen in screens ? initialScreen : 'balances', initialSample || undefined,
    initialType && /^[0-5]$/.test(initialType) ? Number(initialType) : undefined)
})()

'use strict';

(function () {
  const types = [
    ['annual_main','Щорічна основна','calendar'],
    ['oms_service_additional','Додаткова за стаж','landmark'],
    ['children_social_additional','Додаткова на дітей','baby'],
    ['study_leave','Додаткова на навчання','graduation'],
    ['veteran_special_leave','Для УБД та інших категорій за статтею 16-2','shield-check',14],
    ['chernobyl_special_leave','Для постраждалих унаслідок Чорнобильської катастрофи','ribbon',16],
  ]
  const people = ['Олена Коваль','Андрій Гнатюк','Ірина Бондар','Марія Савчук','Петро Мельник']
  const scenarios = [
    ['Основна · підтверджено право та дні',0,0],
    ['Основна · дні ще не внесено',1,0],
    ['Основна · право не перевірено, є історичні дні',2,0],
    ['Основна · права немає, історія порожня',3,0],
    ['Основна · права немає, історія збережена',4,0],
    ['За стаж · дата набуття та пропозиції',0,1],
    ['На дітей · залишок попереднього року',2,2],
    ['На навчання · фактичні реєстрації',0,3],
    ['Спеціальна · річний облік і скасування',0,4],
  ]
  const labels = { yes:'Право підтверджено', unknown:'Право не перевірено', no:'Поточного права немає' }
  const tabs = { journal:'Журнал відпусток', balances:'Залишки відпусток', rights:'Права на відпустки' }
  const cutoff = '2027-01-01'
  const row = (id,start,end,days) => ({id,start,end,days})
  const fixtures = {
    rights:{'0:0':'yes','1:0':'yes','3:0':'no','4:0':'no','0:1':'yes','2:2':'no','0:4':'yes'},
    anchors:{0:'2025-01-03'},
    balances:{
      '0:0':[row('a','2025-09-01','2026-08-31',8),row('b','2026-09-01','2027-08-31',0),row('c','2027-09-01','2028-08-31',null)],
      '1:0':[row('d','2026-09-01','2027-08-31',null)],
      '3:0':[row('h','2026-09-01','2027-08-31',null)],
      '2:0':[row('e','2026-09-01','2027-08-31',7)],
      '4:0':[row('f','2026-09-01','2027-08-31',10)],
      '2:2':[row('g','2026-01-01','2026-12-31',10)],
    },
    records:[
      {id:1,person:4,type:0,start:'2027-02-10',end:'2027-02-12',days:3,alloc:{f:3}},
      {id:2,person:0,type:3,start:'2027-02-01',end:'2027-02-05',days:5,basis:'Довідка-виклик № 12'},
      {id:3,person:0,type:4,start:'2027-03-01',end:'2027-03-14',days:14,basis:'Посвідчення · демо'},
      {id:4,person:0,type:4,start:'2027-01-01',end:'2027-01-14',days:14,basis:'Посвідчення · демо',cancelled:true,reason:'Дати уточнено'},
    ]
  }
  const $ = id => document.getElementById(id)
  const dialog = $('operation')
  let data, person, type, tab, year, scenario, draft, entry, mode, opener, lastPeriod
  const key = () => person + ':' + type
  const periodic = () => type < 3
  const status = () => data.rights[key()] ?? 'unknown'
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
  const date = iso => iso ? iso.split('-').reverse().join('.') : ''
  function iso(text) {
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(text)) return ''
    const value = text.split('.').reverse().join('-')
    const stamp = new Date(value + 'T00:00:00Z')
    return !value.startsWith('0000') && !Number.isNaN(+stamp) && stamp.toISOString().slice(0,10) === value ? value : ''
  }
  const interval = p => date(p.start) + '–' + date(p.end)
  const calendarDays = (start,end) => (Date.parse(end) - Date.parse(start))/86400000 + 1
  function nextYear(start) {
    const [y,m,d] = start.split('-').map(Number)
    const last = new Date(Date.UTC(y+1,m,0)).getUTCDate()
    return `${y+1}-${String(m).padStart(2,'0')}-${String(Math.min(last,d)).padStart(2,'0')}`
  }
  function serviceRows(anchor) {
    if (!anchor) return []
    const rows = []
    for (let start = anchor; rows.length < 200 && start < '9999';) {
      const next = nextYear(start)
      const end = new Date(Date.parse(next)-86400000).toISOString().slice(0,10)
      rows.push(row('oms-'+start,start,end,null))
      if (start > cutoff) break
      start = next
    }
    return rows
  }
  function periods() {
    const saved = data.balances[key()] ?? []
    const generated = type === 1 ? serviceRows(data.anchors[person]).filter(p => !saved.some(s => s.start <= p.end && p.start <= s.end)) : []
    return [...saved,...generated].sort((a,b)=>a.start.localeCompare(b.start))
  }
  const used = (p,except) => data.records.filter(r=>r.person===person && r.type===type && !r.cancelled && r.id!==except)
    .reduce((n,r)=>n+(r.alloc?.[p.id] ?? 0),0)
  const button = (action,label,primary=false,extra='') => `<button type="button" class="btn${primary?' primary':''}" data-action="${action}" ${extra}>${label}</button>`
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"></use></svg>`
  const field = (name,label,value='',attrs='') => `<label class="field"><span>${label}</span><input name="${name}" value="${escape(value)}" ${attrs}></label>`
  const metric = (label,value) => `<div class="item"><dt>${label}</dt><dd>${value}</dd></div>`
  const badge = () => `<span class="badge ${status()==='yes'?'good':status()==='no'?'warn':'info-badge'}">${labels[status()]}</span>`
  const section = (title,body,actions='') => `<section class="info"><header class="section-head"><h2>${title}</h2>${actions}</header>${body}</section>`
  const table = (headers,rows) => `<div class="table-wrap" tabindex="0" aria-label="Прокручувана таблиця"><table><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  const option = (value,label) => `<option value="${value}">${escape(label)}</option>`
  function reset() {
    data = structuredClone(fixtures)
    person=0; type=0; year='2027'; scenario='0'; tab='balances'; draft=null; entry=null; mode=''; lastPeriod={}
    render(); notify('')
  }
  function notify(message) {
    $('feedback').textContent = message
    $('feedback').hidden = !message
  }
  function render() {
    if (periodic()) lastPeriod[person]=type
    $('scenario').value=scenario; $('person').value=person; $('kind').value=type
    for(const b of $('tabs').querySelectorAll('button')) {
      if(b.dataset.tab===tab) b.setAttribute('aria-current','page')
      else b.removeAttribute('aria-current')
    }
    const rows=periods(), confirmed=rows.filter(p=>p.days!==null)
    const available=confirmed.reduce((n,p)=>n+p.days-used(p),0)
    let content
    if(tab==='rights') {
      content=section(types[type][1],`${badge()}<p>Поточна перевірка зберігається окремо від днів і журналу.</p>
        <form id="right-form" class="workflow-inline"><label class="field">Результат перевірки
        <select name="right">${Object.entries(labels).map(([v,l])=>`<option value="${v}" ${v===status()?'selected':''}>${l}</option>`).join('')}</select></label>
        <button class="btn primary">Зберегти право</button></form>`)
    } else if(tab==='balances' && periodic()) {
      const visible=type===2 ? confirmed : rows.filter(p=>status()!=='no'||p.days!==null)
      content=section(`${icon(types[type][2])} ${types[type][1]}`,
        `<dl class="metrics two">${metric('Поточне право',badge())}${metric(status()==='no'?'Історичний залишок':'Підтверджений залишок',confirmed.length?available+' дн.':'Дані відсутні')}</dl>
        ${type===1?`<p class="muted">Дата набуття права · ${date(data.anchors[person])||'Не внесено'}</p>`:''}
        ${status()==='no'&&!confirmed.length?'<p class="muted">Підтверджених історичних днів немає.</p>':''}
        ${confirmed.length&&visible.some(p=>p.days===null&&p.start<=cutoff)?'<p class="muted">Деякі періоди ще не підтверджені. Підсумок охоплює внесені дні.</p>':''}
        ${visible.length?table(['Період','Підтверджено','Враховано','Залишок'],visible.map(p=>`<tr><td>${interval(p)}${p.start>cutoff?'<small>Наступний період</small>':''}</td><td>${p.days??'Не внесено'}</td><td>${p.days===null?'–':used(p)}</td><td>${p.days===null?'–':p.days-used(p)}</td></tr>`)):''}`,
        `<div class="push workflow-actions">${button('right','Перевірити право')}${button('days',status()==='no'?'Історичні дні':type===1?'Дата та дні':type===2?'Додати рік / змінити дні':'Внести або змінити дні')}${button('register','Зареєструвати',true)}</div>`)
    } else {
      const records=data.records.filter(r=>r.person===person&&r.type===type)
      const years=[...new Set(['2027','2028',...records.map(r=>r.start.slice(0,4))])].sort()
      const selected=records.filter(r=>periodic()?r.start.slice(0,4)<=year&&r.end.slice(0,4)>=year:r.start.startsWith(year))
      const active=selected.filter(r=>!r.cancelled), total=active.reduce((n,r)=>n+r.days,0)
      const limit=types[type][3]
      content=section(types[type][1],
        `<dl class="metrics">${metric('Поточне право',badge())}${metric('Активні надання',active.length)}${metric('Дні активних надань',total)}</dl>
        ${!periodic()?`<p class="muted">Облік за роком початку. ${limit?`Обмеження виду: одне активне надання за рік, до ${limit} днів.`:'Універсального річного ліміту в обліку немає.'}</p>`:''}
        ${selected.length?table(['Дати','Дні','Стан і підстава','Дії'],selected.map(r=>`<tr class="${r.cancelled?'cancelled':''}"><td>${interval(r)}</td><td>${r.days}</td><td>${r.cancelled?'Скасовано':'Зареєстровано'}<small>${escape(r.basis||'')}${r.cancelled?' · '+escape(r.reason):''}</small></td><td>${r.cancelled?'–':`<div class="workflow-actions">${button('edit','Редагувати',false,`data-record="${r.id}"`)}${button('cancel','Скасувати',false,`data-record="${r.id}"`)}</div>`}</td></tr>`)):'<p class="empty">За обраний рік записів немає.</p>'}`,
        `<div class="push workflow-actions"><label class="workflow-year">Рік<select id="year">${years.map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}</select></label>${button('right','Перевірити право')}${button('register','Зареєструвати',true)}</div>`)
    }
    $('content').innerHTML=content
  }
  function open(title,body,footer) {
    dialog.innerHTML=`<header class="dialog-title"><h2 id="dialog-title">${title}</h2></header><div class="dialog-body">${body}<p id="error" class="workflow-error" role="alert"></p></div><footer class="dialog-footer">${footer}</footer>`
    if(!dialog.open) { opener=document.activeElement; dialog.showModal() }
    dialog.querySelector('input:not([disabled]), button:not([disabled])')?.focus()
  }
  function close() {
    dialog.close(); mode=''; draft=null; entry=null
    if(opener?.isConnected) opener.focus()
    else $('person').focus()
  }
  const fail = message => { $('error').textContent=message }
  function create(record) {
    draft=record ? {...structuredClone(record), start:date(record.start), end:date(record.end)} :
      {person,type,start:'',end:'',days:'',basis:'',explanation:'',order:'',orderDate:'',alloc:{}}
    registration()
  }
  function registration() {
    mode='registration'
    open(draft.id?'Редагування відпустки':'Реєстрація відпустки',
      section('Відомості',`<p>${escape(people[person])} · ${types[type][1]}</p><div class="field-grid">
      ${field('start','Початок',draft.start,'placeholder="ДД.ММ.РРРР"')}
      ${field('end','Завершення',draft.end,'placeholder="ДД.ММ.РРРР"')}
      ${field('days','Днів',draft.days,'type="number" min="1" step="1"')}</div>
      ${field('explanation','Пояснення уточненої тривалості',draft.explanation)}
      ${periodic()?'':field('basis','Підстава надання',draft.basis)}`)+
      (periodic()?section('Розподіл днів','<div id="allocation" class="workflow-summary"></div>'):'')+
      section('Розпорядження',`<div class="field-grid two">${field('order','Номер',draft.order)}${field('orderDate','Дата',draft.orderDate,'placeholder="ДД.ММ.РРРР"')}</div>`),
      button('close','Закрити')+button('review','Перевірити й зберегти',true))
    allocation()
  }
  const eligible=()=>periods().filter(p=>p.days!==null && p.days-used(p,draft.id)>0)
  function allocation() {
    if(!periodic()) return
    const rows=eligible(), total=rows.reduce((n,p)=>n+p.days-used(p,draft.id),0), needed=Number(draft.days)
    $('allocation').innerHTML=`${needed>total?`<p class="notice">Бракує ${needed-total} підтверджених дн.</p>${button('add-context','Внести дні й повернутися',true)}`:''}
      ${rows.length?table(['Період','Доступно','Списати'],rows.map(p=>`<tr><td>${interval(p)}${iso(draft.end)&&p.start>iso(draft.end)?'<small>Починається після завершення відпустки</small>':''}</td><td>${p.days-used(p,draft.id)}</td><td>${field('alloc:'+p.id,'Днів за '+date(p.start),draft.alloc[p.id]??0,`type="number" min="0" max="${p.days-used(p,draft.id)}" step="1"`)}</td></tr>`)):'<p class="empty">Доступних підтверджених днів немає.</p>'}
      <p id="progress" role="status"></p>${button('fifo','Автоматично розподілити',false,rows.length?'':'disabled')}`
    progress()
  }
  function progress() {
    if (!$('progress')) return
    const rows=eligible(), total=rows.reduce((n,p)=>n+(Number(draft.alloc[p.id])||0),0)
    $('progress').textContent=`Розподілено ${total} із ${Number(draft.days)||0} дн.`
  }
  function review() {
    const start=iso(draft.start), end=iso(draft.end), days=Number(draft.days), limit=types[type][3]
    if(!start||!end||end<start||start<cutoff) return fail('Перевірте дати. Початок відпустки – від 01.01.2027.')
    if(!Number.isInteger(days)||days<1||days>calendarDays(start,end)) return fail('Введіть кількість днів у межах інтервалу.')
    if ((days!==calendarDays(start,end)||limit&&days<limit)&&!draft.explanation?.trim()) return fail('Додайте пояснення уточненої тривалості.')
    if(draft.orderDate&&!iso(draft.orderDate)) return fail('Перевірте дату розпорядження.')
    const active=data.records.filter(r=>r.person===person&&!r.cancelled&&r.id!==draft.id)
    if(active.some(r=>r.start<=end&&r.end>=start)) return fail('У працівника вже є відпустка на частину цих дат.')
    if(!periodic()&&!draft.basis?.trim()) return fail('Вкажіть підставу надання.')
    if(limit&&(days>limit||active.some(r=>r.type===type&&r.start.slice(0,4)===start.slice(0,4)))) return fail('Перевірте ліміт днів і надання цього виду за рік початку.')
    const alloc={}
    if(periodic()){
      for(const p of eligible()){
        const n=Number(draft.alloc[p.id]??0)
        if(!Number.isInteger(n)||n<0||n>p.days-used(p,draft.id)) return fail('Списання має бути цілим і в межах доступних днів.')
        if(n) alloc[p.id]=n
      }
      if(Object.values(alloc).reduce((sum,n)=>sum+n,0)!==days) return fail('Розподіліть усі дні між підтвердженими періодами.')
    }
    mode='review'
    open('Підтвердження реєстрації',section(types[type][1],`<p>${escape(people[person])} · ${date(start)}–${date(end)} · ${days} дн.</p>`),
      button('resume','Повернутися')+button('save-record','Умовно зберегти',true))
    entry={...draft,start,end,days,alloc}
  }
  function daysEditor() {
    mode='days'
    entry={anchor:data.anchors[person]??'',rows:structuredClone(periods())}
    editDays()
  }
  function editDays() {
    const rows=entry.rows.filter(p=>status()!=='no'||p.days!==null||p.start<cutoff)
    open(draft?'Внесення днів із реєстрації':'Дні за періодами',
      (draft?`<p class="empty">Чернетка збережена в цій вкладці · ${escape(people[person])} · ${escape(draft.start||'дата не внесена')}–${escape(draft.end||'дата не внесена')} · ${escape(draft.days||'0')} дн.</p>`:'')+
      section(types[type][1],`${type===1?`<div class="workflow-inline">${field('anchor','Дата набуття права',date(entry.anchor),'placeholder="ДД.ММ.РРРР"')}${button('anchor','Зберегти дату й оновити пропозиції')}</div>`:''}
      ${type===2?`<div class="workflow-inline">${field('child-year','Календарний рік','','type="number" min="1900" max="2027"')}${button('child','Додати рік')}</div>`:''}
      <p class="muted">Порожньо – дані відсутні. 0 – підтверджений нуль.</p>
      ${rows.length?table(['Період','Підтверджені дні'],rows.map(p=>`<tr><td>${interval(p)}</td><td>${field('balance:'+p.id,'Днів за '+date(p.start),p.days??'','type="number" min="0" step="1"')}</td></tr>`)):'<p class="empty">Оберіть період або внесіть дату набуття права.</p>'}`),
      button(draft?'return-unsaved':'close',draft?'До чернетки без запису днів':'Закрити')+button('save-days',draft?'Зберегти дні й повернутися':'Зберегти дні',true))
  }
  function saveDays() {
    const rows=entry.rows
    for(const p of rows) {
      if(p.days===null && periods().some(saved=>saved.id===p.id&&saved.days!==null)) return fail('Підтверджені дні не можна стерти порожнім полем. Введіть значення або поверніться без змін.')
      if(p.days===null) continue
      const n=Number(p.days)
      if(!Number.isSafeInteger(n)||n<0||n<used(p)) return fail('Дні мають бути цілими й не меншими за вже враховані.')
      if(status()==='no'&&p.start>=cutoff&&!periods().some(saved=>saved.id===p.id&&saved.days!==null)) return fail('Спочатку перевірте поточне право для нового підтвердження.')
    }
    data.balances[key()]=rows.filter(p=>p.days!==null||type===0).map(p=>({...p,days:p.days===null?null:Number(p.days)}))
    render(); notify('Дні збережено в демонстраційних даних.')
    if(draft) registration(); else close()
  }
  const actions={
    right(){tab='rights';render()},
    register(){create()},
    days:daysEditor,
    'add-context':daysEditor,
    resume:registration,
    'return-unsaved'(){if(window.confirm('Відкинути незбережені зміни днів і повернутися до реєстрації?')) registration()},
    close(){if(window.confirm('Закрити без збереження чернетки?')) close()},
    review,
    'save-days':saveDays,
    fifo(){
      if(Object.values(draft.alloc).some(Number)&&!window.confirm('Замінити поточний розподіл?')) return
      let remaining=Number(draft.days)||0
      draft.alloc={}
      for(const p of eligible().filter(p=>p.start<=iso(draft.start))){
        const n=Math.min(remaining,p.days-used(p,draft.id)); draft.alloc[p.id]=n; remaining-=n
      }
      allocation()
      dialog.querySelector('[data-action="fifo"]')?.focus()
    },
    child(){
      const value=dialog.querySelector('[name="child-year"]').value
      if(!/^\d{4}$/.test(value)||value<'1900'||value>'2027'||entry.rows.some(p=>p.start.startsWith(value))) return fail('Оберіть інший календарний рік у межах 1900–2027.')
      if(status()==='no'&&value>='2027') return fail('Перед новим підтвердженням перевірте поточне право.')
      entry.rows.push(row('child-'+value,value+'-01-01',value+'-12-31',null));editDays()
    },
    anchor(){
      const value=iso(dialog.querySelector('[name="anchor"]').value)
      if(!value||value<'1900-01-01'||value>'2028-12-31') return fail('Введіть дату в межах демонстраційного календаря 1900–2028.')
      if(JSON.stringify(entry.rows)!==JSON.stringify(periods())) return fail('Спершу збережіть або відкиньте зміни днів.')
      data.anchors[person]=value; entry.anchor=value; entry.rows=structuredClone(periods())
      render();editDays();notify('Дату збережено окремою дією.')
    },
    edit(b){create(data.records.find(r=>r.id===Number(b.dataset.record)))},
    cancel(b){
      entry=data.records.find(r=>r.id===Number(b.dataset.record));mode='cancel'
      open('Скасування відпустки',section(types[type][1],field('reason','Причина скасування')),button('close','Закрити')+button('cancel-save','Умовно скасувати',true))
    },
    'cancel-save'(){
      const reason=dialog.querySelector('[name="reason"]').value.trim()
      if(!reason) return fail('Вкажіть причину скасування.')
      entry.cancelled=true;entry.reason=reason;close();render();notify('Запис залишився в історії, дні повернуто до обліку.')
    },
    'save-record'(){
      const index=data.records.findIndex(r=>r.id===entry.id)
      if(index<0) data.records.push({...entry,id:Math.max(...data.records.map(r=>r.id))+1})
      else data.records[index]=entry
      year=entry.start.slice(0,4);tab='journal';close();render();notify('Відпустку умовно збережено.')
    },
  }
  $('scenario').innerHTML=scenarios.map(([label],i)=>option(i,label)).join('')
  $('person').innerHTML=people.map((label,i)=>option(i,label)).join('')
  $('kind').innerHTML=types.map(([,label],i)=>option(i,label)).join('')
  $('tabs').innerHTML=Object.entries(tabs).map(([id,label])=>`<button class="tab" data-tab="${id}">${label}</button>`).join('')
  $('scenario').addEventListener('change',e=>{
    scenario=e.target.value; [,person,type]=scenarios[Number(scenario)];tab=periodic()?'balances':'journal';year='2027';notify('');render()
  })
  for(const id of ['person','kind']) $(id).addEventListener('change',e=>{
    if(id==='person')person=Number(e.target.value);else type=Number(e.target.value)
    if(tab==='balances'&&!periodic())tab='journal'
    notify('');render()
  })
  $('reset').addEventListener('click',reset)
  document.addEventListener('click',e=>{
    const target=e.target.closest('button')
    if(!target) return
    if(target.dataset.tab){tab=target.dataset.tab;if(tab==='balances'&&!periodic()){type=lastPeriod[person]??0}notify('');render()}
    if(target.dataset.action)actions[target.dataset.action]?.(target)
  })
  document.addEventListener('change',e=>{
    if(e.target.id==='year'){year=e.target.value;render()}
  })
  document.addEventListener('input',e=>{
    const {name,value}=e.target
    if(!dialog.open||!name)return
    if(mode==='registration'){
      if(name.startsWith('alloc:')){draft.alloc[name.slice(6)]=value;progress()}
      else {
        draft[name]=value
        if(['start','end','days'].includes(name)) allocation()
      }
    }
    if(mode==='days'&&name.startsWith('balance:')){
      entry.rows.find(p=>p.id===name.slice(8)).days=value===''?null:value
    }
  })
  document.addEventListener('submit',e=>{
    if(e.target.id!=='right-form')return
    e.preventDefault();data.rights[key()]=new FormData(e.target).get('right');render();notify('Результат перевірки збережено.')
  })
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(mode==='review')registration();else if(mode==='days'&&draft)actions['return-unsaved']();else actions.close()})
  reset()
})()

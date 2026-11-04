// Catch failed React/App/CSS dependency loading before a render boundary exists.
void import('./bootstrap').catch(() => {
  const root = document.getElementById('root')
  if (!root) return
  const main = document.createElement('main')
  main.className = 'app-start-error'
  main.setAttribute('role', 'alert')
  const content = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = 'Не вдалося завантажити HromadaHR.'
  const message = document.createElement('span')
  message.textContent = 'Перезапустіть застосунок. Якщо проблема повторюється, зверніться до адміністратора системи.'
  content.append(title, document.createTextNode(' '), message)
  main.append(content)
  root.replaceChildren(main)
})

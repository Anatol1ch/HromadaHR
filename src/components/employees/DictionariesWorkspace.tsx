import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { DictionaryEntry, DictionaryKind, DictionarySnapshot } from '../../../shared/personnel'
import type { IpcResult } from '../../../shared/ipc'
import { moveDictionaryEntry } from '../../employees/dictionaryOrder'
import { personnelMessage } from '../../employees/model'
import { navigateTabs } from '../../lib/tabNavigation'
import Alert from '../Alert'
import ConfirmDialog from '../ConfirmDialog'
import DataState from '../DataState'
import DictionaryTable from '../DictionaryTable'
import DirectoryForm from './DirectoryForm'
import useUnsavedChanges, { type NavigationGuard } from './useUnsavedChanges'

const tabs = { department: 'Підрозділи', position: 'Посади' }

export default function DictionariesWorkspace({ navigationGuard }: { navigationGuard: RefObject<NavigationGuard> }) {
  const [kind, setKind] = useState<DictionaryKind>('department')
  const tabId = useId()
  return <div className="page-transition personnel-dictionaries">
    <header className="page-heading"><div><div className="eyebrow">КАДРОВИЙ ОБЛІК</div><h1>Довідники</h1></div></header>
    <nav className="settings-section-nav" role="tablist" aria-label="Довідники" onKeyDown={navigateTabs}>
      {(['department', 'position'] as const).map(value => <button key={value} type="button" role="tab" id={tabId + value}
        aria-controls={tabId + value + '-panel'} aria-selected={kind === value} tabIndex={kind === value ? 0 : -1}
        className={'settings-section-current' + (kind === value ? ' is-selected' : '')}
        onClick={() => { if (kind !== value) navigationGuard.current(() => setKind(value)) }}>{tabs[value]}</button>)}
    </nav>
    <div role="tabpanel" id={tabId + kind + '-panel'} aria-labelledby={tabId + kind}>
      <PersonnelDictionary key={kind} kind={kind} navigationGuard={navigationGuard}/>
    </div>
  </div>
}

function PersonnelDictionary({ kind, navigationGuard }: { kind: DictionaryKind; navigationGuard: RefObject<NavigationGuard> }) {
  const [snapshot, setSnapshot] = useState<DictionarySnapshot>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState<'create' | DictionaryEntry | null>(null)
  const [deleting, setDeleting] = useState<DictionaryEntry | null>(null)
  const [dragId, setDragId] = useState('')
  const [overId, setOverId] = useState('')
  const dragged = useRef('')
  const pending = useRef(false)
  const owner = useRef<HTMLElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const sequence = useRef(0)
  useUnsavedChanges(false, pending, navigationGuard, owner)

  const reload = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true); setLoadError('')
    try {
      const result = await window.hromadaHR.personnel.getDictionary(kind)
      if (request !== sequence.current) return
      setSnapshot(result.ok ? result.data : undefined)
      if (!result.ok) setLoadError(personnelMessage(result.error.code))
    } catch {
      if (request === sequence.current) { setSnapshot(undefined); setLoadError('Не вдалося завантажити довідник.') }
    } finally { if (request === sequence.current) setLoading(false) }
  }, [kind])
  useEffect(() => { void reload(); return () => { sequence.current++ } }, [reload])
  const entries = snapshot?.entries ?? []
  const ids = entries.map(entry => entry.id)
  const locked = loading || busy || !!editor || !!deleting
  const addLabel = kind === 'department' ? 'Додати підрозділ' : 'Додати посаду'
  const finishDrag = () => { dragged.current = ''; setDragId(''); setOverId('') }
  const acceptsDrop = (id: string) => !locked && !!dragged.current && dragged.current !== id

  async function mutate(operation: () => Promise<IpcResult<DictionarySnapshot>>, removing: boolean) {
    if (pending.current) return
    pending.current = true
    setBusy(true); setError(''); setDeleteError('')
    const fail = async (message: string) => {
      if (removing) setDeleteError(message)
      else setError(message)
      await reload()
    }
    try {
      const result = await operation()
      if (result.ok) {
        setSnapshot(result.data)
        if (removing) {
          setDeleting(null)
          requestAnimationFrame(() => addButton.current?.focus())
        }
      } else await fail(result.error.code === 'DICTIONARY_IN_USE'
        ? (kind === 'department' ? 'Підрозділ використовується у кадрових відомостях. Видалити його неможливо. Можна змінити назву.'
          : 'Посада використовується у кадрових відомостях. Видалити її неможливо. Можна змінити назву.')
        : personnelMessage(result.error.code))
    } catch { await fail('Результат операції не підтверджено. Перечитайте довідник.') }
    finally { pending.current = false; setBusy(false) }
  }

  function move(source: string, target: string) {
    if (!snapshot || locked) return
    const next = moveDictionaryEntry(ids, source, target)
    if (next !== ids) void mutate(() => window.hromadaHR.personnel.reorderDictionary(kind, next, snapshot.revision), false)
  }

  return <section ref={owner} className="dashboard-panel personnel-dictionary-panel" aria-label={tabs[kind]}>
    <header className="employee-group-heading">
      <h2>{tabs[kind]}</h2>
      <button ref={addButton} type="button" className="primary-button" disabled={locked || !snapshot}
        onClick={() => { setError(''); setEditor('create') }}><Plus size={17} aria-hidden="true"/>{addLabel}</button>
    </header>
    {error && <Alert variant="error">{error}</Alert>}
    {loadError && <Alert variant="error" action={<button type="button" onClick={() => void reload()}>Повторити завантаження</button>}>{loadError}</Alert>}
    <p className="leave-muted" role="status">{busy ? 'Збереження…' : loading ? 'Завантаження…' : ''}</p>
    {loading && !snapshot ? <DataState kind="loading" compact message="Завантаження довідника…"/>
      : snapshot && <DictionaryTable label={tabs[kind]} className="personnel-dictionary-table" loading={loading || busy}
        columns={[{ label: <span className="visually-hidden">Порядок</span>, width: '3rem' }, { label: 'Назва' },
          { label: 'Працівники', width: '7rem' }, { label: 'Дії', width: '6rem' }]}
        empty={!entries.length ? 'Записів ще немає.' : undefined}>
        {entries.map((entry, index) => <tr key={entry.id} className={overId === entry.id ? 'is-drag-over' : dragId === entry.id ? 'is-dragging' : undefined}
          onDragOver={event => { if (acceptsDrop(entry.id)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOverId(entry.id) } }}
          onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setOverId(current => current === entry.id ? '' : current) }}
          onDrop={event => { if (acceptsDrop(entry.id)) { event.preventDefault(); const source = dragged.current; finishDrag(); move(source, entry.id) } }}>
          <td><button type="button" className="secondary-button dictionary-sort-handle" draggable={!locked && entries.length > 1}
            aria-label={'Перемістити ' + entry.name} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" aria-disabled={locked || entries.length < 2}
            onDragStart={event => {
              if (locked || entries.length < 2) { event.preventDefault(); return }
              dragged.current = entry.id; setDragId(entry.id)
              event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.id)
            }} onDragEnd={finishDrag}
            onKeyDown={event => {
              if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
              event.preventDefault(); event.stopPropagation()
              const target = ids[index + (event.key === 'ArrowUp' ? -1 : 1)]
              if (target && !event.repeat) move(entry.id, target)
            }}><GripVertical size={18} aria-hidden="true"/></button></td>
          <td className="dictionary-entry-name">{entry.name}</td><td>{entry.employeeCount}</td>
          <td><div className="registry-row-actions">
            <button type="button" className="table-action" aria-label={'Перейменувати ' + entry.name} title="Перейменувати"
              disabled={locked} onClick={() => { setError(''); setEditor(entry) }}><Pencil size={16} aria-hidden="true"/></button>
            <button type="button" className="table-action" aria-label={'Видалити ' + entry.name} title="Видалити"
              disabled={locked} onClick={() => { setError(''); setDeleteError(''); setDeleting(entry) }}><Trash2 size={16} aria-hidden="true"/></button>
          </div></td>
        </tr>)}
      </DictionaryTable>}
    {editor && <DirectoryForm kind={kind} standalone inFlight={pending} navigationGuard={navigationGuard} onPending={setBusy}
      onConflict={reload} onCreated={() => {
        setEditor(null)
        void reload().then(() => requestAnimationFrame(() => {
          if (document.activeElement === document.body) addButton.current?.focus()
        }))
      }} onClose={() => setEditor(null)}
      edit={editor !== 'create' ? { entry: editor, onSaved: data => { setSnapshot(data); setEditor(null) },
        onReload: () => { setEditor(null); void reload() } } : undefined}/>}
    {deleting && <ConfirmDialog title="Видалити запис?" message={deleting.name} confirmLabel="Видалити" error={deleteError} layout="footer"
      onCancel={() => setDeleting(null)}
      onConfirm={() => mutate(() => window.hromadaHR.personnel.deleteDictionaryEntry(kind, deleting.id, deleting.revision), true)}/>}
  </section>
}

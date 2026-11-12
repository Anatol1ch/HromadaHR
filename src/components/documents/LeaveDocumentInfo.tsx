import { useContext } from 'react'
import type { LeaveDocumentLink } from '../../../shared/documents'
import { formatDate } from '../../lib/dates'
import InfoSection from '../InfoSection'
import InfoItem from '../InfoItem'
import { DocumentNavigationContext } from './DocumentNavigationContext'
import { kindLabel } from './model'
export default function LeaveDocumentInfo({link,onClose}:{link:LeaveDocumentLink|null;onClose:()=>void}) {
  const open=useContext(DocumentNavigationContext)
  if(!link)return null
  return <InfoSection title="Кадровий документ" action={open&&<button type="button" className="secondary-button" onClick={()=>open(link.document.id,onClose)}>Відкрити документ</button>}>
    <dl className="info-grid info-grid-two"><InfoItem label="Вид" value={kindLabel(link.document)}/><InfoItem label="Номер і дата" value={'№ '+link.document.number+' від '+formatDate(link.document.issuedOn)}/><InfoItem label="Назва" value={link.document.title} wide/></dl>
    <p className="employee-hint">Структурний зв’язок підтверджено в реєстрі кадрових документів.</p>
  </InfoSection>
}

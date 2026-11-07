import { useEffect, useState } from 'react'
import { todayIsoDate } from '../../lib/dates'
export default function useAccountingDate() {
  const [today,setToday]=useState(todayIsoDate)
  useEffect(()=>{const update=()=>setToday(todayIsoDate());const timer=window.setInterval(update,60000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update)}},[])
  return {today,throughDate:today>'2027-01-01'?today:'2027-01-01'}
}

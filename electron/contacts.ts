import type { ContactId } from '../shared/contacts.js'

const contacts: Record<ContactId, string> = {
  phone: 'tel:+380985196340', workEmail: 'mailto:tech.vishnsrada@ukr.net',
  personalEmail: 'mailto:myronenko.anatoliu@gmail.com', telegram: 'https://t.me/antlmrnnk',
}
export async function openContact(id: ContactId, open: (uri: string) => Promise<void>): Promise<boolean> {
  if (!Object.hasOwn(contacts, id)) return false
  try { await open(contacts[id]); return true } catch { return false }
}

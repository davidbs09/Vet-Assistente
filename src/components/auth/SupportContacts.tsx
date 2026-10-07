import { SUPPORT_CONTACTS } from '../../shared/supportContacts';

const items = [SUPPORT_CONTACTS.phone, SUPPORT_CONTACTS.whatsapp, SUPPORT_CONTACTS.email];

export default function SupportContacts() {
  return (
    <div className="space-y-1.5 text-xs">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-3">
          <span className="w-16 shrink-0 text-slate-400">{item.label}</span>
          <a
            href={item.href}
            target={item.href.startsWith('http') ? '_blank' : undefined}
            rel={item.href.startsWith('http') ? 'noreferrer' : undefined}
            className="text-slate-600 no-underline hover:text-slate-900"
          >
            {item.value}
          </a>
        </div>
      ))}
    </div>
  );
}

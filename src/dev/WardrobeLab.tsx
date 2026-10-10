import { CREW_STYLES, OpsFace } from '../components/OpsFace'
import { ITEMS, type Wear } from '../components/faces/wardrobe'

/** Dev only (/dev/wardrobe): every wardrobe item on every character, plus a full outfit, to check the fit. */
export default function WardrobeLab() {
  const rows: { label: string; wear: Wear }[] = [
    ...ITEMS.map((it) => ({ label: it.name, wear: [it.id] })),
    { label: 'Crown + kente + gold', wear: ['crown', 'kente', 'gold'] },
    { label: 'Snapback + jersey', wear: ['snapback', 'jersey'] },
  ]
  return (
    <main style={{ padding: 24, display: 'grid', gap: 28, background: 'var(--paper)' }}>
      {rows.map((r) => (
        <section key={r.label}>
          <h2 style={{ fontSize: 18, marginBottom: 18 }}>{r.label}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '34px 26px' }}>
            {CREW_STYLES.map((s) => (
              <OpsFace key={s.id} look={s.id} wear={r.wear} size={64} />
            ))}
            <OpsFace look={CREW_STYLES[4].id} wear={r.wear} mood="win" size={40} />
          </div>
        </section>
      ))}
    </main>
  )
}

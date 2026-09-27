import { fmtDateTime } from './ui'

// Shipment milestones: completed stages in green, the current one highlighted,
// the rest greyed out. Each reached stage shows its latest event.
export default function Timeline({ shipment, onDelete }) {
  const { stages, events, status } = shipment
  const idx = stages.findIndex((s) => s.key === status)
  const latest = {}
  events.forEach((e) => { latest[e.status] = e })
  return (
    <>
      <div className="progress-steps" style={{ marginBottom: 20 }}>
        {stages.map((s, i) => <div key={s.key} className={i <= idx ? 'on' : ''} title={s.label} />)}
      </div>
      <ul className="timeline">
        {stages.map((s, i) => {
          const e = latest[s.key]
          const cls = i < idx ? 'done' : i === idx ? 'current' : 'todo'
          return (
            <li key={s.key} className={cls}>
              <span className="dot" />
              <div className="row between">
                <b>{s.label}</b>
                {e && <span className="small muted">{fmtDateTime(e.event_time)}</span>}
              </div>
              {e && (e.location || e.note) && <div className="small muted">{[e.location, e.note].filter(Boolean).join(' · ')}</div>}
              {e && onDelete && <button className="linkbtn danger small" onClick={() => onDelete(e)}>remove</button>}
            </li>
          )
        })}
      </ul>
    </>
  )
}

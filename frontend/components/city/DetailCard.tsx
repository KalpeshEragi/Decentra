"use client";
// The selected element's detail (FE-11, FE-30): only what the backend reports for it, refreshed with every snapshot.

import type { Detail } from "@/lib/city/detail";

export function DetailCard({ d, onClose }: { d: Detail; onClose: () => void }) {
  return (
    <section className="city-card city-detail" aria-label={`${d.eyebrow}: ${d.title}`}>
      <button className="city-back" onClick={onClose}>‹ Live activity</button>
      <div className="city-dhead"><span className="city-ico">◆</span><div><small>{d.eyebrow}</small><b>{d.title}</b></div></div>
      {d.chip && <span className={`city-chip ${d.chip.tone}`}>{d.chip.text}</span>}
      {d.rows.map(([k, v]) => <div key={k} className="city-kv"><span>{k}</span><b>{v}</b></div>)}
      {d.bars?.map((b) => (
        <div key={b.label} className="city-bar"><span>{b.label}</span><i><u style={{ width: `${Math.min(100, (100 * b.value) / b.max)}%` }} /></i></div>
      ))}
      {d.list?.map((l, i) => <div key={i} className="city-kv"><span>{l.left}</span><b>{l.right}</b></div>)}
      {d.note && <p className="city-note">{d.note}</p>}
    </section>
  );
}

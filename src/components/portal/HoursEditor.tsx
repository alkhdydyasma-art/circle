"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { fieldCls } from "./ui";

type Row = { weekday: number; branch_id: string; start_time: string; end_time: string };

// Editable list of weekly working periods; submitted as parallel weekday/branch/start/end fields.
export function HoursEditor({ initial, branches, weekdays, addLabel }: {
  initial: Row[]; branches: { id: string; name: string }[]; weekdays: string[]; addLabel: string;
}) {
  const [rows, setRows] = useState(initial.map((r, i) => ({ ...r, key: i })));
  const add = () => setRows((rs) => [...rs, { key: Date.now(), weekday: 0, branch_id: branches[0]?.id ?? "", start_time: "16:00", end_time: "22:00" }]);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.key} className="flex flex-wrap items-center gap-2">
          <select name="weekday" defaultValue={r.weekday} aria-label="weekday" className={fieldCls}>
            {weekdays.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <select name="branch" defaultValue={r.branch_id} aria-label="branch" className={fieldCls}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input name="start" type="time" defaultValue={r.start_time.slice(0, 5)} aria-label="start" className={fieldCls} />
          <span className="text-muted">–</span>
          <input name="end" type="time" defaultValue={r.end_time.slice(0, 5)} aria-label="end" className={fieldCls} />
          <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="rounded-lg p-1.5 text-muted hover:text-rose-500" aria-label="remove">
            <X className="size-4" />
          </button>
        </div>
      ))}
      {branches.length > 0 && (
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-sm text-teal">
          <Plus className="size-4" />{addLabel}
        </button>
      )}
    </div>
  );
}

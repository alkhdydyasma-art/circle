"use client";

/* eslint-disable @next/next/no-img-element -- previews of uploaded clinic images */
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { removeMedia, uploadMedia } from "@/app/actions/media";
import { ACCEPTED_IMAGES, MAX_CASES } from "@/lib/media";
import { inputCls } from "./ui";
import { shrinkImage, statusText, type MediaStrings } from "./MediaUpload";

export type CaseItem = { id: string; title: string; before: string; after: string };
type Strings = MediaStrings & { caseTitle: string; before: string; after: string; addCase: string; casesMax: string; consent: string };

// Before/after cases shown on the clinic website with a comparison slider.
export function CaseManager({ clinicId, lang, cases, s }: { clinicId: string; lang: string; cases: CaseItem[]; s: Strings }) {
  const [state, upload, pending] = useActionState(uploadMedia, {});
  const [form, setForm] = useState(0); // bumps to clear the form after a successful upload
  const [localError, setLocalError] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const src = new FormData(e.currentTarget);
    const before = src.get("before"), after = src.get("after");
    if (!(before instanceof File) || !(after instanceof File)) return;
    const fd = new FormData();
    fd.set("clinicId", clinicId); fd.set("lang", lang); fd.set("kind", "case");
    fd.set("title", String(src.get("title") ?? ""));
    const [b, a] = await Promise.all([shrinkImage(before, 1400), shrinkImage(after, 1400)]).catch(() => [null, null]);
    setLocalError(!b || !a);
    if (!b || !a) return; // not readable images
    fd.set("before", b, "before");
    fd.set("after", a, "after");
    startTransition(() => upload(fd));
    setForm((n) => n + 1);
  }

  const msg = localError ? s.errors.type : statusText(state, s);
  return (
    <div className="space-y-5">
      {cases.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {cases.map((c) => (
            <li key={c.id} className="overflow-hidden rounded-xl border border-line">
              <div className="grid grid-cols-2">
                <figure className="relative"><img src={c.before} alt="" className="aspect-[4/3] w-full object-cover" /><figcaption className="absolute start-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{s.before}</figcaption></figure>
                <figure className="relative"><img src={c.after} alt="" className="aspect-[4/3] w-full object-cover" /><figcaption className="absolute start-2 top-2 rounded bg-white/80 px-2 py-0.5 text-xs text-black">{s.after}</figcaption></figure>
              </div>
              <div className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="font-medium">{c.title}</span>
                <form action={removeMedia}>
                  <input type="hidden" name="clinicId" value={clinicId} /><input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="kind" value="case" /><input type="hidden" name="caseId" value={c.id} />
                  <button aria-label={s.remove} className="rounded-lg border border-line p-1.5 text-muted transition hover:border-rose-400/60 hover:text-rose-500"><Trash2 className="size-4" /></button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cases.length >= MAX_CASES ? (
        <p className="text-sm text-muted">{s.casesMax}</p>
      ) : (
        <form key={form} onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-2">
          <input required name="title" maxLength={120} placeholder={s.caseTitle} className={`${inputCls} sm:col-span-2`} />
          <FilePick name="before" label={s.before} choose={s.choose} />
          <FilePick name="after" label={s.after} choose={s.choose} />
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input required type="checkbox" className="size-4 accent-teal-500" />{s.consent}</label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button disabled={pending} className={`bg-brand-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60`}>
              {pending && <Loader2 className="size-4 animate-spin" />}{pending ? s.uploading : s.addCase}
            </button>
            <span className="text-xs text-muted">{s.hint}</span>
          </div>
        </form>
      )}
      {msg && <p role="status" className={`text-sm ${state.ok && !localError ? "text-teal" : "text-rose-500"}`}>{msg}</p>}
    </div>
  );
}

// Styled file picker with a thumbnail (the native control shows browser-language text).
function FilePick({ name, label, choose }: { name: string; label: string; choose: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <label className="group block cursor-pointer space-y-1.5 text-sm text-muted">
      {label}
      <span className="relative grid aspect-[8/5] place-items-center overflow-hidden rounded-lg border border-dashed border-line bg-bg transition group-hover:border-teal">
        {preview ? <img src={preview} alt="" className="size-full object-cover" /> : (
          <span className="flex flex-col items-center gap-1.5"><ImagePlus className="size-5" />{choose}</span>
        )}
        <input
          required name={name} type="file" accept={ACCEPTED_IMAGES}
          onChange={(e) => { const f = e.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </span>
    </label>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element -- previews of uploaded clinic images */
import { startTransition, useActionState, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { removeMedia, uploadMedia, type MediaState } from "@/app/actions/media";
import { ACCEPTED_IMAGES } from "@/lib/media";

export type MediaStrings = {
  choose: string; change: string; remove: string; uploading: string; uploaded: string; hint: string;
  errors: Record<NonNullable<MediaState["error"]>, string>;
};

// Photos are shrunk in the browser (max side `maxSide`, WebP) so uploads stay small and fast.
// Small files that already fit are sent as they are (keeps PNG logos pixel-perfect).
export async function shrinkImage(file: File, maxSide: number): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 600 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  return blob ?? file;
}

export function statusText(state: MediaState, s: MediaStrings) {
  return state.ok ? s.uploaded : state.error ? s.errors[state.error] : null;
}

// One image slot: logo, hero image or a doctor's photo. Uploads as soon as a file is picked.
export function MediaUpload({
  clinicId, lang, kind, doctorId, current, label, hint, maxSide, shape = "wide", s,
}: {
  clinicId: string; lang: string; kind: "logo" | "hero" | "doctor"; doctorId?: string;
  current?: string | null; label: string; hint?: string; maxSide: number;
  shape?: "wide" | "square" | "round"; s: MediaStrings;
}) {
  const [state, upload, pending] = useActionState(uploadMedia, {});
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shown = preview ?? current ?? null;
  const frame = shape === "wide" ? "aspect-[16/7] w-full" : shape === "round" ? "size-24 rounded-full" : "size-24";

  async function onPick(file?: File) {
    if (!file) return;
    if (input.current) input.current.value = "";
    const blob = await shrinkImage(file, maxSide).catch(() => null);
    setLocalError(!blob);
    if (!blob) return; // not a readable image
    setPreview(URL.createObjectURL(blob));
    const fd = new FormData();
    fd.set("clinicId", clinicId); fd.set("lang", lang); fd.set("kind", kind);
    if (doctorId) fd.set("doctorId", doctorId);
    fd.set("file", blob, "image");
    startTransition(() => upload(fd));
  }

  const msg = localError ? s.errors.type : statusText(state, s);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">{label}</p>
      <div className={`flex gap-4 ${shape === "wide" ? "flex-col" : "items-center"}`}>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`group relative grid shrink-0 place-items-center overflow-hidden border border-dashed border-line bg-bg transition hover:border-teal ${frame} ${shape === "round" ? "" : "rounded-xl"}`}
        >
          {shown ? (
            <img src={shown} alt="" className={`size-full ${kind === "logo" ? "object-contain p-2" : "object-cover"}`} />
          ) : (
            <ImagePlus className="size-6 text-muted transition group-hover:text-teal" />
          )}
          {pending && <span className="absolute inset-0 grid place-items-center bg-bg/70"><Loader2 className="size-5 animate-spin" /></span>}
        </button>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => input.current?.click()} className="rounded-lg border border-line px-3 py-1.5 transition hover:border-teal hover:text-teal disabled:opacity-60">
              {pending ? s.uploading : shown ? s.change : s.choose}
            </button>
            {current && !pending && (
              <form action={removeMedia} onSubmit={() => setPreview(null)}>
                <input type="hidden" name="clinicId" value={clinicId} /><input type="hidden" name="lang" value={lang} />
                <input type="hidden" name="kind" value={kind} />
                {doctorId && <input type="hidden" name="doctorId" value={doctorId} />}
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-muted transition hover:border-rose-400/60 hover:text-rose-500">
                  <Trash2 className="size-3.5" />{s.remove}
                </button>
              </form>
            )}
          </div>
          <p className="text-xs text-muted">{hint ?? s.hint}</p>
          {msg && <p role="status" className={`text-xs ${state.ok && !localError ? "text-teal" : "text-rose-500"}`}>{msg}</p>}
        </div>
      </div>
      <input ref={input} type="file" accept={ACCEPTED_IMAGES} hidden onChange={(e) => onPick(e.target.files?.[0])} />
    </div>
  );
}

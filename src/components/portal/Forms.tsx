"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions/portal";
import { activateLead, acceptInvite, inviteMember, signIn, updateClinic } from "@/app/actions/portal";
import type { PortalDictionary } from "@/i18n/portal";
import type { Locale } from "@/i18n";
import { btnCls, inputCls, fieldCls } from "./ui";
import { InviteLink } from "./InviteLink";

type P = { lang: Locale; t: PortalDictionary };

function ErrorLine({ state, t }: { state: ActionState; t: PortalDictionary }) {
  if (!state.error) return null;
  const msg = {
    denied: t.clinic.denied,
    invalid: t.login.error,
    error: t.clinic.error,
    exists: t.invite.exists,
    wrong_account: t.invite.wrongAccount,
  }[state.error];
  return <p role="alert" className="text-sm text-rose-500">{msg}</p>;
}

export function LoginForm({ lang, t, next }: P & { next?: string }) {
  const [state, action, pending] = useActionState(signIn, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="block text-sm">
        <span className="mb-1 block text-muted">{t.login.email}</span>
        <input required name="email" type="email" dir="ltr" autoComplete="email" className={`${inputCls} rtl:text-right`} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">{t.login.password}</span>
        <input required name="password" type="password" dir="ltr" autoComplete="current-password" className={inputCls} />
      </label>
      <ErrorLine state={state} t={t} />
      <button disabled={pending} className={`${btnCls} w-full py-2.5`}>{t.login.submit}</button>
    </form>
  );
}

export function AcceptInviteForm({ lang, t, token, needsPassword }: P & { token: string; needsPassword: boolean }) {
  const [state, action, pending] = useActionState(acceptInvite, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="token" value={token} />
      {needsPassword && (
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{t.invite.createPassword}</span>
          <input required minLength={8} maxLength={200} name="password" type="password" dir="ltr" autoComplete="new-password" className={inputCls} />
        </label>
      )}
      <ErrorLine state={state.error === "invalid" ? { error: "error" } : state} t={t} />
      <button disabled={pending} className={`${btnCls} w-full py-2.5`}>
        {needsPassword ? t.invite.create : t.invite.accept}
      </button>
    </form>
  );
}

export function InviteMemberForm({ lang, t, clinicId, roles }: P & { clinicId: string; roles: (keyof PortalDictionary["roles"])[] }) {
  const [state, action, pending] = useActionState(inviteMember, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="clinicId" value={clinicId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]">
        <input required name="email" type="email" dir="ltr" placeholder={t.clinic.inviteEmail} aria-label={t.clinic.inviteEmail} className={`${inputCls} rtl:text-right`} />
        <select name="role" aria-label={t.clinic.inviteRole} className={inputCls} defaultValue={roles.at(-1)}>
          {roles.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
        </select>
        <button disabled={pending} className={btnCls}>{t.clinic.sendInvite}</button>
      </div>
      <ErrorLine state={state} t={t} />
      {state.link && (
        <InviteLink link={state.link} label={t.clinic.inviteReady} copy={t.clinic.copy} copied={t.clinic.copied} share={t.clinic.shareWhatsapp} />
      )}
    </form>
  );
}

export function ClinicDetailsForm({ lang, t, clinic, canEdit }: P & { clinic: { id: string; name: string; city: string }; canEdit: boolean }) {
  const [state, action, pending] = useActionState(updateClinic, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="id" value={clinic.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{t.clinic.name}</span>
          <input required name="name" maxLength={120} defaultValue={clinic.name} disabled={!canEdit} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{t.clinic.city}</span>
          <input required name="city" maxLength={80} defaultValue={clinic.city} disabled={!canEdit} className={inputCls} />
        </label>
      </div>
      {canEdit && (
        <div className="flex items-center gap-3">
          <button disabled={pending} className={btnCls}>{t.clinic.save}</button>
          {state.ok && <span className="text-sm text-teal">{t.clinic.saved}</span>}
          <ErrorLine state={state} t={t} />
        </div>
      )}
    </form>
  );
}

// Stays mounted after activation (the lead flips to "won" on revalidate) so the
// one-time invite link remains visible.
export function ActivateLeadForm({ lang, t, leadId, activated }: P & { leadId: string; activated: boolean }) {
  const [state, action, pending] = useActionState(activateLead, {});
  if (state.link) {
    return <InviteLink link={state.link} label={t.admin.activated} copy={t.clinic.copy} copied={t.clinic.copied} share={t.clinic.shareWhatsapp} />;
  }
  if (activated) return null;
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="leadId" value={leadId} />
      <input required name="ownerEmail" type="email" dir="ltr" placeholder={t.admin.ownerEmail} aria-label={t.admin.ownerEmail} className={`${fieldCls} w-56 rtl:text-right`} />
      <select name="platform" aria-label={t.admin.cols.platform} className={fieldCls}>
        <option value="smart_clinic">{t.platforms.smart_clinic}</option>
        <option value="medent">{t.platforms.medent}</option>
      </select>
      <button disabled={pending} className={btnCls}>{t.admin.activate}</button>
      <ErrorLine state={state} t={t} />
    </form>
  );
}

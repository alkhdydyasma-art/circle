import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { fill, getPortalDictionary } from "@/i18n/portal";
import { createClient, getUser } from "@/lib/supabase/server";
import { hashToken } from "@/lib/tokens";
import { signOut } from "@/app/actions/portal";
import { AuthCard } from "@/components/portal/AuthCard";
import { AcceptInviteForm } from "@/components/portal/Forms";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Invite = { clinic_name: string; email: string; role: "owner" | "manager" | "doctor" | "reception" };

export default async function InvitePage({ params }: PageProps<"/[lang]/invite/[token]">) {
  const { lang, token } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getPortalDictionary(lang);

  const valid = /^[A-Za-z0-9_-]{43}$/.test(token);
  const supabase = await createClient();
  const { data: invite } = valid
    ? await supabase.rpc("peek_invitation", { p_token_hash: hashToken(token) }).maybeSingle<Invite>()
    : { data: null };

  if (!invite) {
    return <AuthCard lang={lang} title={t.invite.title} subtitle={t.invite.invalid}>{null}</AuthCard>;
  }

  const user = await getUser();
  const body = fill(t.invite.body, { clinic: invite.clinic_name, role: t.roles[invite.role] });

  return (
    <AuthCard lang={lang} title={t.invite.title} subtitle={body}>
      <p dir="ltr" className="mb-4 rounded-lg bg-bg px-3 py-2 text-center text-sm">{invite.email}</p>
      {user && user.email?.toLowerCase() !== invite.email ? (
        <form action={signOut} className="space-y-3">
          <input type="hidden" name="lang" value={lang} />
          <p className="text-sm text-rose-500">{t.invite.wrongAccount}</p>
          <button className="w-full rounded-lg border border-line py-2 text-sm">{t.signOut}</button>
        </form>
      ) : (
        <>
          {user && <p className="mb-3 text-sm text-muted">{fill(t.invite.signedInAs, { email: user.email ?? "" })}</p>}
          <AcceptInviteForm lang={lang} t={t} token={token} needsPassword={!user} />
        </>
      )}
    </AuthCard>
  );
}

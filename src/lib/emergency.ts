// Medical emergency protocol, step 1: a deterministic check that runs BEFORE the AI model.
// A match stops the assistant for that chat, raises a red alert on the clinic dashboard and
// sends the patient the safety message below — no model call, no delay, no token cost.
// Step 2 (inside the model) is the report_emergency tool for wordings this list misses.

/** Arabic normalisation: drop diacritics/tatweel, unify alef, ya and ta marbuta. */
const norm = (s: string) =>
  s.toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/\s+/g, " ");

const RULES: RegExp[] = [
  // breathing / swallowing
  /(ما|مو|ماني|لا)\s?(اقدر|اعرف|قادر)\s?(اتنفس|اتنفّس|ابلع)/, /(صعوبه|ضيق)\s?(في|ب|بـ)?\s?(ال)?(تنفس|بلع)/, /اختناق|اختنق/,
  // swelling of face / neck / throat / eye
  /(تورم|ورم|انتفاخ|منفخ|متورم|منتفخ)[^.؟!\n]{0,25}(الوجه|وجهي|العين|عيني|الرقبه|رقبتي|الحلق|حلقي|الخد كله)/,
  /(الوجه|وجهي|العين|عيني|الرقبه|رقبتي|الحلق|حلقي)[^.؟!\n]{0,20}(تورم|ورم|انتفخ|منتفخ|متورم)/,
  // bleeding that won't stop
  /نزيف[^.؟!\n]{0,25}(ما وقف|ما يوقف|ما يوقف|مستمر|قوي|كثير|غزير|ما توقف|ما يتوقف)/, /(دم|الدم)[^.؟!\n]{0,15}(ما وقف|ما يوقف|ما يتوقف|ما توقف)/,
  // trauma
  /(^|\s)(حادث|حادثه)($|\s|[.,،!؟])|انكسر فكي|كسر (في )?(الفك|فكي)|ضربه (قويه )?(على|في) (الوجه|وجهي|فمي|الفم)/,
  /(طاح|سقط|انخلع|انقلع|طار)\s?(سني|ضرسي|السن|الضرس)[^.؟!\n]{0,20}(من الضربه|بالحادث|من الطيحه|من السقطه|وانا العب|في المباراه)/,
  // loss of consciousness / severe systemic signs
  /اغمي|اغماء|فقد(ت)? الوعي|غاب عن الوعي/, /حراره (عاليه|مرتفعه)[^.؟!\n]{0,30}(تورم|انتفاخ|ورم)/,
  /(تورم|انتفاخ|ورم)[^.؟!\n]{0,30}حراره (عاليه|مرتفعه)/, /حساسيه[^.؟!\n]{0,30}(تنفس|تورم|انتفاخ)/,
  // English
  /can'?t breathe|cannot breathe|difficulty breathing|trouble breathing|short(ness)? of breath|can'?t swallow|difficulty swallowing/,
  /(face|neck|throat|eye) (is )?(swollen|swelling)|swelling (in|of) (my )?(face|neck|throat)|swelling (is )?spreading/,
  /bleeding (won'?t|will not|doesn'?t|does not) stop|heavy bleeding|non-?stop bleeding/,
  /knocked out (a |my )?tooth|tooth (got )?knocked out|broken jaw|jaw (is )?broken|car accident|fainted|passed out|unconscious/,
];

export function detectEmergency(text: string): string | null {
  const t = norm(text);
  for (const r of RULES) {
    const m = t.match(r);
    if (m) return m[0].slice(0, 80);
  }
  return null;
}

/** Safety message for the patient. Directs to 997 and the clinic's phone; never gives advice. */
export function emergencyReply(clinicPhone?: string | null) {
  return [
    "⚠️ سلامتك أولاً.",
    "إذا عندك صعوبة في التنفس أو البلع، أو نزيف ما يتوقف، أو تورم يزيد في الوجه أو الرقبة، أو إصابة قوية: اتصل بالهلال الأحمر 997 فوراً أو توجّه لأقرب طوارئ.",
    clinicPhone ? `وللتواصل مع العيادة مباشرة: ${clinicPhone}` : null,
    "بلّغنا فريق العيادة الآن وبيتواصلون معك هنا.",
    "",
    "If this is an emergency, call 997 now or go to the nearest emergency department.",
  ].filter((l) => l !== null).join("\n");
}

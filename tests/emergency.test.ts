import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEmergency, emergencyReply } from "../src/lib/emergency";

// Must raise the alert (and skip the AI model).
const EMERGENCIES = [
  "ما أقدر أتنفس زين", "عندي تورّم في وجهي وحرارة", "وجهي منتفخ من امس", "نزيف ما وقف من بعد الخلع",
  "صار لي حادث وانكسر سني", "طاح سني من الضربة", "أغمي على ولدي بعد الإبرة", "صعوبة في البلع وورم",
  "my face is swollen", "the bleeding won't stop", "I can't breathe",
];
// Routine messages: must NOT raise a false alarm.
const ROUTINE = [
  "أبي أغير موعدي", "في نفس الموعد لو سمحت", "سقط سن ولدي اللبني", "عندي ورم في اللثة بسيط", "شكراً على المحادثة",
  "عندي نزيف لثة بسيط وقت التفريش", "ابي موعد تنظيف", "توجهت للعيادة امس", "كم سعر التبييض؟", "I want to reschedule",
];

test("emergencies are detected", () => {
  for (const t of EMERGENCIES) assert.ok(detectEmergency(t), `missed: ${t}`);
});

test("routine messages are not flagged", () => {
  for (const t of ROUTINE) assert.equal(detectEmergency(t), null, `false alarm: ${t}`);
});

test("safety message points to 997 and the clinic", () => {
  const r = emergencyReply("0112345678");
  assert.match(r, /997/);
  assert.match(r, /0112345678/);
});

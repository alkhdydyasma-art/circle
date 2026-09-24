import type { Locale } from "@/i18n";

const ar = {
  book: "احجز موعدك",
  whatsapp: "تواصل واتساب",
  call: "اتصل بنا",
  nav: { services: "الخدمات", doctors: "الأطباء", branches: "الفروع", contact: "تواصل" },
  services: { title: "خدماتنا", subtitle: "رعاية متكاملة لصحة وجمال ابتسامتك.", minutes: "دقيقة", from: "يبدأ من", bookThis: "احجز هذه الخدمة" },
  doctors: { title: "فريقنا الطبي", subtitle: "أطباء متخصصون يستمعون لك قبل أن يعالجوك." },
  branches: { title: "فروعنا", subtitle: "اختر الفرع الأقرب لك.", map: "الاتجاهات على الخريطة" },
  facts: { doctors: "أطباء متخصصون", services: "خدمة علاجية وتجميلية", branches: "فروع" },
  cta: { title: "جاهز لزيارتنا؟", subtitle: "احجز موعدك في أقل من دقيقة، وسنرسل لك تأكيداً وتذكيراً قبل الموعد." },
  footer: { poweredBy: "بإدارة", rights: "جميع الحقوق محفوظة." },
  heroCard: "من خدماتنا",
};

export type SiteStrings = typeof ar;

const en: SiteStrings = {
  book: "Book an appointment",
  whatsapp: "WhatsApp us",
  call: "Call us",
  nav: { services: "Services", doctors: "Doctors", branches: "Branches", contact: "Contact" },
  services: { title: "Our services", subtitle: "Complete care for a healthy, confident smile.", minutes: "min", from: "From", bookThis: "Book this service" },
  doctors: { title: "Our doctors", subtitle: "Specialists who listen before they treat." },
  branches: { title: "Our branches", subtitle: "Choose the branch closest to you.", map: "Get directions" },
  facts: { doctors: "Specialist doctors", services: "Treatments", branches: "Branches" },
  cta: { title: "Ready to visit?", subtitle: "Book in under a minute — we'll confirm and remind you before your visit." },
  footer: { poweredBy: "Powered by", rights: "All rights reserved." },
  heroCard: "Popular treatments",
};

export const getSiteStrings = (lang: Locale) => (lang === "en" ? en : ar);

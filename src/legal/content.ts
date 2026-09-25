// Privacy policy and terms of service (Arabic & English).
// DRAFT: written to match how Circle actually processes data. It must be reviewed by a
// Saudi lawyer (PDPL) before launch — see launch plan task T1. Update LAST_UPDATED on change.

import type { Locale } from "@/i18n";

export const LAST_UPDATED = "2026-09-25";

export type LegalSection = { id: string; title: string; body: (string | string[])[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };

const privacyAr: LegalDoc = {
  title: "سياسة الخصوصية",
  intro:
    "توضح هذه السياسة كيف تجمع سيركل البيانات الشخصية وتستخدمها وتحميها، وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية ولوائحه.",
  sections: [
    {
      id: "who",
      title: "من نحن ودورنا",
      body: [
        "سيركل منصة تقنية تقدّم لعيادات الأسنان موقعاً إلكترونياً وحجزاً أونلاين ولوحة تحكم وأتمتة للتذكير والتواصل.",
        [
          "لبيانات زوار موقع سيركل وممثلي العيادات (طلبات العرض وحسابات لوحة التحكم): سيركل هي جهة التحكم.",
          "لبيانات مرضى العيادات (الحجوزات والمواعيد وملفات المرضى): العيادة هي جهة التحكم، وسيركل جهة معالجة تعالج البيانات نيابة عن العيادة ووفق تعليماتها والعقد المبرم معها.",
        ],
      ],
    },
    {
      id: "data",
      title: "البيانات التي نجمعها",
      body: [
        [
          "طلب العرض التجريبي: اسم العيادة، المدينة، معلومات تشغيلية عامة، اسم الممثل وصفته، رقم الجوال، البريد الإلكتروني (اختياري).",
          "حسابات لوحة التحكم: البريد الإلكتروني، الصلاحية داخل العيادة، وسجل النشاط (مثل إضافة موعد أو تعديل إعدادات).",
          "الحجز من موقع العيادة أو واتساب: الاسم، رقم الجوال، الخدمة، الطبيب، الفرع، الموعد، وأي ملاحظة يكتبها المريض.",
          "ما تضيفه العيادة في ملف المريض: بيانات إدارية، وقد تضيف العيادة معلومات صحية (كالحساسية والتاريخ المرضي) لا يطّلع عليها إلا المالك والمدير والطبيب المعالج.",
          "بيانات تقنية ضرورية للأمان: عنوان IP بصيغة مشفّرة غير قابلة للاسترجاع لمنع إساءة الاستخدام.",
        ],
      ],
    },
    {
      id: "purposes",
      title: "أغراض المعالجة",
      body: [
        [
          "تقديم الخدمة للعيادة وتنفيذ العقد معها.",
          "إدارة المواعيد وإرسال التأكيد والتذكير وروابط التعديل للمرضى بتكليف من العيادة.",
          "التواصل مع العيادات المهتمة بناءً على موافقتها في نموذج الطلب.",
          "حماية المنصة ومنع الاحتيال والالتزام بالأنظمة.",
        ],
        "لا نبيع البيانات الشخصية ولا نستخدم بيانات المرضى للتسويق.",
      ],
    },
    {
      id: "location",
      title: "مكان حفظ البيانات",
      body: [
        "تُحفظ قاعدة البيانات والملفات والنسخ الاحتياطية على خوادم داخل المملكة العربية السعودية.",
      ],
    },
    {
      id: "sharing",
      title: "مشاركة البيانات ومقدمو الخدمات",
      body: [
        [
          "واتساب (Meta): لإرسال رسائل التأكيد والتذكير. قد تُعالَج هذه الرسائل خارج المملكة، لذلك نرسل الحد الأدنى فقط: الاسم، اسم العيادة، موعد الزيارة، الفرع، ورابط إدارة الموعد — دون ذكر العلاج أو أي معلومة صحية.",
          "المساعد الذكي على واتساب (عند تفعيله للعيادة): يُبلَّغ المريض بذلك في بداية المحادثة، ويقتصر على المواعيد والمعلومات العامة عن العيادة، ولا يطلب معلومات صحية ولا يقدّم نصائح طبية.",
          "الجهات الحكومية: عند وجود طلب نظامي ملزم.",
        ],
      ],
    },
    {
      id: "security",
      title: "حماية البيانات",
      body: [
        [
          "تشفير الاتصال بالكامل (HTTPS).",
          "عزل بيانات كل عيادة على مستوى قاعدة البيانات، فلا يطّلع مستخدم إلا على بيانات عيادته.",
          "صلاحيات حسب الدور (مالك، مدير، طبيب، استقبال)، والملف الطبي لا يظهر للاستقبال.",
          "جلسات دخول محمية، وروابط دعوة وإدارة مواعيد عشوائية تُحفظ مشفّرة وتنتهي صلاحيتها.",
          "سجل نشاط لكل تغيير، ونسخ احتياطي دوري.",
        ],
      ],
    },
    {
      id: "retention",
      title: "مدة الاحتفاظ",
      body: [
        [
          "طلبات العرض: حتى 24 شهراً من آخر تواصل، ما لم تطلب الحذف قبل ذلك.",
          "بيانات العيادات وحساباتها: طوال مدة الاشتراك، ثم حسب ما تتطلبه الأنظمة.",
          "بيانات المرضى: حسب تعليمات العيادة والأنظمة المنظمة للسجلات الصحية. عند انتهاء الاشتراك نسلّم العيادة بياناتها ثم نحذفها من المنصة وفق العقد.",
        ],
      ],
    },
    {
      id: "rights",
      title: "حقوقك",
      body: [
        "لك وفق نظام حماية البيانات الشخصية: حق العلم بكيفية معالجة بياناتك، وحق الوصول إليها والحصول على نسخة منها، وحق تصحيحها، وحق طلب إتلافها، وحق العدول عن موافقتك.",
        "إن كنت مريضاً في إحدى العيادات فتواصل مع العيادة مباشرة، وسنساعدها في تنفيذ طلبك. ولبقية الطلبات تواصل معنا عبر بيانات التواصل أدناه.",
      ],
    },
    {
      id: "cookies",
      title: "ملفات الارتباط",
      body: [
        "نستخدم ملفات ضرورية فقط: جلسة تسجيل الدخول للوحة التحكم، وتفضيلات العرض مثل الوضع الليلي. لا نستخدم ملفات إعلانية أو تتبع من أطراف ثالثة.",
      ],
    },
    {
      id: "changes",
      title: "التعديلات والتواصل",
      body: [
        "قد نحدّث هذه السياسة، وننشر تاريخ آخر تحديث أعلى الصفحة، ونبلغ العيادات المشتركة بأي تغيير جوهري.",
      ],
    },
  ],
};

const privacyEn: LegalDoc = {
  title: "Privacy Policy",
  intro:
    "This policy explains how Circle collects, uses and protects personal data, in line with the Saudi Personal Data Protection Law (PDPL) and its regulations.",
  sections: [
    {
      id: "who",
      title: "Who we are and our role",
      body: [
        "Circle is a technology platform giving dental clinics a website, online booking, a dashboard and messaging automation.",
        [
          "For visitors to Circle's website and clinic representatives (demo requests, dashboard accounts), Circle is the controller.",
          "For clinics' patient data (bookings, appointments, patient records), the clinic is the controller and Circle is a processor acting on the clinic's behalf, under its instructions and our contract.",
        ],
      ],
    },
    {
      id: "data",
      title: "Data we collect",
      body: [
        [
          "Demo requests: clinic name, city, general operating details, the representative's name and role, mobile number, optional email.",
          "Dashboard accounts: email, role within the clinic, and an activity log (e.g. adding an appointment or changing settings).",
          "Bookings from a clinic website or WhatsApp: name, mobile number, service, doctor, branch, time and any note the patient writes.",
          "What a clinic adds to a patient file: administrative details, and possibly health information (allergies, history) visible only to owners, managers and the treating doctor.",
          "Security data: IP addresses in irreversibly hashed form, to prevent abuse.",
        ],
      ],
    },
    {
      id: "purposes",
      title: "Why we process it",
      body: [
        [
          "To provide the service to clinics and perform our contract.",
          "To manage appointments and send confirmations, reminders and change links to patients on the clinic's behalf.",
          "To contact interested clinics, based on their consent in the request form.",
          "To protect the platform, prevent fraud and meet legal obligations.",
        ],
        "We do not sell personal data and never use patient data for marketing.",
      ],
    },
    { id: "location", title: "Where data is stored", body: ["The database, files and backups are stored on servers inside Saudi Arabia."] },
    {
      id: "sharing",
      title: "Sharing and service providers",
      body: [
        [
          "WhatsApp (Meta), to send confirmations and reminders. These may be processed outside the Kingdom, so we send only the minimum: name, clinic, visit time, branch and the appointment link — never the treatment or any health information.",
          "The WhatsApp AI assistant (when enabled for a clinic): patients are told at the start of the chat; it handles appointments and general clinic information only, never asks for health information and never gives medical advice.",
          "Authorities, when legally required.",
        ],
      ],
    },
    {
      id: "security",
      title: "How we protect data",
      body: [
        [
          "Encrypted connections (HTTPS) throughout.",
          "Each clinic's data is isolated at the database level; users only ever see their own clinic.",
          "Role-based access (owner, manager, doctor, reception); medical records are hidden from reception.",
          "Protected sign-in sessions; random invitation and appointment links stored hashed and expiring.",
          "An activity log of every change, and regular backups.",
        ],
      ],
    },
    {
      id: "retention",
      title: "Retention",
      body: [
        [
          "Demo requests: up to 24 months after last contact, unless you ask us to delete them sooner.",
          "Clinic data and accounts: for the subscription, then as the law requires.",
          "Patient data: per the clinic's instructions and health-record regulations. When a subscription ends we hand the clinic its data, then delete it from the platform per the contract.",
        ],
      ],
    },
    {
      id: "rights",
      title: "Your rights",
      body: [
        "Under the PDPL you have the right to be informed, to access and obtain a copy of your data, to correct it, to request its destruction, and to withdraw consent.",
        "If you are a clinic's patient, contact the clinic directly and we will help it fulfil your request. For anything else, contact us below.",
      ],
    },
    {
      id: "cookies",
      title: "Cookies",
      body: ["We only use essential cookies: the dashboard sign-in session and display preferences such as dark mode. No advertising or third-party tracking cookies."],
    },
    { id: "changes", title: "Changes and contact", body: ["We may update this policy; the last-updated date appears at the top, and subscribed clinics are told about material changes."] },
  ],
};

const termsAr: LegalDoc = {
  title: "شروط الاستخدام",
  intro: "تنظّم هذه الشروط استخدام منصة سيركل من قبل العيادات وفرقها. وتكمّلها شروط العقد الموقّع مع كل عيادة، وتُقدَّم عليها عند التعارض.",
  sections: [
    { id: "service", title: "الخدمة", body: ["توفر سيركل للعيادة موقعاً إلكترونياً، وحجزاً أونلاين، ولوحة تحكم، وأدوات أتمتة للتأكيد والتذكير والتواصل، وفق الباقة المشترك بها."] },
    {
      id: "accounts",
      title: "الحسابات والمسؤوليات",
      body: [
        [
          "تُنشأ الحسابات بدعوة، وتتحمل العيادة مسؤولية منح الصلاحيات لفريقها وسحبها.",
          "تتحمل العيادة صحة المعلومات المنشورة في موقعها (الخدمات، الأسعار، الأطباء، أوقات الدوام).",
          "على المستخدم الحفاظ على سرية كلمة المرور وإبلاغنا فوراً عن أي استخدام غير مصرح به.",
        ],
      ],
    },
    {
      id: "patients",
      title: "بيانات المرضى",
      body: [
        "العيادة هي جهة التحكم في بيانات مرضاها، وتلتزم بالحصول على الأساس النظامي لمعالجتها وإبلاغ مرضاها. وتعالج سيركل هذه البيانات بصفتها جهة معالجة وفق سياسة الخصوصية والعقد.",
      ],
    },
    {
      id: "assistant",
      title: "المساعد الذكي",
      body: ["المساعد الذكي أداة لتنظيم المواعيد والإجابة عن المعلومات العامة للعيادة، ولا يقدّم تشخيصاً أو نصيحة طبية، ويحوّل الاستفسارات الطبية إلى فريق العيادة."],
    },
    {
      id: "use",
      title: "الاستخدام المقبول",
      body: [["عدم استخدام المنصة لإرسال رسائل غير مرغوبة أو محتوى مخالف للأنظمة.", "عدم محاولة الوصول لبيانات عيادة أخرى أو تعطيل المنصة.", "الالتزام بسياسات واتساب للأعمال عند استخدام الرسائل."]],
    },
    {
      id: "fees",
      title: "الرسوم",
      body: ["تُحدَّد الرسوم ومدة الاشتراك في العقد أو عرض السعر. تكاليف رسائل واتساب لدى Meta تُحتسب على حساب العيادة ما لم يُتفق على غير ذلك."],
    },
    {
      id: "availability",
      title: "توفر الخدمة",
      body: ["نبذل العناية المعقولة لإتاحة المنصة باستمرار، وقد تتوقف مؤقتاً للصيانة أو لأسباب خارجة عن إرادتنا، ونبلغ العيادات مسبقاً بالصيانة المجدولة قدر الإمكان."],
    },
    {
      id: "ip",
      title: "الملكية الفكرية",
      body: ["المنصة وقوالبها وبرمجياتها ملك لسيركل. ومحتوى العيادة (شعارها ونصوصها وصورها وبياناتها) ملك للعيادة، وتمنح سيركل حق استخدامه لتقديم الخدمة فقط."],
    },
    {
      id: "end",
      title: "إنهاء الاشتراك",
      body: ["عند انتهاء الاشتراك أو إنهائه تُسلَّم العيادة نسخة من بياناتها بصيغة قابلة للاستخدام، ثم تُحذف من المنصة وفق العقد وسياسة الخصوصية."],
    },
    {
      id: "liability",
      title: "حدود المسؤولية",
      body: ["في حدود ما يسمح به النظام، لا تتجاوز مسؤولية سيركل عن أي مطالبة قيمة الرسوم التي دفعتها العيادة خلال الأشهر الثلاثة السابقة للمطالبة."],
    },
    { id: "law", title: "النظام الواجب التطبيق", body: ["تخضع هذه الشروط لأنظمة المملكة العربية السعودية، وتختص الجهات القضائية المختصة في المملكة بالنظر في أي نزاع."] },
  ],
};

const termsEn: LegalDoc = {
  title: "Terms of Service",
  intro: "These terms govern use of the Circle platform by clinics and their teams. They complement each clinic's signed contract, which prevails in case of conflict.",
  sections: [
    { id: "service", title: "The service", body: ["Circle provides a clinic website, online booking, a dashboard and automation for confirmations, reminders and messaging, according to the subscribed plan."] },
    {
      id: "accounts",
      title: "Accounts and responsibilities",
      body: [["Accounts are created by invitation; the clinic is responsible for granting and revoking its team's access.", "The clinic is responsible for the accuracy of what its website publishes (services, prices, doctors, hours).", "Users must keep passwords confidential and tell us immediately about any unauthorised use."]],
    },
    { id: "patients", title: "Patient data", body: ["The clinic is the controller of its patients' data and is responsible for its lawful basis and for informing patients. Circle processes that data as a processor under the privacy policy and the contract."] },
    { id: "assistant", title: "The AI assistant", body: ["The assistant organises appointments and answers general clinic questions. It gives no diagnosis or medical advice and hands clinical questions to the clinic's team."] },
    { id: "use", title: "Acceptable use", body: [["No spam or unlawful content.", "No attempts to access another clinic's data or disrupt the platform.", "Follow WhatsApp Business policies when messaging."]] },
    { id: "fees", title: "Fees", body: ["Fees and subscription term are set in the contract or quote. WhatsApp messaging costs charged by Meta are billed to the clinic's account unless agreed otherwise."] },
    { id: "availability", title: "Availability", body: ["We take reasonable care to keep the platform available; it may pause for maintenance or reasons beyond our control, and we announce scheduled maintenance in advance where possible."] },
    { id: "ip", title: "Intellectual property", body: ["The platform, its templates and software belong to Circle. Clinic content (logo, text, images, data) belongs to the clinic, which grants Circle the right to use it only to provide the service."] },
    { id: "end", title: "Ending a subscription", body: ["When a subscription ends, the clinic receives a usable copy of its data, which is then deleted from the platform per the contract and privacy policy."] },
    { id: "liability", title: "Limitation of liability", body: ["To the extent the law allows, Circle's liability for any claim is limited to the fees the clinic paid in the three months before the claim."] },
    { id: "law", title: "Governing law", body: ["These terms are governed by the laws of the Kingdom of Saudi Arabia, and its competent courts have jurisdiction over any dispute."] },
  ],
};

export const getLegal = (doc: "privacy" | "terms", lang: Locale): LegalDoc =>
  doc === "privacy" ? (lang === "en" ? privacyEn : privacyAr) : lang === "en" ? termsEn : termsAr;

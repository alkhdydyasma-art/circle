import type { Dictionary } from "./ar";

const en: Dictionary = {
  meta: {
    title: "Circle | AI automation platform for dental clinics",
    description:
      "Circle gives your clinic a website, smart booking, an AI WhatsApp agent, automatic reminders and a full dashboard — with zero effort from your front desk.",
  },
  nav: {
    features: "Features",
    how: "How it works",
    dashboard: "Dashboard",
    pricing: "Pricing",
    faq: "FAQ",
    cta: "Book a demo",
    switchLang: "العربية",
    theme: "Toggle dark mode",
  },
  hero: {
    badge: "An AI agent answering on WhatsApp 24/7",
    title: "Your clinic takes bookings",
    titleAccent: "while you focus on care",
    subtitle:
      "Circle connects your clinic website, WhatsApp and dashboard in one automated system: patients book or reschedule, Circle confirms, reminds and organizes — and every booking lands in your dashboard with no manual work.",
    primary: "Book a free demo",
    secondary: "See how it works",
    stats: [
      { value: "24/7", label: "instant patient replies" },
      { value: "< 1 min", label: "to complete a booking" },
      { value: "0", label: "manual booking entry" },
    ],
  },
  chat: {
    header: "Clinic assistant",
    status: "Online",
    messages: [
      { from: "patient", text: "Hi, I'd like a teeth cleaning appointment this week" },
      { from: "bot", text: "Hi 👋 We have Wednesday 5:30 PM or Thursday 7:00 PM with Dr. Sarah. Which works for you?" },
      { from: "patient", text: "Wednesday" },
      { from: "bot", text: "You're booked ✅ Wednesday 5:30 PM — Olaya branch. I'll remind you a day before, and you can reschedule right here." },
    ],
    toast: "New booking in your dashboard",
    toastDetail: "Teeth cleaning · Wed 5:30 PM",
    typing: "typing…",
  },
  features: {
    eyebrow: "Everything a clinic needs",
    title: "One system instead of ten tools",
    subtitle: "Everything is activated the moment your clinic subscribes — and it all works together.",
    items: [
      {
        icon: "bot",
        title: "AI WhatsApp agent (RAG)",
        text: "Answers patients from your clinic's real data — services, prices, doctors and branches — and books or reschedules on its own.",
      },
      {
        icon: "calendar",
        title: "Smart online booking",
        text: "Patients pick a service, doctor and open slot on your website in under a minute. No calls, no waiting.",
      },
      {
        icon: "bell",
        title: "Automatic reminders & rescheduling",
        text: "Reminders before every visit, and patients can reschedule up to a day before — your calendar updates itself.",
      },
      {
        icon: "layout",
        title: "Clinic dashboard",
        text: "Manage bookings, doctors, services and your blog in one place, with live insight into clinic performance.",
      },
      {
        icon: "globe",
        title: "Professional clinic website",
        text: "A fast, SEO-ready site showcasing your services, doctors and before/after cases — wired into booking.",
      },
      {
        icon: "shield",
        title: "Secure, isolated data",
        text: "Each clinic gets its own workspace and team permissions. Data is protected and never mixed.",
      },
    ],
  },
  how: {
    eyebrow: "How it works",
    title: "From a WhatsApp message to a confirmed visit — automatically",
    steps: [
      { title: "Patient messages or books", text: "On WhatsApp or your website, any time of day." },
      { title: "The AI agent replies & books", text: "Understands the request, offers open slots and confirms." },
      { title: "Booking lands in the dashboard", text: "Visible instantly to reception and doctors — no data entry." },
      { title: "Reminders & follow-up", text: "A reminder before the visit, easy rescheduling, and follow-up after." },
    ],
  },
  compare: {
    eyebrow: "Before & after Circle",
    title: "Goodbye operational chaos",
    beforeTitle: "Without Circle",
    afterTitle: "With Circle",
    before: [
      "Piles of unanswered WhatsApp messages",
      "Bookings in a notebook or spreadsheet",
      "Patients forgetting appointments",
      "Reception stuck on the phone all day",
    ],
    after: [
      "Instant smart reply to every message",
      "Every booking in one dashboard",
      "Automatic reminders, one-tap rescheduling",
      "Reception free to care for patients",
    ],
  },
  dashboard: {
    eyebrow: "Dashboard",
    title: "Your whole clinic on one screen",
    subtitle: "Follow bookings in real time, assign appointments to doctors, and track every branch.",
    kpis: [
      { label: "Bookings today", value: "32" },
      { label: "Via WhatsApp", value: "71%" },
      { label: "Show-up rate", value: "94%" },
    ],
    listTitle: "Upcoming appointments",
    heatmapTitle: "Booking activity — last 20 weeks",
    less: "Less",
    more: "More",
    rows: [
      { name: "Abdullah M.", service: "Cleaning", time: "4:30 PM", source: "WhatsApp", whatsapp: true },
      { name: "Reem S.", service: "Orthodontics", time: "5:00 PM", source: "Website", whatsapp: false },
      { name: "Fahad A.", service: "Cosmetic filling", time: "5:30 PM", source: "WhatsApp", whatsapp: true },
    ],
  },
  lead: {
    eyebrow: "Get started",
    title: "Ready to see Circle running your clinic?",
    subtitle: "Tell us about your clinic and we'll prepare a demo built around your services and doctors — your platform goes live as soon as you subscribe.",
    steps: ["Your clinic", "Current operations", "Contact"],
    next: "Next",
    back: "Back",
    fields: {
      clinic: "Clinic name",
      city: "City",
      clinicType: "Clinic type",
      branches: "Branches",
      chairs: "Chairs",
      doctors: "Doctors",
      bookingMethod: "How do you take bookings today?",
      monthlyPatients: "Patients per month (approx.)",
      needs: "What do you most want to fix?",
      name: "Your name",
      role: "Your role",
      phone: "Mobile (WhatsApp)",
      email: "Email (optional)",
      consent: "I agree to Circle processing my details to contact me, per the privacy policy.",
    },
    options: {
      clinicType: {
        general: "General dentistry",
        ortho: "Orthodontics",
        cosmetic: "Cosmetic dentistry",
        pediatric: "Pediatric dentistry",
        multi: "Multi-specialty center",
      },
      bookingMethod: {
        phone: "Phone calls",
        whatsapp: "Manual WhatsApp",
        software: "Another booking system",
        paper: "Notebook / spreadsheet",
      },
      monthlyPatients: {
        lt200: "Under 200",
        "200_500": "200 – 500",
        "500_1000": "500 – 1,000",
        gt1000: "Over 1,000",
      },
      needs: {
        whatsapp: "WhatsApp replies",
        noshows: "No-shows",
        booking: "Online booking",
        dashboard: "Performance tracking",
        website: "Clinic website",
      },
      role: {
        owner: "Owner / partner",
        manager: "Clinic manager",
        doctor: "Doctor",
        reception: "Reception",
      },
    },
    select: "Select…",
    submit: "Book my demo",
    sending: "Sending…",
    success: "Got it ✅ We'll reach out on WhatsApp shortly.",
    error: "Something went wrong. Please try again or message us on WhatsApp.",
    note: "No commitment · Live in days",
  },
  testimonials: {
    eyebrow: "What clinics say",
    title: "Clinics that now run calmly",
    sampleNote: "Illustrative examples — to be replaced with real customer reviews",
    items: [
      {
        quote: "WhatsApp messages used to pile up after hours. Now the assistant replies and books, and we start the day with a tidy schedule.",
        role: "Dental clinic manager",
        city: "Riyadh",
      },
      {
        quote: "Reminders made the biggest difference — patients reschedule themselves instead of just not showing up.",
        role: "Dentist & clinic owner",
        city: "Jeddah",
      },
      {
        quote: "With three branches, I now see every branch's bookings and each doctor's performance on one screen instead of manual reports.",
        role: "Dental center director",
        city: "Dammam",
      },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "Everything you need to know before starting",
    items: [
      {
        q: "How long does it take to activate my clinic?",
        a: "After you subscribe we set up your website and dashboard and connect WhatsApp within a few business days, adding your services, doctors and hours with you.",
      },
      {
        q: "Do I need to change my clinic's WhatsApp number?",
        a: "No. We connect your number through the WhatsApp Business API and guide you through verification if it isn't enabled yet.",
      },
      {
        q: "Is my clinic's patient data kept separate?",
        a: "Yes. Every clinic has its own data space isolated at the database level, users only ever see their own clinic's data, and all connections are encrypted.",
      },
      {
        q: "Does the AI assistant answer medical questions?",
        a: "It answers from your clinic's information (services, prices, hours, branches) and books or reschedules — it never gives a diagnosis and hands clinical questions to your team.",
      },
      {
        q: "Can patients reschedule on their own?",
        a: "Yes, from the reminder or the chat, within the window your clinic sets (e.g. up to a day before), and the calendar updates automatically.",
      },
      {
        q: "Who can access the dashboard?",
        a: "You decide your team and their permissions — owner, manager, doctor, reception — and each role only sees and edits what it should.",
      },
      {
        q: "Are there long contracts or hidden fees?",
        a: "Plans are monthly or yearly with clear pricing from day one. We'll send full details after your demo.",
      },
    ],
  },
  contact: {
    whatsapp: "Chat with us on WhatsApp",
    call: "Call us",
    whatsappMessage: "Hi, I'd like to learn more about Circle for my clinic",
  },
  footer: {
    contact: "Contact",
    tagline: "Smart automation for dental clinics.",
    rights: "All rights reserved.",
  },
};

export default en;

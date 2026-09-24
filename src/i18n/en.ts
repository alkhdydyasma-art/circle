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
      { value: "60%", label: "fewer front-desk calls" },
      { value: "40%", label: "fewer no-shows" },
      { value: "24/7", label: "instant patient replies" },
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
    subtitle: "Leave your details and we'll set up a live demo within 24 hours — your platform is activated as soon as you subscribe.",
    fields: {
      clinic: "Clinic name",
      name: "Your name",
      phone: "Mobile (WhatsApp)",
      city: "City",
      chairs: "Chairs / branches",
    },
    submit: "Book my demo",
    sending: "Sending…",
    success: "Got it ✅ We'll reach out on WhatsApp shortly.",
    error: "Something went wrong. Please try again or message us on WhatsApp.",
    note: "No commitment · Live in days",
  },
  footer: {
    tagline: "Smart automation for dental clinics.",
    rights: "All rights reserved.",
  },
};

export default en;

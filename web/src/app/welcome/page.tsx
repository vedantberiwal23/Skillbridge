import Link from "next/link"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { GlobeSection } from "@/components/visual/globe-section"
import { MultilingualHeroCards } from "@/components/visual/multilingual-hero-cards"

const LANG_ICON =
  "M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7m-7 0l-1 2m1-2l2.5-5 2.5 5m0 0l1 2m-1-2h-5"
const MACHINE_ICON =
  "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
const CHART_ICON = "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"

export default function LandingPage() {
  return (
    <div className="flex-1 bg-background">

      {/* Header */}
      <header className="border-b border-border/60 bg-card">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4 md:px-10">
          <Link href="/welcome" className="flex items-center gap-2.5">
            <span className="size-2.5 rounded-full bg-primary" />
            <span className="text-lg font-semibold tracking-tight text-foreground">
              SkillBridge
            </span>
          </Link>

          <nav className="flex items-center gap-7">
            {["Pricing", "Blog", "Trust"].map((item) => (
              <a
                key={item}
                href="#"
                className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
              >
                {item}
              </a>
            ))}
            <Link
              href="/login"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Log in
            </Link>
            <a
              href="#demo"
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Book a demo
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-[1600px] items-center gap-12 px-6 py-14 md:px-10 min-[900px]:grid-cols-2 lg:gap-8 lg:py-20">
          {/* Left: the pitch */}
          <div className="max-w-xl">
            <div className="flex items-center gap-4">
              <span className="h-px w-10 bg-primary/40" />
              <p className="text-xs font-data uppercase tracking-[0.18em] text-muted-foreground">
                Industrial training for a stronger tomorrow
              </p>
            </div>

            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-foreground lg:text-5xl xl:text-6xl">
              Train your workforce,
              <br />
              in their own{" "}
              <span className="text-primary">language</span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
              Workers learn hands-free, by voice, grounded in your own SOPs and
              manuals — not generic content. Managers see skill gaps and training
              ROI across every department, in one place.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#demo"
                className="group inline-flex min-h-12 items-center gap-2 rounded-md bg-primary px-6 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Book a demo
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </a>
              <a
                href="#demo"
                className="inline-flex min-h-12 items-center rounded-md border border-border bg-card px-6 text-base font-medium text-foreground transition-colors hover:border-primary/40"
              >
                Talk to sales
              </a>
            </div>

            {/* Value props */}
            <dl className="mt-10 grid gap-6 border-t border-border pt-6 min-[1100px]:grid-cols-3 min-[1100px]:gap-0">
              {[
                { icon: LANG_ICON, title: "Multilingual", sub: "For every worker" },
                { icon: MACHINE_ICON, title: "Practical training", sub: "On real machines" },
                { icon: CHART_ICON, title: "Measurable outcomes", sub: "Skills, safety, productivity" },
              ].map((item, index) => (
                <div
                  key={item.title}
                  className={`flex items-start gap-3 min-[1100px]:px-5 ${
                    index > 0
                      ? "min-[1100px]:border-l min-[1100px]:border-border"
                      : "min-[1100px]:pl-0"
                  }`}
                >
                  <svg
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                  <div>
                    <dt className="text-sm font-semibold text-foreground">{item.title}</dt>
                    <dd className="mt-0.5 text-xs text-muted-foreground">{item.sub}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>

          {/* Right: the worker, with live-looking overlays */}
          <div className="relative min-h-[440px] lg:min-h-[580px]">
            {/* Subtle angled background shadow/accent to the left of the stripe */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 hidden sm:block"
              style={{
                clipPath: "polygon(5% 0, 10.5% 0, -2.5% 100%, -8% 100%)",
                background:
                  "linear-gradient(to right, rgba(232,163,61,0) 0%, rgba(232,163,61,0.10) 100%)",
              }}
            />

            {/* Amber rim-light along the diagonal cut */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 hidden sm:block"
              style={{
                clipPath: "polygon(10.5% 0, 13% 0, 0% 100%, -2.5% 100%)",
                backgroundColor: "#e8a33d",
              }}
            />

            {/* The photo, clipped along the navy stripe with no dark blue tint */}
            <div
              className="hero-photo absolute inset-0 overflow-hidden"
              style={{
                clipPath: "polygon(13% 0, 100% 0, 100% 100%, 0% 100%)",
              }}
            >
              {/* Soft right-edge scrim strictly for standfirst text legibility */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-1/4"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(10,15,22,0) 0%, rgba(10,15,22,0.35) 60%, rgba(10,15,22,0.6) 100%)",
                }}
              />

              {/* Faint standfirst, matching reference */}
              <p className="absolute right-6 top-8 text-right text-xs font-semibold uppercase leading-6 tracking-[0.14em] text-foreground/35">
                Safer
                <br />
                Skilled
                <br />
                Stronger
                <br />
                India
              </p>
              <p className="absolute bottom-8 right-6 text-right text-[10px] font-medium uppercase leading-5 tracking-[0.14em] text-foreground/30">
                People
                <br />
                Skills
                <br />
                Industry
                <br />
                Progress
              </p>
            </div>

            {/* Dynamic Multilingual Overlays: Cycles through Indian languages every 3.2 seconds */}
            <MultilingualHeroCards />
          </div>
        </div>
      </section>


      {/* Product preview on sky background */}
      <section className="relative overflow-hidden px-4 md:px-8">
        <div className="relative rounded-2xl overflow-hidden max-w-7xl mx-auto">
          <Image
            src="/cloud.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            aria-hidden
          />
          <div
            className="absolute inset-0"
            aria-hidden
            style={{
              background:
                "linear-gradient(180deg, rgba(10,15,22,0.55) 0%, rgba(10,15,22,0.75) 60%, rgba(10,15,22,0.9) 100%)",
            }}
          />

          {/* Browser mockup */}
          <div className="relative px-4 md:px-16 py-10 md:py-16">
            <div className="bg-card rounded-xl border border-border shadow-[0_30px_70px_-20px_rgba(0,0,0,0.7)] overflow-hidden flex" style={{ height: 460 }}>
              {/* Mock sidebar */}
              <div className="hidden sm:flex w-44 md:w-52 bg-card border-r border-border flex-shrink-0 flex-col">
                <div className="px-3 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="text-xs font-semibold text-foreground">SkillBridge</span>
                  </div>
                  <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
                  </svg>
                </div>
                <div className="px-2 py-2 border-b border-border flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-muted-foreground">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Workflows
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-muted-foreground">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    </svg>
                    Settings
                  </div>
                </div>
                <div className="px-3 pt-3 pb-1">
                  <p className="text-[10px] font-data uppercase tracking-widest text-muted-foreground">Today</p>
                </div>
                <div className="px-2 flex flex-col gap-0.5">
                  {["Troubleshooting skill drop", "Welder dept pass rate", "New SOP upload review"].map((t, i) => (
                    <div key={t} className={`px-2 py-1.5 rounded text-[11px] truncate ${i === 0 ? "bg-secondary text-primary font-medium" : "text-muted-foreground"}`}>
                      {t}
                    </div>
                  ))}
                </div>
                <div className="mt-auto px-3 py-3 border-t border-border flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[9px] font-semibold text-primary flex-shrink-0">
                    MS
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-foreground truncate">Meera Shah</p>
                    <p className="text-[10px] text-muted-foreground truncate">meera@bharatmfg.com</p>
                  </div>
                </div>
              </div>

              {/* Mock chat panel */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="h-11 border-b border-border flex items-center justify-between px-5 flex-shrink-0">
                  <span className="text-xs font-medium text-foreground">Troubleshooting skill drop</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4l3 3" />
                    </svg>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" />
                    </svg>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden px-6 py-5">
                  <div className="flex items-start gap-2.5 mb-4">
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-semibold text-primary flex-shrink-0">
                      MS
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground mb-0.5">You</p>
                      <p className="text-xs text-foreground leading-relaxed">
                        Why has the troubleshooting score dropped for the CNC department this month?
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-primary-foreground" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Assistant</p>
                      <p className="text-[10px] text-muted-foreground mb-2">Completed 4 actions ›</p>
                      <p className="text-xs text-foreground leading-relaxed">
                        Attempt logs show workers stalling on the hydraulic fault-diagnosis
                        scenario. The linked SOP hasn&rsquo;t been updated since March.
                      </p>
                      <div className="border border-border rounded-md px-3 py-2 mt-2.5 flex items-center justify-between gap-3">
                        <span className="text-[11px] text-foreground">Flag SOP for re-verification</span>
                        <Badge variant="success" className="flex-shrink-0 text-[10px] px-1.5 py-0">Confirmed</Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 pb-5">
                  <div className="border border-border rounded-md flex items-center gap-2 px-3 py-2.5 bg-card">
                    <span className="flex-1 text-xs text-muted-foreground">Ask about your team...</span>
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 md:px-10 py-20 max-w-7xl mx-auto">
        <div className="max-w-xl mb-12">
          <p className="text-xs font-data uppercase tracking-widest text-muted-foreground mb-3">
            Why it works
          </p>
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight">
            Built for the shop floor, not a browser tab
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-x-10 gap-y-10">
          {[
            {
              icon: "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z",
              title: "Voice-first, in their language",
              desc: "Workers ask questions out loud, in Hindi, Tamil or any Indian language they speak. Technical terms stay in English — no awkward literal translation.",
            },
            {
              icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
              title: "Grounded in your own SOPs",
              desc: "Upload your manuals and safety procedures. The AI tutor answers from your documentation, not generic internet knowledge — with your source cited every time.",
            },
            {
              icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
              title: "Skill gaps, not just completion",
              desc: "See who's actually competent, not just who finished a module. Department-level skill gaps roll up automatically, so you know where to focus training spend.",
            },
          ].map((f) => (
            <div key={f.title}>
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center mb-4">
                <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-10 py-20 border-t border-border max-w-7xl mx-auto">
        <div className="max-w-xl mb-12">
          <p className="text-xs font-data uppercase tracking-widest text-muted-foreground mb-3">
            How it works
          </p>
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight">
            From invite to competency, tracked end to end
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { step: "01", title: "Invite", desc: "Admin invites workers by SMS or email — no app-store search, no password to remember." },
            { step: "02", title: "Learn", desc: "An AI-generated plan for their profession, grounded in your uploaded SOPs, delivered by voice." },
            { step: "03", title: "Practice", desc: "Interactive 3D machine models — tap a part, ask about it out loud, get an answer from your docs." },
            { step: "04", title: "Prove", desc: "Voice and scenario-based assessments build a real competency profile, not a completion checkbox." },
          ].map((s) => (
            <div key={s.step} className="border-t border-border pt-4">
              <p className="text-xs font-data text-muted-foreground mb-3">{s.step}</p>
              <h3 className="text-sm font-semibold text-foreground mb-1.5">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <GlobeSection
        eyebrow="Scale"
        heading="Built for a workforce the size of a country"
      />

      {/* Stats */}
      <section className="px-6 md:px-10 py-20 border-t border-border max-w-7xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-10">
          {[
            { stat: "78%", label: "of blue-collar turnover isn't about wages — it's growth and environment." },
            { stat: "~50%", label: "of contract workers who quit do so within their first 90 days." },
            { stat: "8.7cr", label: "Indians aged 15–29 are not in education, employment or training." },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl md:text-4xl font-semibold text-foreground font-data">{s.stat}</p>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-6 md:px-10 py-20 border-t border-border">
        <div
          className="max-w-7xl mx-auto rounded-2xl px-8 py-14 md:px-16 flex flex-col md:flex-row md:items-center md:justify-between gap-8"
          style={{
            background: "linear-gradient(135deg, #161d25 0%, #1a2430 55%, #2b2013 100%)",
          }}
        >
          <div className="max-w-lg">
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight">
              See it with your own SOPs
            </h2>
            <p className="text-muted-foreground mt-3 leading-relaxed">
              We&rsquo;ll walk through onboarding a worker on your actual procedures — book a
              time with the team.
            </p>
          </div>
          <button className="bg-primary text-primary-foreground text-sm font-medium px-6 py-3 rounded-md hover:opacity-90 transition-opacity whitespace-nowrap flex-shrink-0">
            Book a demo
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-10 py-10 max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-sm font-semibold text-foreground tracking-tight">
            SkillBridge
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#" className="hover:text-foreground transition-colors">Pricing</a>
          <a href="#" className="hover:text-foreground transition-colors">Blog</a>
          <a href="#" className="hover:text-foreground transition-colors">Trust</a>
          <Link href="/login" className="hover:text-foreground transition-colors">Log in</Link>
        </div>
      </footer>
    </div>
  )
}

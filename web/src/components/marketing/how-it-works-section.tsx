'use client';

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative w-full py-20 sm:py-24 border-t border-neutral-200/60 overflow-hidden bg-[#faf8f4] footer-dots">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-12">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          <div>
            {/* Orange bar + Eyebrow */}
            <div className="inline-flex items-center gap-2.5">
              <span className="w-8 h-[2.5px] bg-[#f2621f] rounded-full" />
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
                HOW IT WORKS
              </span>
            </div>

            {/* Main Section Heading */}
            <h2 className="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight text-neutral-900">
              Learn. Practice. Apply.
            </h2>

            {/* Subtitle */}
            <p className="mt-2 text-sm sm:text-base text-neutral-500 font-normal">
              Hands-on industrial training. Built for real work.
            </p>
          </div>

          {/* Top-Right Tagline Badge */}
          <div className="hidden sm:flex flex-col items-end text-right self-start pt-1">
            <span className="text-xs sm:text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400 leading-snug">
              SKILLED PEOPLE<br />
              A STRONGER INDIA
            </span>
            <div className="mt-2 w-7 h-[2px] bg-[#f2621f] rounded-full" />
          </div>
        </div>

        {/* 3-Step Process Flow with Connecting Arrows */}
        <div className="mt-14 sm:mt-16 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-8 lg:gap-5">
          {/* STEP 01: Choose a skill */}
          <div className="flex flex-col">
            <span className="text-xs sm:text-sm font-bold font-mono text-[#f2621f]">
              01
            </span>
            <h3 className="mt-2 text-lg sm:text-xl font-bold text-neutral-900">
              Choose a skill
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-neutral-500 leading-relaxed min-h-[44px]">
              Pick from industry-relevant modules in hydraulics, electrical systems, machine maintenance and more.
            </p>

            {/* Step 1 UI Mockup Card */}
            <div className="mt-6 rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-[0_2px_14px_rgba(0,0,0,0.03)] flex flex-col justify-center gap-1 min-h-[260px]">
              {/* Hydraulics (Selected) */}
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-orange-50/70 text-[#f2621f]">
                <span className="w-2 h-2 rounded-full bg-[#f2621f] flex-shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-neutral-900">
                  Hydraulics
                </span>
              </div>

              {/* Electrical Systems */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-neutral-600 hover:bg-neutral-50 transition-colors">
                <span className="w-2 h-2 rounded-full bg-neutral-300 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-neutral-700">
                  Electrical Systems
                </span>
              </div>

              {/* Machine Maintenance */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-neutral-600 hover:bg-neutral-50 transition-colors">
                <span className="w-2 h-2 rounded-full bg-neutral-300 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-neutral-700">
                  Machine Maintenance
                </span>
              </div>

              {/* Safety & Compliance */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-neutral-600 hover:bg-neutral-50 transition-colors">
                <span className="w-2 h-2 rounded-full bg-neutral-300 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-neutral-700">
                  Safety &amp; Compliance
                </span>
              </div>

              {/* Pneumatics */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-neutral-600 hover:bg-neutral-50 transition-colors">
                <span className="w-2 h-2 rounded-full bg-neutral-300 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-neutral-700">
                  Pneumatics
                </span>
              </div>
            </div>
          </div>

          {/* Arrow 1 -> 2 */}
          <div className="hidden lg:flex items-center justify-center pt-48 text-neutral-300">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>

          {/* STEP 02: Learn by doing */}
          <div className="flex flex-col">
            <span className="text-xs sm:text-sm font-bold font-mono text-[#f2621f]">
              02
            </span>
            <h3 className="mt-2 text-lg sm:text-xl font-bold text-neutral-900">
              Learn by doing
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-neutral-500 leading-relaxed min-h-[44px]">
              Follow step-by-step lessons, run simulations and get clear, practical answers anytime you&rsquo;re stuck.
            </p>

            {/* Step 2 UI Mockup Card */}
            <div className="mt-6 rounded-2xl border border-neutral-200/90 bg-white p-4 sm:p-5 shadow-[0_2px_14px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[260px] gap-3">
              <div className="space-y-3">
                {/* User Message */}
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-500 flex-shrink-0">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </div>
                  <div className="bg-neutral-100/90 rounded-2xl rounded-tl-sm px-3.5 py-2 text-xs text-neutral-800 font-medium leading-snug">
                    How do I set the pressure relief valve in a hydraulic system?
                  </div>
                </div>

                {/* AI Assistant Message */}
                <div className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-neutral-900 flex items-center justify-center flex-shrink-0">
                    <div className="flex items-center gap-0.5 h-3">
                      <span className="w-0.5 h-1.5 bg-[#f2621f] rounded-full" />
                      <span className="w-0.5 h-2.5 bg-[#f2621f] rounded-full" />
                      <span className="w-0.5 h-1.5 bg-[#f2621f] rounded-full" />
                      <span className="w-0.5 h-3 bg-[#f2621f] rounded-full" />
                      <span className="w-0.5 h-1 bg-[#f2621f] rounded-full" />
                    </div>
                  </div>
                  <div className="bg-neutral-100/90 rounded-2xl rounded-tl-sm px-3.5 py-2 text-xs sm:text-xs text-neutral-700 leading-relaxed">
                    <p className="font-semibold text-neutral-900 mb-1">
                      Here&rsquo;s the step-by-step process:
                    </p>
                    <ol className="space-y-0.5 list-decimal list-inside text-neutral-600">
                      <li>Locate the relief valve.</li>
                      <li>Set the desired pressure (bar).</li>
                      <li>Observe the gauge reading.</li>
                      <li>Verify system response.</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Bottom Input Box */}
              <div className="rounded-full border border-neutral-200 bg-neutral-50/70 px-3 py-1.5 flex items-center justify-between">
                <span className="text-xs text-neutral-400 pl-1">
                  Ask a question...
                </span>
                <div className="w-6 h-6 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs">
                  &uarr;
                </div>
              </div>
            </div>
          </div>

          {/* Arrow 2 -> 3 */}
          <div className="hidden lg:flex items-center justify-center pt-48 text-neutral-300">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>

          {/* STEP 03: Get job-ready */}
          <div className="flex flex-col">
            <span className="text-xs sm:text-sm font-bold font-mono text-[#f2621f]">
              03
            </span>
            <h3 className="mt-2 text-lg sm:text-xl font-bold text-neutral-900">
              Get job-ready
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-neutral-500 leading-relaxed min-h-[44px]">
              Track your progress, build certifications and apply your skills in real-world workplaces.
            </p>

            {/* Step 3 UI Mockup Card */}
            <div className="mt-6 rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-[0_2px_14px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-[260px]">
              <div>
                {/* Header & Percentage */}
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-neutral-900">
                    Your Progress
                  </span>
                  <span className="text-sm font-bold font-mono text-neutral-900">
                    78%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-neutral-100 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-[#f2621f] rounded-full w-[78%]" />
                </div>

                {/* Lessons breakdown */}
                <div className="mt-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#f2621f] flex-shrink-0" />
                      <span className="font-medium text-neutral-800">Video Lessons</span>
                    </div>
                    <span className="font-mono text-neutral-500">8/8</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#f2621f] flex-shrink-0" />
                      <span className="font-medium text-neutral-800">Hands-on Simulation</span>
                    </div>
                    <span className="font-mono text-neutral-500">5/6</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-neutral-300 flex-shrink-0" />
                      <span className="font-medium text-neutral-400">Assessment</span>
                    </div>
                    <span className="font-mono text-neutral-400">0/2</span>
                  </div>
                </div>
              </div>

              {/* Get Certified CTA Bar */}
              <div className="rounded-xl bg-neutral-100/90 hover:bg-neutral-200/70 transition-colors px-3.5 py-2.5 flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4 text-neutral-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-xs font-semibold text-neutral-900">
                    Get Certified
                  </span>
                </div>
                <span className="text-sm text-neutral-700">&rarr;</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Accent Footer inside Section */}
        <div className="mt-14 sm:mt-16 pt-6 border-t border-neutral-200/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="w-6 h-[1.5px] bg-neutral-300 rounded-full" />
            <span>Real skills for a stronger India.</span>
          </div>
          <div className="font-mono text-xs text-neutral-400">
            SkillBridge &nbsp;|&nbsp; 2026
          </div>
        </div>
      </div>
    </section>
  );
}

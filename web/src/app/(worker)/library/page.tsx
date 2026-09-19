"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

import catalogData from "@/data/materials-catalog.json";
import { useI18n } from "@/i18n/provider";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";

interface MaterialItem {
  id: number;
  name: string;
  slug: string;
  category: string;
  media_format: string;
  topic: string;
  topic_slug: string;
  session: string;
  session_slug: string;
  session_id: number;
  average_time: number;
  free: boolean;
}

const TOPICS = [
  "All Topics",
  "Hydraulics",
  "Electrical",
  "Mobile",
  "Stationary",
  "Automation Controllers",
  "Training Systems",
  "Pneumatics",
  "Battery Electric",
];

const CATEGORIES = [
  { id: "all", label: "All Materials", count: catalogData.total_materials },
  { id: "Simulation", label: "Simulations", count: 495 },
  { id: "Lesson", label: "Lessons", count: 118 },
  { id: "Quiz", label: "Diagnostics & Quizzes", count: 50 },
  { id: "Video", label: "Video Demonstrations", count: 166 },
  { id: "Reference", label: "Manuals & Reference", count: 75 },
];

export default function LibraryPage() {
  const { locale, setLocale } = useI18n();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("All Topics");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const materials = catalogData.materials as MaterialItem[];

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return materials.filter((item) => {
      // Topic filter
      if (selectedTopic !== "All Topics" && item.topic !== selectedTopic) {
        return false;
      }

      // Category filter
      if (selectedCategory !== "all") {
        if (selectedCategory === "Reference") {
          if (
            !["Reference", "Manual", "Workbook", "Poster"].includes(
              item.category,
            )
          ) {
            return false;
          }
        } else if (item.category !== selectedCategory) {
          return false;
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesSession = item.session.toLowerCase().includes(query);
        const matchesTopic = item.topic.toLowerCase().includes(query);
        if (!matchesName && !matchesSession && !matchesTopic) {
          return false;
        }
      }

      return true;
    });
  }, [materials, selectedTopic, selectedCategory, searchQuery]);

  const totalPages = Math.ceil(filteredMaterials.length / pageSize) || 1;
  const paginatedList = filteredMaterials.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setPage(1);
  };

  const handleTopicChange = (top: string) => {
    setSelectedTopic(top);
    setPage(1);
  };

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setPage(1);
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/plan"
              className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-[#0B57D0] transition-colors"
            >
              <svg
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              <span>Back to Roadmap</span>
            </Link>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">
                Complete Industrial Library
              </span>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-[#0B57D0]">
                {catalogData.total_materials} Materials
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Quick Locale Selector */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-2xs">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code as Locale)}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition-all ${
                    locale === code
                      ? "bg-[#0B57D0] text-white"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {LOCALE_LABELS[code]}
                </button>
              ))}
            </div>

            <Link
              href="/worker-file"
              className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 px-3 py-1 text-xs font-bold shadow-2xs transition-all inline-flex items-center gap-1.5"
            >
              <svg
                className="size-3.5 text-[#0B57D0]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span>Worker File</span>
            </Link>

            <Link
              href="/assessment/asmt-hydraulics-l1"
              className="text-xs font-bold text-[#0B57D0] hover:underline hidden sm:inline"
            >
              Take Assessment &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <div className="mx-auto max-w-7xl px-6 pt-8 space-y-6">
        {/* Hero Banner */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0B57D0]">
              Universal Vocational Dataset &bull;
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">
              Industrial Training Catalog & Simulations
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Explore 976 course materials across 8 manufacturing disciplines:
              495 interactive digital twin simulations, 118 procedural lessons,
              50 diagnostic quizzes, and 166 video modules.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center min-w-24">
              <span className="text-2xl font-black text-slate-900 block">
                495
              </span>
              <span className="text-[10px] font-bold uppercase text-slate-500">
                Simulations
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center min-w-24">
              <span className="text-2xl font-black text-slate-900 block">
                86
              </span>
              <span className="text-[10px] font-bold uppercase text-slate-500">
                Sessions
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center min-w-24">
              <span className="text-2xl font-black text-slate-900 block">
                8
              </span>
              <span className="text-[10px] font-bold uppercase text-slate-500">
                Disciplines
              </span>
            </div>
          </div>
        </div>

        {/* Live Search & Filter Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
          {/* Search Input */}
          <div className="relative w-full">
            <svg
              className="pointer-events-none absolute left-4 top-3.5 size-5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search 976 materials by keyword (e.g. relief valve, gear pump, CAN Bus, air brakes, PLC ladder, cylinder)..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-11 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#0B57D0] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0B57D0] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="absolute right-3.5 top-3 text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Filter Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(cat.id)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  selectedCategory === cat.id
                    ? "bg-[#0B57D0] text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                {cat.label} ({cat.count})
              </button>
            ))}
          </div>

          {/* Topic Pills */}
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((top) => (
              <button
                key={top}
                type="button"
                onClick={() => handleTopicChange(top)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  selectedTopic === top
                    ? "bg-slate-900 text-white font-semibold"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {top}
              </button>
            ))}
          </div>
        </div>

        {/* Featured Live Dynamic Simulations Spotlight */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border-2 border-teal-500/40 bg-gradient-to-br from-teal-50/70 to-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-teal-600 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Featured 3D Twin &bull; ID 2236
                </span>
                <span className="text-[11px] font-mono text-teal-700 font-semibold">
                  WebGL Exploded View
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-2">
                Dynex Checkball Piston Pump
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Full 3D WebGL exploded view twin with rotating swashplate,
                holddown plate, reciprocating pistons, check valves, full-flow
                cover, and projected callout leader lines.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-teal-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Fixed Displacement Pumps
              </span>
              <Link
                href="/lesson/dynex-model-simulation"
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 text-xs font-bold transition-all shadow-xs"
              >
                <span>Launch 3D Sim</span>
                <span>&rarr;</span>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-[#0B57D0]/30 bg-gradient-to-br from-blue-50/60 to-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-[#0B57D0] text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Featured Digital Twin &bull; ID 1221
                </span>
                <span className="text-[11px] font-mono text-emerald-700 font-semibold">
                  Live Animated Rotation
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-2">
                Crescent Internal Gear Pump
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Rotating inner spur pinion meshing with internal ring gear,
                crescent stationary seal dividing suction and discharge, and
                moving fluid tooth pockets with real-time RPM modulation.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-blue-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Fixed Displacement Pumps
              </span>
              <Link
                href="/lesson/crescent-pump-simulation"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B57D0] hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold transition-all shadow-xs"
              >
                <span>Launch Interactive Sim</span>
                <span>&rarr;</span>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50/60 to-white p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Featured Digital Twin &bull; ID 686
                </span>
                <span className="text-[11px] font-mono text-blue-700 font-semibold">
                  P = F ÷ A Physics Twin
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-2">
                Force = Pressure × Area (Cylinder & Gear Pump)
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                10 GPM external gear pump driving double-acting cylinder pushing
                15,000 lbs load with 1500 PSI gauge, live stroke control,
                US/Metric/Bar units, and interactive damage injection.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-emerald-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Hydraulic Actuator Circuit
              </span>
              <Link
                href="/lesson/force-pressure-area"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-black text-white px-4 py-2 text-xs font-bold transition-all shadow-xs"
              >
                <span>Launch Interactive Sim</span>
                <span>&rarr;</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Results Metadata Bar */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>
            Showing <strong>{filteredMaterials.length}</strong> matching
            materials
            {selectedTopic !== "All Topics" && ` in ${selectedTopic}`}
            {searchQuery && ` for "${searchQuery}"`}
          </span>
          <span>
            Page {page} of {totalPages}
          </span>
        </div>

        {/* Materials Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedList.map((item) => {
            const isSimulation = item.category === "Simulation";
            const isLesson = item.category === "Lesson";
            const isQuiz = item.category === "Quiz";

            const itemHref =
              item.id === 2236 ||
              item.slug === "dynex-model-simulation" ||
              (item.slug && item.slug.includes("dynex"))
                ? "/lesson/dynex-model-simulation"
                : item.id === 1221 || item.slug === "crescent-pump-simulation"
                  ? "/lesson/crescent-pump-simulation"
                  : item.id === 1379 ||
                      item.id === 686 ||
                      (item.slug &&
                        (item.slug.includes("force") ||
                          item.slug.includes("gear-pump")))
                    ? "/lesson/force-pressure-area"
                    : isQuiz
                      ? "/assessment/asmt-hydraulics-l1"
                      : item.topic === "Automation Controllers"
                        ? "/lesson/lesson-plc-basics"
                        : item.topic === "Mobile Equipment"
                          ? "/lesson/lesson-mobile-braking"
                          : item.topic === "Electrical"
                            ? "/lesson/lesson-electrical-breakers"
                            : `/lesson/${item.slug || "lesson-hpu-startup"}`;

            return (
              <div
                key={item.id}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:border-[#0B57D0]/60 hover:shadow-sm transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 pb-2">
                    <span
                      className={`rounded-lg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        isSimulation
                          ? "bg-blue-50 text-[#0B57D0] border border-blue-100"
                          : isLesson
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : isQuiz
                              ? "bg-purple-50 text-purple-700 border border-purple-100"
                              : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {item.category}
                    </span>

                    <span className="text-[11px] font-mono text-slate-400">
                      ~{item.average_time || 15}m
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 group-hover:text-[#0B57D0] transition-colors line-clamp-2 mt-1">
                    {item.name}
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {item.topic}
                    </span>{" "}
                    &bull; {item.session}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400">
                    SOP Validated
                  </span>

                  <Link
                    href={itemHref}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 group-hover:bg-[#0B57D0] group-hover:text-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-all"
                  >
                    <span>
                      {isSimulation
                        ? "Launch Sim"
                        : isQuiz
                          ? "Take Quiz"
                          : "Start"}
                    </span>
                    <span>&rarr;</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredMaterials.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <svg
              className="mx-auto size-12 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <h3 className="mt-3 text-base font-bold text-slate-900">
              No materials found
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Try searching with different terms or selecting &quot;All
              Topics&quot;.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedTopic("All Topics");
                setSelectedCategory("all");
              }}
              className="mt-4 rounded-xl bg-[#0B57D0] px-4 py-2 text-xs font-bold text-white shadow-xs"
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-6 border-t border-slate-200">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              &larr; Previous Page
            </button>

            <span className="text-xs font-medium text-slate-500">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Next Page &rarr;
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

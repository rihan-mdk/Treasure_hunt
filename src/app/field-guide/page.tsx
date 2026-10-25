import type { Metadata } from "next";
import Link from "next/link";
import {
  Layers,
  HelpCircle,
  RotateCcw,
  Lightbulb,
  Unlock,
  Key,
  ShieldCheck,
  EyeOff,
  ArrowRight,
} from "lucide-react";
import { TopBar } from "@/components/navigation/TopBar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { StatusBadge } from "@/components/common/StatusBadge";

export const metadata: Metadata = {
  title: "Field Manual — Rules & Guidelines | The Hunt",
  description:
    "Learn the rules of The Hunt Expedition. Five levels, 45 challenges, 3 hints per level, and one hidden treasure.",
};

const operationalRules = [
  {
    icon: Layers,
    title: "Five Sequential Levels",
    detail:
      "The expedition is divided into 5 distinct stages totaling 45 required challenges. Each stage unlocks only after completing all challenges in the previous tier.",
  },
  {
    icon: HelpCircle,
    title: "45 Authoritative Challenges",
    detail:
      "Levels 1 through 4 contain exactly 10 questions each. Level 5 contains five sequentially connected finale clues.",
  },
  {
    icon: RotateCcw,
    title: "Unlimited Answer Attempts",
    detail:
      "Submit guesses as many times as required without penalties. Refine your decryption and keep testing hypotheses.",
  },
  {
    icon: Lightbulb,
    title: "Three Hints Per Level",
    detail:
      "Each level provides 3 tactical hints. Hints do not carry over between levels, so deploy them strategically.",
  },
  {
    icon: Unlock,
    title: "Instant Level Unlocks",
    detail:
      "Your squad advances the moment the final challenge of a sector is verified. All team devices reflect the unlock simultaneously.",
  },
  {
    icon: Key,
    title: "Final Physical Quest",
    detail:
      "Solving all 45 challenges reveals eligibility for the physical campus treasure. The first eligible team to verify in person wins.",
  },
  {
    icon: ShieldCheck,
    title: "Marshal Verification",
    detail:
      "Final victory is confirmed on-site by hunt marshals after verifying your squad credentials and physical token discovery.",
  },
  {
    icon: EyeOff,
    title: "No Public Leaderboard",
    detail:
      "Leaderboards are hidden to maintain genuine suspense. Trust your squad speed and focus solely on your trail.",
  },
];

const levels = [
  { num: 1, title: "The Warm-Up", codename: "PERIMETER ECHO", colour: "#00E5FF", clueCount: "10 Clues" },
  { num: 2, title: "Mind Games", codename: "SYNAPSE MATRIX", colour: "#dab9ff", clueCount: "10 Clues" },
  { num: 3, title: "Code Breakers", codename: "CIPHER VORTEX", colour: "#00E5FF", clueCount: "10 Clues" },
  { num: 4, title: "Master Puzzles", codename: "LABYRINTH PROTOCOL", colour: "#dab9ff", clueCount: "10 Clues" },
  { num: 5, title: "The Final Hunt", codename: "APEX OMEGA", colour: "#F5F3F7", clueCount: "5 Clues" },
];

export default function FieldGuidePage() {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col justify-between">
      <TopBar title="Field Manual" showBack backHref="/" />

      <main className="flex-1 pt-18 pb-24 px-4 max-w-lg mx-auto w-full">
        {/* Header Briefing */}
        <div className="py-4">
          <div className="flex items-center gap-2 mb-3">
            <StatusBadge status="active" showDot>
              EXPEDITION BRIEFING
            </StatusBadge>
          </div>

          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F3F7] mb-2"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Rules of Engagement
          </h1>
          <p className="text-[14px] text-[#A8A1B0] leading-relaxed">
            Review these protocols before deploying into the field. Knowing how the grid behaves is your best tactical advantage.
          </p>
        </div>

        {/* Level Map */}
        <section className="mb-6">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest text-[#A8A1B0] mb-3 px-1"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            Mission Progression // 5 Tiers (45 Challenges)
          </p>
          <div className="flex flex-col gap-2">
            {levels.map((lvl) => (
              <div
                key={lvl.num}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-[#110B18] border border-white/[0.07]"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0"
                  style={{
                    backgroundColor: `${lvl.colour}15`,
                    color: lvl.colour,
                    fontFamily: "var(--font-jetbrains-mono)",
                  }}
                >
                  0{lvl.num}
                </div>
                <div className="min-w-0">
                  <p
                    className="font-semibold text-[14px] text-[#F5F3F7] leading-tight"
                    style={{ fontFamily: "var(--font-space-grotesk)" }}
                  >
                    {lvl.title}
                  </p>
                  <p
                    className="text-[10px] text-[#A8A1B0] uppercase tracking-wider"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    {lvl.codename}
                  </p>
                </div>
                <span
                  className="ml-auto text-[11px] font-semibold text-[#A8A1B0] shrink-0"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {lvl.clueCount}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Operational Rules */}
        <section className="mb-8">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest text-[#A8A1B0] mb-3 px-1"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            Field Directives
          </p>
          <div className="flex flex-col gap-2.5">
            {operationalRules.map((rule, idx) => {
              const Icon = rule.icon;
              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-[#110B18] border border-white/[0.07] flex items-start gap-3.5"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#3B0A6B]/30 border border-[#3B0A6B]/60 flex items-center justify-center shrink-0 text-[#00E5FF] mt-0.5">
                    <Icon size={16} />
                  </div>
                  <div>
                    <h2
                      className="font-semibold text-[14px] text-[#F5F3F7] mb-0.5"
                      style={{ fontFamily: "var(--font-space-grotesk)" }}
                    >
                      {rule.title}
                    </h2>
                    <p className="text-[13px] text-[#A8A1B0] leading-relaxed">
                      {rule.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <div className="pb-4">
          <Link
            href="/login"
            className="w-full h-12 rounded-xl bg-[#00E5FF] text-[#050505] font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,229,255,0.25)] hover:bg-[#38ecff] transition-all"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            <span>Deploy to Squad Login</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

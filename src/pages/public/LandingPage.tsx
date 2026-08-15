import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { BOARD_TYPES } from '@/config/boardTypes';

const SAMPLE = [
  { text: 'Your are the best!', from: 'lamb', tone: 'bg-zap' },
  { text: 'Hilarious and Smart', from: 'danke', tone: 'bg-card' },
  { text: 'You made the onboarding doc that saved my first month.', from: 'benjmain Tesla', tone: 'bg-aqua' },
];

export default function LandingPage() {
  return (
    <div className="grain min-h-dvh">
      <main className="relative z-10 mx-auto max-w-5xl px-5 py-16 sm:py-24">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="pill mx-auto w-fit bg-card"
        >
          <Sparkles className="h-3 w-3" />
          powered by rAvivek
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="mx-auto mt-6 max-w-3xl text-center text-[clamp(2.6rem,9vw,5.5rem)] leading-[0.92]"
        >
          Say the nice thing{' '}
          <span className="relative inline-block">
            out loud
            <svg
              viewBox="0 0 300 20"
              className="absolute -bottom-2 left-0 w-full"
              aria-hidden
              preserveAspectRatio="none"
            >
              <path
                d="M4 14C60 4 240 4 296 12"
                stroke="rgb(var(--hype))"
                strokeWidth="7"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mx-auto mt-8 max-w-lg text-center text-lg text-muted"
        >
          Someone is leaving, turning thirty, or shipping the thing. Spin up a board, drop the link
          in the channel, and let the team fill it.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="mt-9 flex flex-wrap justify-center gap-3"
        >
          <Link
            to="/admin"
            className="inline-flex h-14 items-center gap-2 rounded-full border-2 border-ink bg-hype px-7 font-display text-base font-extrabold text-white shadow-pop-lg sticker-lift"
          >
            Open the admin
            <ArrowRight className="h-5 w-5" />
          </Link>
        </motion.div>

        {/* Three sample cards, tilted, doing the job a screenshot usually does. */}
        <div className="mt-20 grid gap-5 sm:grid-cols-3">
          {SAMPLE.map((card, i) => (
            <motion.figure
              key={card.from}
              initial={{ opacity: 0, y: 28, rotate: 0 }}
              animate={{ opacity: 1, y: 0, rotate: [-2.5, 1.5, -1][i] }}
              transition={{ delay: 0.3 + i * 0.1, type: 'spring', stiffness: 200, damping: 20 }}
              whileHover={{ rotate: 0, y: -6 }}
              className={`relative rounded-2xl border-2 border-ink p-5 shadow-pop tape ${card.tone}`}
            >
              <blockquote className="pt-3 text-[15px] leading-relaxed">{card.text}</blockquote>
              <figcaption className="mt-4 font-mono text-[11px] uppercase tracking-widest">
                From {card.from}
              </figcaption>
            </motion.figure>
          ))}
        </div>

        <section className="mt-24 text-center">
          <h2 className="text-2xl">Every excuse is covered</h2>
          <ul className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
            {BOARD_TYPES.map((t) => (
              <li key={t.id} className="pill bg-card">
                <span aria-hidden>{t.sticker}</span>
                {t.label}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

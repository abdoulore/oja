// Small shared primitives: scroll reveal, springing number ticker, buttons.
import { useEffect, useRef } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function NumberTicker({ value, dp = 0 }: { value: number; dp?: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 80, damping: 24 });
  const text = useTransform(spring, v =>
    v.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 }),
  );
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.jump(value);
      return;
    }
    mv.set(value);
  }, [inView, value, reduce, mv]);

  return <motion.span ref={ref}>{text}</motion.span>;
}

const CTA_BASE =
  "inline-flex items-center gap-2 px-5 py-3 font-mono text-[13px] tracking-[0.04em] " +
  "transition-colors duration-150 active:translate-y-px select-none whitespace-nowrap";

export function PrimaryCta({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`${CTA_BASE} bg-amber text-ink font-bold hover:bg-[#ffbe5c]`}
    >
      {children}
    </a>
  );
}

export function GhostCta({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`${CTA_BASE} border border-grid text-body hover:border-amber hover:text-amber`}
    >
      {children}
    </a>
  );
}

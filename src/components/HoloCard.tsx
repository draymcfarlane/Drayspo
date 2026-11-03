import { motion, useMotionValue, useSpring } from "framer-motion";
import { useAppReady } from "@/lib/app-ready";
import { useLiquidMotion } from "./Liquid";
import { useConfig } from "@/config/ConfigProvider";

// Holographic ID card that tilts with the pointer and floats skill tags.
export function HoloCard() {
  const { config, intensity } = useConfig();
  const ready = useAppReady();
  const motionAllowed = useLiquidMotion();
  const c = config.content;
  const x = useMotionValue(4),
    y = useMotionValue(-10);
  const rx = useSpring(x, { stiffness: 120, damping: 20 }),
    ry = useSpring(y, { stiffness: 120, damping: 20 });
  const gx = useMotionValue("50%"),
    gy = useMotionValue("35%");
  return (
    <motion.div
      className="holo-stage"
      data-motion={ready && intensity > 0}
      initial={false}
      animate={motionAllowed && !ready ? { opacity: 0, y: 90 * intensity, rotate: 4 * intensity, scaleY: 1 + .18 * intensity, filter: `blur(${14 * intensity}px)` } : { opacity: 1, y: 0, rotate: 0, scaleY: 1, filter: "blur(0px)" }}
      transition={motionAllowed && ready ? { type: "spring", stiffness: 60, damping: 13, mass: 1.1, delay: .35 } : { duration: 0 }}
    >
      <motion.div
        className="holo-card"
        style={
          {
            rotateX: intensity ? rx : 0,
            rotateY: intensity ? ry : 0,
            "--glare-x": gx,
            "--glare-y": gy,
          } as never
        }
        onPointerMove={(e) => {
          if (
            !intensity ||
            !config.animation.enableCursorEffects ||
            !window.matchMedia("(pointer: fine)").matches
          )
            return;
          const r = e.currentTarget.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width,
            py = (e.clientY - r.top) / r.height;
          x.set((0.5 - py) * 18 * intensity);
          y.set((px - 0.5) * 24 * intensity);
          gx.set(`${px * 100}%`);
          gy.set(`${py * 100}%`);
        }}
        onPointerLeave={() => {
          x.set(4);
          y.set(-10);
          gx.set("50%");
          gy.set("35%");
        }}
      >
        <div className="holo-strip">
          <span>{c.holo.label}</span>
          <span>{c.holo.stamp}</span>
        </div>
        <img
          className="holo-photo"
          data-cutout={c.holo.cutout}
          src={c.holo.photoUrl}
          alt={`Portrait of ${c.name}`}
          width={380}
          height={540}
          fetchPriority="high"
        />
        <svg
          className="holo-wave wave-back"
          viewBox="0 0 760 180"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 60 Q95 0 190 60 T380 60 T570 60 T760 60 V180 H0Z" />
        </svg>
        <svg
          className="holo-wave wave-front"
          viewBox="0 0 760 180"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 70 Q95 125 190 70 T380 70 T570 70 T760 70 V180 H0Z" />
        </svg>
        <div className="holo-info">
          <div>
            <p>{c.name}</p>
            <span>{c.title}</span>
          </div>
          <small>{c.holo.credential}</small>
        </div>
        <div className="holo-glare" aria-hidden="true" />
        <div className="holo-sheen" aria-hidden="true" />
      </motion.div>
      {c.skills[0]?.items.slice(0, 3).map((skill, i) => (
        <span key={skill} className={`holo-chip chip-${i}`}>
          {skill}
        </span>
      ))}
    </motion.div>
  );
}

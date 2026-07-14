import {
  mix,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  MotionValue,
} from "motion/react";
import React, { useEffect, useRef, useId } from "react";
import { Filter } from "./Filter";

type Size = "sm" | "md" | "lg" | number;

interface ThemeSwitchProps {
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: Size;
}

const SIZE_SCALES: Record<"sm" | "md" | "lg", number> = {
  sm: 0.45,
  md: 0.6,
  lg: 1,
};

const SLIDER_HEIGHT = 67;
const SLIDER_WIDTH = 160;
const THUMB_WIDTH = 146;
const THUMB_HEIGHT = 92;
const THUMB_RADIUS = THUMB_HEIGHT / 2;

export const ThemeSwitch: React.FC<ThemeSwitchProps> = ({
  defaultChecked = false,
  onChange,
  size = "md",
}) => {
  const filterId = useId();
  const scale = typeof size === "number" ? size : SIZE_SCALES[size];

  const sliderRef = useRef<HTMLDivElement>(null);

  const THUMB_REST_SCALE = 0.65;
  const THUMB_ACTIVE_SCALE = 1;
  const THUMB_REST_OFFSET = ((1 - THUMB_REST_SCALE) * THUMB_WIDTH) / 2;
  const TRAVEL = SLIDER_WIDTH - SLIDER_HEIGHT - (THUMB_WIDTH - THUMB_HEIGHT) * THUMB_REST_SCALE;

  const getInitialChecked = (): number => {
    if (typeof window === "undefined") return defaultChecked ? 1 : 0;
    const currentTheme = localStorage.getItem("theme");
    if (currentTheme) return currentTheme === "dark" ? 1 : 0;
    const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return isSystemDark ? 1 : 0;
  };

  const checked = useMotionValue(getInitialChecked());
  const pointerDown = useMotionValue(0);
  const forceActive = useMotionValue(false);
  const xDragRatio = useMotionValue(0);
  const initialPointerX = useMotionValue(0);
  const startDragRatio = useMotionValue(0);
  const previousPointerX = useMotionValue(0);
  const velocityX = useMotionValue(0);

  const targetX = useTransform(
    () => {
      const pd = pointerDown.get();
      const drag = xDragRatio.get();
      const chk = checked.get();
      return pd > 0.5 ? drag : chk;
    }
  ) as MotionValue<number>;

  const xRatio = useSpring(targetX, { damping: 40, stiffness: 500 });

  const isLiquid = useTransform(
    () => {
      const x = xRatio.get();
      const c = checked.get();
      const pd = pointerDown.get();
      if (forceActive.get() || pd > 0.5) return 1;
      return Math.abs(x - c) > 0.08 ? 1 : 0;
    }
  ) as MotionValue<number>;

  const liquidEffect = useSpring(isLiquid, {
    stiffness: 400,
    damping: 35,
  });

  const objectScale = useTransform(liquidEffect, [0, 1], [THUMB_REST_SCALE, THUMB_ACTIVE_SCALE]);
  const backgroundOpacity = useTransform(liquidEffect, [0, 1], [1, 0.05]);

  const smoothedVelocity = useSpring(velocityX, { stiffness: 300, damping: 40 });
  const objectScaleY = useTransform(() => {
    const base = objectScale.get();
    const vel = Math.abs(smoothedVelocity.get());
    const stretch = Math.min(vel / 2500, 0.3);
    return base * (1 - stretch);
  });
  const objectScaleX = useTransform(() => {
    const base = objectScale.get();
    const sy = objectScaleY.get();
    return base + (base - sy) * 1.6;
  });

  const blur = useMotionValue(0.2);
  const specularOpacity = useMotionValue(0.5);
  const specularSaturation = useMotionValue(6);
  const refractionBase = useMotionValue(1);
  const magnifyingScale = useTransform(liquidEffect, [0, 1], [12, -12]);
  const scaleRatio = useTransform(() => (0.4 + 0.5 * liquidEffect.get()) * refractionBase.get());

  const backgroundColor = useTransform(
    xRatio,
    (value) => value > 0.5 ? "#3BBF4EEE" : "#94949F77"
  );

  const boxShadow = useTransform(liquidEffect, (v) => {
    const alpha = mix(0.12, 0.25, v);
    const blurVal = mix(6, 28, v);
    const sy = mix(4, 18, v);
    const insetAlpha = mix(0, 0.4, v);
    const outer = `0px ${sy}px ${blurVal}px rgba(0,0,0,${alpha})`;
    const inset = v > 0.1
      ? `, inset 4px 10px 20px rgba(0,0,0,${insetAlpha}), inset -4px -10px 20px rgba(255,255,255,${insetAlpha})`
      : '';

    return outer + inset;
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    pointerDown.set(1);
    initialPointerX.set(e.clientX);
    previousPointerX.set(e.clientX);
    startDragRatio.set(xRatio.get());
    xDragRatio.set(xRatio.get());
  };

  const handleToggle = (newChecked: number) => {
    checked.set(newChecked);
    onChange?.(newChecked > 0.5);
  };

  useEffect(() => {
    const handleGlobalUpdate = (e: MouseEvent | TouchEvent) => {
      if (pointerDown.get() < 0.5) return;

      const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
      const displacementX = clientX - initialPointerX.get();
      const ratio = startDragRatio.get() + displacementX / TRAVEL;

      xDragRatio.set(Math.min(1.1, Math.max(-0.1, ratio)));

      const currentVel = clientX - previousPointerX.get();
      velocityX.set(currentVel * 12);
      previousPointerX.set(clientX);
    };

    const handleGlobalUp = (e: MouseEvent | TouchEvent) => {
      if (pointerDown.get() < 0.5) return;

      const clientX = e instanceof MouseEvent ? e.clientX : e.changedTouches[0].clientX;
      const distance = Math.abs(clientX - initialPointerX.get());

      pointerDown.set(0);
      velocityX.set(0);

      if (distance > 5) {
        handleToggle(xDragRatio.get() > 0.5 ? 1 : 0);
      }
    };

    window.addEventListener("mousemove", handleGlobalUpdate);
    window.addEventListener("touchmove", handleGlobalUpdate, { passive: false });
    window.addEventListener("mouseup", handleGlobalUp);
    window.addEventListener("touchend", handleGlobalUp);

    return () => {
      window.removeEventListener("mousemove", handleGlobalUpdate);
      window.removeEventListener("touchmove", handleGlobalUpdate);
      window.removeEventListener("mouseup", handleGlobalUp);
      window.removeEventListener("touchend", handleGlobalUp);
    };
  }, [TRAVEL]);

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        transformOrigin: "center",
      }}
      className="touch-none"
    >
      <motion.div
        ref={sliderRef}
        style={{
          width: SLIDER_WIDTH,
          height: SLIDER_HEIGHT,
          backgroundColor,
          borderRadius: SLIDER_HEIGHT / 2,
          position: "relative",
          cursor: "pointer",
        }}
        onClick={(e) => {
          const distance = Math.abs(e.clientX - initialPointerX.get());
          if (distance < 5) {
            handleToggle(checked.get() < 0.5 ? 1 : 0);
          }
        }}
      >
        {typeof window !== "undefined" && (
          <Filter
            id={filterId}
            blur={blur}
            scaleRatio={scaleRatio}
            specularOpacity={specularOpacity}
            specularSaturation={specularSaturation}
            magnifyingScale={magnifyingScale}
            width={THUMB_WIDTH}
            height={THUMB_HEIGHT}
            radius={THUMB_RADIUS}
            bezelWidth={19}
            glassThickness={47}
            bezelType="lip"
            refractiveIndex={1.5}
          />
        )}

        <motion.div
          className="absolute"
          onPointerDown={handlePointerDown}
          style={{
            height: THUMB_HEIGHT,
            width: THUMB_WIDTH,
            left: (SLIDER_HEIGHT - THUMB_HEIGHT * THUMB_REST_SCALE) / 2 - THUMB_REST_OFFSET,
            x: useTransform(() => xRatio.get() * TRAVEL),
            y: "-50%",
            top: "50%",
            borderRadius: THUMB_RADIUS,
            backdropFilter: `url(#${filterId})`,
            scaleX: objectScaleX,
            scaleY: objectScaleY,
            backgroundColor: useTransform(backgroundOpacity, (op) => `rgba(255, 255, 255, ${op})`),
            boxShadow,
          }}
        />
      </motion.div>
    </div>
  );
};
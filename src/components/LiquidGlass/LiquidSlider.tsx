import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  useVelocity,
  useMotionValueEvent,
} from "motion/react";
import React, { useEffect, useRef, useCallback, useId } from "react";
import { Filter } from "./Filter";

type Size = "sm" | "md" | "lg" | number;

interface LiquidSliderProps {
  size?: Size;
  width?: number;
  fillContainer?: boolean;
  defaultValue?: number;
  onChange?: (value: number, mappedValue: number) => void;
  showPercentage?: boolean;
  showMappedValue?: boolean;
}

const SIZE_SCALES: Record<"sm" | "md" | "lg", number> = {
  sm: 0.5,
  md: 0.75,
  lg: 1,
};

const DEFAULT_SLIDER_WIDTH = 480;
const THUMB_WIDTH = 90;
const THUMB_HEIGHT = 60;
const THUMB_RADIUS = 30;
const SLIDER_HEIGHT = 10;

export const LiquidSlider: React.FC<LiquidSliderProps> = ({
  size = "md",
  width = DEFAULT_SLIDER_WIDTH,
  fillContainer = false,
  defaultValue = 50,
  onChange,
  showPercentage = false,
  showMappedValue = false,
}) => {
  const filterId = useId();
  const scale = typeof size === "number" ? size : SIZE_SCALES[size];
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(width);

  React.useEffect(() => {
    if (!fillContainer) return;

    const updateWidth = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect && rect.width > 0) {
        setContainerWidth(rect.width / scale);
      }
    };

    const timer = setTimeout(() => {
      updateWidth();
    }, 100);

    window.addEventListener("resize", updateWidth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateWidth);
    };
  }, [fillContainer, scale]);

  const sliderWidth = fillContainer ? containerWidth : width;

  const scaledThumbWidth = THUMB_WIDTH * scale;
  const scaledThumbHeight = THUMB_HEIGHT * scale;
  const scaledThumbRadius = THUMB_RADIUS * scale;
  const scaledSliderHeight = SLIDER_HEIGHT * scale;
  const scaledSliderWidth = sliderWidth * scale;

  const MAX_STRETCH = scaledSliderWidth * 0.1;
  const STRETCH_RESISTANCE = 0.4;

  const SCALE_REST = 0.6;
  const SCALE_DRAG = 1;
  const thumbWidthRest = scaledThumbWidth * SCALE_REST;

  const maxDragDistance = scaledSliderWidth - scaledThumbWidth;

  const constraintsLeft = -thumbWidthRest / 3;
  const constraintsRight = maxDragDistance + thumbWidthRest / 3;
  const totalSlideRange = constraintsRight - constraintsLeft;

  const valueToX = useCallback((targetValue: number) => {
    const easedProgress = Math.max(0, Math.min(1, targetValue / 100));
    let linearProgress;

    if (easedProgress < 0.1) {
      linearProgress = (easedProgress / 0.1) * 0.05;
    } else if (easedProgress <= 0.9) {
      linearProgress = 0.05 + ((easedProgress - 0.1) / 0.8) * 0.9;
    } else {
      linearProgress = 0.95 + ((easedProgress - 0.9) / 0.1) * 0.05;
    }

    return constraintsLeft + linearProgress * totalSlideRange;
  }, [constraintsLeft, totalSlideRange]);

  const initialX = valueToX(defaultValue);
  const x = useMotionValue(initialX);
  const velocityX = useVelocity(x);
  const pointerDown = useMotionValue(0);
  const forceActive = useMotionValue(false);

  useEffect(() => {
    if (!fillContainer) return;
    const targetX = valueToX(value.get());
    x.set(targetX);
  }, [sliderWidth, fillContainer, valueToX, x]);

  const isUp = useTransform((): number =>
    forceActive.get() || pointerDown.get() > 0.5 ? 1 : 0
  );

  const overshoot = useMotionValue(0);

  const value = useMotionValue(defaultValue);

  useMotionValueEvent(x, "change", (latestX) => {
    const rawProgress = (latestX - constraintsLeft) / totalSlideRange;
    const linearProgress = Math.max(0, Math.min(1, rawProgress));

    let easedProgress;
    if (linearProgress < 0.05) {
      easedProgress = (linearProgress / 0.05) * 0.1;
    } else if (linearProgress <= 0.95) {
      const middleProgress = (linearProgress - 0.05) / 0.9;
      easedProgress = 0.1 + middleProgress * 0.8;
    } else {
      const rightProgress = (linearProgress - 0.95) / 0.05;
      easedProgress = 0.9 + rightProgress * 0.1;
    }

    const currentValue = Math.max(0, Math.min(100, easedProgress * 100));
    value.set(currentValue);

    let mappedValue = 0;
    if (currentValue < 10) {
      mappedValue = 0;
    } else if (currentValue > 90) {
      mappedValue = 100;
    } else {
      mappedValue = ((currentValue - 10) / 80) * 100;
    }

    onChange?.(Math.round(mappedValue), Math.round(currentValue));

    if (pointerDown.get() > 0.5) {
      let over = 0;
      if (latestX < constraintsLeft) {
        over = latestX - constraintsLeft;
      } else if (latestX > constraintsRight) {
        over = latestX - constraintsRight;
      }
      overshoot.set(over);
    }
  });

  const overshootSpring = useSpring(overshoot, { stiffness: 400, damping: 30 });

  const trackScaleY = useTransform(overshootSpring, (x) => {
    const damped = Math.max(-MAX_STRETCH, Math.min(MAX_STRETCH, x * STRETCH_RESISTANCE));
    const v = 1 - Math.abs(damped) / (scaledSliderWidth * 1.5);
    return Math.max(0.8, v);
  });

  const trackXStyle = useTransform(overshootSpring, (o) => {
    const stretch = Math.min(Math.abs(o * STRETCH_RESISTANCE), MAX_STRETCH);
    const sign = Math.sign(o);
    if (sign > 0) {
      return stretch * 0.8;
    } else {
      return -stretch - (stretch * 0.8);
    }
  });

  const blur = useMotionValue(0);
  const specularOpacity = useMotionValue(0.4);
  const specularSaturation = useMotionValue(7);
  const refractionBase = useMotionValue(1);
  const pressMultiplier = useTransform(isUp, [0, 1], [0.4, 0.9]);

  const scaleRatio = useSpring(
    useTransform(
      [pressMultiplier, refractionBase],
      ([m, base]) => (Number(m) || 0) * (Number(base) || 0)
    )
  );

  const magnifyingScale: undefined = undefined;

  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const baseScale = useSpring(
    useTransform(isUp, [0, 1], [SCALE_REST, SCALE_DRAG]),
    { stiffness: 340, damping: 20 }
  );

  const objectScaleY = useTransform(
    [baseScale, velocityX],
    ([s, v]) => {
      const velocityFactor = Math.abs(v as number) / 3000;
      const deformation = 1 - Math.min(velocityFactor, 0.3);
      return (s as number) * deformation;
    }
  );

  const objectScaleX = useTransform(
    [baseScale, objectScaleY],
    ([s, sy]) => {
      const currentScale = s as number;
      const currentScaleY = sy as number;
      return currentScale + (currentScale - currentScaleY);
    }
  );

  const backgroundOpacity = useSpring(useTransform(isUp, [0, 1], [1, 0.1]), { stiffness: 340, damping: 20 });
  const shadowSx = useSpring(useTransform(isUp, [0, 1], [0, 4 * scale]), { stiffness: 340, damping: 30 });
  const shadowSy = useSpring(useTransform(isUp, [0, 1], [0, 4 * scale]), { stiffness: 340, damping: 30 });
  const shadowAlpha = useSpring(useTransform(isUp, [0, 1], [0.16, 0.22]), { stiffness: 220, damping: 24 });
  const insetShadowAlpha = useSpring(useTransform(isUp, [0, 1], [0, 0.27]), { stiffness: 220, damping: 24 });
  const shadowBlur = useSpring(useTransform(isUp, [0, 1], [9 * scale, 24 * scale]), { stiffness: 340, damping: 30 });

  const boxShadow = useTransform(() => {
    const inset = isUp.get() > 0.5
      ? `inset ${shadowSx.get() / 2}px ${shadowSy.get() / 2}px ${24 * scale}px rgba(0,0,0,${insetShadowAlpha.get()}),
         inset ${-shadowSx.get() / 2}px ${-shadowSy.get() / 2}px ${24 * scale}px rgba(255,255,255,${insetShadowAlpha.get()})`
      : '';
    return `${shadowSx.get()}px ${shadowSy.get()}px ${shadowBlur.get()}px rgba(0,0,0,${shadowAlpha.get()})${inset ? ', ' + inset : ''}`;
  });

  useEffect(() => {
    function onPointerUp() {
      pointerDown.set(0);
      animate(overshoot, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("mouseup", onPointerUp);
    window.addEventListener("touchend", onPointerUp);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("mouseup", onPointerUp);
      window.removeEventListener("touchend", onPointerUp);
    };
  }, []);

  const percentageText = useTransform(value, (v) => `${Math.round(v)}%`);

  const mappedPercentageText = useTransform(value, (v) => {
    let mapped = 0;
    if (v < 10) {
      mapped = 0;
    } else if (v > 90) {
      mapped = 100;
    } else {
      mapped = ((v - 10) / 80) * 100;
    }
    return `${Math.round(mapped)}%`;
  });

  return (
    <div
      ref={containerRef}
      style={{
        width: fillContainer ? "100%" : scaledSliderWidth,
        height: scaledThumbHeight + (showPercentage || showMappedValue ? 60 * scale : 0),
        position: "relative",
      }}
      className="touch-none"
    >
      <motion.div style={{ position: "relative", width: scaledSliderWidth, height: scaledThumbHeight }}>
        <motion.div
          ref={trackRef}
          style={{
            display: "inline-block",
            height: scaledSliderHeight,
            left: 0,
            top: (scaledThumbHeight - scaledSliderHeight) / 2,
            backgroundColor: "#89898F66",
            borderRadius: scaledSliderHeight / 2,
            position: "absolute",
            cursor: "pointer",
            width: useTransform(overshootSpring, (o) => {
              const stretch = Math.min(Math.abs(o * STRETCH_RESISTANCE), MAX_STRETCH);
              return scaledSliderWidth + stretch;
            }),
            x: trackXStyle,
            scaleY: trackScaleY,
            originX: 0,
          }}
        >
          <div className="w-full h-full overflow-hidden rounded-full">
            <motion.div
              style={{
                top: 0,
                left: 0,
                height: scaledSliderHeight,
                width: useTransform(value, (v) => `${v}%`),
                borderRadius: scaledSliderHeight / 2,
                backgroundColor: "#0377F7",
              }}
            />
          </div>
        </motion.div>

        {typeof window !== "undefined" && (
          <Filter
            id={filterId}
            blur={blur}
            scaleRatio={scaleRatio}
            specularOpacity={specularOpacity}
            specularSaturation={specularSaturation}
            magnifyingScale={magnifyingScale}
            width={scaledThumbWidth}
            height={scaledThumbHeight}
            radius={scaledThumbRadius}
            bezelWidth={16 * scale}
            glassThickness={80 * scale}
            refractiveIndex={1.45}
          />
        )}

        <motion.div
          ref={thumbRef}
          drag="x"
          dragElastic={0.1}
          dragMomentum={true}
          dragTransition={{ power: 0.15, timeConstant: 250 }}
          dragConstraints={{
            left: constraintsLeft,
            right: constraintsRight,
          }}
          onMouseDown={() => pointerDown.set(1)}
          onMouseUp={() => pointerDown.set(0)}
          onDragStart={() => {
            pointerDown.set(1);
          }}
          onDragEnd={() => {
            pointerDown.set(0);

            const SNAP_THRESHOLD = 30 * scale;
            const currentX = x.get();
            let targetValue: number | null = null;

            if (currentX < SNAP_THRESHOLD) {
              targetValue = 0;
            } else if (currentX > maxDragDistance - SNAP_THRESHOLD) {
              targetValue = 100;
            }

            if (targetValue !== null) {
              const targetX = valueToX(targetValue);
              animate(x, targetX, {
                type: "spring",
                stiffness: 400,
                damping: 30,
              });
            }

            animate(overshoot, 0, { type: "spring", stiffness: 400, damping: 30 });
          }}
          className="absolute"
          style={{
            height: scaledThumbHeight,
            width: scaledThumbWidth,
            top: 0,
            borderRadius: scaledThumbRadius,
            backdropFilter: `url(#${filterId})`,
            scaleX: objectScaleX,
            scaleY: objectScaleY,
            cursor: "pointer",
            backgroundColor: useTransform(
              backgroundOpacity,
              (op) => `rgba(255, 255, 255, ${op})`
            ),
            boxShadow,
            x,
          }}
        />
      </motion.div>

      {(showPercentage || showMappedValue) && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
          {showMappedValue && (
            <motion.span className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              {mappedPercentageText}
            </motion.span>
          )}
          {showPercentage && (
            <motion.span className="font-mono text-sm text-black/60 dark:text-white/60 tabular-nums">
              {percentageText}
            </motion.span>
          )}
        </div>
      )}
    </div>
  );
};
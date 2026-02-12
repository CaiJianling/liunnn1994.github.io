import {
  mix,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  MotionValue,
} from "motion/react";
import React, { useEffect, useRef } from "react";
import { Filter } from "./Filter";

export const Switch: React.FC = () => {
  // --- 常量设定 ---
  const sliderHeight = 67;
  const sliderWidth = 160;
  const thumbWidth = 146;
  const thumbHeight = 92;
  const thumbRadius = thumbHeight / 2;
  const sliderRef = useRef<HTMLDivElement>(null);

  const THUMB_REST_SCALE = 0.65;
  const THUMB_ACTIVE_SCALE = 1;
  const THUMB_REST_OFFSET = ((1 - THUMB_REST_SCALE) * thumbWidth) / 2;
  const TRAVEL = sliderWidth - sliderHeight - (thumbWidth - thumbHeight) * THUMB_REST_SCALE;

  // --- 核心状态 ---
  const checked = useMotionValue(1);
  const pointerDown = useMotionValue(0);
  const forceActive = useMotionValue(false);
  const xDragRatio = useMotionValue(0);
  const initialPointerX = useMotionValue(0);
  const startDragRatio = useMotionValue(0);
  const previousPointerX = useMotionValue(0);
  const velocityX = useMotionValue(0);

  // --- 物理模拟控制 ---

  // 1. 位置控制：显式监听 pointerDown, xDragRatio 和 checked
  const targetX = useTransform(
    () => {
      const pd = pointerDown.get();
      const drag = xDragRatio.get();
      const chk = checked.get();
      return pd > 0.5 ? drag : chk;
    }
  ) as MotionValue<number>;

  const xRatio = useSpring(targetX, { damping: 40, stiffness: 500 });

  // 2. 液化逻辑：通过显式数组依赖确保实时计算
  const isLiquid = useTransform(
    () => {
      const x = xRatio.get();
      const c = checked.get();
      const pd = pointerDown.get();
      if (forceActive.get() || pd > 0.5) return 1;
      // 这里的 0.08 决定了何时从玻璃变回白块，数值越大变回来的越早（体感停顿越短）
      return Math.abs(x - c) > 0.08 ? 1 : 0;
    }
  ) as MotionValue<number>;

  // 3. 凝固动画：控制从玻璃变回白色椭圆的过程
  const liquidEffect = useSpring(isLiquid, {
    stiffness: 400, // 适中的恢复速度
    damping: 35,
  });

  // --- 视觉表现参数 ---

  const objectScale = useTransform(liquidEffect, [0, 1], [THUMB_REST_SCALE, THUMB_ACTIVE_SCALE]);
  const backgroundOpacity = useTransform(liquidEffect, [0, 1], [1, 0.05]);

  // 速度产生的物理形变
  const smoothedVelocity = useSpring(velocityX, { stiffness: 300, damping: 40 });
  const objectScaleY = useTransform(() => {
    const base = objectScale.get();
    const vel = Math.abs(smoothedVelocity.get());
    const stretch = Math.min(vel / 2500, 0.3); // 稍微增加了一点拉伸感
    return base * (1 - stretch);
  });
  const objectScaleX = useTransform(() => {
    const base = objectScale.get();
    const sy = objectScaleY.get();
    return base + (base - sy) * 1.6;
  });

  // 滤镜参数
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

  // 增强版多重动态阴影
  const boxShadow = useTransform(liquidEffect, (v) => {
    const alpha = mix(0.12, 0.25, v);
    const blurVal = mix(6, 28, v);
    const sy = mix(4, 18, v);
    const insetAlpha = mix(0, 0.4, v); // 增强内阴影深度
    const outer = `0px ${sy}px ${blurVal}px rgba(0,0,0,${alpha})`;
    const inset = v > 0.1
      ? `, inset 4px 10px 20px rgba(0,0,0,${insetAlpha}), inset -4px -10px 20px rgba(255,255,255,${insetAlpha})`
      : '';

    return outer + inset;
  });

  // --- 交互逻辑 ---
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    pointerDown.set(1);
    initialPointerX.set(e.clientX);
    previousPointerX.set(e.clientX);
    // 关键修复：从当前物理位置开始计算拖拽，而不是从状态位开始
    startDragRatio.set(xRatio.get());
    xDragRatio.set(xRatio.get());
  };

  useEffect(() => {
    const handleGlobalUpdate = (e: MouseEvent | TouchEvent) => {
      if (pointerDown.get() < 0.5) return;

      const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
      const displacementX = clientX - initialPointerX.get();
      // 基于开始时的 ratio 进行累加位移
      const ratio = startDragRatio.get() + displacementX / TRAVEL;

      xDragRatio.set(Math.min(1.1, Math.max(-0.1, ratio)));

      const currentVel = clientX - previousPointerX.get();
      velocityX.set(currentVel * 12); // 增强速度反馈
      previousPointerX.set(clientX);
    };

    const handleGlobalUp = (e: MouseEvent | TouchEvent) => {
      if (pointerDown.get() < 0.5) return;

      const clientX = e instanceof MouseEvent ? e.clientX : e.changedTouches[0].clientX;
      const distance = Math.abs(clientX - initialPointerX.get());

      pointerDown.set(0);
      velocityX.set(0);

      // 如果有位移，根据位置判定 checked；如果是点击，由 onClick 处理
      if (distance > 5) {
        checked.set(xDragRatio.get() > 0.5 ? 1 : 0);
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
    <>
      <div
        className="relative h-96 flex justify-center items-center rounded-xl -ml-[15px] w-[calc(100%+30px)] select-none text-black/5 dark:text-white/5 [--bg1:#f8fafc] [--bg2:#e7eeef] dark:[--bg1:#1b1b22] dark:[--bg2:#0f0f14] border border-black/10 dark:border-white/10 touch-none"
        style={{
          backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px), radial-gradient(120% 100% at 10% 0%, var(--bg1), var(--bg2))",
          backgroundSize: "24px 24px, 24px 24px, 100% 100%",
          backgroundPosition: "12px 12px, 12px 12px, 0 0",
        }}
      >
        <motion.div
          ref={sliderRef}
          style={{
            width: sliderWidth,
            height: sliderHeight,
            backgroundColor,
            borderRadius: sliderHeight / 2,
            position: "relative",
            cursor: "pointer",
          }}
          onClick={(e) => {
            const distance = Math.abs(e.clientX - initialPointerX.get());
            if (distance < 5) {
              checked.set(checked.get() < 0.5 ? 1 : 0);
            }
          }}
        >
          {typeof window !== "undefined" && (
            <Filter
              id="thumb-filter-refined"
              blur={blur}
              scaleRatio={scaleRatio}
              specularOpacity={specularOpacity}
              specularSaturation={specularSaturation}
              magnifyingScale={magnifyingScale}
              width={146}
              height={92}
              radius={46}
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
              height: thumbHeight,
              width: thumbWidth,
              left: (sliderHeight - thumbHeight * THUMB_REST_SCALE) / 2 - THUMB_REST_OFFSET,
              x: useTransform(() => xRatio.get() * TRAVEL),
              y: "-50%",
              top: "50%",
              borderRadius: thumbRadius,
              backdropFilter: `url(#thumb-filter-refined)`,
              scaleX: objectScaleX,
              scaleY: objectScaleY,
              backgroundColor: useTransform(backgroundOpacity, (op) => `rgba(255, 255, 255, ${op})`),
              boxShadow,
            }}
          />
        </motion.div>
        {/* 强制液态控制：现在能勾选了 */}
        <label className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs bg-white/10 dark:bg-black/10 backdrop-blur px-2 py-1 rounded-md flex items-center gap-2 text-black/80 dark:text-white/80">
          <input
            type="checkbox"
            defaultChecked={forceActive.get()}
            onChange={(e) => forceActive.set(e.currentTarget.checked)}
            className="accent-blue-600"
          />
          聚焦
        </label>
      </div>

      <div className="mt-8 space-y-3 text-black/80 dark:text-white/80">
        <div className="flex items-center gap-4">
          <div className="uppercase tracking-[0.14em] text-[10px] opacity-70 select-none">
            参数
          </div>
          <div className="h-[1px] flex-1 bg-black/10 dark:bg-white/10" />
        </div>

        <div className="flex items-center gap-4">
          <label className="w-56 uppercase tracking-[0.08em] text-[11px] opacity-80 select-none [line-height:1.2]">
            镜面反射透明度
          </label>
          <motion.span className="w-14 text-right font-mono tabular-nums text-[11px] text-black/60 dark:text-white/60">
            {useTransform(specularOpacity, (v) => v.toFixed(2))}
          </motion.span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            defaultValue={specularOpacity.get()}
            onInput={(e) =>
              specularOpacity.set(parseFloat(e.currentTarget.value))
            }
            className="flex-1 appearance-none h-[2px] bg-black/20 dark:bg-white/20 rounded outline-none"
            aria-label="镜面反射透明度"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="w-56 uppercase tracking-[0.08em] text-[11px] opacity-80 select-none [line-height:1.2]">
            镜面饱和度
          </label>
          <motion.span className="w-14 text-right font-mono tabular-nums text-[11px] text-black/60 dark:text-white/60">
            {useTransform(specularSaturation, (v) => Math.round(v).toString())}
          </motion.span>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            defaultValue={specularSaturation.get()}
            onInput={(e) =>
              specularSaturation.set(parseFloat(e.currentTarget.value))
            }
            className="flex-1 appearance-none h-[2px] bg-black/20 dark:bg-white/20 rounded outline-none"
            aria-label="镜面饱和度"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="w-56 uppercase tracking-[0.08em] text-[11px] opacity-80 select-none [line-height:1.2]">
            折射等级
          </label>
          <motion.span className="w-14 text-right font-mono tabular-nums text-[11px] text-black/60 dark:text-white/60">
            {useTransform(refractionBase, (v) => v.toFixed(2))}
          </motion.span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            defaultValue={refractionBase.get()}
            onInput={(e) =>
              refractionBase.set(parseFloat(e.currentTarget.value))
            }
            className="flex-1 appearance-none h-[2px] bg-black/20 dark:bg-white/20 rounded outline-none"
            aria-label="折射等级"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="w-56 uppercase tracking-[0.08em] text-[11px] opacity-80 select-none [line-height:1.2]">
            模糊等级
          </label>
          <motion.span className="w-14 text-right font-mono tabular-nums text-[11px] text-black/60 dark:text-white/60">
            {useTransform(blur, (v) => v.toFixed(1))}
          </motion.span>
          <input
            type="range"
            min={0}
            max={40}
            step={0.1}
            defaultValue={blur.get()}
            onInput={(e) => blur.set(parseFloat(e.currentTarget.value))}
            className="flex-1 appearance-none h-[2px] bg-black/20 dark:bg-white/20 rounded outline-none"
            aria-label="模糊等级"
          />
        </div>
      </div>
    </>
  );
};

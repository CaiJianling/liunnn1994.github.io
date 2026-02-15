import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  useVelocity,
  useMotionValueEvent,
} from "motion/react";
import React, { useEffect, useRef } from "react";
import { Filter } from "./Filter";

export const Slider: React.FC = () => {
  const min = 0;
  const max = 100;
  const initialValue = 50;

  // 初始值
  const value = useMotionValue(initialValue); // 0-100

  const sliderHeight = 10;
  const sliderWidth = 400;
  const thumbWidth = 90;
  const thumbHeight = 60;
  const thumbRadius = 30;

  // --- 核心物理参数 ---
  const MAX_STRETCH = sliderWidth * 0.1; // 最大拉伸 10%
  const STRETCH_RESISTANCE = 0.4; // 拉伸阻尼

  const SCALE_REST = 0.6;
  const SCALE_DRAG = 1;
  const thumbWidthRest = thumbWidth * SCALE_REST; // 54px

  // 计算滑块可移动的总物理距离 (400 - 90 = 310)
  const maxDragDistance = sliderWidth - thumbWidth;

  // --- 滑块物理边界 ---
  const constraintsLeft = -thumbWidthRest / 3; // 左顶端：-18px
  const constraintsRight = maxDragDistance + thumbWidthRest / 3; // 右顶端：310+18=328px
  // 滑块总可滑动范围 (328 - (-18) = 346)
  const totalSlideRange = constraintsRight - constraintsLeft;

  // --- 吸附参数 ---
  const SNAP_THRESHOLD = 0.05; // 5% 的吸附触发范围
  const snapDistance = totalSlideRange * SNAP_THRESHOLD; // 触发吸附的距离阈值

  // --- Motion Values ---
  // 初始化 x：将 50% 映射到物理中心
  const initialX = constraintsLeft + (initialValue / 100) * totalSlideRange;
  const x = useMotionValue(initialX);
  const velocityX = useVelocity(x);
  const pointerDown = useMotionValue(0);
  const forceActive = useMotionValue(false);

  const isUp = useTransform((): number =>
    forceActive.get() || pointerDown.get() > 0.5 ? 1 : 0
  );

  // --- 越界与形变逻辑 ---
  const overshoot = useMotionValue(0);

  useMotionValueEvent(x, "change", (latestX) => {
    // 1. 计算 Value (将物理坐标 [constraintsLeft, constraintsRight] 映射到 [0, 100])
    // 先把 x 限制在物理边界内
    const clampedX = Math.max(constraintsLeft, Math.min(constraintsRight, latestX));
    // 计算线性进度 0-1
    const linearProgress = (clampedX - constraintsLeft) / totalSlideRange;

    // 第一步：线性映射得到调整后的百分比（5-95 映射到 0-100）
    let mappedProgress;
    if (linearProgress < 0.05) {
      mappedProgress = 0;
    } else if (linearProgress > 0.95) {
      mappedProgress = 1;
    } else {
      // 将 0.05-0.95 映射到 0-1
      mappedProgress = (linearProgress - 0.05) / 0.9;
    }

    // 第二步：基于调整后的百分比进行分段映射
    let easedProgress;
    if (mappedProgress < 0.05) {
      easedProgress = mappedProgress * 3;
    } else if (mappedProgress < 0.95) {
      easedProgress = 0.15 + (mappedProgress - 0.05) * 0.777;
    } else {
      easedProgress = 0.85 + (mappedProgress - 0.95) * 3;
    }

    const currentValue = easedProgress * 100;
    value.set(currentValue);

    // 2. 计算 Overshoot - 【修改逻辑】超出物理边界才算拉伸
    if (pointerDown.get() > 0.5) {
      let over = 0;
      
      // 只有当 x 超出 constraintsLeft 或 constraintsRight 时才计算拉伸
      if (latestX < constraintsLeft) {
        over = latestX - constraintsLeft; // 负数
      } else if (latestX > constraintsRight) {
        over = latestX - constraintsRight; // 正数
      }
      
      overshoot.set(over);
    }
  });
  
  const overshootSpring = useSpring(overshoot, { stiffness: 400, damping: 30 });

  // 轨道形变逻辑 (保持不变，但注意 overshoot 的基准变了)
  const trackScaleY = useTransform(overshootSpring, (x) => {
    const damped = Math.max(-MAX_STRETCH, Math.min(MAX_STRETCH, x * STRETCH_RESISTANCE));
    const v = 1 - Math.abs(damped) / (sliderWidth * 1.5); 
    return Math.max(0.8, v); 
  });

  const trackWidthStyle = useTransform(overshootSpring, (o) => {
    const stretch = Math.min(Math.abs(o * STRETCH_RESISTANCE), MAX_STRETCH);
    return sliderWidth + stretch;
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

  // --- 其他视觉效果完全保持不变 ---
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
  const trackBoundsRef = useRef<DOMRect | null>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  // --- 动态形变逻辑完全保持不变 ---
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
  const shadowSx = useSpring(useTransform(isUp, [0, 1], [0, 4]), { stiffness: 340, damping: 30 });
  const shadowSy = useSpring(useTransform(isUp, [0, 1], [4, 16]), { stiffness: 340, damping: 30 });
  const shadowAlpha = useSpring(useTransform(isUp, [0, 1], [0.16, 0.22]), { stiffness: 220, damping: 24 });
  const insetShadowAlpha = useSpring(useTransform(isUp, [0, 1], [0, 0.27]), { stiffness: 220, damping: 24 });
  const shadowBlur = useSpring(useTransform(isUp, [0, 1], [9, 24]), { stiffness: 340, damping: 30 });
  
  const boxShadow = useTransform(() => {
    const inset = isUp.get() > 0.5
      ? `inset ${shadowSx.get() / 2}px ${shadowSy.get() / 2}px 24px rgba(0,0,0,${insetShadowAlpha.get()}),
         inset ${-shadowSx.get() / 2}px ${-shadowSy.get() / 2}px 24px rgba(255,255,255,${insetShadowAlpha.get()})`
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

  const specularOpacityText = useTransform(specularOpacity, (v) => v.toFixed(2));
  const specularSaturationText = useTransform(specularSaturation, (v) => Math.round(v).toString());
  const refractionLevelText = useTransform(refractionBase, (v) => v.toFixed(2));
  const blurText = useTransform(blur, (v) => v.toFixed(1));

  // 创建一个显示百分比的motion值
  const percentageText = useTransform(value, (v) => `${Math.round(v)}%`);

  // 创建映射后的百分比（将5-95映射到0-100）
  const mappedPercentageText = useTransform(value, (v) => {
    let mapped = 0;
    if (v < 5) {
      mapped = 0;
    } else if (v > 95) {
      mapped = 100;
    } else {
      // 将 5-95 映射到 0-100
      mapped = ((v - 5) / 90) * 100;
    }
    return `${Math.round(mapped)}%`;
  });

  return (
    <>
      <div
        className="relative h-96 flex justify-center items-center rounded-xl -ml-[15px] w-[calc(100%+30px)] select-none text-black/5 dark:text-white/5 [--bg1:#f8fafc] [--bg2:#e7eeef] dark:[--bg1:#1b1b22] dark:[--bg2:#0f0f14] border border-black/10 dark:border-white/10"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px)," +
            "linear-gradient(to bottom, currentColor 1px, transparent 1px)," +
            "radial-gradient(120% 100% at 10% 0%, var(--bg1), var(--bg2))",
          backgroundSize: "24px 24px, 24px 24px, 100% 100%",
          backgroundPosition: "12px 12px, 12px 12px, 0 0",
        }}
      >
        <motion.div style={{ position: "relative", width: sliderWidth, height: thumbHeight }}>
          {/* 轨道 */}
          <motion.div
            ref={trackRef}
            style={{
              display: "inline-block",
              height: sliderHeight,
              left: 0,
              top: (thumbHeight - sliderHeight) / 2,
              backgroundColor: "#89898F66",
              borderRadius: sliderHeight / 2,
              position: "absolute",
              cursor: "pointer",
              width: trackWidthStyle,
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
                  height: sliderHeight,
                  width: useTransform(value, (v) => `${v}%`),
                  borderRadius: 6,
                  backgroundColor: "#0377F7",
                }}
              />
            </div>
          </motion.div>

          {typeof window !== "undefined" && (
            <Filter
              id="thumb-filter-slider"
              blur={blur}
              scaleRatio={scaleRatio}
              specularOpacity={specularOpacity}
              specularSaturation={specularSaturation}
              magnifyingScale={magnifyingScale}
              width={90}
              height={60}
              radius={30}
              bezelWidth={16}
              glassThickness={80}
              refractiveIndex={1.45}
              bezelType="convex_squircle"
            />
          )}

          {/* 滑块 */}
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
              if (trackRef.current) trackBoundsRef.current = trackRef.current.getBoundingClientRect();
            }}
            onDragEnd={() => {
              pointerDown.set(0);
              trackBoundsRef.current = null;
              
              const currentX = x.get();
              let targetX: number | null = null;
              
              // 吸附逻辑：距离边界近则吸附
              if (Math.abs(currentX - constraintsLeft) < snapDistance) {
                targetX = constraintsLeft;
              } 
              else if (Math.abs(currentX - constraintsRight) < snapDistance) {
                targetX = constraintsRight;
              }

              if (targetX !== null) {
                animate(x.get(), targetX, {
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                  onUpdate: (latest) => x.set(latest)
                });
              }

              animate(overshoot, 0, { type: "spring", stiffness: 400, damping: 30 });
            }}
            className="absolute"
            style={{
              height: thumbHeight,
              width: thumbWidth,
              top: 0,
              borderRadius: thumbRadius,
              backdropFilter: `url(#thumb-filter-slider)`,
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

        <div className="absolute bottom-[52px] left-1/2 -translate-x-1/2">
          <motion.span className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400 tabular-nums">
            {mappedPercentageText}
          </motion.span>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <motion.span className="font-mono text-sm text-black/60 dark:text-white/60 tabular-nums">
            {percentageText}
          </motion.span>
        </div>
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

      {/* 参数控制区域完全保持不变 */}
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
            {specularOpacityText}
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
          />
        </div>
        <div className="flex items-center gap-4">
        <label className="w-56 uppercase tracking-[0.08em] text-[11px] opacity-80 select-none [line-height:1.2]">
            镜面饱和度
        </label>
        <motion.span className="w-14 text-right font-mono tabular-nums text-[11px] text-black/60 dark:text-white/60">
            {specularSaturationText}
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
        />
        </div>
        <div className="flex items-center gap-4">
        <label className="w-56 uppercase tracking-[0.08em] text-[11px] opacity-80 select-none [line-height:1.2]">
            折射等级
        </label>
        <motion.span className="w-14 text-right font-mono tabular-nums text-[11px] text-black/60 dark:text-white/60">
            {refractionLevelText}
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
        />
        </div>
        <div className="flex items-center gap-4">
        <label className="w-56 uppercase tracking-[0.08em] text-[11px] opacity-80 select-none [line-height:1.2]">
            模糊等级
        </label>
        <motion.span className="w-14 text-right font-mono tabular-nums text-[11px] text-black/60 dark:text-white/60">
            {blurText}
        </motion.span>
        <input
            type="range"
            min={0}
            max={40}
            step={0.1}
            defaultValue={blur.get()}
            onInput={(e) => blur.set(parseFloat(e.currentTarget.value))}
            className="flex-1 appearance-none h-[2px] bg-black/20 dark:bg-white/20 rounded outline-none"
        />
        </div>
      </div>
    </>
  );
};
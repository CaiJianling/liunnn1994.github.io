import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
} from "motion/react";
import React, { useEffect, useRef } from "react";
import { Filter } from "./Filter";

export const Slider: React.FC = () => {
  const min = 0;
  const max = 100;
  const value = useMotionValue(10); // 0-100

  const sliderHeight = 14;
  const sliderWidth = 330;
  const thumbWidth = 90;
  const thumbHeight = 60;
  const thumbRadius = 30;

  // --- 核心物理参数 ---
  const MAX_STRETCH = sliderWidth * 0.1; // 最大拉伸 10% (33px)
  const STRETCH_RESISTANCE = 0.4; // 拉伸阻尼 (越小拉得越慢)

  // Use numeric MotionValue (0/1) instead of boolean
  const pointerDown = useMotionValue(0);
  const forceActive = useMotionValue(false);

  const isUp = useTransform((): number =>
    forceActive.get() || pointerDown.get() > 0.5 ? 1 : 0
  );

  // --- 越界与形变逻辑 ---
  const overshoot = useMotionValue(0);
  
  // 橡皮筋弹簧
  const overshootSpring = useSpring(overshoot, {
    stiffness: 400,
    damping: 30,
  });

  // 1. 变细效果 (应用到轨道整体)
  const trackScaleY = useTransform(overshootSpring, (x) => {
    // 限制最大形变输入，防止过细
    const damped = Math.max(-MAX_STRETCH, Math.min(MAX_STRETCH, x * STRETCH_RESISTANCE));
    const v = 1 - Math.abs(damped) / (sliderWidth * 1.5); 
    return Math.max(0.8, v); 
  });

  // 2. 宽度拉伸 (应用到轨道整体)
  const trackWidthStyle = useTransform(overshootSpring, (o) => {
    // 无论向左还是向右拉，宽度都是增加的
    const stretch = Math.min(Math.abs(o * STRETCH_RESISTANCE), MAX_STRETCH);
    return sliderWidth + stretch;
  });

  // 3. 整体位移 (关键修复点)
  const trackXStyle = useTransform(overshootSpring, (o) => {
    const stretch = Math.min(Math.abs(o * STRETCH_RESISTANCE), MAX_STRETCH);
    const sign = Math.sign(o);

    if (sign > 0) {
      // 向右拉时：轨道整体向右移，但移动距离小于宽度增加量，产生"左边缩进"的效果
      // 宽度增加 stretch, 位移 stretch * 0.8 -> 左侧看起来缩进了 0.8
      return stretch * 0.8;
    } else {
      // 向左拉时：轨道整体必须向左移动【宽度增加量 + 额外偏移】
      // 这样左边才会伸出，右边才会缩进
      // -stretch 是补偿宽度的增加，再 - (stretch * 0.8) 是"另一头移动一半多"的效果
      return -stretch - (stretch * 0.8);
    }
  });

  // --- 其他视觉效果 ---
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
  
  const magnifyingScale = useSpring(
    useTransform(isUp, (d): number => (d ? -24 : 24)),
    { stiffness: 250, damping: 14 }
  );

  const trackRef = useRef<HTMLDivElement>(null);
  // 新增：用于在拖拽开始时缓存轨道位置，防止轨道变形导致计算抖动
  const trackBoundsRef = useRef<DOMRect | null>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const velocityX = useMotionValue(0);

  const SCALE_REST = 0.6;
  const SCALE_DRAG = 1;
  const thumbWidthRest = thumbWidth * SCALE_REST;

  const objectScale = useSpring(
    useTransform(isUp, [0, 1], [SCALE_REST, SCALE_DRAG]),
    { stiffness: 340, damping: 20 }
  );
  
  const objectScaleY = useTransform((): number => {
    const baseScale = objectScale.get();
    const velocityFactor = Math.abs(velocityX.get()) / 3000;
    const deformation = 1 - Math.min(velocityFactor, 0.3);
    return baseScale * deformation;
  });
  
  const objectScaleX = useTransform((): number => {
    const baseScale = objectScale.get();
    const currentScaleY = objectScaleY.get();
    return baseScale + (baseScale - currentScaleY);
  });

  const backgroundOpacity = useSpring(useTransform(isUp, [0, 1], [1, 0.1]), {
    stiffness: 340,
    damping: 20,
  });

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

  return (
    <>
      <div
        className="relative h-96 flex justify-center items-center rounded-xl -ml-[15px] w-[calc(100%+30px)] select-none text-black/5 dark:text-white/5 [--bg1:#f8fafc] [--bg2:#e7eeef] dark:[--bg1:#1b1b22] dark:[--bg2:#0f0f14] border border-black/10 dark:border-white/10 contain-layout contain-style contain-paint [content-visibility:auto]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px)," +
            "linear-gradient(to bottom, currentColor 1px, transparent 1px)," +
            "radial-gradient(120% 100% at 10% 0%, var(--bg1), var(--bg2))",
          backgroundSize: "24px 24px, 24px 24px, 100% 100%",
          backgroundPosition: "12px 12px, 12px 12px, 0 0",
        }}
      >
        <motion.div
          style={{
            position: "relative",
            width: sliderWidth,
            height: thumbHeight,
          }}
        >
          {/* 将 transform 移动到这个父级容器上，并移除 transform origin 限制 */}
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
              // --- 关键修改：灰色轨道整体动 ---
              width: trackWidthStyle, // 整体宽度变化
              x: trackXStyle,         // 整体位移
              scaleY: trackScaleY,    // 整体变细
              originX: 0, // 设置为0，方便我们手动通过 x 轴控制位移逻辑
            }}
            onMouseDown={() => {
              pointerDown.set(1);
            }}
            onMouseUp={() => {
              pointerDown.set(0);
            }}
          >
            {/* 蓝色条条现在只是容器的100%宽度填充，它会自然跟随父容器变形 */}
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

          <motion.div
            ref={thumbRef}
            drag="x"
            dragElastic={0.1}
            dragConstraints={{
              left: -thumbWidthRest / 3,
              right: sliderWidth - thumbWidth + thumbWidthRest / 3,
            }}
            onMouseDown={() => {
              pointerDown.set(1);
            }}
            onMouseUp={() => {
              pointerDown.set(0);
            }}
            onDragStart={() => {
              pointerDown.set(1);
              // 缓存原始位置，确保拖拽计算不受轨道变形影响
              if (trackRef.current) {
                trackBoundsRef.current = trackRef.current.getBoundingClientRect();
              }
            }}
            onDrag={(_, info) => {
              velocityX.set(info.velocity.x);
              
              // 使用缓存的 bounds 进行计算
              const track = trackBoundsRef.current || trackRef.current!.getBoundingClientRect();
              const thumb = thumbRef.current!.getBoundingClientRect();

              // 注意：这里需要根据 trackXStyle 的位移稍微修正一下计算中心的逻辑
              // 但因为我们锁定了 trackBoundsRef，所以计算逻辑是基于"未变形前"的物理位置，
              // 这通常是用户手感最自然的方式。

              const x0 = track.left + thumbWidthRest / 2;
              const x100 = track.right - thumbWidthRest / 2;
              const trackInsideWidth = x100 - x0;
              const thumbCenterX = thumb.left + thumb.width / 2;

              const currentX = Math.max(x0, Math.min(x100, thumbCenterX));
              const ratio = (currentX - x0) / trackInsideWidth;
              
              value.set(
                Math.max(min, Math.min(max, ratio * (max - min) + min))
              );

              // 计算原始越界量
              let over = 0;
              if (thumbCenterX < x0) {
                over = thumbCenterX - x0;
              } else if (thumbCenterX > x100) {
                over = thumbCenterX - x100;
              }
              overshoot.set(over);
            }}
            onDragEnd={() => {
              velocityX.set(0);
              pointerDown.set(0);
              trackBoundsRef.current = null; // 清除缓存
              animate(overshoot, 0, { type: "spring", stiffness: 400, damping: 30 });
            }}
            dragMomentum={false}
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
            }}
          />
        </motion.div>

        {/* Toggle control */}
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

      {/* 参数控制区域保持不变... */}
      <div className="mt-8 space-y-3 text-black/80 dark:text-white/80">
        <div className="flex items-center gap-4">
            <div className="uppercase tracking-[0.14em] text-[10px] opacity-70 select-none">
            参数
            </div>
            <div className="h-[1px] flex-1 bg-black/10 dark:bg-white/10" />
        </div>
        {/* ... 省略重复的 Controls 代码 ... */}
         {/* 镜面反射透明度 */}
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
        {/* 其他Input保持原样 */}
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
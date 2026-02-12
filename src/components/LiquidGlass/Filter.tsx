import { createCanvas, type ImageData } from "canvas";
import { motion, MotionValue, useTransform } from "motion/react";
import React from "react";
import {
  calculateDisplacementMap,
  calculateDisplacementMap2,
} from "./displacementMap";
import { calculateMagnifyingDisplacementMap } from "./magnifyingDisplacement";
import { calculateRefractionSpecular } from "./specular";
import { CONVEX } from "./surfaceEquations";
import { getValueOrMotion } from "./useValueOrMotion";

function imageDataToUrl(imageData: ImageData): string {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

type FilterProps = {
  id: string;
  withSvgWrapper?: boolean;
  scaleRatio?: MotionValue<number>;
  canvasWidth?: number;
  canvasHeight?: number;
  blur: number | MotionValue<number>;
  width: number | MotionValue<number>;
  height: number | MotionValue<number>;
  radius: number | MotionValue<number>;
  glassThickness: number | MotionValue<number>;
  bezelWidth: number | MotionValue<number>;
  refractiveIndex: number | MotionValue<number>;
  specularOpacity: number | MotionValue<number>;
  specularSaturation?: number | MotionValue<number>;
  magnifyingScale?: number | MotionValue<number>;
  colorScheme?: MotionValue<"light" | "dark">;
  dpr?: number;
  bezelHeightFn?: (x: number) => number;
  [str: string]: any;
};

export const Filter: React.FC<FilterProps> = ({
  id,
  withSvgWrapper = true,
  canvasWidth,
  canvasHeight,
  width,
  height,
  radius,
  blur,
  glassThickness,
  bezelWidth,
  refractiveIndex,
  scaleRatio,
  specularOpacity,
  specularSaturation = 4,
  magnifyingScale,
  colorScheme,
  bezelHeightFn = CONVEX.fn,
  dpr,
}) => {
  const map = useTransform(() => {
    return calculateDisplacementMap(
      getValueOrMotion(glassThickness),
      getValueOrMotion(bezelWidth),
      bezelHeightFn,
      getValueOrMotion(refractiveIndex)
    );
  });

  const maximumDisplacement = useTransform(() =>
    Math.max(...map.get().map((v) => Math.abs(v)))
  );

  const displacementMap = useTransform(() => {
    return calculateDisplacementMap2(
      getValueOrMotion(canvasWidth ?? width),
      getValueOrMotion(canvasHeight ?? height),
      getValueOrMotion(width),
      getValueOrMotion(height),
      getValueOrMotion(radius),
      getValueOrMotion(bezelWidth),
      getValueOrMotion(maximumDisplacement),
      getValueOrMotion(map),
      dpr
    );
  });

  const specularLayer = useTransform(() => {
    return calculateRefractionSpecular(
      getValueOrMotion(width),
      getValueOrMotion(height),
      getValueOrMotion(radius),
      50,
      undefined,
      dpr
    );
  });

  const magnifyingDisplacementMap = useTransform(() => {
    return magnifyingScale !== undefined
      ? calculateMagnifyingDisplacementMap(
          getValueOrMotion(canvasWidth ?? width),
          getValueOrMotion(canvasHeight ?? height)
        )
      : undefined;
  });

  const magnifyingDisplacementMapDataUrl = useTransform(() => {
    if (magnifyingScale) {
      return imageDataToUrl(magnifyingDisplacementMap.get());
    }
  });
  const displacementMapDataUrl = useTransform(() => {
    return imageDataToUrl(displacementMap.get());
  });
  const specularLayerDataUrl = useTransform(() => {
    return imageDataToUrl(specularLayer.get());
  });
  const scale = useTransform(
    () => maximumDisplacement.get() * (scaleRatio?.get() ?? 1)
  );

  const content = (
    <filter id={id}>
      {magnifyingScale && (
        <>
          <motion.feImage
            href={magnifyingDisplacementMapDataUrl}
            x={0}
            y={0}
            width={canvasWidth ?? width}
            height={canvasHeight ?? height}
            result="magnifying_displacement_map"
          />

          <motion.feDisplacementMap
            in="SourceGraphic"
            in2="magnifying_displacement_map"
            scale={magnifyingScale}
            xChannelSelector="R"
            yChannelSelector="G"
            result="magnified_source"
          />
        </>
      )}

      {/* Augment brightness and saturation */}
      {colorScheme && (
        <motion.feColorMatrix
          in={
            magnifyingDisplacementMapDataUrl
              ? "magnified_source"
              : "SourceGraphic"
          }
          type="matrix"
          values={
            useTransform(() =>
              getValueOrMotion(colorScheme) === "dark"
                ? "0.9 0 0 0 -0.3 0 0.9 0 0 -0.3 0 0 0.9 0 -0.3 0 0 0 1 0"
                : "1.03 0 0 0 0.2 0 1.03 0 0 0.2 0 0 1.03 0 0.2 0 0 0 1 0"
            ) as any
          }
          result="brightened_source"
        />
      )}

      <motion.feGaussianBlur
        in={
          colorScheme
            ? "brightened_source"
            : magnifyingDisplacementMapDataUrl
            ? "magnified_source"
            : "SourceGraphic"
        }
        stdDeviation={blur}
        result="blurred_source"
      />

      <motion.feImage
        href={displacementMapDataUrl}
        x={0}
        y={0}
        width={canvasWidth ?? width}
        height={canvasHeight ?? height}
        result="displacement_map"
      />

      {/* Dispersion effect: separate color channels with different refractive indices */}
      <feComponentTransfer in="blurred_source" result="red_channel">
        <feFuncR type="linear" slope="1" intercept="0"/>
        <feFuncG type="linear" slope="0" intercept="0"/>
        <feFuncB type="linear" slope="0" intercept="0"/>
      </feComponentTransfer>
      
      <feComponentTransfer in="blurred_source" result="green_channel">
        <feFuncR type="linear" slope="0" intercept="0"/>
        <feFuncG type="linear" slope="1" intercept="0"/>
        <feFuncB type="linear" slope="0" intercept="0"/>
      </feComponentTransfer>
      
      <feComponentTransfer in="blurred_source" result="blue_channel">
        <feFuncR type="linear" slope="0" intercept="0"/>
        <feFuncG type="linear" slope="0" intercept="0"/>
        <feFuncB type="linear" slope="1" intercept="0"/>
      </feComponentTransfer>
      
      {/* Red channel with less refraction (lower refractive index) */}
      <motion.feDisplacementMap
        in="red_channel"
        in2="displacement_map"
        scale={useTransform(() => scale.get() * 0.8)}
        xChannelSelector="R"
        yChannelSelector="G"
        result="displaced_red"
      />
      
      {/* Green channel with medium refraction */}
      <motion.feDisplacementMap
        in="green_channel"
        in2="displacement_map"
        scale={useTransform(() => scale.get() * 0.9)}
        xChannelSelector="R"
        yChannelSelector="G"
        result="displaced_green"
      />
      
      {/* Blue channel with more refraction (higher refractive index) */}
      <motion.feDisplacementMap
        in="blue_channel"
        in2="displacement_map"
        scale={scale}
        xChannelSelector="R"
        yChannelSelector="G"
        result="displaced_blue"
      />
      
      {/* Combine the displaced color channels */}
      <feBlend in="displaced_red" in2="displaced_green" mode="screen" result="displaced_rg"/>
      <feBlend in="displaced_rg" in2="displaced_blue" mode="screen" result="displaced_combined"/>
      
      {/* Apply Gaussian blur to the entire displaced image */}
      <motion.feGaussianBlur
        in="displaced_combined"
        stdDeviation={10}
        result="displaced_blurred"
      />
      
      {/* Adjust the opacity of the blurred image */}
      <feComponentTransfer in="displaced_blurred" result="displaced_blurred_faded">
        <feFuncA type="linear" slope="0.7"/>
      </feComponentTransfer>
      
      {/* Create a simple overlay effect */}
      {/* This will apply the blur to the entire image but it will be more noticeable at the edges */}
      {/* due to the refraction effect already present there */}
      <feBlend in="displaced_combined" in2="displaced_blurred_faded" mode="normal" result="displaced"/>

      <motion.feColorMatrix
        in="displaced"
        type="saturate"
        values={
          useTransform(() =>
            getValueOrMotion(specularSaturation).toString()
          ) as any
        }
        result="displaced_saturated"
      />

      <motion.feImage
        href={specularLayerDataUrl}
        x={0}
        y={0}
        width={canvasWidth ?? width}
        height={canvasHeight ?? height}
        result="specular_layer"
      />

      <feComposite
        in="displaced_saturated"
        in2="specular_layer"
        operator="in"
        result="specular_saturated"
      />

      <feComponentTransfer in="specular_layer" result="specular_faded">
        <motion.feFuncA
          type="linear"
          slope={useTransform(() => getValueOrMotion(specularOpacity))}
        />
      </feComponentTransfer>

      <motion.feBlend
        in="specular_saturated"
        in2="displaced"
        mode="normal"
        result="withSaturation"
      />
      <motion.feBlend in="specular_faded" in2="withSaturation" mode="normal" />
    </filter>
  );

  return withSvgWrapper ? (
    <svg colorInterpolationFilters="sRGB" style={{ display: "none" }}>
      <defs>{content}</defs>
    </svg>
  ) : (
    content
  );
};
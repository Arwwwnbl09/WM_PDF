"use client";
import { useEffect, useRef, useState } from "react";
import type { WatermarkConfig } from "@/types/watermark";
import { rotatedInkBounds } from "@/lib/watermark/measure";
import { fontFamilies } from "@/lib/watermark/fonts";
import {
  CSS_PIXELS_PER_POINT,
  watermarkLayout,
  type PreviewSize,
} from "@/lib/watermark/preview";

export function WatermarkOverlay({
  config,
  size,
  scale,
}: {
  config: WatermarkConfig;
  size: PreviewSize;
  scale: number;
}) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const measurementKey = JSON.stringify([
    config.text,
    config.font,
    config.fontSize,
    config.angle,
  ]);
  const [measuredKey, setMeasuredKey] = useState<string | null>(null);
  const [measured, setMeasured] = useState<PreviewSize>({
    width: 1,
    height: 1,
  });
  const [textOffset, setTextOffset] = useState({ left: 0, top: 0 });
  const [rotated, setRotated] = useState({
    width: 1,
    height: 1,
    offsetX: 0,
    offsetY: 0,
  });
  useEffect(() => {
    const element = measureRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const css = getComputedStyle(element);
      const context = document.createElement("canvas").getContext("2d");
      if (!context) return;
      context.font = `${css.fontSize} ${css.fontFamily}`;
      const metrics = context.measureText(element.textContent || " ");
      const baseline =
        (entry.contentRect.height -
          metrics.fontBoundingBoxAscent -
          metrics.fontBoundingBoxDescent) /
          2 +
        metrics.fontBoundingBoxAscent;
      const inkSize = {
        width: Math.max(
          1,
          metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
        ),
        height: Math.max(
          1,
          metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
        ),
      };
      setMeasured(inkSize);
      setRotated(
        rotatedInkBounds(
          element.textContent || " ",
          parseFloat(css.fontSize),
          css.fontFamily,
          config.angle,
          inkSize,
          metrics.actualBoundingBoxLeft,
          metrics.actualBoundingBoxAscent,
        ),
      );
      setTextOffset({
        left: metrics.actualBoundingBoxLeft,
        top: metrics.actualBoundingBoxAscent - baseline,
      });
      setMeasuredKey(measurementKey);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [measurementKey, config.angle]);
  const geometry = watermarkLayout(config, size, measured, rotated);
  const style = {
    fontFamily: fontFamilies[config.font],
    fontSize: config.fontSize * CSS_PIXELS_PER_POINT,
    color: config.color,
    opacity: config.opacity,
  };
  const rows = Math.ceil(size.height / geometry.tileHeight) + 2;
  const columns = Math.ceil(size.width / geometry.tileWidth) + 2;
  // Avoid unbounded DOM creation for pathological page dimensions.
  const count = Math.min(20000, rows * columns);
  return (
    <div
      className="watermark-layer"
      aria-hidden="true"
      style={{
        width: size.width,
        height: size.height,
        transform: `scale(${scale})`,
      }}
    >
      <span ref={measureRef} className="watermark-measure" style={style}>
        {config.text || " "}
      </span>
      {config.text &&
        measuredKey === measurementKey &&
        (config.type === "single" ? (
          <span
            className="watermark-mark single-mark"
            style={{
              ...style,
              width: measured.width,
              height: measured.height,
              left: geometry.x - rotated.offsetX * geometry.fit,
              top: geometry.y - rotated.offsetY * geometry.fit,
              transform: `translate(-50%, -50%) rotate(${-config.angle}deg) scale(${geometry.fit})`,
            }}
          >
            <span style={{ position: "absolute", ...textOffset }}>
              {config.text}
            </span>
          </span>
        ) : (
          Array.from({ length: count }, (_, index) => {
            const row = Math.floor(index / columns) - 1;
            const column = (index % columns) - 1;
            return (
              <span
                key={index}
                className="watermark-mark repeated-mark"
                style={{
                  ...style,
                  width: measured.width,
                  height: measured.height,
                  left:
                    column * geometry.tileWidth +
                    (row % 2 ? geometry.tileWidth / 2 : 0) -
                    rotated.offsetX,
                  top: row * geometry.tileHeight - rotated.offsetY,
                  transform: `translate(-50%, -50%) rotate(${-config.angle}deg)`,
                }}
              >
                <span style={{ position: "absolute", ...textOffset }}>
                  {config.text}
                </span>
              </span>
            );
          })
        ))}
    </div>
  );
}

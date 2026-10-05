"use client";

import { useRef, useState, type PointerEvent } from "react";

export function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const current = point(event);
    if (!canvas || !context || !current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    context.strokeStyle = "#203b2d";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(current.x, current.y);
    setDrawing(true);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const context = canvasRef.current?.getContext("2d");
    const current = point(event);
    if (!context || !current) return;
    context.lineTo(current.x, current.y);
    context.stroke();
  }

  function finish() {
    if (!drawing) return;
    setDrawing(false);
    const data = canvasRef.current?.toDataURL("image/png").split(",")[1] || "";
    onChange(data);
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="signature-control">
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        width={720}
        height={210}
        aria-label="Draw your signature in this area"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      <div className="signature-footer">
        <span>{value ? "Signature captured" : "Sign using your finger or mouse"}</span>
        <button className="text-action" type="button" onClick={clear} disabled={!value}>Clear signature</button>
      </div>
      {!value && <p className="visitor-field-error">A signature is required.</p>}
    </div>
  );
}

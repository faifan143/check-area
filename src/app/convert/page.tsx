"use client";

import { useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// Set up the PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

export default function PdfColorizer() {
    const [file, setFile] = useState<File | null>(null);
    const [selectedColor, setSelectedColor] = useState("rgba(255, 0, 0, 0.3)");
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const x = e.nativeEvent.offsetX;
        const y = e.nativeEvent.offsetY;

        // Naive fill (just a dot for now, simulate fill effect)
        ctx.fillStyle = selectedColor;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, 2 * Math.PI);
        ctx.fill();
    };

    return (
        <div className="p-4 space-y-4">
            <h1 className="text-2xl font-bold">PDF Plan Colorizer</h1>

            <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="border p-2"
            />

            <div className="flex items-center gap-2">
                <label className="text-sm">Select color:</label>
                <input
                    type="color"
                    onChange={(e) => setSelectedColor(e.target.value + "33")}
                />
            </div>

            {file && (
                <div className="relative border w-[600px]">
                    <Document file={file}>
                        <Page pageNumber={1} width={600} />
                    </Document>

                    {/* Overlay Canvas */}
                    <canvas
                        ref={canvasRef}
                        width={600}
                        height={850}
                        onClick={handleCanvasClick}
                        className="absolute top-0 left-0 z-10 cursor-crosshair"
                    />
                </div>
            )}
        </div>
    );
}

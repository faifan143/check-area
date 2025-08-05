"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// Set up the PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

export default function PdfColorizer() {
    const [file, setFile] = useState<File | null>(null);
    const [selectedColor, setSelectedColor] = useState("rgba(255, 0, 0, 0.3)");
    const [zoom, setZoom] = useState(100); // 100% = 1x zoom
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Add proper wheel event listener to prevent console errors
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheelEvent = (e: WheelEvent) => {
            e.preventDefault();

            if (e.ctrlKey || e.metaKey) {
                // Zoom with Ctrl/Cmd + wheel
                const zoomDelta = e.deltaY > 0 ? -5 : 5;
                setZoom(prev => Math.max(10, Math.min(1000, prev + zoomDelta)));
            } else {
                // Pan with wheel
                setPan(prev => ({
                    x: prev.x - e.deltaX,
                    y: prev.y - e.deltaY
                }));
            }
        };

        canvas.addEventListener('wheel', handleWheelEvent, { passive: false });

        return () => {
            canvas.removeEventListener('wheel', handleWheelEvent);
        };
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            // Reset zoom and pan when new file is loaded
            setZoom(100);
            setPan({ x: 0, y: 0 });
        }
    };

    const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newZoom = parseInt(e.target.value);
        setZoom(newZoom);
    };

    const handleZoomIn = () => {
        setZoom(prev => Math.min(1000, prev + 10));
    };

    const handleZoomOut = () => {
        setZoom(prev => Math.max(10, prev - 10));
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button === 0) { // Left click for panning
            setIsPanning(true);
            setLastPanPoint({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isPanning) {
            const deltaX = e.clientX - lastPanPoint.x;
            const deltaY = e.clientY - lastPanPoint.y;

            setPan(prev => ({
                x: prev.x + deltaX,
                y: prev.y + deltaY
            }));

            setLastPanPoint({ x: e.clientX, y: e.clientY });
        }
    }, [isPanning, lastPanPoint]);

    const handleMouseUp = () => {
        setIsPanning(false);
    };



    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isPanning) return; // Don't draw while panning

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Calculate the actual position considering zoom and pan
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - pan.x;
        const y = e.clientY - rect.top - pan.y;

        // Draw directly on the scaled canvas
        ctx.fillStyle = selectedColor;
        ctx.beginPath();
        ctx.arc(x, y, 10 * (zoom / 100), 0, 2 * Math.PI);
        ctx.fill();
    };

    // Calculate scaled dimensions for high quality rendering
    const baseWidth = 600;
    const baseHeight = 850;
    const scaledWidth = Math.round(baseWidth * (zoom / 100));
    const scaledHeight = Math.round(baseHeight * (zoom / 100));

    const resetView = () => {
        setZoom(100);
        setPan({ x: 0, y: 0 });
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

            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <label className="text-sm">Select color:</label>
                    <input
                        type="color"
                        onChange={(e) => setSelectedColor(e.target.value + "33")}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-sm">Zoom: {zoom}%</label>
                    <input
                        type="range"
                        min="10"
                        max="1000"
                        value={zoom}
                        onChange={handleZoomChange}
                        className="w-32"
                    />
                    <button
                        onClick={handleZoomOut}
                        className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                    >
                        -
                    </button>
                    <button
                        onClick={handleZoomIn}
                        className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                    >
                        +
                    </button>
                    <button
                        onClick={resetView}
                        className="px-2 py-1 bg-blue-200 rounded hover:bg-blue-300 text-sm"
                    >
                        Reset View
                    </button>
                </div>
            </div>

            {file && (
                <div className="border rounded overflow-hidden">
                    <div
                        ref={containerRef}
                        className="relative overflow-hidden"
                        style={{
                            width: '100%',
                            height: '600px',
                            cursor: isPanning ? 'grabbing' : 'grab'
                        }}
                    >
                        <div
                            style={{
                                transform: `translate(${pan.x}px, ${pan.y}px)`,
                                transformOrigin: '0 0',
                                transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                            }}
                        >
                            <Document file={file}>
                                <Page pageNumber={1} width={scaledWidth} />
                            </Document>

                            {/* Overlay Canvas */}
                            <canvas
                                ref={canvasRef}
                                width={scaledWidth}
                                height={scaledHeight}
                                onClick={handleCanvasClick}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                                className="absolute top-0 left-0 z-10"
                                style={{
                                    cursor: isPanning ? 'grabbing' : 'crosshair',
                                    width: `${scaledWidth}px`,
                                    height: `${scaledHeight}px`
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="text-sm text-gray-600">
                <p>• Use mouse wheel to pan up/down</p>
                <p>• Hold Ctrl/Cmd + mouse wheel to zoom in/out</p>
                <p>• Click and drag to pan around</p>
                <p>• Use the zoom slider or +/- buttons for precise zoom control</p>
            </div>
        </div>
    );
}

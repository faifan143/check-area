"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

// Set up the PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

interface Selection {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    area: number;
    areaInMeters: number;
}

interface Calibration {
    pixelsPerMeter: number;
    referenceLength: number; // pixels
    referenceMeters: number; // actual meters
}

export default function SimplePdfViewer() {
    const [file, setFile] = useState<File | null>(null);
    const [zoom, setZoom] = useState(100);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
    const [pageWidth, setPageWidth] = useState(600);
    const [pageHeight, setPageHeight] = useState(850);

    // Selection state
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 });
    const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 });
    const [selections, setSelections] = useState<Selection[]>([]);

    // Calibration state
    const [isCalibrationMode, setIsCalibrationMode] = useState(false);
    const [isCalibrating, setIsCalibrating] = useState(false);
    const [calibrationStart, setCalibrationStart] = useState({ x: 0, y: 0 });
    const [calibrationEnd, setCalibrationEnd] = useState({ x: 0, y: 0 });
    const [calibration, setCalibration] = useState<Calibration | null>(null);
    const [calibrationMeters, setCalibrationMeters] = useState(1);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setZoom(100);
            setPan({ x: 0, y: 0 });
            setSelections([]);
        }
    };

    const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newZoom = parseInt(e.target.value);
        setZoom(newZoom);
    };

    const handleZoomIn = () => {
        setZoom(prev => Math.min(1000, prev + 25));
    };

    const handleZoomOut = () => {
        setZoom(prev => Math.max(25, prev - 25));
    };

    const zoomToFit = () => {
        const container = containerRef.current;
        if (!container) return;

        const containerWidth = container.clientWidth - 40; // Account for padding
        const containerHeight = container.clientHeight - 40;

        const scaleX = containerWidth / pageWidth;
        const scaleY = containerHeight / pageHeight;
        const scale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%

        setZoom(Math.round(scale * 100));
        setPan({ x: 0, y: 0 });
    };

    const resetView = () => {
        setZoom(100);
        setPan({ x: 0, y: 0 });
    };

    const clearSelections = () => {
        setSelections([]);
    };

    // Helper function to convert mouse coordinates to PDF coordinates
    const getPdfCoordinates = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };

        // Get mouse position relative to container
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert to PDF coordinates (accounting for pan and zoom)
        const pdfX = (mouseX - pan.x) / (zoom / 100);
        const pdfY = (mouseY - pan.y) / (zoom / 100);

        // Ensure coordinates are within PDF bounds
        return {
            x: Math.max(0, Math.min(pdfX, pageWidth)),
            y: Math.max(0, Math.min(pdfY, pageHeight))
        };
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isCalibrationMode) {
            // Start calibration
            const coords = getPdfCoordinates(e);
            setIsCalibrating(true);
            setCalibrationStart(coords);
            setCalibrationEnd(coords);
        } else if (isSelectionMode) {
            // Start selection
            const coords = getPdfCoordinates(e);
            setIsSelecting(true);
            setSelectionStart(coords);
            setSelectionEnd(coords);
        } else if (e.button === 0) {
            // Start panning
            setIsPanning(true);
            setLastPanPoint({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isCalibrating) {
            // Update calibration
            const coords = getPdfCoordinates(e);
            setCalibrationEnd(coords);
        } else if (isSelecting) {
            // Update selection
            const coords = getPdfCoordinates(e);
            setSelectionEnd(coords);
        } else if (isPanning) {
            // Update panning
            const deltaX = e.clientX - lastPanPoint.x;
            const deltaY = e.clientY - lastPanPoint.y;

            setPan(prev => ({
                x: prev.x + deltaX,
                y: prev.y + deltaY
            }));

            setLastPanPoint({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseUp = () => {
        if (isCalibrating) {
            // Finish calibration
            const length = Math.sqrt(
                Math.pow(calibrationEnd.x - calibrationStart.x, 2) +
                Math.pow(calibrationEnd.y - calibrationStart.y, 2)
            );

            if (length > 10) { // Minimum calibration length
                const newCalibration: Calibration = {
                    pixelsPerMeter: length / calibrationMeters,
                    referenceLength: length,
                    referenceMeters: calibrationMeters
                };

                setCalibration(newCalibration);

                // Recalculate areas for existing selections
                setSelections(prev => prev.map(selection => ({
                    ...selection,
                    areaInMeters: selection.area / (newCalibration.pixelsPerMeter * newCalibration.pixelsPerMeter)
                })));
            }

            setIsCalibrating(false);
        } else if (isSelecting) {
            // Finish selection
            const width = Math.abs(selectionEnd.x - selectionStart.x);
            const height = Math.abs(selectionEnd.y - selectionStart.y);

            if (width > 10 && height > 10) { // Minimum selection size
                const x = Math.min(selectionStart.x, selectionEnd.x);
                const y = Math.min(selectionStart.y, selectionEnd.y);
                const area = width * height;

                // Calculate area in meters if calibration exists
                const areaInMeters = calibration
                    ? (area / (calibration.pixelsPerMeter * calibration.pixelsPerMeter))
                    : 0;

                const newSelection: Selection = {
                    id: `selection_${Date.now()}`,
                    x,
                    y,
                    width,
                    height,
                    area,
                    areaInMeters
                };

                setSelections(prev => [...prev, newSelection]);
            }

            setIsSelecting(false);
        } else {
            setIsPanning(false);
        }
    };

    // Simple wheel zoom
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();

            if (e.ctrlKey || e.metaKey) {
                const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
                setZoom(prev => Math.max(25, Math.min(1000, prev * zoomFactor)));
            } else {
                setPan(prev => ({
                    x: prev.x - e.deltaX,
                    y: prev.y - e.deltaY
                }));
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

    // Draw selections on canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // No transformations - draw directly in canvas coordinates
        ctx.save();

        // Draw existing selections
        selections.forEach((selection, index) => {
            // Convert PDF coordinates to canvas coordinates
            const x = selection.x * (zoom / 100);
            const y = selection.y * (zoom / 100);
            const width = selection.width * (zoom / 100);
            const height = selection.height * (zoom / 100);

            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(x, y, width, height);
            ctx.setLineDash([]);

            // Fill with semi-transparent color
            ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
            ctx.fillRect(x, y, width, height);

            // Draw selection number
            ctx.fillStyle = '#3b82f6';
            ctx.font = '16px Arial';
            ctx.fillText(`${index + 1}`, x + 10, y + 20);
        });

        // Draw current selection
        if (isSelecting) {
            const x = Math.min(selectionStart.x, selectionEnd.x) * (zoom / 100);
            const y = Math.min(selectionStart.y, selectionEnd.y) * (zoom / 100);
            const width = Math.abs(selectionEnd.x - selectionStart.x) * (zoom / 100);
            const height = Math.abs(selectionEnd.y - selectionStart.y) * (zoom / 100);

            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(x, y, width, height);
            ctx.setLineDash([]);

            ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
            ctx.fillRect(x, y, width, height);
        }

        // Draw calibration line
        if (isCalibrating) {
            const startX = calibrationStart.x * (zoom / 100);
            const startY = calibrationStart.y * (zoom / 100);
            const endX = calibrationEnd.x * (zoom / 100);
            const endY = calibrationEnd.y * (zoom / 100);

            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw calibration label
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            const length = Math.sqrt(
                Math.pow(calibrationEnd.x - calibrationStart.x, 2) +
                Math.pow(calibrationEnd.y - calibrationStart.y, 2)
            );

            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`${calibrationMeters}m (${length.toFixed(1)}px)`, midX + 20, midY - 20);
        }

        // Draw existing calibration line
        if (calibration) {
            const startX = calibrationStart.x * (zoom / 100);
            const startY = calibrationStart.y * (zoom / 100);
            const endX = calibrationEnd.x * (zoom / 100);
            const endY = calibrationEnd.y * (zoom / 100);

            ctx.strokeStyle = '#059669';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.setLineDash([]);

            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;

            ctx.fillStyle = '#059669';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`${calibration.referenceMeters}m`, midX + 10, midY - 10);
        }

        ctx.restore();
    }, [selections, isSelecting, selectionStart, selectionEnd, isCalibrating, calibrationStart, calibrationEnd, calibration, calibrationMeters, zoom, pan]);

    const handlePageLoadSuccess = (page: any) => {
        setPageWidth(page.width);
        setPageHeight(page.height);
    };

    const baseWidth = 600;
    const scaledWidth = Math.round(baseWidth * (zoom / 100));
    const scaledHeight = Math.round(baseWidth * (pageHeight / pageWidth) * (zoom / 100));

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Header */}
            <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <h1 className="text-2xl font-bold text-slate-900">PDF Area Calculator</h1>
                            </div>
                        </div>

                        {/* File Upload */}
                        <div className="flex items-center space-x-4">
                            <div className="relative">
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    onChange={handleFileChange}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    id="file-upload"
                                />
                                <label
                                    htmlFor="file-upload"
                                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <span className="text-sm font-medium">Upload PDF</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="container mx-auto px-6 py-8">
                {/* Controls Panel */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* Zoom Controls */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-slate-700 flex items-center space-x-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                </svg>
                                <span>Zoom Controls</span>
                            </h3>
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={handleZoomOut}
                                    className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                    </svg>
                                </button>
                                <div className="flex-1">
                                    <input
                                        type="range"
                                        min="25"
                                        max="1000"
                                        value={zoom}
                                        onChange={handleZoomChange}
                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider"
                                    />
                                </div>
                                <button
                                    onClick={handleZoomIn}
                                    className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                >
                                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex items-center justify-between text-sm text-slate-600">
                                <span>{zoom}%</span>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={zoomToFit}
                                        className="px-3 py-1 bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors text-xs font-medium"
                                    >
                                        Fit
                                    </button>
                                    <button
                                        onClick={resetView}
                                        className="px-3 py-1 bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors text-xs font-medium"
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Calibration Controls */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-slate-700 flex items-center space-x-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span>Calibration</span>
                            </h3>
                            <div className="space-y-2">
                                <button
                                    onClick={() => setIsCalibrationMode(!isCalibrationMode)}
                                    className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isCalibrationMode
                                        ? 'bg-green-600 text-white hover:bg-green-700'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    {isCalibrationMode ? 'Calibrating...' : 'Start Calibration'}
                                </button>
                                {isCalibrationMode && (
                                    <div className="flex items-center space-x-2 p-2 bg-slate-50 rounded-lg">
                                        <span className="text-sm text-slate-600">=</span>
                                        <input
                                            type="number"
                                            min="0.1"
                                            step="0.1"
                                            value={calibrationMeters}
                                            onChange={(e) => setCalibrationMeters(parseFloat(e.target.value) || 1)}
                                            className="w-16 px-2 py-1 border border-slate-300 rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-slate-600">meters</span>
                                    </div>
                                )}
                                {calibration && (
                                    <div className="flex items-center space-x-2 p-2 bg-green-50 rounded-lg">
                                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-sm text-green-700 font-medium">
                                            {calibration.pixelsPerMeter.toFixed(1)} px/m
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Selection Controls */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-slate-700 flex items-center space-x-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                                <span>Selection</span>
                            </h3>
                            <div className="space-y-2">
                                <button
                                    onClick={() => setIsSelectionMode(!isSelectionMode)}
                                    className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isSelectionMode
                                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    {isSelectionMode ? 'Selection Active' : 'Start Selection'}
                                </button>
                                {selections.length > 0 && (
                                    <button
                                        onClick={clearSelections}
                                        className="w-full px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                                    >
                                        Clear All ({selections.length})
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Status */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-slate-700 flex items-center space-x-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Status</span>
                            </h3>
                            <div className="space-y-2">
                                <div className="flex items-center space-x-2 p-2 bg-slate-50 rounded-lg">
                                    <div className={`w-2 h-2 rounded-full ${file ? 'bg-green-500' : 'bg-slate-400'}`}></div>
                                    <span className="text-sm text-slate-600">
                                        {file ? 'PDF Loaded' : 'No PDF'}
                                    </span>
                                </div>
                                {calibration && (
                                    <div className="flex items-center space-x-2 p-2 bg-green-50 rounded-lg">
                                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                        <span className="text-sm text-green-700 font-medium">
                                            Calibrated
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* PDF Viewer */}
                {file && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
                        <div className="p-4 border-b border-slate-200 bg-slate-50">
                            <div className="flex items-center space-x-2">
                                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-sm font-medium text-slate-700">{file.name}</span>
                            </div>
                        </div>
                        <div
                            ref={containerRef}
                            className="relative overflow-hidden bg-slate-100"
                            style={{
                                width: '100%',
                                height: '600px',
                                cursor: isCalibrationMode
                                    ? (isCalibrating ? 'crosshair' : 'crosshair')
                                    : isSelectionMode
                                        ? (isSelecting ? 'crosshair' : 'crosshair')
                                        : (isPanning ? 'grabbing' : 'grab')
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                            <div
                                style={{
                                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                                    transformOrigin: '0 0'
                                }}
                            >
                                <Document file={file}>
                                    <Page
                                        pageNumber={1}
                                        width={scaledWidth}
                                        onLoadSuccess={handlePageLoadSuccess}
                                    />
                                </Document>

                                {/* Selection Canvas Overlay */}
                                <canvas
                                    ref={canvasRef}
                                    width={scaledWidth}
                                    height={scaledHeight}
                                    className="absolute top-0 left-0 pointer-events-none"
                                    style={{
                                        zIndex: 10,
                                        width: `${scaledWidth}px`,
                                        height: `${scaledHeight}px`
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Selections Panel */}
                {selections.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-slate-900 flex items-center space-x-2">
                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                <span>Selected Areas ({selections.length})</span>
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {selections.map((selection, index) => (
                                <div key={selection.id} className="bg-slate-50 rounded-lg p-4 border border-slate-200 hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                                {index + 1}
                                            </div>
                                            <span className="font-medium text-slate-900">Selection {index + 1}</span>
                                        </div>
                                        <button
                                            onClick={() => setSelections(prev => prev.filter(s => s.id !== selection.id))}
                                            className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Position:</span>
                                            <span className="font-mono text-slate-900">({selection.x.toFixed(1)}, {selection.y.toFixed(1)})</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Size:</span>
                                            <span className="font-mono text-slate-900">{selection.width.toFixed(1)} × {selection.height.toFixed(1)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-600">Area:</span>
                                            <span className="font-mono text-slate-900">{selection.area.toFixed(1)} sq units</span>
                                        </div>
                                        {calibration && (
                                            <div className="flex justify-between pt-2 border-t border-slate-200">
                                                <span className="text-slate-600 font-medium">Real Area:</span>
                                                <span className="font-mono text-green-600 font-bold">{selection.areaInMeters.toFixed(2)} m²</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>

            <style jsx>{`
                .slider::-webkit-slider-thumb {
                    appearance: none;
                    height: 16px;
                    width: 16px;
                    border-radius: 50%;
                    background: #3b82f6;
                    cursor: pointer;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .slider::-moz-range-thumb {
                    height: 16px;
                    width: 16px;
                    border-radius: 50%;
                    background: #3b82f6;
                    cursor: pointer;
                    border: none;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
            `}</style>
        </div>
    );
} 
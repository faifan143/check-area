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
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
            {/* Enhanced Header */}
            <header className="border-b border-slate-200/60 bg-white/90 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-6">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                                        PDF Area Calculator
                                    </h1>
                                    <p className="text-sm text-slate-500 font-medium">Professional Measurement Tool</p>
                                </div>
                            </div>
                        </div>

                        {/* Enhanced File Upload */}
                        <div className="flex items-center space-x-4">
                            <div className="relative group">
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    onChange={handleFileChange}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    id="file-upload"
                                />
                                <label
                                    htmlFor="file-upload"
                                    className="flex items-center space-x-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <span className="font-semibold">Upload PDF</span>
                                    <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="container mx-auto px-6 py-8">
                {/* Enhanced Controls Panel */}
                <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8 mb-8">
                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                        {/* Enhanced Zoom Controls */}
                        <div className="space-y-4">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Zoom & Navigation</h3>
                            </div>

                            <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-4 border border-slate-200/50">
                                <div className="flex items-center space-x-3 mb-4">
                                    <button
                                        onClick={handleZoomOut}
                                        className="w-10 h-10 bg-white hover:bg-slate-100 rounded-lg shadow-sm border border-slate-200 transition-all duration-200 hover:shadow-md flex items-center justify-center"
                                    >
                                        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                        </svg>
                                    </button>
                                    <div className="flex-1 relative">
                                        <input
                                            type="range"
                                            min="25"
                                            max="1000"
                                            value={zoom}
                                            onChange={handleZoomChange}
                                            className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer slider"
                                        />
                                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-2 py-1 rounded text-xs font-medium">
                                            {zoom}%
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleZoomIn}
                                        className="w-10 h-10 bg-white hover:bg-slate-100 rounded-lg shadow-sm border border-slate-200 transition-all duration-200 hover:shadow-md flex items-center justify-center"
                                    >
                                        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={zoomToFit}
                                        className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all duration-200 text-sm font-semibold shadow-sm hover:shadow-md"
                                    >
                                        Fit to Screen
                                    </button>
                                    <button
                                        onClick={resetView}
                                        className="px-4 py-2 bg-gradient-to-r from-slate-500 to-slate-600 text-white rounded-lg hover:from-slate-600 hover:to-slate-700 transition-all duration-200 text-sm font-semibold shadow-sm hover:shadow-md"
                                    >
                                        Reset View
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Enhanced Calibration Controls */}
                        <div className="space-y-4">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Calibration</h3>
                            </div>

                            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200/50">
                                <button
                                    onClick={() => setIsCalibrationMode(!isCalibrationMode)}
                                    className={`w-full px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 shadow-sm hover:shadow-md ${isCalibrationMode
                                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'
                                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                                        }`}
                                >
                                    <div className="flex items-center justify-center space-x-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        <span>{isCalibrationMode ? 'Calibrating...' : 'Start Calibration'}</span>
                                    </div>
                                </button>

                                {isCalibrationMode && (
                                    <div className="mt-4 p-3 bg-white rounded-lg border border-green-200">
                                        <div className="flex items-center space-x-3">
                                            <span className="text-sm font-semibold text-slate-700">Reference:</span>
                                            <input
                                                type="number"
                                                min="0.1"
                                                step="0.1"
                                                value={calibrationMeters}
                                                onChange={(e) => setCalibrationMeters(parseFloat(e.target.value) || 1)}
                                                className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-center text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                            />
                                            <span className="text-sm font-semibold text-slate-700">meters</span>
                                        </div>
                                    </div>
                                )}

                                {calibration && (
                                    <div className="mt-4 p-3 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg border border-green-300">
                                        <div className="flex items-center space-x-2">
                                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="text-sm font-bold text-green-800">
                                                {calibration.pixelsPerMeter.toFixed(1)} px/m
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Enhanced Selection Controls */}
                        <div className="space-y-4">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Area Selection</h3>
                            </div>

                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200/50">
                                <button
                                    onClick={() => setIsSelectionMode(!isSelectionMode)}
                                    className={`w-full px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 shadow-sm hover:shadow-md ${isSelectionMode
                                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'
                                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                                        }`}
                                >
                                    <div className="flex items-center justify-center space-x-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.122 2.122" />
                                        </svg>
                                        <span>{isSelectionMode ? 'Selection Active' : 'Start Selection'}</span>
                                    </div>
                                </button>

                                {selections.length > 0 && (
                                    <button
                                        onClick={clearSelections}
                                        className="w-full mt-3 px-4 py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-lg hover:from-red-600 hover:to-pink-600 transition-all duration-200 text-sm font-semibold shadow-sm hover:shadow-md"
                                    >
                                        Clear All ({selections.length})
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Enhanced Status */}
                        <div className="space-y-4">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className="w-8 h-8 bg-gradient-to-br from-slate-500 to-slate-600 rounded-lg flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Status</h3>
                            </div>

                            <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl p-4 border border-slate-200/50 space-y-3">
                                <div className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-slate-200">
                                    <div className={`w-3 h-3 rounded-full ${file ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}></div>
                                    <span className="text-sm font-semibold text-slate-700">
                                        {file ? 'PDF Loaded' : 'No PDF'}
                                    </span>
                                </div>

                                {calibration && (
                                    <div className="flex items-center space-x-3 p-3 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg border border-green-300">
                                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                                        <span className="text-sm font-bold text-green-800">
                                            Calibrated & Ready
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-slate-200">
                                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                    <span className="text-sm font-semibold text-slate-700">
                                        {selections.length} Areas Selected
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Enhanced PDF Viewer */}
                {file && (
                    <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden mb-8">
                        <div className="p-6 border-b border-slate-200/60 bg-gradient-to-r from-slate-50 to-blue-50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-800">{file.name}</h3>
                                        <p className="text-sm text-slate-600">Ready for measurement</p>
                                    </div>
                                </div>

                                {/* Quick Actions */}
                                <div className="flex items-center space-x-3">
                                    {isCalibrationMode && (
                                        <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold flex items-center space-x-1">
                                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                            <span>Calibration Mode</span>
                                        </div>
                                    )}
                                    {isSelectionMode && (
                                        <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold flex items-center space-x-1">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                            <span>Selection Mode</span>
                                        </div>
                                    )}
                                    {!isCalibrationMode && !isSelectionMode && (
                                        <div className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold flex items-center space-x-1">
                                            <div className="w-2 h-2 bg-slate-500 rounded-full"></div>
                                            <span>Navigation Mode</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div
                            ref={containerRef}
                            className="relative overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200"
                            style={{
                                width: '100%',
                                height: '700px',
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

                                {/* Enhanced Selection Canvas Overlay */}
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

                            {/* Zoom Level Indicator */}
                            <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg border border-slate-200/50">
                                <div className="flex items-center space-x-2">
                                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                                    </svg>
                                    <span className="text-sm font-semibold text-slate-700">{zoom}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Enhanced Selections Panel */}
                {selections.length > 0 && (
                    <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8 mb-8">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-slate-900">Selected Areas</h3>
                                    <p className="text-slate-600">{selections.length} area{selections.length !== 1 ? 's' : ''} selected</p>
                                </div>
                            </div>

                            {/* Summary Stats */}
                            <div className="flex items-center space-x-4">
                                <div className="text-right">
                                    <div className="text-2xl font-bold text-slate-900">
                                        {selections.reduce((sum, s) => sum + s.area, 0).toFixed(1)}
                                    </div>
                                    <div className="text-sm text-slate-600">Total Area (px²)</div>
                                </div>
                                {calibration && (
                                    <div className="text-right">
                                        <div className="text-2xl font-bold text-green-600">
                                            {selections.reduce((sum, s) => sum + s.areaInMeters, 0).toFixed(2)}
                                        </div>
                                        <div className="text-sm text-slate-600">Total Area (m²)</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {selections.map((selection, index) => (
                                <div key={selection.id} className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-6 border border-slate-200/50 hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">
                                                {index + 1}
                                            </div>
                                            <div>
                                                <span className="font-bold text-slate-900">Area {index + 1}</span>
                                                <div className="text-xs text-slate-500">Selection</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setSelections(prev => prev.filter(s => s.id !== selection.id))}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-200"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-white/70 rounded-lg p-3 border border-slate-200/50">
                                                <div className="text-xs text-slate-500 font-medium mb-1">Position</div>
                                                <div className="font-mono text-sm font-semibold text-slate-900">
                                                    ({selection.x.toFixed(1)}, {selection.y.toFixed(1)})
                                                </div>
                                            </div>
                                            <div className="bg-white/70 rounded-lg p-3 border border-slate-200/50">
                                                <div className="text-xs text-slate-500 font-medium mb-1">Dimensions</div>
                                                <div className="font-mono text-sm font-semibold text-slate-900">
                                                    {selection.width.toFixed(1)} × {selection.height.toFixed(1)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg p-3 border border-blue-200">
                                            <div className="text-xs text-blue-600 font-medium mb-1">Pixel Area</div>
                                            <div className="font-mono text-lg font-bold text-blue-900">
                                                {selection.area.toFixed(1)} px²
                                            </div>
                                        </div>

                                        {calibration && (
                                            <div className="bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-3 border border-green-200">
                                                <div className="text-xs text-green-600 font-medium mb-1">Real Area</div>
                                                <div className="font-mono text-lg font-bold text-green-900">
                                                    {selection.areaInMeters.toFixed(2)} m²
                                                </div>
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
                    height: 20px;
                    width: 20px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    cursor: pointer;
                    box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
                    border: 2px solid white;
                    transition: all 0.2s ease;
                }
                .slider::-webkit-slider-thumb:hover {
                    transform: scale(1.1);
                    box-shadow: 0 6px 12px rgba(59, 130, 246, 0.4);
                }
                .slider::-webkit-slider-track {
                    background: linear-gradient(to right, #e2e8f0, #cbd5e1);
                    border-radius: 10px;
                    height: 8px;
                }
                .slider::-moz-range-thumb {
                    height: 20px;
                    width: 20px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    cursor: pointer;
                    border: 2px solid white;
                    box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
                    transition: all 0.2s ease;
                }
                .slider::-moz-range-thumb:hover {
                    transform: scale(1.1);
                    box-shadow: 0 6px 12px rgba(59, 130, 246, 0.4);
                }
                .slider::-moz-range-track {
                    background: linear-gradient(to right, #e2e8f0, #cbd5e1);
                    border-radius: 10px;
                    height: 8px;
                    border: none;
                }
            `}</style>
        </div>
    );
} 
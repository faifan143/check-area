"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
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
    start?: { x: number; y: number }; // calibration line start (PDF coords)
    end?: { x: number; y: number };   // calibration line end (PDF coords)
}

// A named calibration system the user can select from
interface NamedCalibration extends Calibration {
    name: string;
}

interface EdgeControl {
    point: { x: number; y: number };
    edgeIndex: number; // Which edge this controls (from point index to next point)
}

interface Shape {
    id: string;
    type: 'circle' | 'rectangle' | 'polygon' | 'line' | 'filled-area';
    points: number[];
    color: string;
    strokeWidth: number;
    selected?: boolean; // For selection state
    curveMode?: boolean; // Enable curve mode for polygons
    edgeControls?: EdgeControl[]; // Curve control points for polygons
    bezierPoints?: number[][];
    fillColor?: string; // Fill color for filled areas
    filled?: boolean; // Whether the shape is filled
    holes?: number[][]; // Optional holes (each is a flat [x1,y1,...])
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
    // Backward-compatible single calibration currently applied (derived from list)
    const [calibration, setCalibration] = useState<Calibration | null>(null);
    const [calibrationMeters, setCalibrationMeters] = useState(1);
    const [calibrationUnit, setCalibrationUnit] = useState<'m' | 'cm'>('m');
    // Multiple calibration systems
    const [calibrations, setCalibrations] = useState<NamedCalibration[]>([]);
    const [activeCalibrationName, setActiveCalibrationName] = useState<string | null>(null);
    const [isCalibNameModalOpen, setIsCalibNameModalOpen] = useState(false);
    const [pendingCalibrationBase, setPendingCalibrationBase] = useState<Calibration | null>(null);
    const [pendingCalibrationName, setPendingCalibrationName] = useState('');
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<'shape' | 'calibration' | null>(null);
    const [isCalibListOpen, setIsCalibListOpen] = useState(false);
    const [calibrationToDeleteName, setCalibrationToDeleteName] = useState<string | null>(null);

    const deleteCalibrationByName = useCallback((name: string) => {
        setCalibrations(prev => {
            const arr = prev.filter(c => c.name !== name);
            try { sessionStorage.setItem('calibrations', JSON.stringify(arr)); } catch { }
            return arr;
        });
        if (activeCalibrationName === name) {
            setActiveCalibrationName(null);
            setCalibration(null);
            try { sessionStorage.removeItem('activeCalibration'); } catch { }
            setSelections(prev => prev.map(s => ({ ...s, areaInMeters: 0 })));
            setIsCalibrationMode(false);
        }
    }, [activeCalibrationName]);

    const deleteActiveCalibration = useCallback(() => {
        if (!activeCalibrationName) return;
        setCalibrations(prev => {
            const arr = prev.filter(c => c.name !== activeCalibrationName);
            try { sessionStorage.setItem('calibrations', JSON.stringify(arr)); } catch { }
            return arr;
        });
        setActiveCalibrationName(null);
        setCalibration(null);
        try { sessionStorage.removeItem('activeCalibration'); } catch { }
        setSelections(prev => prev.map(s => ({ ...s, areaInMeters: 0 })));
        setIsCalibrationMode(false);
    }, [activeCalibrationName]);

    // Drawing state
    const [drawingMode, setDrawingMode] = useState<'circle' | 'rectangle' | 'polygon' | 'line' | 'fill' | null>(null);
    // Single mode: draw + select combined. Draw can be toggled on/off for panning.
    const [currentMode, setCurrentMode] = useState<'draw' | 'select'>('draw');
    const [drawEnabled, setDrawEnabled] = useState<boolean>(false);
    const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
    const [shapes, setShapes] = useState<Shape[]>([]);
    const [fillColor, setFillColor] = useState<string>('#ffeb3b'); // Default fill color (yellow)
    const [drawingPoints, setDrawingPoints] = useState<number[]>([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
    const [draggingShape, setDraggingShape] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
    const [resizing, setResizing] = useState<{ shapeId: string; handleIndex: number } | null>(null);
    const [draggedControlPoint, setDraggedControlPoint] = useState<{ shapeId: string; pointIndex: number; type: 'vertex' | 'edge' } | null>(null);
    // Floating shape info card visibility and data derive from selection + active calibration
    const [isFloodFilling, setIsFloodFilling] = useState(false);
    const [lastDragPdfPoint, setLastDragPdfPoint] = useState<{ x: number; y: number } | null>(null);
    const [hoverCursor, setHoverCursor] = useState<string | null>(null);
    // Dynamic fill now uses internal tuned defaults (no UI sliders)

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

    // Persist calibrations and shapes in sessionStorage
    useEffect(() => {
        // load once
        const rawCalibs = sessionStorage.getItem('calibrations');
        if (rawCalibs) {
            try { setCalibrations(JSON.parse(rawCalibs)); } catch { }
        }
        const rawActive = sessionStorage.getItem('activeCalibration');
        if (rawActive) {
            setActiveCalibrationName(rawActive);
            const found = rawCalibs ? (JSON.parse(rawCalibs) as NamedCalibration[]).find(c => c.name === rawActive) : null;
            if (found) {
                setCalibration(found);
                if (found.start && found.end) {
                    setCalibrationStart(found.start);
                    setCalibrationEnd(found.end);
                }
            }
        }
        const rawShapes = sessionStorage.getItem('shapes');
        if (rawShapes) {
            try { setShapes(JSON.parse(rawShapes)); } catch { }
        }
    }, []);

    useEffect(() => {
        sessionStorage.setItem('shapes', JSON.stringify(shapes));
    }, [shapes]);

    useEffect(() => {
        sessionStorage.setItem('calibrations', JSON.stringify(calibrations));
        if (activeCalibrationName) sessionStorage.setItem('activeCalibration', activeCalibrationName);
        else try { sessionStorage.removeItem('activeCalibration'); } catch { }
    }, [calibrations, activeCalibrationName]);

    useEffect(() => {
        if (calibration?.start && calibration?.end) {
            setCalibrationStart(calibration.start);
            setCalibrationEnd(calibration.end);
        }
    }, [calibration]);

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

    const deleteSelectedShape = () => {
        if (!selectedShapeId) return;
        setShapes(prev => prev.filter(s => s.id !== selectedShapeId));
        setSelectedShapeId(null);
    };

    // Drawing functions
    const handleModeChange = (mode: 'draw' | 'select') => {
        setCurrentMode(mode);
        if (mode !== 'draw') {
            setDrawingMode(null);
            setDrawEnabled(false);
        }
    };

    const handleShapeSelect = (shapeId: string | null) => {
        setSelectedShapeId(shapeId);
        setShapes(shapes.map(shape => ({
            ...shape,
            selected: shape.id === shapeId
        })));
    };

    // Curve mode is always enabled for polygons now; no toggle needed

    // Hit testing function to check if point is inside a shape
    const isPointInShape = useCallback((point: { x: number; y: number }, shape: Shape): boolean => {
        if (shape.type === 'circle') {
            const [centerX, centerY, radius] = shape.points;
            const distance = Math.sqrt(
                Math.pow(point.x - centerX, 2) + Math.pow(point.y - centerY, 2)
            );
            return distance <= radius;
        } else if (shape.type === 'rectangle') {
            const [x, y, width, height] = shape.points;
            const minX = Math.min(x, x + width);
            const maxX = Math.max(x, x + width);
            const minY = Math.min(y, y + height);
            const maxY = Math.max(y, y + height);
            return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
        } else if (shape.type === 'line') {
            // For lines, check if point is close to the line (within 5 pixels)
            const [x1, y1, x2, y2] = shape.points;
            const A = point.x - x1;
            const B = point.y - y1;
            const C = x2 - x1;
            const D = y2 - y1;

            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            const param = lenSq !== 0 ? dot / lenSq : -1;

            let xx, yy;
            if (param < 0) {
                xx = x1;
                yy = y1;
            } else if (param > 1) {
                xx = x2;
                yy = y2;
            } else {
                xx = x1 + param * C;
                yy = y1 + param * D;
            }

            const dx = point.x - xx;
            const dy = point.y - yy;
            return Math.sqrt(dx * dx + dy * dy) <= 5;
        } else if (shape.type === 'polygon') {
            // Point-in-polygon test using ray casting
            let inside = false;
            const points = [];
            for (let i = 0; i < shape.points.length; i += 2) {
                points.push({ x: shape.points[i], y: shape.points[i + 1] });
            }

            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                if (((points[i].y > point.y) !== (points[j].y > point.y)) &&
                    (point.x < (points[j].x - points[i].x) * (point.y - points[i].y) / (points[j].y - points[i].y) + points[i].x)) {
                    inside = !inside;
                }
            }
            return inside;
        }
        return false;
    }, []);

    // Handle canvas click for drawing or selection
    const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const point = {
            x: e.clientX - rect.left - pan.x,
            y: e.clientY - rect.top - pan.y
        };

        // Convert to PDF coordinates
        const pdfPoint = {
            x: point.x / (zoom / 100),
            y: point.y / (zoom / 100)
        };

        // Handle selection mode
        if (currentMode === 'select') {
            // Find clicked shape (check from top to bottom)
            const clickedShape = [...shapes].reverse().find(shape => isPointInShape(pdfPoint, shape));

            if (clickedShape) {
                handleShapeSelect(clickedShape.id);
            } else {
                handleShapeSelect(null);
            }
            return;
        }

        // Handle drawing mode
        if (!drawEnabled || !drawingMode || draggingShape || isFloodFilling) return;

        // Handle flood fill mode on original PDF (dynamic fill)
        if (drawingMode === 'fill') {
            performPdfDynamicFill({ x: pdfPoint.x, y: pdfPoint.y });
            return;
        }

        if (drawingMode === 'line') {
            if (drawingPoints.length === 0) {
                setDrawingPoints([pdfPoint.x, pdfPoint.y]);
                setIsDrawing(true);
            } else {
                const newShape: Shape = {
                    id: `shape_${Date.now()}`,
                    type: 'line',
                    points: [...drawingPoints, pdfPoint.x, pdfPoint.y],
                    color: '#3b82f6', // Blue
                    strokeWidth: 2
                };
                setShapes([...shapes, newShape]);
                setDrawingPoints([]);
                setIsDrawing(false);
                setMousePosition(null);
                // Exit drawing phase until user picks a tool again
                setDrawingMode(null);
            }
        } else if (drawingMode === 'circle') {
            if (drawingPoints.length === 0) {
                setDrawingPoints([pdfPoint.x, pdfPoint.y]);
                setIsDrawing(true);
            } else {
                const [x1, y1] = drawingPoints;
                const [x2, y2] = [pdfPoint.x, pdfPoint.y];
                const centerX = (x1 + x2) / 2;
                const centerY = (y1 + y2) / 2;
                const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)) / 2;

                const newShape: Shape = {
                    id: `shape_${Date.now()}`,
                    type: 'circle',
                    points: [centerX, centerY, radius],
                    color: '#ef4444', // Red
                    strokeWidth: 2
                };
                setShapes([...shapes, newShape]);
                setDrawingPoints([]);
                setIsDrawing(false);
                setMousePosition(null);
                setDrawingMode(null);
            }
        } else if (drawingMode === 'rectangle') {
            if (drawingPoints.length === 0) {
                setDrawingPoints([pdfPoint.x, pdfPoint.y]);
                setIsDrawing(true);
            } else {
                const [x1, y1] = drawingPoints;
                const [x2, y2] = [pdfPoint.x, pdfPoint.y];

                const newShape: Shape = {
                    id: `shape_${Date.now()}`,
                    type: 'rectangle',
                    points: [x1, y1, x2 - x1, y2 - y1],
                    color: '#3b82f6', // Blue
                    strokeWidth: 2
                };
                setShapes([...shapes, newShape]);
                setDrawingPoints([]);
                setIsDrawing(false);
                setMousePosition(null);
                setDrawingMode(null);
            }
        } else if (drawingMode === 'polygon') {
            // Add point to polygon
            setDrawingPoints([...drawingPoints, pdfPoint.x, pdfPoint.y]);
            setIsDrawing(true);
        }
    }, [drawingMode, drawingPoints, shapes, draggingShape, currentMode, isPointInShape, isFloodFilling, fillColor, pan, zoom]);

    // ===== Dynamic Fill (original PDF content) =====
    const getUnderlyingPdfCanvas = (): HTMLCanvasElement | null => {
        const root = containerRef.current;
        if (!root) return null;
        const canvases = Array.from(root.querySelectorAll('canvas')) as HTMLCanvasElement[];
        // Our overlay is canvasRef.current; pick a different one (the PDF render canvas)
        const pdfCanvas = canvases.find(c => c !== canvasRef.current) || null;
        return pdfCanvas;
    };

    const getPixelColor = (data: Uint8ClampedArray, x: number, y: number, width: number): number[] => {
        const clampedX = Math.max(0, Math.min(Math.floor(x), width - 1));
        const clampedY = Math.max(0, Math.min(Math.floor(y), (data.length / 4) / width - 1));
        const idx = (clampedY * width + clampedX) * 4;
        return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    };

    const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        const d = max - min;
        if (d !== 0) {
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h * 360, s * 100, l * 100];
    };

    const colorsMatch = (c1: number[], c2: number[], tol = 6): boolean => {
        return Math.abs(c1[0] - c2[0]) <= tol && Math.abs(c1[1] - c2[1]) <= tol && Math.abs(c1[2] - c2[2]) <= tol;
    };

    const isDarkPixel = (color: number[], threshold = 120): boolean => {
        const brightness = (color[0] + color[1] + color[2]) / 3;
        return brightness < threshold;
    };

    // Simple morphology: dilate dark pixels then erode to seal tiny gaps in walls
    const buildWallMask = (data: Uint8ClampedArray, w: number, h: number, threshold: number, closeRadius: number): Uint8Array => {
        const mask = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                const bright = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                mask[y * w + x] = bright < threshold ? 1 : 0;
            }
        }
        if (closeRadius <= 0) return mask;
        // dilate
        const dil = new Uint8Array(mask);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (mask[y * w + x]) {
                    for (let dy = -closeRadius; dy <= closeRadius; dy++) {
                        for (let dx = -closeRadius; dx <= closeRadius; dx++) {
                            const nx = x + dx, ny = y + dy;
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h) dil[ny * w + nx] = 1;
                        }
                    }
                }
            }
        }
        // erode back
        const ero = new Uint8Array(dil);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!dil[y * w + x]) continue;
                let allOn = 1;
                for (let dy = -closeRadius; dy <= closeRadius && allOn; dy++) {
                    for (let dx = -closeRadius; dx <= closeRadius; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx < 0 || nx >= w || ny < 0 || ny >= h || !dil[ny * w + nx]) { allOn = 0; break; }
                    }
                }
                if (!allOn) ero[y * w + x] = 0;
            }
        }
        return ero;
    };

    const traceBoundaryWithMarchingSquares = (boundaryPixels: Array<{ x: number, y: number }>): number[] => {
        if (boundaryPixels.length === 0) return [];
        const minX = Math.min(...boundaryPixels.map(p => p.x));
        const maxX = Math.max(...boundaryPixels.map(p => p.x));
        const minY = Math.min(...boundaryPixels.map(p => p.y));
        const maxY = Math.max(...boundaryPixels.map(p => p.y));
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        const grid: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));
        boundaryPixels.forEach(p => {
            const gx = p.x - minX;
            const gy = p.y - minY;
            if (gx >= 0 && gx < width && gy >= 0 && gy < height) grid[gy][gx] = true;
        });
        let startX = 0, startY = 0; let found = false;
        for (let y = 0; y < height && !found; y++) {
            for (let x = 0; x < width && !found; x++) {
                if (grid[y][x]) { startX = x; startY = y; found = true; }
            }
        }
        if (!found) return [];
        const points: Array<{ x: number, y: number }> = [];
        const visited = new Set<string>();
        let cx = startX, cy = startY; let dir = 0; // 0 right
        const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
        while (points.length < boundaryPixels.length * 2) {
            const key = `${cx},${cy}`;
            if (visited.has(key)) break;
            visited.add(key);
            points.push({ x: cx + minX, y: cy + minY });
            let nextFound = false;
            for (let i = 0; i < 8; i++) {
                const t = (dir + i) % 8; const [dx, dy] = dirs[t];
                const nx = cx + dx, ny = cy + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx]) { cx = nx; cy = ny; dir = t; nextFound = true; break; }
            }
            if (!nextFound) break;
        }
        // simple simplification by skipping very close points
        const simplified: Array<{ x: number, y: number }> = [];
        const tol = Math.max(1, Math.floor(points.length / 200));
        for (const p of points) {
            const last = simplified[simplified.length - 1];
            if (!last || Math.hypot(p.x - last.x, p.y - last.y) > tol) simplified.push(p);
        }
        const result: number[] = [];
        simplified.forEach(p => { result.push(p.x, p.y); });
        return result;
    };

    const performPdfDynamicFill = async (pdfPoint: { x: number; y: number }) => {
        const pdfCanvas = getUnderlyingPdfCanvas();
        if (!pdfCanvas) return;
        setIsFloodFilling(true);
        try {
            const pageW = pdfCanvas.width;
            const pageH = pdfCanvas.height;
            // ROI around click for stability
            const clickX = Math.floor(pdfPoint.x * (zoom / 100));
            const clickY = Math.floor(pdfPoint.y * (zoom / 100));
            const half = 640;
            const x0 = Math.max(0, clickX - half);
            const y0 = Math.max(0, clickY - half);
            const x1 = Math.min(pageW, clickX + half);
            const y1 = Math.min(pageH, clickY + half);
            const roiW = x1 - x0;
            const roiH = y1 - y0;

            const temp = document.createElement('canvas');
            temp.width = roiW; temp.height = roiH;
            const tctx = temp.getContext('2d');
            if (!tctx) return;
            tctx.drawImage(pdfCanvas, x0, y0, roiW, roiH, 0, 0, roiW, roiH);
            const imgData = tctx.getImageData(0, 0, roiW, roiH);
            const data = imgData.data;
            // Tuned constants for robust results
            const wallThreshold = 170; // 0-255 brightness considered wall
            const gapPixels = 2;       // morphological closing kernel radius
            const fillTolerance = 26;  // color tolerance
            const maxSaturation = 40;  // exclude highly saturated regions
            const smoothEpsilon = 4;   // simplification epsilon in px
            const wallMask = buildWallMask(data, roiW, roiH, wallThreshold, gapPixels);

            let startX = clickX - x0;
            let startY = clickY - y0;
            if (wallMask[startY * roiW + startX] === 1) {
                let found = false;
                for (let r = 1; r <= 6 && !found; r++) {
                    for (let dy = -r; dy <= r && !found; dy++) {
                        for (let dx = -r; dx <= r; dx++) {
                            const nx = startX + dx, ny = startY + dy;
                            if (nx >= 0 && nx < roiW && ny >= 0 && ny < roiH && wallMask[ny * roiW + nx] === 0) {
                                startX = nx; startY = ny; found = true; break;
                            }
                        }
                    }
                }
                if (!found) { setIsFloodFilling(false); return; }
            }
            const startColor = getPixelColor(data, startX, startY, roiW);
            const [, sat] = (() => { const [h, s, l] = rgbToHsl(startColor[0], startColor[1], startColor[2]); return [h, s, l]; })();
            if (isDarkPixel(startColor, wallThreshold) || sat > maxSaturation) { setIsFloodFilling(false); return; }

            const isBoundary = (x: number, y: number) => wallMask[y * roiW + x] === 1;

            const visited = new Set<string>();
            const queue: Array<{ x: number, y: number }> = [{ x: startX, y: startY }];
            const filled: Array<{ x: number, y: number }> = [];
            const maxPixels = roiW * roiH * 0.6;
            while (queue.length) {
                const p = queue.shift()!; const key = `${p.x},${p.y}`;
                if (visited.has(key) || p.x < 0 || p.x >= roiW || p.y < 0 || p.y >= roiH) continue;
                if (isBoundary(p.x, p.y)) continue;
                const c = getPixelColor(data, p.x, p.y, roiW);
                if (!colorsMatch(c, startColor, fillTolerance)) continue;
                visited.add(key); filled.push(p);
                if (filled.length > maxPixels) break;
                queue.push({ x: p.x + 1, y: p.y });
                queue.push({ x: p.x - 1, y: p.y });
                queue.push({ x: p.x, y: p.y + 1 });
                queue.push({ x: p.x, y: p.y - 1 });
            }

            if (filled.length < 30) { setIsFloodFilling(false); return; }
            const filledSet = new Set(filled.map(p => `${p.x},${p.y}`));
            const boundary: Array<{ x: number, y: number }> = [];
            for (const p of filled) {
                const neighbors = [{ x: p.x + 1, y: p.y }, { x: p.x - 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y - 1 }];
                if (neighbors.some(n => !filledSet.has(`${n.x},${n.y}`))) boundary.push({ x: p.x + x0, y: p.y + y0 });
            }
            let boundaryPoints = traceBoundaryWithMarchingSquares(boundary);
            // extra simplification pass
            if (smoothEpsilon > 0 && boundaryPoints.length > 50) {
                const eps = smoothEpsilon;
                const simp: number[] = [];
                let lastX = boundaryPoints[0], lastY = boundaryPoints[1];
                simp.push(lastX, lastY);
                for (let i = 2; i < boundaryPoints.length; i += 2) {
                    const x = boundaryPoints[i], y = boundaryPoints[i + 1];
                    if (Math.hypot(x - lastX, y - lastY) >= eps) {
                        simp.push(x, y); lastX = x; lastY = y;
                    }
                }
                boundaryPoints = simp;
            }
            if (boundaryPoints.length >= 6) {
                // convert back to PDF coords
                const invScale = 1 / (zoom / 100);
                const pdfPts: number[] = [];
                for (let i = 0; i < boundaryPoints.length; i += 2) {
                    pdfPts.push(boundaryPoints[i] * invScale);
                    pdfPts.push(boundaryPoints[i + 1] * invScale);
                }
                const newShape: Shape = {
                    id: `shape_${Date.now()}`,
                    type: 'filled-area',
                    points: pdfPts,
                    color: fillColor,
                    strokeWidth: 0,
                    fillColor: fillColor,
                    filled: true
                };
                setShapes(prev => [...prev, newShape]);
            }
        } finally {
            setIsFloodFilling(false);
        }
    };

    // Handle double click to close polygon
    const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (drawingMode === 'polygon' && drawingPoints.length >= 6) { // At least 3 points (6 coordinates)
            // Clean up duplicate last point(s) caused by double-click second click
            const cleaned = [...drawingPoints];
            const eps = 0.5; // in PDF coords

            const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

            // Remove trailing duplicates (last point nearly equal to previous)
            while (cleaned.length >= 4) {
                const lx = cleaned[cleaned.length - 2];
                const ly = cleaned[cleaned.length - 1];
                const px = cleaned[cleaned.length - 4];
                const py = cleaned[cleaned.length - 3];
                if (dist(lx, ly, px, py) <= eps) {
                    cleaned.splice(cleaned.length - 2, 2);
                } else {
                    break;
                }
            }

            // If last point equals first point, drop the last
            if (cleaned.length >= 6) {
                const lx = cleaned[cleaned.length - 2];
                const ly = cleaned[cleaned.length - 1];
                const fx = cleaned[0];
                const fy = cleaned[1];
                if (dist(lx, ly, fx, fy) <= eps) {
                    cleaned.splice(cleaned.length - 2, 2);
                }
            }

            if (cleaned.length >= 6) {
                const newShape: Shape = {
                    id: `shape_${Date.now()}`,
                    type: 'polygon',
                    points: cleaned,
                    color: '#ef4444', // Red
                    strokeWidth: 2,
                    curveMode: true
                };
                setShapes([...shapes, newShape]);
            }
            setDrawingPoints([]);
            setIsDrawing(false);
            setMousePosition(null);
            setDrawingMode(null);
        }
    }, [drawingMode, drawingPoints, shapes]);

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
        // Prioritize calibration mode so nothing else intercepts the click
        if (isCalibrationMode) {
            const coords = getPdfCoordinates(e);
            if (!isCalibrating) {
                setIsCalibrating(true);
                setCalibrationStart(coords);
                setCalibrationEnd(coords);
            } else {
                const length = Math.hypot(coords.x - calibrationStart.x, coords.y - calibrationStart.y);
                if (length > 10) {
                    const refMeters = calibrationUnit === 'm' ? calibrationMeters : (calibrationMeters / 100);
                    const base: Calibration = {
                        pixelsPerMeter: length / refMeters,
                        referenceLength: length,
                        referenceMeters: refMeters,
                        start: { x: calibrationStart.x, y: calibrationStart.y },
                        end: { x: coords.x, y: coords.y }
                    };
                    setPendingCalibrationBase(base);
                    setPendingCalibrationName('');
                    setIsCalibNameModalOpen(true);
                }
                // Freeze at this end point until user confirms
                setIsCalibrating(false);
            }
            return;
        }

        // Selection interactions (move/resize/curve) like home page
        {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const pdfPoint = {
                    x: (e.clientX - rect.left - pan.x) / (zoom / 100),
                    y: (e.clientY - rect.top - pan.y) / (zoom / 100)
                };

                // Prefer working on the selected shape if any
                const selectedShape = selectedShapeId ? shapes.find(s => s.id === selectedShapeId) : undefined;

                // Utility thresholds in pdf coords
                const threshold = 8 / (zoom / 100);

                // If selected polygon, check handles first
                if (selectedShape && selectedShape.type === 'polygon') {
                    // Check vertices proximity
                    for (let i = 0; i < selectedShape.points.length; i += 2) {
                        const vx = selectedShape.points[i];
                        const vy = selectedShape.points[i + 1];
                        if (Math.hypot(pdfPoint.x - vx, pdfPoint.y - vy) <= threshold) {
                            setDraggedControlPoint({ shapeId: selectedShape.id, pointIndex: i, type: 'vertex' });
                            return;
                        }
                    }

                    // Check edge control points (existing or midpoints)
                    for (let i = 0; i < selectedShape.points.length; i += 2) {
                        const nextIndex = (i + 2) % selectedShape.points.length;
                        const midX = (selectedShape.points[i] + selectedShape.points[nextIndex]) / 2;
                        const midY = (selectedShape.points[i + 1] + selectedShape.points[nextIndex + 1]) / 2;

                        const existing = selectedShape.edgeControls?.find(ec => ec.edgeIndex === i / 2);
                        const control = existing ? existing.point : { x: midX, y: midY };
                        if (Math.hypot(pdfPoint.x - control.x, pdfPoint.y - control.y) <= threshold) {
                            setDraggedControlPoint({ shapeId: selectedShape.id, pointIndex: i, type: 'edge' });
                            return;
                        }
                    }
                }

                // If selected rectangle, check resize handles (corners only) or curve controls (edge midpoints)
                if (selectedShape && selectedShape.type === 'rectangle') {
                    const [rx, ry, rwidth, rheight] = selectedShape.points;
                    const minX = Math.min(rx, rx + rwidth);
                    const maxX = Math.max(rx, rx + rwidth);
                    const minY = Math.min(ry, ry + rheight);
                    const maxY = Math.max(ry, ry + rheight);

                    // Resize handles: corners only
                    const handles = [
                        { x: minX, y: minY }, // 0 nw
                        { x: maxX, y: minY }, // 1 ne
                        { x: maxX, y: maxY }, // 2 se
                        { x: minX, y: maxY }  // 3 sw
                    ];

                    for (let i = 0; i < handles.length; i++) {
                        if (Math.hypot(pdfPoint.x - handles[i].x, pdfPoint.y - handles[i].y) <= threshold) {
                            setResizing({ shapeId: selectedShape.id, handleIndex: i });
                            return;
                        }
                    }

                    // Curve controls (midpoints) act like polygon edge controls
                    {
                        const corners = [
                            { x: minX, y: minY },
                            { x: maxX, y: minY },
                            { x: maxX, y: maxY },
                            { x: minX, y: maxY }
                        ];
                        for (let i = 0; i < 4; i++) {
                            const a = corners[i];
                            const b = corners[(i + 1) % 4];
                            const midX = (a.x + b.x) / 2;
                            const midY = (a.y + b.y) / 2;
                            const existing = selectedShape.edgeControls?.find(ec => ec.edgeIndex === i);
                            const control = existing ? existing.point : { x: midX, y: midY };
                            if (Math.hypot(pdfPoint.x - control.x, pdfPoint.y - control.y) <= threshold) {
                                setDraggedControlPoint({ shapeId: selectedShape.id, pointIndex: i * 2, type: 'edge' });
                                return;
                            }
                        }
                    }
                }

                // Otherwise, start dragging the clicked shape if any (only on left click)
                const clickedShape = [...shapes].reverse().find(shape => isPointInShape(pdfPoint, shape));
                if (clickedShape && e.button === 0) {
                    handleShapeSelect(clickedShape.id);
                    setDraggingShape(clickedShape.id);
                    setLastDragPdfPoint(pdfPoint);
                    return;
                } else if (!clickedShape && e.button === 0) {
                    // Clicked empty canvas: clear selection
                    handleShapeSelect(null);
                }
            }
        }
        // Handle drawing mode first
        if (drawEnabled && drawingMode && e.button === 0) {
            handleCanvasClick(e);
            return;
        }

        if (isSelectionMode) {
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
        // Handle drawing preview
        if (drawEnabled && drawingMode && isDrawing) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;

            const point = {
                x: e.clientX - rect.left - pan.x,
                y: e.clientY - rect.top - pan.y
            };

            const pdfPoint = {
                x: point.x / (zoom / 100),
                y: point.y / (zoom / 100)
            };

            setMousePosition(pdfPoint);
            return;
        }

        // Dragging shape in select mode
        if (draggingShape) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const pdfPoint = {
                x: (e.clientX - rect.left - pan.x) / (zoom / 100),
                y: (e.clientY - rect.top - pan.y) / (zoom / 100)
            };
            if (!lastDragPdfPoint) {
                setLastDragPdfPoint(pdfPoint);
                return;
            }
            const dx = pdfPoint.x - lastDragPdfPoint.x;
            const dy = pdfPoint.y - lastDragPdfPoint.y;
            if (dx !== 0 || dy !== 0) {
                setShapes(prev => prev.map(s => {
                    if (s.id !== draggingShape) return s;
                    let newPoints: number[] = [];
                    if (s.type === 'line' || s.type === 'polygon' || s.type === 'filled-area') {
                        for (let i = 0; i < s.points.length; i += 2) {
                            newPoints.push(s.points[i] + dx);
                            newPoints.push(s.points[i + 1] + dy);
                        }
                    } else if (s.type === 'rectangle') {
                        const [rx, ry, rw, rh] = s.points;
                        newPoints = [rx + dx, ry + dy, rw, rh];
                    } else if (s.type === 'circle') {
                        newPoints = [s.points[0] + dx, s.points[1] + dy, s.points[2]];
                    }
                    let newEdgeControls = s.edgeControls ? s.edgeControls.map(ec => ({ edgeIndex: ec.edgeIndex, point: { x: ec.point.x + dx, y: ec.point.y + dy } })) : undefined;
                    return { ...s, points: newPoints, edgeControls: newEdgeControls };
                }));
                setLastDragPdfPoint(pdfPoint);
            }
            return;
        }

        // Dragging polygon control point
        if (draggedControlPoint) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const pdfPoint = {
                x: (e.clientX - rect.left - pan.x) / (zoom / 100),
                y: (e.clientY - rect.top - pan.y) / (zoom / 100)
            };
            setShapes(prev => prev.map(s => {
                if (s.id !== draggedControlPoint.shapeId) return s;
                if (s.type === 'polygon') {
                    if (draggedControlPoint.type === 'vertex') {
                        const newPts = [...s.points];
                        newPts[draggedControlPoint.pointIndex] = pdfPoint.x;
                        newPts[draggedControlPoint.pointIndex + 1] = pdfPoint.y;
                        return { ...s, points: newPts };
                    } else {
                        const edgeIndex = draggedControlPoint.pointIndex / 2;
                        const newControls = [...(s.edgeControls || [])];
                        const idx = newControls.findIndex(ec => ec.edgeIndex === edgeIndex);
                        if (idx >= 0) newControls[idx] = { edgeIndex, point: { x: pdfPoint.x, y: pdfPoint.y } };
                        else newControls.push({ edgeIndex, point: { x: pdfPoint.x, y: pdfPoint.y } });
                        return { ...s, curveMode: true, edgeControls: newControls };
                    }
                } else if (s.type === 'rectangle' && draggedControlPoint.type === 'edge') {
                    const edgeIndex = Math.floor(draggedControlPoint.pointIndex / 2);
                    const newControls = [...(s.edgeControls || [])];
                    const idx = newControls.findIndex(ec => ec.edgeIndex === edgeIndex);
                    if (idx >= 0) newControls[idx] = { edgeIndex, point: { x: pdfPoint.x, y: pdfPoint.y } };
                    else newControls.push({ edgeIndex, point: { x: pdfPoint.x, y: pdfPoint.y } });
                    return { ...s, curveMode: true, edgeControls: newControls };
                }
                return s;
            }));
            return;
        }

        // Resizing rectangle or circle
        if (resizing) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const pdfPoint = {
                x: (e.clientX - rect.left - pan.x) / (zoom / 100),
                y: (e.clientY - rect.top - pan.y) / (zoom / 100)
            };
            setShapes(prev => prev.map(s => {
                if (s.id !== resizing.shapeId) return s;
                if (s.type === 'rectangle') {
                    const [rx, ry, rw, rh] = s.points;
                    let x0 = Math.min(rx, rx + rw);
                    let y0 = Math.min(ry, ry + rh);
                    let x1 = Math.max(rx, rx + rw);
                    let y1 = Math.max(ry, ry + rh);
                    switch (resizing.handleIndex) {
                        case 0: x0 = pdfPoint.x; y0 = pdfPoint.y; break; // nw
                        case 1: x1 = pdfPoint.x; y0 = pdfPoint.y; break; // ne
                        case 2: x1 = pdfPoint.x; y1 = pdfPoint.y; break; // se
                        case 3: x0 = pdfPoint.x; y1 = pdfPoint.y; break; // sw
                        case 4: y0 = pdfPoint.y; break; // n
                        case 5: y1 = pdfPoint.y; break; // s
                        case 6: x0 = pdfPoint.x; break; // w
                        case 7: x1 = pdfPoint.x; break; // e
                    }
                    const nx = x0;
                    const ny = y0;
                    const nw = x1 - x0;
                    const nh = y1 - y0;
                    return { ...s, points: [nx, ny, nw, nh] };
                } else if (s.type === 'circle') {
                    const [cx, cy] = s.points;
                    const r = Math.max(1, Math.hypot(pdfPoint.x - cx, pdfPoint.y - cy));
                    return { ...s, points: [cx, cy, r] };
                }
                return s;
            }));
            return;
        }

        // Hover cursor feedback when not dragging
        {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const pdfPoint = {
                    x: (e.clientX - rect.left - pan.x) / (zoom / 100),
                    y: (e.clientY - rect.top - pan.y) / (zoom / 100)
                };
                const threshold = 8 / (zoom / 100);
                let cursor: string | null = null;
                const selectedShape = selectedShapeId ? shapes.find(s => s.id === selectedShapeId) : undefined;

                // Check polygon handles
                if (selectedShape && selectedShape.type === 'polygon') {
                    for (let i = 0; i < selectedShape.points.length; i += 2) {
                        const vx = selectedShape.points[i];
                        const vy = selectedShape.points[i + 1];
                        if (Math.hypot(pdfPoint.x - vx, pdfPoint.y - vy) <= threshold) {
                            cursor = 'pointer';
                            break;
                        }
                    }
                    if (!cursor) {
                        for (let i = 0; i < selectedShape.points.length; i += 2) {
                            const nextIndex = (i + 2) % selectedShape.points.length;
                            const midX = (selectedShape.points[i] + selectedShape.points[nextIndex]) / 2;
                            const midY = (selectedShape.points[i + 1] + selectedShape.points[nextIndex + 1]) / 2;
                            const existing = selectedShape.edgeControls?.find(ec => ec.edgeIndex === i / 2);
                            const cp = existing ? existing.point : { x: midX, y: midY };
                            if (Math.hypot(pdfPoint.x - cp.x, pdfPoint.y - cp.y) <= threshold) {
                                cursor = 'pointer';
                                break;
                            }
                        }
                    }
                }

                // Check rectangle resize handles (corners only)
                if (!cursor && selectedShape && selectedShape.type === 'rectangle') {
                    const [rx, ry, rwidth, rheight] = selectedShape.points;
                    const minX = Math.min(rx, rx + rwidth);
                    const maxX = Math.max(rx, rx + rwidth);
                    const minY = Math.min(ry, ry + rheight);
                    const maxY = Math.max(ry, ry + rheight);
                    const handles = [
                        { x: minX, y: minY },
                        { x: maxX, y: minY },
                        { x: maxX, y: maxY },
                        { x: minX, y: maxY }
                    ];
                    for (let i = 0; i < handles.length; i++) {
                        if (Math.hypot(pdfPoint.x - handles[i].x, pdfPoint.y - handles[i].y) <= threshold) {
                            cursor = 'nwse-resize';
                            break;
                        }
                    }
                }

                // Check circle resize handles (N,E,S,W)
                if (!cursor && selectedShape && selectedShape.type === 'circle') {
                    const [cx, cy, r] = selectedShape.points;
                    const handles = [
                        { x: cx + r, y: cy },
                        { x: cx - r, y: cy },
                        { x: cx, y: cy - r },
                        { x: cx, y: cy + r }
                    ];
                    for (let i = 0; i < handles.length; i++) {
                        if (Math.hypot(pdfPoint.x - handles[i].x, pdfPoint.y - handles[i].y) <= threshold) {
                            cursor = i >= 2 ? 'ns-resize' : 'ew-resize';
                            break;
                        }
                    }
                }

                // Over any shape
                if (!cursor) {
                    const overShape = [...shapes].reverse().find(s => isPointInShape(pdfPoint, s));
                    if (overShape) cursor = 'pointer';
                }

                setHoverCursor(cursor);
            }
        }

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
        if (draggingShape) {
            setDraggingShape(null);
            setLastDragPdfPoint(null);
        }
        if (draggedControlPoint) {
            setDraggedControlPoint(null);
        }
        if (resizing) {
            setResizing(null);
        }
        if (isCalibrating) {
            // Do nothing on mouse up; finalize on second click (mouse down)
            return;
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
    }, [drawEnabled]);

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
        if (isCalibrating || calibration) {
            const startX = calibrationStart.x * (zoom / 100);
            const startY = calibrationStart.y * (zoom / 100);
            const endX = (isCalibrating ? calibrationEnd.x : (calibration?.end?.x ?? calibrationEnd.x)) * (zoom / 100);
            const endY = (isCalibrating ? calibrationEnd.y : (calibration?.end?.y ?? calibrationEnd.y)) * (zoom / 100);

            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.setLineDash([]);
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
            ctx.fillText(`${calibration?.referenceMeters ?? calibrationMeters}m`, midX + 10, midY - 10);
        }

        // Draw shapes
        shapes.forEach((shape) => {
            ctx.save();

            // Convert PDF coordinates to canvas coordinates
            const scale = zoom / 100;

            switch (shape.type) {
                case 'circle':
                    const [centerX, centerY, radius] = shape.points;
                    const scaledCenterX = centerX * scale;
                    const scaledCenterY = centerY * scale;
                    const scaledRadius = radius * scale;

                    ctx.strokeStyle = shape.selected ? '#ff0000' : shape.color;
                    ctx.lineWidth = shape.selected ? 3 : shape.strokeWidth;
                    ctx.beginPath();
                    ctx.arc(scaledCenterX, scaledCenterY, scaledRadius, 0, 2 * Math.PI);
                    ctx.stroke();

                    // Fill with semi-transparent color
                    ctx.fillStyle = shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)';
                    ctx.fill();

                    // Resize handles when selected
                    if (shape.selected) {
                        const handlePoints = [
                            { x: (centerX + radius) * scale, y: centerY * scale },
                            { x: (centerX - radius) * scale, y: centerY * scale },
                            { x: centerX * scale, y: (centerY - radius) * scale },
                            { x: centerX * scale, y: (centerY + radius) * scale }
                        ];
                        ctx.fillStyle = '#ffffff';
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 2;
                        handlePoints.forEach(h => {
                            ctx.beginPath();
                            ctx.arc(h.x, h.y, 5, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.stroke();
                        });
                    }
                    break;

                case 'rectangle':
                    const [x, y, width, height] = shape.points;
                    const scaledX = x * scale;
                    const scaledY = y * scale;
                    const scaledWidth = width * scale;
                    const scaledHeight = height * scale;

                    ctx.strokeStyle = shape.selected ? '#ff0000' : shape.color;
                    ctx.lineWidth = shape.selected ? 3 : shape.strokeWidth;

                    // If curve mode enabled for rectangle, draw each edge possibly curved
                    if (shape.curveMode) {
                        const corners = [
                            { x: x, y: y },
                            { x: x + width, y: y },
                            { x: x + width, y: y + height },
                            { x: x, y: y + height }
                        ];
                        ctx.beginPath();
                        ctx.moveTo(corners[0].x * scale, corners[0].y * scale);
                        for (let i = 0; i < 4; i++) {
                            const a = corners[i];
                            const b = corners[(i + 1) % 4];
                            const ec = shape.edgeControls?.find(ec => ec.edgeIndex === i);
                            if (ec) {
                                ctx.quadraticCurveTo(ec.point.x * scale, ec.point.y * scale, b.x * scale, b.y * scale);
                            } else {
                                ctx.lineTo(b.x * scale, b.y * scale);
                            }
                        }
                        ctx.closePath();
                        ctx.stroke();
                        ctx.fillStyle = shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)';
                        ctx.fill();
                    } else {
                        ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
                        ctx.fillStyle = shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)';
                        ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
                    }

                    // Resize handles when selected
                    if (shape.selected) {
                        const handles = [
                            { x: scaledX, y: scaledY },
                            { x: scaledX + scaledWidth, y: scaledY },
                            { x: scaledX + scaledWidth, y: scaledY + scaledHeight },
                            { x: scaledX, y: scaledY + scaledHeight }
                        ];
                        ctx.fillStyle = '#ffffff';
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 2;
                        handles.forEach(h => {
                            ctx.beginPath();
                            ctx.arc(h.x, h.y, 5, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.stroke();
                        });

                        // Curve controls on each edge (midpoints), shown in different color
                        const corners = [
                            { x: x, y: y },
                            { x: x + width, y: y },
                            { x: x + width, y: y + height },
                            { x: x, y: y + height }
                        ];
                        for (let i = 0; i < 4; i++) {
                            const a = corners[i];
                            const b = corners[(i + 1) % 4];
                            const midX = (a.x + b.x) / 2;
                            const midY = (a.y + b.y) / 2;
                            const ec = shape.edgeControls?.find(ec => ec.edgeIndex === i);
                            const cp = ec ? ec.point : { x: midX, y: midY };
                            if (ec) {
                                ctx.strokeStyle = '#999999';
                                ctx.lineWidth = 1;
                                ctx.setLineDash([3, 3]);
                                ctx.beginPath();
                                ctx.moveTo(midX * scale, midY * scale);
                                ctx.lineTo(cp.x * scale, cp.y * scale);
                                ctx.stroke();
                                ctx.setLineDash([]);
                            }
                            ctx.fillStyle = ec ? '#4ecdc4' : '#dddddd';
                            ctx.strokeStyle = '#666666';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.arc(cp.x * scale, cp.y * scale, 5, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.stroke();
                        }
                    }
                    break;

                case 'line':
                    const [x1, y1, x2, y2] = shape.points;
                    const scaledX1 = x1 * scale;
                    const scaledY1 = y1 * scale;
                    const scaledX2 = x2 * scale;
                    const scaledY2 = y2 * scale;

                    ctx.strokeStyle = shape.color;
                    ctx.lineWidth = shape.strokeWidth;
                    ctx.beginPath();
                    ctx.moveTo(scaledX1, scaledY1);
                    ctx.lineTo(scaledX2, scaledY2);
                    ctx.stroke();
                    break;

                case 'polygon':
                    ctx.strokeStyle = shape.selected ? '#ff0000' : shape.color;
                    ctx.lineWidth = shape.selected ? 3 : shape.strokeWidth;
                    ctx.beginPath();

                    if (shape.curveMode && shape.edgeControls && shape.edgeControls.length > 0) {
                        for (let i = 0; i < shape.points.length; i += 2) {
                            const x = shape.points[i] * scale;
                            const y = shape.points[i + 1] * scale;
                            if (i === 0) {
                                ctx.moveTo(x, y);
                            } else {
                                const edgeIndex = (i / 2) - 1;
                                const ec = shape.edgeControls.find(ec => ec.edgeIndex === edgeIndex);
                                if (ec) {
                                    ctx.quadraticCurveTo(ec.point.x * scale, ec.point.y * scale, x, y);
                                } else {
                                    ctx.lineTo(x, y);
                                }
                            }
                        }
                        // Closing edge
                        const lastEdgeIndex = (shape.points.length / 2) - 1;
                        const lastEC = shape.edgeControls.find(ec => ec.edgeIndex === lastEdgeIndex);
                        if (lastEC) {
                            ctx.quadraticCurveTo(lastEC.point.x * scale, lastEC.point.y * scale, shape.points[0] * scale, shape.points[1] * scale);
                        } else {
                            ctx.closePath();
                        }
                    } else {
                        for (let i = 0; i < shape.points.length; i += 2) {
                            const x = shape.points[i] * scale;
                            const y = shape.points[i + 1] * scale;
                            if (i === 0) {
                                ctx.moveTo(x, y);
                            } else {
                                ctx.lineTo(x, y);
                            }
                        }
                        ctx.closePath();
                    }

                    ctx.stroke();

                    // Fill with semi-transparent color
                    ctx.fillStyle = shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)';
                    ctx.fill();

                    // Draw control handles when selected (draggable)
                    if (shape.selected) {
                        // Vertex handles
                        for (let i = 0; i < shape.points.length; i += 2) {
                            const vx = shape.points[i] * scale;
                            const vy = shape.points[i + 1] * scale;
                            ctx.fillStyle = '#ffffff';
                            ctx.strokeStyle = '#000000';
                            ctx.lineWidth = 2;
                            ctx.beginPath();
                            ctx.arc(vx, vy, 6, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.stroke();
                        }
                        // Edge controls for curve mode
                        if (shape.curveMode) {
                            for (let i = 0; i < shape.points.length; i += 2) {
                                const nextIndex = (i + 2) % shape.points.length;
                                const midX = (shape.points[i] + shape.points[nextIndex]) / 2;
                                const midY = (shape.points[i + 1] + shape.points[nextIndex + 1]) / 2;
                                const ec = shape.edgeControls?.find(ec => ec.edgeIndex === i / 2);
                                const cp = ec ? ec.point : { x: midX, y: midY };
                                if (ec) {
                                    // guide line
                                    ctx.strokeStyle = '#999999';
                                    ctx.lineWidth = 1;
                                    ctx.setLineDash([3, 3]);
                                    ctx.beginPath();
                                    ctx.moveTo(midX * scale, midY * scale);
                                    ctx.lineTo(cp.x * scale, cp.y * scale);
                                    ctx.stroke();
                                    ctx.setLineDash([]);
                                }
                                // control point
                                ctx.fillStyle = ec ? '#4ecdc4' : '#dddddd';
                                ctx.strokeStyle = '#666666';
                                ctx.lineWidth = 1;
                                ctx.beginPath();
                                ctx.arc(cp.x * scale, cp.y * scale, 5, 0, 2 * Math.PI);
                                ctx.fill();
                                ctx.stroke();
                            }
                        }
                    }
                    break;

                case 'filled-area':
                    ctx.fillStyle = shape.fillColor || fillColor;
                    ctx.strokeStyle = shape.selected ? '#ff0000' : 'rgba(0,0,0,0.1)';
                    ctx.lineWidth = shape.selected ? 2 : 0;
                    ctx.globalAlpha = 0.85;

                    ctx.beginPath();
                    for (let i = 0; i < shape.points.length; i += 2) {
                        const x = shape.points[i] * scale;
                        const y = shape.points[i + 1] * scale;

                        if (i === 0) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }
                    }
                    ctx.closePath();
                    ctx.fill();
                    if (shape.selected) {
                        ctx.stroke();
                    }
                    ctx.globalAlpha = 1;
                    break;
            }

            ctx.restore();
        });

        // No-op: drawing preview handled below

        // Draw drawing preview
        if (isDrawing && drawingPoints.length > 0 && mousePosition) {
            ctx.save();
            const scale = zoom / 100;

            if (drawingMode === 'line') {
                ctx.strokeStyle = '#0066cc';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(drawingPoints[0] * scale, drawingPoints[1] * scale);
                ctx.lineTo(mousePosition.x * scale, mousePosition.y * scale);
                ctx.stroke();
                ctx.setLineDash([]);
            } else if (drawingMode === 'circle') {
                const centerX = (drawingPoints[0] + mousePosition.x) / 2 * scale;
                const centerY = (drawingPoints[1] + mousePosition.y) / 2 * scale;
                const radius = Math.sqrt(Math.pow(mousePosition.x - drawingPoints[0], 2) + Math.pow(mousePosition.y - drawingPoints[1], 2)) / 2 * scale;

                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
                ctx.fill();
            } else if (drawingMode === 'rectangle') {
                const x = drawingPoints[0] * scale;
                const y = drawingPoints[1] * scale;
                const width = (mousePosition.x - drawingPoints[0]) * scale;
                const height = (mousePosition.y - drawingPoints[1]) * scale;

                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(x, y, width, height);
                ctx.setLineDash([]);

                ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
                ctx.fillRect(x, y, width, height);
            } else if (drawingMode === 'polygon') {
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);

                // Draw existing lines
                if (drawingPoints.length >= 4) {
                    ctx.beginPath();
                    for (let i = 0; i < drawingPoints.length; i += 2) {
                        const x = drawingPoints[i] * scale;
                        const y = drawingPoints[i + 1] * scale;

                        if (i === 0) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }
                    }
                    ctx.stroke();
                }

                // Draw line from last point to current mouse position
                if (drawingPoints.length >= 2) {
                    ctx.beginPath();
                    ctx.moveTo(drawingPoints[drawingPoints.length - 2] * scale, drawingPoints[drawingPoints.length - 1] * scale);
                    ctx.lineTo(mousePosition.x * scale, mousePosition.y * scale);
                    ctx.stroke();
                }

                // Draw line from current mouse position back to first point
                if (drawingPoints.length >= 2) {
                    ctx.setLineDash([3, 3]);
                    ctx.globalAlpha = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(mousePosition.x * scale, mousePosition.y * scale);
                    ctx.lineTo(drawingPoints[0] * scale, drawingPoints[1] * scale);
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }

                ctx.setLineDash([]);

                // Draw points
                drawingPoints.forEach((point, index) => {
                    if (index % 2 === 0) {
                        ctx.fillStyle = '#ef4444';
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.arc(point * scale, drawingPoints[index + 1] * scale, 3, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.stroke();
                    }
                });

                // Draw current mouse position
                ctx.fillStyle = '#ef4444';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.globalAlpha = 0.7;
                ctx.beginPath();
                ctx.arc(mousePosition.x * scale, mousePosition.y * scale, 3, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            ctx.restore();
        }

        // Floating info card near selected shape when calibration active
        if (selectedShapeId && calibration) {
            const ppm = calibration.pixelsPerMeter;
            const toMeters = (px: number) => px / ppm;
            const toMetersSq = (px2: number) => px2 / (ppm * ppm);
            let cx = 0, cy = 0;
            let lines: string[] = [];
            const s = shapes.find(sh => sh.id === selectedShapeId);
            if (s) {
                switch (s.type) {
                    case 'rectangle': {
                        const [x, y, w, h] = s.points;
                        cx = x + w; cy = y;
                        const corners = [
                            { x: x, y: y },
                            { x: x + w, y: y },
                            { x: x + w, y: y + h },
                            { x: x, y: y + h }
                        ];
                        const ecList = s.edgeControls || [];
                        const samples: { x: number; y: number }[] = [];
                        const samplesPerEdge = 16;
                        for (let i = 0; i < 4; i++) {
                            const a = corners[i];
                            const b = corners[(i + 1) % 4];
                            const ec = ecList.find(e => e.edgeIndex === i)?.point;
                            for (let t = 0; t <= samplesPerEdge; t++) {
                                const u = t / samplesPerEdge;
                                let px: number, py: number;
                                if (s.curveMode && ec) {
                                    const oneMinus = 1 - u;
                                    px = oneMinus * oneMinus * a.x + 2 * oneMinus * u * ec.x + u * u * b.x;
                                    py = oneMinus * oneMinus * a.y + 2 * oneMinus * u * ec.y + u * u * b.y;
                                } else {
                                    px = a.x + (b.x - a.x) * u;
                                    py = a.y + (b.y - a.y) * u;
                                }
                                samples.push({ x: px, y: py });
                            }
                        }
                        let area = 0; let peri = 0;
                        for (let i = 0; i < samples.length; i++) {
                            const j = (i + 1) % samples.length;
                            const p = samples[i], q = samples[j];
                            area += p.x * q.y - q.x * p.y;
                            peri += Math.hypot(q.x - p.x, q.y - p.y);
                        }
                        area = Math.abs(area / 2);
                        lines = [
                            `Rectangle`,
                            `Area: ${toMetersSq(area).toFixed(2)} m²`,
                            `Perimeter: ${toMeters(peri).toFixed(2)} m`,
                            `W×H: ${toMeters(Math.abs(w)).toFixed(2)} × ${toMeters(Math.abs(h)).toFixed(2)} m`
                        ];
                        break;
                    }
                    case 'circle': {
                        const [x, y, r] = s.points; cx = x + r; cy = y - r; const area = Math.PI * r * r; const peri = 2 * Math.PI * r;
                        lines = [
                            `Circle`,
                            `Area: ${toMetersSq(area).toFixed(2)} m²`,
                            `Circumf.: ${toMeters(peri).toFixed(2)} m`,
                            `D: ${toMeters(2 * r).toFixed(2)} m`
                        ];
                        break;
                    }
                    case 'line': {
                        const [x1, y1, x2, y2] = s.points; cx = x2; cy = y2; const len = Math.hypot(x2 - x1, y2 - y1);
                        lines = [`Line`, `Length: ${toMeters(len).toFixed(2)} m`];
                        break;
                    }
                    default: {
                        // polygon / filled-area
                        let area = 0, peri = 0; const pts = s.points; for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; const x1 = pts[i], y1 = pts[i + 1], x2 = pts[j], y2 = pts[j + 1]; area += x1 * y2 - x2 * y1; peri += Math.hypot(x2 - x1, y2 - y1); } area = Math.abs(area / 2);
                        // centroid approx for label position
                        let Cx = 0, Cy = 0, A = 0; for (let i = 0; i < pts.length; i += 2) { const j = (i + 2) % pts.length; const x1 = pts[i], y1 = pts[i + 1], x2 = pts[j], y2 = pts[j + 1]; const a = x1 * y2 - x2 * y1; A += a; Cx += (x1 + x2) * a; Cy += (y1 + y2) * a; } A = A / 2; Cx = Cx / (6 * A); Cy = Cy / (6 * A); cx = Cx; cy = Cy;
                        lines = [`Area`, `Area: ${toMetersSq(area).toFixed(2)} m²`, `Perimeter: ${toMeters(peri).toFixed(2)} m`];
                    }
                }

                const sx = cx * (zoom / 100);
                const sy = cy * (zoom / 100);
                const cardX = sx + 10;
                const cardY = sy - 10;
                const padX = 10, padY = 8;
                ctx.save();
                ctx.font = '12px Arial';
                const textWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
                const cardW = textWidth + padX * 2;
                const cardH = lines.length * 16 + padY * 2;
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.strokeStyle = 'rgba(15,23,42,0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(cardX, cardY - cardH, cardW, cardH, 6);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#0f172a';
                lines.forEach((l, idx) => {
                    ctx.fillText(l, cardX + padX, cardY - cardH + padY + 12 + idx * 16);
                });
                ctx.restore();
            }
        }
        ctx.restore();
    }, [selections, isSelecting, selectionStart, selectionEnd, isCalibrating, calibrationStart, calibrationEnd, calibration, calibrationMeters, zoom, pan, shapes, isDrawing, drawingPoints, mousePosition, drawingMode, fillColor]);

    const handlePageLoadSuccess = (page: any) => {
        setPageWidth(page.width);
        setPageHeight(page.height);
    };

    const baseWidth = 600;
    const scaledWidth = Math.round(baseWidth * (zoom / 100));
    const scaledHeight = Math.round(baseWidth * (pageHeight / pageWidth) * (zoom / 100));

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
            {/* Enlarged Header */}
            <header className="border-b border-slate-200/60 bg-white/90 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
                <div className="container mx-auto px-6 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <h1 className="text-lg font-bold text-slate-800">PDF Area Calculator</h1>
                        </div>

                        {/* Enlarged File Upload */}
                        <div className="flex items-center">
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
                                    className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 cursor-pointer text-sm font-medium shadow-sm"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <span>Upload PDF</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="container mx-auto px-6 py-2">
                {/* Professional Compact Controls */}
                <div className="bg-white/80 backdrop-blur-sm rounded-t-xl shadow-lg border border-white/20 p-3 relative z-[200] ">
                    {isDeleteConfirmOpen && createPortal(
                        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center">
                            <div className="absolute inset-0 bg-black/45" onClick={() => { setIsDeleteConfirmOpen(false); setDeleteTarget(null); }}></div>
                            <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm p-4">
                                <div className="text-sm font-semibold text-slate-800 mb-2">Confirm delete</div>
                                <div className="text-xs text-slate-600 mb-3">Are you sure you want to delete this {deleteTarget === 'shape' ? 'shape' : `calibration${calibrationToDeleteName ? ` (${calibrationToDeleteName})` : ''}`}?</div>
                                <div className="mt-2 flex justify-end gap-2">
                                    <button onClick={() => { setIsDeleteConfirmOpen(false); setDeleteTarget(null); }} className="h-8 px-3 rounded-md border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs">Cancel</button>
                                    <button onClick={() => { if (deleteTarget === 'shape') { deleteSelectedShape(); } else if (deleteTarget === 'calibration') { if (calibrationToDeleteName) deleteCalibrationByName(calibrationToDeleteName); } setIsDeleteConfirmOpen(false); setDeleteTarget(null); setCalibrationToDeleteName(null); }} className="h-8 px-3 rounded-md bg-red-600 text-white text-xs">Delete</button>
                                </div>
                            </div>
                        </div>, document.body)}
                    {isCalibNameModalOpen && createPortal(
                        <div className="fixed inset-0 z-[2147483647] flex items-center justify-center">
                            <div className="absolute inset-0 bg-black/45" onClick={() => { setIsCalibNameModalOpen(false); setIsCalibrating(false); setIsCalibrationMode(false); setPendingCalibrationBase(null); }}></div>
                            <div className="relative bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-sm p-4">
                                <div className="text-sm font-semibold text-slate-800 mb-2">Save Calibration</div>
                                <div className="text-xs text-slate-600 mb-3">Give a name for this calibration system.</div>
                                <input value={pendingCalibrationName} onChange={(e) => setPendingCalibrationName(e.target.value)} className="w-full h-9 px-3 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-600" placeholder="e.g. Ground Floor 1m" autoFocus />
                                <div className="mt-4 flex justify-end gap-2">
                                    <button onClick={() => { setIsCalibNameModalOpen(false); setIsCalibrating(false); setIsCalibrationMode(false); setPendingCalibrationBase(null); }} className="h-8 px-3 rounded-md border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs">Cancel</button>
                                    <button onClick={() => { if (!pendingCalibrationBase) return; const name = (pendingCalibrationName || '').trim(); if (!name) return; const named = { name, ...pendingCalibrationBase } as NamedCalibration; setCalibrations(prev => { const arr = [...prev.filter(c => c.name !== name), named]; sessionStorage.setItem('calibrations', JSON.stringify(arr)); return arr; }); setActiveCalibrationName(name); setCalibration(pendingCalibrationBase); setIsCalibNameModalOpen(false); setIsCalibrating(false); setIsCalibrationMode(false); setPendingCalibrationBase(null); }} className="h-8 px-3 rounded-md bg-slate-800 text-white text-xs">Save</button>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                    <div className="flex items-center justify-between gap-3">
                        {/* Left: Zoom (compact) */}
                        <div className="flex items-center gap-2">
                            <button onClick={handleZoomOut} className="h-8 w-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center">
                                <span className="text-slate-700 text-lg leading-none">−</span>
                            </button>
                            <input type="range" min="25" max="1000" value={zoom} onChange={handleZoomChange} className="w-40 h-2 accent-slate-700" />
                            <div className="text-xs text-slate-600 w-10 text-right">{zoom}%</div>
                            <button onClick={handleZoomIn} className="h-8 w-8 rounded-md border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center">
                                <span className="text-slate-700 text-lg leading-none">+</span>
                            </button>
                            <button onClick={zoomToFit} className="ml-2 h-8 px-2 rounded-md border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs">Fit</button>
                            <button onClick={resetView} className="h-8 px-2 rounded-md border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs">Reset</button>
                        </div>

                        {/* Right: Calibrate + Draw */}
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <button onClick={() => setIsCalibListOpen(prev => !prev)} className="h-8 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-700 min-w-[150px] flex items-center justify-between">
                                    <span className="truncate">{activeCalibrationName ?? 'No calibration'}</span>
                                    <svg className="w-3 h-3 ml-2" viewBox="0 0 20 20" fill="currentColor"><path d="M5.23 7.21a.75.75 0 011.06.02L10 11.188l3.71-3.957a.75.75 0 111.08 1.04l-4.24 4.52a.75.75 0 01-1.08 0l-4.24-4.52a.75.75 0 01.02-1.06z" /></svg>
                                </button>
                                {isCalibListOpen && (
                                    <div className="absolute right-0 mt-1 z-[2147483000] w-64 bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden">
                                        <div className="max-h-64 overflow-auto">
                                            <div className="px-2 py-1 text-[10px] text-slate-500">Calibrations</div>
                                            <button className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center justify-between" onClick={() => { setIsCalibListOpen(false); setCalibration(null); setActiveCalibrationName(null); setIsCalibrationMode(false); try { sessionStorage.removeItem('activeCalibration'); } catch { } setSelections(prev => prev.map(s => ({ ...s, areaInMeters: 0 }))); }}>No calibration</button>
                                            {calibrations.map(c => (
                                                <div
                                                    key={c.name}
                                                    className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                                                    onClick={() => { setIsCalibListOpen(false); setActiveCalibrationName(c.name); setCalibration(c); if (c.start && c.end) { setCalibrationStart(c.start); setCalibrationEnd(c.end); } setIsCalibrationMode(false); setIsCalibrating(false); try { sessionStorage.setItem('activeCalibration', c.name); } catch { } setSelections(prev => prev.map(s => ({ ...s, areaInMeters: s.area / (c.pixelsPerMeter * c.pixelsPerMeter) }))); }}
                                                >
                                                    <span className="text-left truncate">{c.name}</span>
                                                    <button title="Delete" onClick={(e) => { e.stopPropagation(); setIsCalibListOpen(false); setCalibrationToDeleteName(c.name); setDeleteTarget('calibration'); setIsDeleteConfirmOpen(true); }} className="text-red-600 hover:text-red-700 p-1">
                                                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </div>
                                            ))}
                                            <button className="w-full text-left px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100" onClick={() => { setIsCalibListOpen(false); setIsCalibrationMode(true); setIsCalibrating(false); setActiveCalibrationName(null); setCalibration(null); }}>+ New calibration…</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Removed toggle; calibration is considered active when selected from dropdown */}
                            {isCalibrationMode && (
                                <div className="flex items-center gap-1 text-xs text-slate-700">
                                    <span>Ref</span>
                                    <input type="number" min="0.01" step="0.01" value={calibrationMeters} onChange={(e) => setCalibrationMeters(parseFloat(e.target.value) || 1)} className="w-20 h-8 px-2 rounded-md border border-slate-200 text-right" />
                                    <select value={calibrationUnit} onChange={(e) => setCalibrationUnit(e.target.value as 'm' | 'cm')} className="h-8 px-2 rounded-md border border-slate-200 bg-white text-xs">
                                        <option value="m">m</option>
                                        <option value="cm">cm</option>
                                    </select>
                                </div>
                            )}
                            <button onClick={() => { handleModeChange('draw'); setDrawEnabled(prev => !prev); }} className={`h-8 px-3 rounded-md text-xs ${drawEnabled ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                                {drawEnabled ? 'Draw On' : 'Draw Off'}
                            </button>
                            {selectedShapeId && (
                                <button onClick={() => { setDeleteTarget('shape'); setIsDeleteConfirmOpen(true); }} className="h-8 px-3 rounded-md text-xs bg-red-600 text-white">Delete</button>
                            )}
                        </div>
                    </div>
                    {currentMode === 'draw' && drawEnabled && (
                        <div className="mt-3 flex items-center gap-1 justify-end">
                            <button onClick={() => setDrawingMode(drawingMode === 'line' ? null : 'line')} className={`h-8 px-2 rounded-l-md text-xs ${drawingMode === 'line' ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>Line</button>
                            <button onClick={() => setDrawingMode(drawingMode === 'circle' ? null : 'circle')} className={`h-8 px-2 text-xs ${drawingMode === 'circle' ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>Circle</button>
                            <button onClick={() => setDrawingMode(drawingMode === 'rectangle' ? null : 'rectangle')} className={`h-8 px-2 text-xs ${drawingMode === 'rectangle' ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>Rect</button>
                            <button onClick={() => setDrawingMode(drawingMode === 'polygon' ? null : 'polygon')} className={`h-8 px-2 text-xs ${drawingMode === 'polygon' ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>Poly</button>
                            <button onClick={() => setDrawingMode(drawingMode === 'fill' ? null : 'fill')} className={`h-8 px-2 rounded-r-md text-xs ${drawingMode === 'fill' ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>Fill</button>
                            {drawingMode === 'fill' && (
                                <input type="color" value={fillColor} onChange={(e) => setFillColor(e.target.value)} className="ml-1 h-8 w-8 rounded border border-slate-200" />
                            )}
                        </div>
                    )}

                    {/* Curve mode toggle removed; curve is always on for polygons */}

                    {/* Status panel removed as requested */}
                </div>

                {/* Enhanced PDF Viewer */}
                {file && (
                    <div className="bg-white/90 backdrop-blur-sm rounded-b-2xl shadow-xl border border-white/20 overflow-hidden mb-8">

                        <div
                            ref={containerRef}
                            className="relative overflow-auto bg-gradient-to-br from-slate-100 to-slate-200"
                            style={{
                                width: '100%',
                                maxHeight: '80vh',
                                cursor: hoverCursor
                                    ? hoverCursor
                                    : isCalibrationMode
                                        ? (isCalibrating ? 'crosshair' : 'crosshair')
                                        : isSelectionMode
                                            ? (isSelecting ? 'crosshair' : 'crosshair')
                                            : (drawEnabled && drawingMode ? 'crosshair' : (isPanning ? 'grabbing' : 'grab'))
                            }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            onDoubleClick={handleDoubleClick}
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
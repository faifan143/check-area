"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

    // Drawing state
    const [drawingMode, setDrawingMode] = useState<'circle' | 'rectangle' | 'polygon' | 'line' | 'fill' | null>(null);
    // Single mode: draw + select combined. We keep state for backward compatibility.
    const [currentMode, setCurrentMode] = useState<'draw' | 'select'>('draw');
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
    const [isFloodFilling, setIsFloodFilling] = useState(false);
    const [lastDragPdfPoint, setLastDragPdfPoint] = useState<{ x: number; y: number } | null>(null);
    const [hoverCursor, setHoverCursor] = useState<string | null>(null);

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

    // Drawing functions
    const handleModeChange = (mode: 'draw' | 'select') => {
        setCurrentMode(mode);
        // With unified mode, keep behavior minimal
        if (mode !== 'draw') setDrawingMode(null);
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
        if (!drawingMode || draggingShape || isFloodFilling) return;

        // Handle flood fill mode
        if (drawingMode === 'fill') {
            // For now, just create a simple filled area
            const newShape: Shape = {
                id: `shape_${Date.now()}`,
                type: 'filled-area',
                points: [pdfPoint.x - 20, pdfPoint.y - 20, pdfPoint.x + 20, pdfPoint.y - 20, pdfPoint.x + 20, pdfPoint.y + 20, pdfPoint.x - 20, pdfPoint.y + 20],
                color: fillColor,
                strokeWidth: 0,
                fillColor: fillColor,
                filled: true
            };
            setShapes([...shapes, newShape]);
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
            }
        } else if (drawingMode === 'polygon') {
            // Add point to polygon
            setDrawingPoints([...drawingPoints, pdfPoint.x, pdfPoint.y]);
            setIsDrawing(true);
        }
    }, [drawingMode, drawingPoints, shapes, draggingShape, currentMode, isPointInShape, isFloodFilling, fillColor, pan, zoom]);

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

                // If selected rectangle, check resize handles
                if (selectedShape && selectedShape.type === 'rectangle') {
                    const [rx, ry, rwidth, rheight] = selectedShape.points;
                    const minX = Math.min(rx, rx + rwidth);
                    const maxX = Math.max(rx, rx + rwidth);
                    const minY = Math.min(ry, ry + rheight);
                    const maxY = Math.max(ry, ry + rheight);

                    const handles = [
                        { x: minX, y: minY }, // 0 nw
                        { x: maxX, y: minY }, // 1 ne
                        { x: maxX, y: maxY }, // 2 se
                        { x: minX, y: maxY }, // 3 sw
                        { x: (minX + maxX) / 2, y: minY }, // 4 n
                        { x: (minX + maxX) / 2, y: maxY }, // 5 s
                        { x: minX, y: (minY + maxY) / 2 }, // 6 w
                        { x: maxX, y: (minY + maxY) / 2 }  // 7 e
                    ];

                    for (let i = 0; i < handles.length; i++) {
                        if (Math.hypot(pdfPoint.x - handles[i].x, pdfPoint.y - handles[i].y) <= threshold) {
                            setResizing({ shapeId: selectedShape.id, handleIndex: i });
                            return;
                        }
                    }
                }

                // Otherwise, start dragging the clicked shape if any
                const clickedShape = [...shapes].reverse().find(shape => isPointInShape(pdfPoint, shape));
                if (clickedShape) {
                    handleShapeSelect(clickedShape.id);
                    setDraggingShape(clickedShape.id);
                    setLastDragPdfPoint(pdfPoint);
                    return;
                }
            }
        }
        // Handle drawing mode first
        if (drawingMode && e.button === 0) {
            handleCanvasClick(e);
            return;
        }

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
        // Handle drawing preview
        if (drawingMode && isDrawing) {
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
                    if (s.type === 'line' || s.type === 'polygon' || s.type === 'rectangle' || s.type === 'filled-area') {
                        for (let i = 0; i < s.points.length; i += 2) {
                            newPoints.push(s.points[i] + dx);
                            newPoints.push(s.points[i + 1] + dy);
                        }
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
                if (s.id !== draggedControlPoint.shapeId || s.type !== 'polygon') return s;
                if (draggedControlPoint.type === 'vertex') {
                    const newPts = [...s.points];
                    newPts[draggedControlPoint.pointIndex] = pdfPoint.x;
                    newPts[draggedControlPoint.pointIndex + 1] = pdfPoint.y;
                    return { ...s, points: newPts };
                } else {
                    const edgeIndex = draggedControlPoint.pointIndex / 2;
                    const newControls = [...(s.edgeControls || [])];
                    const idx = newControls.findIndex(ec => ec.edgeIndex === edgeIndex);
                    if (idx >= 0) {
                        newControls[idx] = { edgeIndex, point: { x: pdfPoint.x, y: pdfPoint.y } };
                    } else {
                        newControls.push({ edgeIndex, point: { x: pdfPoint.x, y: pdfPoint.y } });
                    }
                    return { ...s, edgeControls: newControls };
                }
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
                            cursor = 'grab';
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
                                cursor = 'grab';
                                break;
                            }
                        }
                    }
                }

                // Check rectangle resize handles
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
                        { x: minX, y: maxY },
                        { x: (minX + maxX) / 2, y: minY },
                        { x: (minX + maxX) / 2, y: maxY },
                        { x: minX, y: (minY + maxY) / 2 },
                        { x: maxX, y: (minY + maxY) / 2 }
                    ];
                    for (let i = 0; i < handles.length; i++) {
                        if (Math.hypot(pdfPoint.x - handles[i].x, pdfPoint.y - handles[i].y) <= threshold) {
                            cursor = i <= 3 ? 'nwse-resize' : 'ew-resize';
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
                    break;

                case 'rectangle':
                    const [x, y, width, height] = shape.points;
                    const scaledX = x * scale;
                    const scaledY = y * scale;
                    const scaledWidth = width * scale;
                    const scaledHeight = height * scale;

                    ctx.strokeStyle = shape.selected ? '#ff0000' : shape.color;
                    ctx.lineWidth = shape.selected ? 3 : shape.strokeWidth;
                    ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);

                    // Fill with semi-transparent color
                    ctx.fillStyle = shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)';
                    ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
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

            <div className="container mx-auto px-6 py-4">
                {/* Professional Compact Controls */}
                <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-4 mb-6">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        {/* Zoom Controls */}
                        <div className="flex items-center">
                            <button
                                onClick={handleZoomOut}
                                className="w-12 h-12 bg-white hover:bg-slate-100 rounded-l-xl border border-slate-200 transition-all duration-200 flex items-center justify-center shadow-md"
                            >
                                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                </svg>
                            </button>
                            <div className="flex-1 relative min-w-[150px]">
                                <input
                                    type="range"
                                    min="25"
                                    max="1000"
                                    value={zoom}
                                    onChange={handleZoomChange}
                                    className="w-full h-3 bg-slate-200 appearance-none cursor-pointer slider"
                                />
                                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-3 py-1 rounded-lg text-sm font-medium">
                                    {zoom}%
                                </div>
                            </div>
                            <button
                                onClick={handleZoomIn}
                                className="w-12 h-12 bg-white hover:bg-slate-100 rounded-r-xl border-l-0 border border-slate-200 transition-all duration-200 flex items-center justify-center shadow-md"
                            >
                                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        </div>

                        {/* View Controls */}
                        <div className="flex items-center">
                            <button
                                onClick={zoomToFit}
                                className="px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-l-lg hover:from-green-600 hover:to-emerald-600 transition-all duration-200 text-xs font-medium shadow-md"
                            >
                                Fit
                            </button>
                            <button
                                onClick={resetView}
                                className="px-3 py-2 bg-gradient-to-r from-slate-500 to-slate-600 text-white rounded-r-lg hover:from-slate-600 hover:to-slate-700 transition-all duration-200 text-xs font-medium shadow-md border-l border-slate-400"
                            >
                                Reset
                            </button>
                        </div>

                        {/* Calibration */}
                        <div className="flex items-center">
                            <button
                                onClick={() => setIsCalibrationMode(!isCalibrationMode)}
                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-md ${isCalibrationMode
                                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'
                                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                                    }`}
                            >
                                <div className="flex items-center space-x-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    <span>{isCalibrationMode ? 'Active' : 'Calibrate'}</span>
                                </div>
                            </button>
                            {isCalibrationMode && (
                                <div className="flex items-center ml-2">
                                    <span className="text-sm text-slate-700">Ref:</span>
                                    <input
                                        type="number"
                                        min="0.1"
                                        step="0.1"
                                        value={calibrationMeters}
                                        onChange={(e) => setCalibrationMeters(parseFloat(e.target.value) || 1)}
                                        className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-center text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ml-1"
                                    />
                                    <span className="text-sm text-slate-700 ml-1">m</span>
                                </div>
                            )}
                        </div>

                        {/* Shapes quick action */}
                        <div className="flex items-center">
                            {shapes.length > 0 && (
                                <button
                                    onClick={() => setShapes([])}
                                    className="px-3 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-200 text-xs font-medium shadow-md"
                                >
                                    Clear Shapes ({shapes.length})
                                </button>
                            )}
                        </div>

                        {/* Draw Button (Select removed; selection is always available) */}
                        <div className="flex items-center">
                            <button
                                onClick={() => handleModeChange('draw')}
                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 shadow-md ${currentMode === 'draw'
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700'
                                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                                    }`}
                            >
                                <div className="flex items-center space-x-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    <span>Draw</span>
                                </div>
                            </button>
                        </div>

                        {/* Drawing Tools (only show in draw mode) */}
                        {currentMode === 'draw' && (
                            <div className="flex items-center">
                                <button
                                    onClick={() => setDrawingMode(drawingMode === 'line' ? null : 'line')}
                                    className={`px-3 py-2 rounded-l-lg text-xs font-medium transition-all duration-200 shadow-md ${drawingMode === 'line'
                                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'
                                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                                        }`}
                                >
                                    <div className="flex items-center space-x-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                                        </svg>
                                        <span>Line</span>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setDrawingMode(drawingMode === 'circle' ? null : 'circle')}
                                    className={`px-3 py-2 text-xs font-medium transition-all duration-200 shadow-md border-l border-slate-200 ${drawingMode === 'circle'
                                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'
                                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                                        }`}
                                >
                                    <div className="flex items-center space-x-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>Circle</span>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setDrawingMode(drawingMode === 'rectangle' ? null : 'rectangle')}
                                    className={`px-3 py-2 text-xs font-medium transition-all duration-200 shadow-md border-l border-slate-200 ${drawingMode === 'rectangle'
                                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'
                                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                                        }`}
                                >
                                    <div className="flex items-center space-x-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                        </svg>
                                        <span>Rect</span>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setDrawingMode(drawingMode === 'polygon' ? null : 'polygon')}
                                    className={`px-3 py-2 text-xs font-medium transition-all duration-200 shadow-md border-l border-slate-200 ${drawingMode === 'polygon'
                                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'
                                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                                        }`}
                                >
                                    <div className="flex items-center space-x-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                        </svg>
                                        <span>Poly</span>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setDrawingMode(drawingMode === 'fill' ? null : 'fill')}
                                    className={`px-3 py-2 rounded-r-lg text-xs font-medium transition-all duration-200 shadow-md border-l border-slate-200 ${drawingMode === 'fill'
                                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700'
                                        : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                                        }`}
                                >
                                    <div className="flex items-center space-x-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
                                        </svg>
                                        <span>Fill</span>
                                    </div>
                                </button>
                                {drawingMode === 'fill' && (
                                    <div className="flex items-center ml-1">
                                        <input
                                            type="color"
                                            value={fillColor}
                                            onChange={(e) => setFillColor(e.target.value)}
                                            className="w-6 h-6 rounded border border-slate-300 cursor-pointer"
                                            title="Fill Color"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Curve mode toggle removed; curve is always on for polygons */}

                        {/* Status panel removed as requested */}
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
                                cursor: hoverCursor
                                    ? hoverCursor
                                    : isCalibrationMode
                                        ? (isCalibrating ? 'crosshair' : 'crosshair')
                                        : isSelectionMode
                                            ? (isSelecting ? 'crosshair' : 'crosshair')
                                            : (drawingMode ? 'crosshair' : (isPanning ? 'grabbing' : 'grab'))
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
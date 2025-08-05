"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { GeometricAnalyzer, Point, EnclosedShape } from "@/utils/geometricAnalyzer";

// Set up the PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

export default function PdfColorizer() {
    const [file, setFile] = useState<File | null>(null);
    const [zoom, setZoom] = useState(100); // 100% = 1x zoom
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
    const [isMaskingMode, setIsMaskingMode] = useState(false);
    const [selectedColor, setSelectedColor] = useState("rgba(255, 0, 0, 0.3)");
    const [detectedShapes, setDetectedShapes] = useState<EnclosedShape[]>([]);
    const [coloredShapes, setColoredShapes] = useState<Map<string, string>>(new Map());
    const [lastClickPoint, setLastClickPoint] = useState<Point | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Add proper wheel event listener to prevent console errors
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheelEvent = (e: WheelEvent) => {
            e.preventDefault();

            if (e.ctrlKey || e.metaKey) {
                // Google Maps-style zoom towards mouse cursor
                const rect = container.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                // Calculate zoom factor (Google Maps uses exponential zoom)
                const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
                const newZoom = Math.max(10, Math.min(2000, zoom * zoomFactor));

                // Calculate the point under mouse before zoom
                const pointBeforeZoom = {
                    x: (mouseX - pan.x) / (zoom / 100),
                    y: (mouseY - pan.y) / (zoom / 100)
                };

                // Calculate the point under mouse after zoom
                const pointAfterZoom = {
                    x: (mouseX - pan.x) / (newZoom / 100),
                    y: (mouseY - pan.y) / (newZoom / 100)
                };

                // Adjust pan to keep the mouse point in the same position
                const newPan = {
                    x: pan.x + (pointAfterZoom.x - pointBeforeZoom.x) * (newZoom / 100),
                    y: pan.y + (pointAfterZoom.y - pointBeforeZoom.y) * (newZoom / 100)
                };

                setZoom(newZoom);
                setPan(newPan);
            } else {
                // Pan with wheel
                setPan(prev => ({
                    x: prev.x - e.deltaX,
                    y: prev.y - e.deltaY
                }));
            }
        };

        container.addEventListener('wheel', handleWheelEvent, { passive: false });

        return () => {
            container.removeEventListener('wheel', handleWheelEvent);
        };
    }, [zoom, pan]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            // Reset zoom and pan when new file is loaded
            setZoom(100);
            setPan({ x: 0, y: 0 });
            // Clear previous shapes and colors
            setDetectedShapes([]);
            setColoredShapes(new Map());
        }
    };

    const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newZoom = parseInt(e.target.value);

        // Zoom towards center of viewport
        const container = containerRef.current;
        if (!container) {
            setZoom(newZoom);
            return;
        }

        const rect = container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Calculate the point under center before zoom
        const pointBeforeZoom = {
            x: (centerX - pan.x) / (zoom / 100),
            y: (centerY - pan.y) / (zoom / 100)
        };

        // Calculate the point under center after zoom
        const pointAfterZoom = {
            x: (centerX - pan.x) / (newZoom / 100),
            y: (centerY - pan.y) / (newZoom / 100)
        };

        // Adjust pan to keep the center point in the same position
        const newPan = {
            x: pan.x + (pointAfterZoom.x - pointBeforeZoom.x) * (newZoom / 100),
            y: pan.y + (pointAfterZoom.y - pointBeforeZoom.y) * (newZoom / 100)
        };

        setZoom(newZoom);
        setPan(newPan);
    };

    const handleZoomIn = () => {
        // Zoom towards center of viewport
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const zoomFactor = 1.1;
        const newZoom = Math.min(2000, zoom * zoomFactor);

        // Calculate the point under center before zoom
        const pointBeforeZoom = {
            x: (centerX - pan.x) / (zoom / 100),
            y: (centerY - pan.y) / (zoom / 100)
        };

        // Calculate the point under center after zoom
        const pointAfterZoom = {
            x: (centerX - pan.x) / (newZoom / 100),
            y: (centerY - pan.y) / (newZoom / 100)
        };

        // Adjust pan to keep the center point in the same position
        const newPan = {
            x: pan.x + (pointAfterZoom.x - pointBeforeZoom.x) * (newZoom / 100),
            y: pan.y + (pointAfterZoom.y - pointBeforeZoom.y) * (newZoom / 100)
        };

        setZoom(newZoom);
        setPan(newPan);
    };

    const handleZoomOut = () => {
        // Zoom towards center of viewport
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const zoomFactor = 0.9;
        const newZoom = Math.max(10, zoom * zoomFactor);

        // Calculate the point under center before zoom
        const pointBeforeZoom = {
            x: (centerX - pan.x) / (zoom / 100),
            y: (centerY - pan.y) / (zoom / 100)
        };

        // Calculate the point under center after zoom
        const pointAfterZoom = {
            x: (centerX - pan.x) / (newZoom / 100),
            y: (centerY - pan.y) / (newZoom / 100)
        };

        // Adjust pan to keep the center point in the same position
        const newPan = {
            x: pan.x + (pointAfterZoom.x - pointBeforeZoom.x) * (newZoom / 100),
            y: pan.y + (pointAfterZoom.y - pointBeforeZoom.y) * (newZoom / 100)
        };

        setZoom(newZoom);
        setPan(newPan);
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button === 0) { // Left click for panning
            setIsPanning(true);
            setLastPanPoint({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
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

    // Function to detect shapes from PDF content
    const detectShapes = useCallback(async () => {
        if (!file) return;

        try {
            // Load PDF and extract vector data
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);

            // Get page viewport for coordinate transformation
            const viewport = page.getViewport({ scale: 1.0 });
            console.log('Page viewport:', { width: viewport.width, height: viewport.height });

            // Extract text and path data
            const textContent = await page.getTextContent();
            const operatorList = await page.getOperatorList();

            console.log('PDF Text Content:', textContent.items.map((item: any) => ({
                text: item.str,
                x: item.transform[4],
                y: item.transform[5]
            })));

            // Extract vector paths from operator list
            const paths: any[] = [];
            const operators = operatorList.fnArray;
            const args = operatorList.argsArray;

            for (let i = 0; i < operators.length; i++) {
                const op = operators[i];
                if (op === 1) { // moveTo
                    paths.push({ type: 'moveTo', x: args[i][0], y: args[i][1] });
                } else if (op === 2) { // lineTo
                    paths.push({ type: 'lineTo', x: args[i][0], y: args[i][1] });
                } else if (op === 3) { // curveTo
                    paths.push({ type: 'curveTo', x1: args[i][0], y1: args[i][1], x2: args[i][2], y2: args[i][3], x: args[i][4], y: args[i][5] });
                } else if (op === 4) { // closePath
                    paths.push({ type: 'closePath' });
                }
            }

            console.log('Extracted paths:', paths.length);

            // Convert to geometric data
            const shapes: EnclosedShape[] = [];

            // Group paths into potential enclosed shapes
            let currentPath: Point[] = [];
            const enclosedPaths: Point[][] = [];

            for (const path of paths) {
                if (path.type === 'moveTo') {
                    if (currentPath.length > 0) {
                        enclosedPaths.push([...currentPath]);
                    }
                    currentPath = [{ x: path.x, y: path.y }];
                } else if (path.type === 'lineTo') {
                    currentPath.push({ x: path.x, y: path.y });
                } else if (path.type === 'closePath') {
                    if (currentPath.length > 0) {
                        currentPath.push(currentPath[0]); // Close the path
                        enclosedPaths.push([...currentPath]);
                        currentPath = [];
                    }
                }
            }

            // Convert enclosed paths to shapes
            enclosedPaths.forEach((path, index) => {
                if (path.length < 4) return; // Need at least 3 points + closing point

                // Transform coordinates
                const transformedPath = path.map(point => ({
                    x: (point.x / viewport.width) * 600,
                    y: ((viewport.height - point.y) / viewport.height) * 850
                }));

                // Calculate bounding box
                const xs = transformedPath.map(p => p.x);
                const ys = transformedPath.map(p => p.y);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);

                // Only include shapes that are reasonably sized
                const width = maxX - minX;
                const height = maxY - minY;
                if (width < 10 || height < 10) return; // Too small
                if (width > 500 || height > 500) return; // Too large

                // Calculate area using shoelace formula
                const area = GeometricAnalyzer.polygonArea(transformedPath);
                if (area < 100) return; // Too small area

                const shape: EnclosedShape = {
                    type: 'polygon',
                    geometry: {
                        points: transformedPath,
                        area: area,
                        perimeter: GeometricAnalyzer.polygonPerimeter(transformedPath),
                        isClosed: true
                    },
                    label: `Room ${index + 1}`,
                    area: area,
                    perimeter: GeometricAnalyzer.polygonPerimeter(transformedPath)
                };

                shapes.push(shape);
                console.log('Detected enclosed shape:', shape);
            });

            console.log('Total enclosed shapes detected:', shapes.length);

            // If no shapes detected, create some test shapes for demonstration
            if (shapes.length === 0) {
                console.log('No enclosed shapes detected, creating test shapes...');
                const testShapes: EnclosedShape[] = [
                    {
                        type: 'rectangle',
                        geometry: {
                            topLeft: { x: 100, y: 100 },
                            bottomRight: { x: 200, y: 150 },
                            width: 100,
                            height: 50,
                            area: 5000,
                            perimeter: 300
                        },
                        label: 'Test Room 1',
                        area: 5000,
                        perimeter: 300
                    },
                    {
                        type: 'rectangle',
                        geometry: {
                            topLeft: { x: 250, y: 100 },
                            bottomRight: { x: 350, y: 150 },
                            width: 100,
                            height: 50,
                            area: 5000,
                            perimeter: 300
                        },
                        label: 'Test Room 2',
                        area: 5000,
                        perimeter: 300
                    }
                ];
                setDetectedShapes(testShapes);
                console.log('Test shapes created:', testShapes.length);
            } else {
                setDetectedShapes(shapes);
            }
        } catch (error) {
            console.error('Error detecting shapes:', error);
        }
    }, [file]);

    // Function to handle canvas click for shape coloring
    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isMaskingMode || isPanning) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Get the actual canvas coordinates (not the scaled ones)
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;

        // Convert to PDF coordinates
        const clickX = (canvasX - pan.x) / (zoom / 100);
        const clickY = (canvasY - pan.y) / (zoom / 100);
        const clickPoint: Point = { x: clickX, y: clickY };

        console.log('Raw canvas click:', { canvasX, canvasY });
        console.log('PDF coordinates:', clickPoint);
        console.log('Available shapes:', detectedShapes.length);

        // Store click point for visual debugging
        setLastClickPoint(clickPoint);

        // Find which shape was clicked with tolerance
        const clickedShape = detectedShapes.find(shape => {
            if (shape.type === 'rectangle') {
                const rect = shape.geometry as any;

                // Add larger tolerance for easier clicking
                const tolerance = 50;
                const isInside = clickX >= (rect.topLeft.x - tolerance) &&
                    clickX <= (rect.bottomRight.x + tolerance) &&
                    clickY >= (rect.topLeft.y - tolerance) &&
                    clickY <= (rect.bottomRight.y + tolerance);

                if (isInside) {
                    console.log('Clicked shape:', shape);
                    console.log('Shape bounds:', {
                        topLeft: rect.topLeft,
                        bottomRight: rect.bottomRight,
                        clickPoint: clickPoint
                    });
                }

                return isInside;
            } else if (shape.type === 'polygon') {
                const polygon = shape.geometry as any;

                // Use point-in-polygon algorithm with tolerance
                const tolerance = 20;
                const isInside = GeometricAnalyzer.isPointInPolygon(clickPoint, polygon.points, tolerance);

                if (isInside) {
                    console.log('Clicked polygon shape:', shape);
                    console.log('Click point:', clickPoint);
                }

                return isInside;
            }
            return false;
        });

        if (clickedShape) {
            const shapeId = clickedShape.label || `shape_${Date.now()}`;
            setColoredShapes(prev => new Map(prev.set(shapeId, selectedColor)));

            // Draw the colored shape on canvas
            drawColoredShape(clickedShape, selectedColor);
            console.log('Shape colored successfully:', shapeId);
        } else {
            console.log('No shape found at click position');
            // Log the first few shapes for debugging
            console.log('First 3 shapes for reference:', detectedShapes.slice(0, 3));

            // Also log the coordinate ranges of detected shapes
            if (detectedShapes.length > 0) {
                const xCoords = detectedShapes.map(s => (s.geometry as any).topLeft.x).sort((a, b) => a - b);
                const yCoords = detectedShapes.map(s => (s.geometry as any).topLeft.y).sort((a, b) => a - b);
                console.log('Shape X coordinate range:', { min: xCoords[0], max: xCoords[xCoords.length - 1] });
                console.log('Shape Y coordinate range:', { min: yCoords[0], max: yCoords[yCoords.length - 1] });
                console.log('Click coordinates:', { x: clickX, y: clickY });
            }
        }
    };

    // Function to draw colored shape on canvas
    const drawColoredShape = (shape: EnclosedShape, color: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.save();
        ctx.scale(zoom / 100, zoom / 100);
        ctx.translate(pan.x / (zoom / 100), pan.y / (zoom / 100));

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;

        if (shape.type === 'rectangle') {
            const rect = shape.geometry as any;
            ctx.fillRect(rect.topLeft.x, rect.topLeft.y, rect.width, rect.height);
        } else if (shape.type === 'polygon') {
            const polygon = shape.geometry as any;

            // Fill polygon
            ctx.beginPath();
            ctx.moveTo(polygon.points[0].x, polygon.points[0].y);
            for (let i = 1; i < polygon.points.length; i++) {
                ctx.lineTo(polygon.points[i].x, polygon.points[i].y);
            }
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        // Redraw outlines after coloring
        drawShapeOutlines();
    };

    // Effect to detect shapes when file changes
    useEffect(() => {
        if (file) {
            detectShapes();
        }
    }, [file, detectShapes]);

    // Effect to draw shape outlines for debugging
    useEffect(() => {
        if (detectedShapes.length > 0 && canvasRef.current) {
            drawShapeOutlines();
        }
    }, [detectedShapes, zoom, pan]);

    // Function to calculate centroid of a polygon
    const calculateCentroid = (points: Point[]): Point => {
        if (points.length === 0) return { x: 0, y: 0 };

        let sumX = 0;
        let sumY = 0;

        for (const point of points) {
            sumX += point.x;
            sumY += point.y;
        }

        return {
            x: sumX / points.length,
            y: sumY / points.length
        };
    };

    // Function to draw shape outlines for debugging
    const drawShapeOutlines = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.scale(zoom / 100, zoom / 100);
        ctx.translate(pan.x / (zoom / 100), pan.y / (zoom / 100));

        // Draw outlines for all detected shapes
        detectedShapes.forEach((shape, index) => {
            if (shape.type === 'rectangle') {
                const rect = shape.geometry as any;

                // Draw outline
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.strokeRect(rect.topLeft.x, rect.topLeft.y, rect.width, rect.height);

                // Draw label
                ctx.fillStyle = '#00ff00';
                ctx.font = '12px Arial';
                ctx.fillText(shape.label || `Shape ${index}`, rect.topLeft.x, rect.topLeft.y - 5);

                // Draw center point for debugging
                const centerX = rect.topLeft.x + rect.width / 2;
                const centerY = rect.topLeft.y + rect.height / 2;
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
                ctx.fill();
            } else if (shape.type === 'polygon') {
                const polygon = shape.geometry as any;

                // Draw polygon outline
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(polygon.points[0].x, polygon.points[0].y);
                for (let i = 1; i < polygon.points.length; i++) {
                    ctx.lineTo(polygon.points[i].x, polygon.points[i].y);
                }
                ctx.closePath();
                ctx.stroke();

                // Draw label at centroid
                const centroid = calculateCentroid(polygon.points);
                ctx.fillStyle = '#00ff00';
                ctx.font = '12px Arial';
                ctx.fillText(shape.label || `Room ${index}`, centroid.x, centroid.y);

                // Draw center point for debugging
                ctx.fillStyle = '#ff0000';
                ctx.beginPath();
                ctx.arc(centroid.x, centroid.y, 3, 0, 2 * Math.PI);
                ctx.fill();
            }
        });

        // Draw last click point for debugging
        if (lastClickPoint) {
            ctx.fillStyle = '#0000ff';
            ctx.beginPath();
            ctx.arc(lastClickPoint.x, lastClickPoint.y, 8, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.restore();
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
            <h1 className="text-2xl font-bold">PDF Viewer</h1>

            <div className="flex items-center justify-between">
                <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    className="border p-2"
                />
                <div className="flex items-center gap-4 flex-wrap">
                    {/* Masking Mode Toggle */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm">Masking Mode:</label>
                        <button
                            onClick={() => setIsMaskingMode(!isMaskingMode)}
                            className={`px-3 py-1 rounded text-sm font-medium ${isMaskingMode
                                ? 'bg-green-500 text-white hover:bg-green-600'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                        >
                            {isMaskingMode ? 'ON' : 'OFF'}
                        </button>
                    </div>

                    {/* Color Picker */}
                    {isMaskingMode && (
                        <div className="flex items-center gap-2">
                            <label className="text-sm">Color:</label>
                            <input
                                type="color"
                                value={selectedColor.startsWith('rgba')
                                    ? '#' + selectedColor.match(/\d+/g)?.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('') || '000000'
                                    : selectedColor.startsWith('#')
                                        ? selectedColor.slice(0, 7)
                                        : '#000000'
                                }
                                onChange={(e) => setSelectedColor(e.target.value + "33")}
                                className="w-8 h-8 border rounded cursor-pointer"
                            />
                        </div>
                    )}

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm">Zoom: {zoom}%</label>
                        <input
                            type="range"
                            min="10"
                            max="2000"
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
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
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

                            {/* Overlay Canvas for Shape Coloring */}
                            <canvas
                                ref={canvasRef}
                                width={scaledWidth}
                                height={scaledHeight}
                                onClick={handleCanvasClick}
                                className="absolute top-0 left-0 z-10"
                                style={{
                                    cursor: isMaskingMode ? 'crosshair' : 'default',
                                    pointerEvents: isMaskingMode ? 'auto' : 'none'
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Shape Information Panel */}
            {isMaskingMode && detectedShapes.length > 0 && (
                <div className="border rounded p-4 bg-gray-50">
                    <h3 className="text-lg font-semibold mb-2">Detected Shapes ({detectedShapes.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {detectedShapes.map((shape, index) => (
                            <div
                                key={index}
                                className="border rounded p-2 bg-white hover:bg-gray-50 cursor-pointer"
                                onClick={() => {
                                    const shapeId = shape.label || `shape_${index}`;
                                    setColoredShapes(prev => new Map(prev.set(shapeId, selectedColor)));
                                    drawColoredShape(shape, selectedColor);
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm">
                                        {shape.label || `Shape ${index + 1}`}
                                    </span>
                                    <div
                                        className="w-4 h-4 rounded border"
                                        style={{
                                            backgroundColor: coloredShapes.get(shape.label || `shape_${index}`) || 'transparent'
                                        }}
                                    />
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                    Area: {shape.area.toFixed(2)} m² | Perimeter: {shape.perimeter.toFixed(2)} m
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Instructions */}
            <div className="text-sm text-gray-600 space-y-1">
                <p>• Use mouse wheel to pan up/down</p>
                <p>• Hold Ctrl/Cmd + mouse wheel to zoom in/out</p>
                <p>• Click and drag to pan around</p>
                <p>• Toggle Masking Mode to color detected shapes</p>
                {isMaskingMode && (
                    <p className="text-green-600 font-medium">• Click on shapes to color them with the selected color</p>
                )}
            </div>
            bhkjn
        </div>
    );
}

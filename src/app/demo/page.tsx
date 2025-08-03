'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface Point {
    x: number;
    y: number;
}

interface BezierPoint extends Point {
    // Keeping interface name for compatibility, but no more complex bezier
}

interface EdgeControl {
    point: Point;
    edgeIndex: number; // Which edge this controls (from point index to next point)
}

interface Shape {
    id: string;
    type: 'circle' | 'rectangle' | 'polygon';
    points: BezierPoint[];
    color: string;
    selected: boolean;
    curveMode?: boolean; // Enable simple curve mode
    edgeControls?: EdgeControl[]; // Simple curve system - one control per edge
}

interface ControlPoint {
    x: number;
    y: number;
    type: 'corner' | 'edge';
    shapeId: string;
    index: number;
}

export default function DrawingPage() {
    const svgRef = useRef<SVGSVGElement>(null);
    const [shapes, setShapes] = useState<Shape[]>([]);
    const [currentTool, setCurrentTool] = useState<'select' | 'circle' | 'rectangle' | 'polygon'>('select');
    const [isDrawing, setIsDrawing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
    const [currentShape, setCurrentShape] = useState<Shape | null>(null);
    const [selectedShape, setSelectedShape] = useState<string | null>(null);
    const [draggedPoint, setDraggedPoint] = useState<{ shapeId: string; pointIndex: number; type: 'point' | 'edge' } | null>(null);
    const [mousePosition, setMousePosition] = useState<Point>({ x: 0, y: 0 });
    const [showPreview, setShowPreview] = useState(false);
    const [hoveredShape, setHoveredShape] = useState<string | null>(null);
    const [showGrid, setShowGrid] = useState(false);
    const [firstClick, setFirstClick] = useState<Point | null>(null);
    const [waitingForSecondClick, setWaitingForSecondClick] = useState(false);

    const colors = ['#ff6b6b80', '#4ecdc480', '#45b7d180', '#96ceb480', '#feca5780', '#ff9ff380'];
    const [currentColorIndex, setCurrentColorIndex] = useState(0);

    const getMousePosition = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        };
    }, []);

    const generateId = () => Math.random().toString(36).substr(2, 9);

    // Keyboard event handling
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Prevent default for handled keys
            switch (event.key.toLowerCase()) {
                case 's':
                    event.preventDefault();
                    setCurrentTool('select');
                    break;
                case 'c':
                    event.preventDefault();
                    setCurrentTool('circle');
                    break;
                case 'r':
                    event.preventDefault();
                    setCurrentTool('rectangle');
                    break;
                case 'p':
                    event.preventDefault();
                    setCurrentTool('polygon');
                    break;
                case 'g':
                    event.preventDefault();
                    setShowGrid(prev => !prev);
                    break;
                case 'delete':
                case 'backspace':
                    event.preventDefault();
                    if (selectedShape) {
                        setShapes(prev => prev.filter(shape => shape.id !== selectedShape));
                        setSelectedShape(null);
                    }
                    break;
                case 'escape':
                    event.preventDefault();
                    setSelectedShape(null);
                    setShapes(prev => prev.map(s => ({ ...s, selected: false })));
                    setFirstClick(null);
                    setWaitingForSecondClick(false);
                    setCurrentShape(null);
                    break;
                case 'q':
                    event.preventDefault();
                    if (selectedShape) {
                        toggleCurveMode();
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedShape]);

    // Reset drawing state when tool changes
    useEffect(() => {
        setFirstClick(null);
        setWaitingForSecondClick(false);
        setCurrentShape(null);
    }, [currentTool]);

    const handleMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
        const point = getMousePosition(event);

        if (currentTool === 'select') {
            // Check if clicking on a shape
            const clickedShape = shapes.find(shape => isPointInShape(point, shape));
            if (clickedShape) {
                setSelectedShape(clickedShape.id);
                setShapes(prev => prev.map(s => ({ ...s, selected: s.id === clickedShape.id })));
                setIsDragging(true);
                setDragStart(point);
            } else {
                setSelectedShape(null);
                setShapes(prev => prev.map(s => ({ ...s, selected: false })));
            }
            return;
        }

        // Two-click drawing flow for circles and rectangles
        if (currentTool === 'circle' || currentTool === 'rectangle') {
            if (!waitingForSecondClick) {
                // First click - set the starting point
                setFirstClick(point);
                setWaitingForSecondClick(true);
                const newShape: Shape = {
                    id: generateId(),
                    type: currentTool,
                    points: [point, point],
                    color: colors[currentColorIndex],
                    selected: false,
                };
                setCurrentShape(newShape);
            } else {
                // Second click - finalize the shape
                if (currentShape) {
                    const finalShape = {
                        ...currentShape,
                        points: [firstClick!, point]
                    };
                    setShapes(prev => [...prev, finalShape]);
                    setCurrentColorIndex(prev => (prev + 1) % colors.length);
                }
                setFirstClick(null);
                setWaitingForSecondClick(false);
                setCurrentShape(null);
            }
            return;
        }

        // Polygon drawing (multi-click)
        if (currentTool === 'polygon') {
            if (!currentShape) {
                const newShape: Shape = {
                    id: generateId(),
                    type: 'polygon',
                    points: [point],
                    color: colors[currentColorIndex],
                    selected: false,
                };
                setCurrentShape(newShape);
            } else {
                setCurrentShape(prev => prev ? { ...prev, points: [...prev.points, point] } : null);
            }
        }
    }, [currentTool, getMousePosition, shapes, colors, currentColorIndex, currentShape, waitingForSecondClick, firstClick]);

    const handleMouseMove = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
        const point = getMousePosition(event);
        setMousePosition(point);
        setShowPreview(currentTool !== 'select');

        // Hover detection for select tool
        if (currentTool === 'select' && !isDragging && !draggedPoint) {
            const hoveredShapeObj = shapes.find(shape => isPointInShape(point, shape));
            setHoveredShape(hoveredShapeObj ? hoveredShapeObj.id : null);
        } else {
            setHoveredShape(null);
        }

        if (isDragging && selectedShape) {
            const dx = point.x - dragStart.x;
            const dy = point.y - dragStart.y;

            setShapes(prev => prev.map(shape => {
                if (shape.id === selectedShape) {
                    return {
                        ...shape,
                        points: shape.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
                    };
                }
                return shape;
            }));

            setDragStart(point);
            return;
        }

        if (draggedPoint) {
            setShapes(prev => prev.map(shape => {
                if (shape.id === draggedPoint.shapeId) {
                    if (draggedPoint.type === 'edge') {
                        // Handle edge control dragging
                        const newEdgeControls = [...(shape.edgeControls || [])];
                        const existingIndex = newEdgeControls.findIndex(ec => ec.edgeIndex === draggedPoint.pointIndex);

                        if (existingIndex >= 0) {
                            newEdgeControls[existingIndex] = {
                                ...newEdgeControls[existingIndex],
                                point: point
                            };
                        } else {
                            newEdgeControls.push({
                                point: point,
                                edgeIndex: draggedPoint.pointIndex
                            });
                        }

                        return { ...shape, edgeControls: newEdgeControls };
                    } else {
                        // Handle vertex dragging
                        const newPoints = [...shape.points];
                        const pointIndex = draggedPoint.pointIndex;

                        if (draggedPoint.type === 'point') {
                            newPoints[pointIndex] = { ...newPoints[pointIndex], x: point.x, y: point.y };
                        }

                        return { ...shape, points: newPoints };
                    }
                }
                return shape;
            }));
            return;
        }

        // Update current shape during two-click drawing
        if (waitingForSecondClick && currentShape && firstClick) {
            if (currentTool === 'circle') {
                const radius = Math.sqrt(
                    Math.pow(point.x - firstClick.x, 2) + Math.pow(point.y - firstClick.y, 2)
                );
                setCurrentShape(prev => prev ? {
                    ...prev,
                    points: [firstClick, { x: firstClick.x + radius, y: firstClick.y }]
                } : null);
            } else if (currentTool === 'rectangle') {
                setCurrentShape(prev => prev ? {
                    ...prev,
                    points: [firstClick, point]
                } : null);
            }
        }
    }, [currentTool, getMousePosition, isDragging, selectedShape, draggedPoint, shapes, waitingForSecondClick, currentShape, firstClick, dragStart]);

    const handleMouseEnter = useCallback(() => {
        setShowPreview(currentTool !== 'select');
    }, [currentTool]);

    const handleMouseLeave = useCallback(() => {
        setShowPreview(false);
    }, []);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setDraggedPoint(null);
    }, []);

    const handleDoubleClick = useCallback(() => {
        if (currentTool === 'polygon' && currentShape) {
            setShapes(prev => [...prev, currentShape]);
            setCurrentShape(null);
            setCurrentColorIndex(prev => (prev + 1) % colors.length);
        }
    }, [currentTool, currentShape, colors.length]);

    const isPointInShape = (point: Point, shape: Shape): boolean => {
        if (shape.type === 'circle') {
            const [center, radiusPoint] = shape.points;
            const radius = Math.sqrt(
                Math.pow(radiusPoint.x - center.x, 2) + Math.pow(radiusPoint.y - center.y, 2)
            );
            const distance = Math.sqrt(
                Math.pow(point.x - center.x, 2) + Math.pow(point.y - center.y, 2)
            );
            return distance <= radius;
        } else if (shape.type === 'rectangle') {
            const [p1, p2] = shape.points;
            const minX = Math.min(p1.x, p2.x);
            const maxX = Math.max(p1.x, p2.x);
            const minY = Math.min(p1.y, p2.y);
            const maxY = Math.max(p1.y, p2.y);
            return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
        } else if (shape.type === 'polygon') {
            // Simple point-in-polygon test using ray casting
            let inside = false;
            for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
                if (((shape.points[i].y > point.y) !== (shape.points[j].y > point.y)) &&
                    (point.x < (shape.points[j].x - shape.points[i].x) * (point.y - shape.points[i].y) / (shape.points[j].y - shape.points[i].y) + shape.points[i].x)) {
                    inside = !inside;
                }
            }
            return inside;
        }
        return false;
    };

    const renderShape = (shape: Shape) => {
        const isHovered = hoveredShape === shape.id;
        const strokeColor = shape.selected ? '#000' : isHovered ? '#666' : 'none';
        const strokeWidth = shape.selected ? 2 : isHovered ? 1 : 0;
        const opacity = isHovered && !shape.selected ? 0.8 : 1;

        if (shape.type === 'circle') {
            const [center, radiusPoint] = shape.points;
            const radius = Math.sqrt(
                Math.pow(radiusPoint.x - center.x, 2) + Math.pow(radiusPoint.y - center.y, 2)
            );
            return (
                <circle
                    key={shape.id}
                    cx={center.x}
                    cy={center.y}
                    r={radius}
                    fill={shape.color}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={shape.selected ? '5,5' : 'none'}
                    opacity={opacity}
                    style={{ cursor: currentTool === 'select' ? 'pointer' : 'default' }}
                />
            );
        } else if (shape.type === 'rectangle') {
            const [p1, p2] = shape.points;
            const x = Math.min(p1.x, p2.x);
            const y = Math.min(p1.y, p2.y);
            const width = Math.abs(p2.x - p1.x);
            const height = Math.abs(p2.y - p1.y);
            return (
                <rect
                    key={shape.id}
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={shape.color}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={shape.selected ? '5,5' : 'none'}
                    opacity={opacity}
                    style={{ cursor: currentTool === 'select' ? 'pointer' : 'default' }}
                />
            );
        } else if (shape.type === 'polygon') {
            let pathData = shape.points.reduce((path, point, index) => {
                if (index === 0) return `M ${point.x} ${point.y}`;

                // Check for simple edge control
                const edgeControl = shape.edgeControls?.find(ec => ec.edgeIndex === index - 1);
                if (edgeControl) {
                    // Use quadratic curve with the edge control point
                    return `${path} Q ${edgeControl.point.x} ${edgeControl.point.y}, ${point.x} ${point.y}`;
                }

                // Straight line if no curve
                return `${path} L ${point.x} ${point.y}`;
            }, '');

            // Handle the closing edge from last point to first point
            const lastEdgeControl = shape.edgeControls?.find(ec => ec.edgeIndex === shape.points.length - 1);
            if (lastEdgeControl) {
                pathData += ` Q ${lastEdgeControl.point.x} ${lastEdgeControl.point.y}, ${shape.points[0].x} ${shape.points[0].y}`;
            } else {
                pathData += ' Z';
            }

            return (
                <path
                    key={shape.id}
                    d={pathData}
                    fill={shape.color}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={shape.selected ? '5,5' : 'none'}
                    opacity={opacity}
                    style={{ cursor: currentTool === 'select' ? 'pointer' : 'default' }}
                />
            );
        }
        return null;
    };

    const renderControlPoints = (shape: Shape) => {
        if (!shape.selected) return null;

        const points: React.JSX.Element[] = [];

        // Render main control points (vertices)
        shape.points.forEach((point, index) => {
            points.push(
                <circle
                    key={`control-${shape.id}-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r={5}
                    fill="#fff"
                    stroke="#000"
                    strokeWidth={2}
                    style={{ cursor: 'pointer' }}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggedPoint({ shapeId: shape.id, pointIndex: index, type: 'point' });
                    }}
                />
            );
        });

        // Render simple edge controls for polygons - so much easier!
        if (shape.type === 'polygon' && shape.curveMode) {
            shape.points.forEach((point, index) => {
                const nextIndex = (index + 1) % shape.points.length;
                const nextPoint = shape.points[nextIndex];

                // Calculate midpoint of edge
                const midX = (point.x + nextPoint.x) / 2;
                const midY = (point.y + nextPoint.y) / 2;

                // Check if there's already an edge control for this edge
                const existingControl = shape.edgeControls?.find(ec => ec.edgeIndex === index);
                const controlPoint = existingControl ? existingControl.point : { x: midX, y: midY };

                // Show controls when curve mode is enabled
                points.push(
                    <g key={`edge-${shape.id}-${index}`}>
                        {/* Line from edge midpoint to control point (only show if control exists) */}
                        {existingControl && (
                            <line
                                x1={midX}
                                y1={midY}
                                x2={controlPoint.x}
                                y2={controlPoint.y}
                                stroke="#999"
                                strokeWidth={1}
                                strokeDasharray="3,3"
                            />
                        )}
                        {/* Edge control point */}
                        <circle
                            cx={controlPoint.x}
                            cy={controlPoint.y}
                            r={4}
                            fill={existingControl ? "#4ecdc4" : "#ddd"}
                            stroke="#666"
                            strokeWidth={1}
                            style={{ cursor: 'pointer' }}
                            opacity={existingControl ? 1 : 0.6}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                setDraggedPoint({ shapeId: shape.id, pointIndex: index, type: 'edge' });
                            }}
                        />
                    </g>
                );
            });
        }

        return points;
    };

    const toggleCurveMode = () => {
        if (!selectedShape) return;

        setShapes(prev => prev.map(shape => {
            if (shape.id === selectedShape && shape.type === 'polygon') {
                // Toggle simple curve mode flag
                const newCurveMode = !shape.curveMode;

                if (!newCurveMode) {
                    // Disable curve mode - remove edge controls and mode flag
                    return { ...shape, curveMode: false, edgeControls: [] };
                } else {
                    // Enable curve mode - just set the flag, don't create controls yet
                    return { ...shape, curveMode: true };
                }
            }
            return shape;
        }));
    };

    const addResizeHandles = (shape: Shape) => {
        if (!shape.selected || shape.type !== 'rectangle') return null;

        const [p1, p2] = shape.points;
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        const handles = [
            { x: minX, y: minY, cursor: 'nw-resize' },
            { x: maxX, y: minY, cursor: 'ne-resize' },
            { x: maxX, y: maxY, cursor: 'se-resize' },
            { x: minX, y: maxY, cursor: 'sw-resize' },
            { x: (minX + maxX) / 2, y: minY, cursor: 'n-resize' },
            { x: (minX + maxX) / 2, y: maxY, cursor: 's-resize' },
            { x: minX, y: (minY + maxY) / 2, cursor: 'w-resize' },
            { x: maxX, y: (minY + maxY) / 2, cursor: 'e-resize' },
        ];

        return handles.map((handle, index) => (
            <rect
                key={`resize-${shape.id}-${index}`}
                x={handle.x - 4}
                y={handle.y - 4}
                width={8}
                height={8}
                fill="#fff"
                stroke="#000"
                strokeWidth={1}
                style={{ cursor: handle.cursor }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    // Handle resize logic here
                }}
            />
        ));
    };

    const renderVisualFeedback = () => {
        if (!showPreview) return null;

        const feedback: React.JSX.Element[] = [];

        // Crosshair cursor
        if (currentTool !== 'select') {
            feedback.push(
                <g key="crosshair" opacity="0.6">
                    <line
                        x1={mousePosition.x - 10}
                        y1={mousePosition.y}
                        x2={mousePosition.x + 10}
                        y2={mousePosition.y}
                        stroke="#333"
                        strokeWidth="1"
                    />
                    <line
                        x1={mousePosition.x}
                        y1={mousePosition.y - 10}
                        x2={mousePosition.x}
                        y2={mousePosition.y + 10}
                        stroke="#333"
                        strokeWidth="1"
                    />
                </g>
            );
        }

        // Preview line for polygon drawing
        if (currentTool === 'polygon' && currentShape && !isDrawing) {
            const lastPoint = currentShape.points[currentShape.points.length - 1];
            feedback.push(
                <g key="polygon-preview">
                    <line
                        x1={lastPoint.x}
                        y1={lastPoint.y}
                        x2={mousePosition.x}
                        y2={mousePosition.y}
                        stroke={colors[currentColorIndex].replace('80', 'aa')}
                        strokeWidth="2"
                        strokeDasharray="5,5"
                    />
                    <circle
                        cx={mousePosition.x}
                        cy={mousePosition.y}
                        r="3"
                        fill={colors[currentColorIndex]}
                        stroke="#333"
                        strokeWidth="1"
                    />
                </g>
            );
        }

        // First click indicator for two-click drawing
        if (waitingForSecondClick && firstClick) {
            feedback.push(
                <g key="first-click">
                    <circle
                        cx={firstClick.x}
                        cy={firstClick.y}
                        r="6"
                        fill="none"
                        stroke={colors[currentColorIndex].replace('80', 'ff')}
                        strokeWidth="2"
                    />
                    <circle
                        cx={firstClick.x}
                        cy={firstClick.y}
                        r="2"
                        fill={colors[currentColorIndex].replace('80', 'ff')}
                    />
                    {currentTool === 'rectangle' && (
                        <line
                            x1={firstClick.x}
                            y1={firstClick.y}
                            x2={mousePosition.x}
                            y2={mousePosition.y}
                            stroke={colors[currentColorIndex].replace('80', 'aa')}
                            strokeWidth="1"
                            strokeDasharray="3,3"
                        />
                    )}
                    {currentTool === 'circle' && (
                        <line
                            x1={firstClick.x}
                            y1={firstClick.y}
                            x2={mousePosition.x}
                            y2={mousePosition.y}
                            stroke={colors[currentColorIndex].replace('80', 'aa')}
                            strokeWidth="1"
                            strokeDasharray="3,3"
                        />
                    )}
                </g>
            );
        }

        // Tool preview indicator
        if (currentTool === 'circle' && !isDrawing) {
            feedback.push(
                <circle
                    key="circle-preview"
                    cx={mousePosition.x}
                    cy={mousePosition.y}
                    r="20"
                    fill="none"
                    stroke={colors[currentColorIndex].replace('80', 'aa')}
                    strokeWidth="2"
                    strokeDasharray="3,3"
                    opacity="0.7"
                />
            );
        }

        if (currentTool === 'rectangle' && !isDrawing) {
            feedback.push(
                <rect
                    key="rect-preview"
                    x={mousePosition.x - 20}
                    y={mousePosition.y - 15}
                    width="40"
                    height="30"
                    fill="none"
                    stroke={colors[currentColorIndex].replace('80', 'aa')}
                    strokeWidth="2"
                    strokeDasharray="3,3"
                    opacity="0.7"
                />
            );
        }

        return feedback;
    };

    const renderDrawingGuidelines = () => {
        if (!currentShape || !waitingForSecondClick) return null;

        const guidelines: React.JSX.Element[] = [];

        // Size indicator for circles and rectangles during two-click drawing
        if (currentTool === 'circle' && currentShape.points.length >= 2) {
            const [center, radiusPoint] = currentShape.points;
            const radius = Math.sqrt(
                Math.pow(radiusPoint.x - center.x, 2) + Math.pow(radiusPoint.y - center.y, 2)
            );

            guidelines.push(
                <g key="circle-size">
                    <line
                        x1={center.x}
                        y1={center.y}
                        x2={center.x + radius}
                        y2={center.y}
                        stroke="#666"
                        strokeWidth="1"
                        strokeDasharray="2,2"
                    />
                    <text
                        x={center.x + radius / 2}
                        y={center.y - 5}
                        fill="#333"
                        fontSize="12"
                        textAnchor="middle"
                    >
                        r: {Math.round(radius)}
                    </text>
                </g>
            );
        }

        if (currentTool === 'rectangle' && currentShape.points.length >= 2) {
            const [p1, p2] = currentShape.points;
            const width = Math.abs(p2.x - p1.x);
            const height = Math.abs(p2.y - p1.y);
            const centerX = (p1.x + p2.x) / 2;
            const centerY = (p1.y + p2.y) / 2;

            guidelines.push(
                <g key="rect-size">
                    <text
                        x={centerX}
                        y={Math.min(p1.y, p2.y) - 5}
                        fill="#333"
                        fontSize="12"
                        textAnchor="middle"
                    >
                        {Math.round(width)} × {Math.round(height)}
                    </text>
                </g>
            );
        }

        return guidelines;
    };

    const renderGrid = () => {
        if (!showGrid) return null;

        const gridSize = 20;
        const width = 800;
        const height = 600;
        const lines: React.JSX.Element[] = [];

        // Vertical lines
        for (let x = 0; x <= width; x += gridSize) {
            lines.push(
                <line
                    key={`v-${x}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={height}
                    stroke="#f0f0f0"
                    strokeWidth="0.5"
                />
            );
        }

        // Horizontal lines
        for (let y = 0; y <= height; y += gridSize) {
            lines.push(
                <line
                    key={`h-${y}`}
                    x1={0}
                    y1={y}
                    x2={width}
                    y2={y}
                    stroke="#f0f0f0"
                    strokeWidth="0.5"
                />
            );
        }

        return <g key="grid">{lines}</g>;
    };

    const renderArchitecturePlaceholder = () => (
        <g opacity="0.2" stroke="#ddd" strokeWidth="1" fill="none">
            {/* Main Building Structure */}
            <rect x="100" y="100" width="600" height="400" stroke="#bbb" strokeWidth="2" />

            {/* Living Areas */}
            <rect x="120" y="120" width="280" height="180" />
            <rect x="420" y="120" width="160" height="120" />
            <rect x="600" y="120" width="80" height="120" />

            {/* Bedrooms */}
            <rect x="120" y="320" width="140" height="160" />
            <rect x="280" y="320" width="140" height="160" />
            <rect x="440" y="260" width="140" height="140" />
            <rect x="600" y="260" width="80" height="140" />

            {/* Kitchen & Dining */}
            <rect x="440" y="420" width="140" height="60" />
            <rect x="600" y="420" width="80" height="60" />

            {/* Bathrooms */}
            <rect x="420" y="240" width="60" height="80" />
            <rect x="260" y="400" width="60" height="80" />

            {/* Hallways */}
            <line x1="400" y1="120" x2="400" y2="480" stroke="#ccc" strokeWidth="1" />
            <line x1="120" y1="300" x2="580" y2="300" stroke="#ccc" strokeWidth="1" />

            {/* Doors */}
            <line x1="200" y1="120" x2="200" y2="140" strokeWidth="4" stroke="#888" />
            <line x1="400" y1="160" x2="420" y2="160" strokeWidth="4" stroke="#888" />
            <line x1="400" y1="280" x2="420" y2="280" strokeWidth="4" stroke="#888" />
            <line x1="190" y1="320" x2="190" y2="300" strokeWidth="4" stroke="#888" />
            <line x1="350" y1="320" x2="350" y2="300" strokeWidth="4" stroke="#888" />
            <line x1="440" y1="340" x2="420" y2="340" strokeWidth="4" stroke="#888" />
            <line x1="420" y1="280" x2="440" y2="280" strokeWidth="4" stroke="#888" />

            {/* Windows */}
            <rect x="130" y="115" width="60" height="10" fill="#ddd" />
            <rect x="220" y="115" width="60" height="10" fill="#ddd" />
            <rect x="320" y="115" width="60" height="10" fill="#ddd" />
            <rect x="450" y="115" width="60" height="10" fill="#ddd" />
            <rect x="630" y="115" width="40" height="10" fill="#ddd" />

            <rect x="115" y="180" width="10" height="60" fill="#ddd" />
            <rect x="115" y="350" width="10" height="60" fill="#ddd" />
            <rect x="675" y="180" width="10" height="60" fill="#ddd" />
            <rect x="675" y="300" width="10" height="60" fill="#ddd" />

            <rect x="130" y="475" width="60" height="10" fill="#ddd" />
            <rect x="220" y="475" width="60" height="10" fill="#ddd" />
            <rect x="320" y="475" width="60" height="10" fill="#ddd" />
            <rect x="450" y="475" width="60" height="10" fill="#ddd" />
            <rect x="630" y="475" width="40" height="10" fill="#ddd" />

            {/* Kitchen Elements */}
            <rect x="430" y="130" width="20" height="60" fill="#eee" stroke="#ccc" />
            <rect x="450" y="130" width="60" height="20" fill="#eee" stroke="#ccc" />
            <circle cx="560" cy="140" r="8" fill="none" stroke="#ccc" />
            <circle cx="560" cy="160" r="8" fill="none" stroke="#ccc" />
            <circle cx="560" cy="180" r="8" fill="none" stroke="#ccc" />

            {/* Bathroom Fixtures */}
            <rect x="430" y="250" width="20" height="15" fill="#eee" stroke="#ccc" />
            <rect x="450" y="260" width="15" height="20" fill="#eee" stroke="#ccc" />
            <circle cx="440" cy="300" r="8" fill="none" stroke="#ccc" />

            <rect x="270" y="410" width="20" height="15" fill="#eee" stroke="#ccc" />
            <rect x="290" y="420" width="15" height="20" fill="#eee" stroke="#ccc" />
            <circle cx="280" cy="460" r="8" fill="none" stroke="#ccc" />

            {/* Furniture Outlines */}
            <rect x="140" y="140" width="80" height="40" fill="none" stroke="#ddd" strokeDasharray="2,2" />
            <rect x="300" y="200" width="40" height="80" fill="none" stroke="#ddd" strokeDasharray="2,2" />
            <rect x="140" y="340" width="60" height="30" fill="none" stroke="#ddd" strokeDasharray="2,2" />
            <rect x="300" y="340" width="60" height="30" fill="none" stroke="#ddd" strokeDasharray="2,2" />
            <rect x="460" y="280" width="60" height="30" fill="none" stroke="#ddd" strokeDasharray="2,2" />

            {/* Labels */}
            <text x="260" y="210" textAnchor="middle" fontSize="14" fill="#aaa" fontWeight="bold">Living Room</text>
            <text x="500" y="180" textAnchor="middle" fontSize="12" fill="#aaa">Kitchen</text>
            <text x="640" y="180" textAnchor="middle" fontSize="10" fill="#aaa">Pantry</text>
            <text x="190" y="400" textAnchor="middle" fontSize="12" fill="#aaa">Bedroom 1</text>
            <text x="350" y="400" textAnchor="middle" fontSize="12" fill="#aaa">Bedroom 2</text>
            <text x="510" y="330" textAnchor="middle" fontSize="12" fill="#aaa">Master BR</text>
            <text x="640" y="330" textAnchor="middle" fontSize="10" fill="#aaa">Closet</text>
            <text x="450" y="270" textAnchor="middle" fontSize="10" fill="#aaa">Bath</text>
            <text x="290" y="450" textAnchor="middle" fontSize="10" fill="#aaa">Bath</text>
            <text x="510" y="450" textAnchor="middle" fontSize="12" fill="#aaa">Dining</text>
            <text x="640" y="450" textAnchor="middle" fontSize="10" fill="#aaa">Utility</text>

            {/* Dimensions */}
            <line x1="90" y1="100" x2="90" y2="500" stroke="#bbb" strokeWidth="1" strokeDasharray="3,3" />
            <text x="85" y="300" textAnchor="middle" fontSize="10" fill="#aaa" transform="rotate(-90, 85, 300)">40'</text>
            <line x1="100" y1="90" x2="700" y2="90" stroke="#bbb" strokeWidth="1" strokeDasharray="3,3" />
            <text x="400" y="85" textAnchor="middle" fontSize="10" fill="#aaa">60'</text>
        </g>
    );

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Architecture Plan Drawing Tool</h1>

            {/* Toolbar */}
            <div className="mb-4 flex gap-2 items-center">
                <button
                    onClick={() => setCurrentTool('select')}
                    className={`px-3 py-2 rounded ${currentTool === 'select' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                >
                    Select
                </button>
                <button
                    onClick={() => setCurrentTool('circle')}
                    className={`px-3 py-2 rounded ${currentTool === 'circle' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                >
                    Circle
                </button>
                <button
                    onClick={() => setCurrentTool('rectangle')}
                    className={`px-3 py-2 rounded ${currentTool === 'rectangle' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                >
                    Rectangle
                </button>
                <button
                    onClick={() => setCurrentTool('polygon')}
                    className={`px-3 py-2 rounded ${currentTool === 'polygon' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                >
                    Polygon
                </button>

                {selectedShape && shapes.find(s => s.id === selectedShape)?.type === 'polygon' && (
                    <button
                        onClick={toggleCurveMode}
                        className={`ml-2 px-3 py-2 rounded ${shapes.find(s => s.id === selectedShape)?.curveMode
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200'
                            }`}
                    >
                        Curve Mode
                    </button>
                )}

                <div className="ml-4 flex gap-1">
                    {colors.map((color, index) => (
                        <div
                            key={index}
                            className={`w-6 h-6 rounded border-2 cursor-pointer ${index === currentColorIndex ? 'border-black' : 'border-gray-300'
                                }`}
                            style={{ backgroundColor: color }}
                            onClick={() => setCurrentColorIndex(index)}
                        />
                    ))}
                </div>

                <button
                    onClick={() => setShowGrid(!showGrid)}
                    className={`ml-2 px-3 py-2 rounded ${showGrid ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
                >
                    Grid
                </button>

                <button
                    onClick={() => setShapes([])}
                    className="ml-4 px-3 py-2 bg-red-500 text-white rounded"
                >
                    Clear All
                </button>
            </div>

            {/* Keyboard Shortcuts */}
            <div className="mb-4 text-xs text-gray-500">
                <strong>Shortcuts:</strong> S=Select | C=Circle | R=Rectangle | P=Polygon | G=Grid | Q=Curve | Del=Delete Shape | Esc=Cancel
            </div>

            {/* SVG Canvas */}
            <svg
                ref={svgRef}
                width="800"
                height="600"
                className="border border-gray-300 bg-white cursor-crosshair"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {/* Grid */}
                {renderGrid()}

                {/* Architecture placeholder */}
                {renderArchitecturePlaceholder()}

                {/* Rendered shapes */}
                {shapes.map(renderShape)}

                {/* Current shape being drawn */}
                {currentShape && renderShape(currentShape)}

                {/* Control points for selected shapes */}
                {shapes.filter(s => s.selected).map(renderControlPoints)}

                {/* Resize handles for rectangles */}
                {shapes.filter(s => s.selected).map(addResizeHandles)}

                {/* Visual feedback */}
                {renderVisualFeedback()}

                {/* Drawing guidelines */}
                {renderDrawingGuidelines()}
            </svg>
        </div>
    );
}
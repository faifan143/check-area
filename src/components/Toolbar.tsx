'use client';

import React, { useState } from 'react';
import { Upload, Circle, Square, Triangle, Minus, Trash2, RotateCcw, MousePointer, Waves, Paintbrush, FileText } from 'lucide-react';

interface EdgeControl {
    point: { x: number; y: number };
    edgeIndex: number;
}

interface Shape {
    id: string;
    type: 'circle' | 'rectangle' | 'polygon' | 'line' | 'filled-area';
    points: number[];
    color: string;
    strokeWidth: number;
    selected?: boolean;
    curveMode?: boolean;
    edgeControls?: EdgeControl[];
    bezierPoints?: number[][];
    fillColor?: string;
    filled?: boolean;
}

interface ToolbarProps {
    onFileUpload: (file: File) => void;
    drawingMode: 'circle' | 'rectangle' | 'polygon' | 'line' | 'fill' | null;
    onDrawingModeChange: (mode: 'circle' | 'rectangle' | 'polygon' | 'line' | 'fill' | null) => void;
    currentMode: 'draw' | 'select';
    onModeChange: (mode: 'draw' | 'select') => void;
    selectedShapeId: string | null;
    onToggleCurveMode: () => void;
    shapes: Shape[];
    onShapesChange: (shapes: Shape[]) => void;
    onClearCanvas: () => void;
    fillColor: string;
    onFillColorChange: (color: string) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
    onFileUpload,
    drawingMode,
    onDrawingModeChange,
    currentMode,
    onModeChange,
    selectedShapeId,
    onToggleCurveMode,
    shapes,
    onShapesChange,
    onClearCanvas,
    fillColor,
    onFillColorChange
}) => {
    const [dragOver, setDragOver] = useState(false);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type === 'application/pdf') {
            if (file.size > 10 * 1024 * 1024) {
                alert('File size must be less than 10MB');
                return;
            }
            onFileUpload(file);
        } else {
            alert('Please select a valid PDF file');
        }
    };

    const handleDrop = (event: React.DragEvent) => {
        event.preventDefault();
        setDragOver(false);

        const file = event.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            if (file.size > 10 * 1024 * 1024) {
                alert('File size must be less than 10MB');
                return;
            }
            onFileUpload(file);
        } else {
            alert('Please drop a valid PDF file');
        }
    };

    const handleDragOver = (event: React.DragEvent) => {
        event.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = (event: React.DragEvent) => {
        event.preventDefault();
        setDragOver(false);
    };

    const deleteShape = (shapeId: string) => {
        onShapesChange(shapes.filter(shape => shape.id !== shapeId));
    };

    return (
        <div className="bg-white border-b border-gray-200 px-4 py-2">
            <div className="flex items-center justify-between">
                {/* Left side - File upload and mode selection */}
                <div className="flex items-center space-x-4">
                    {/* File Upload */}
                    <div className="flex items-center space-x-2">
                        <div
                            className={`flex items-center space-x-2 px-3 py-1.5 rounded border cursor-pointer transition-colors ${dragOver
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-300 hover:border-gray-400'
                                }`}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                        >
                            <input
                                type="file"
                                accept=".pdf"
                                onChange={handleFileChange}
                                className="hidden"
                                id="pdf-upload"
                            />
                            <label htmlFor="pdf-upload" className="flex items-center space-x-2 cursor-pointer">
                                <Upload className="h-4 w-4 text-gray-600" />
                                <span className="text-sm text-gray-700">Upload PDF</span>
                            </label>
                        </div>
                    </div>

                    {/* Mode Selection */}
                    <div className="flex items-center space-x-1">
                        <button
                            onClick={() => onModeChange('draw')}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded text-sm transition-colors ${currentMode === 'draw'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            <Triangle className="h-4 w-4" />
                            <span>Draw</span>
                        </button>
                        <button
                            onClick={() => onModeChange('select')}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded text-sm transition-colors ${currentMode === 'select'
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            <MousePointer className="h-4 w-4" />
                            <span>Select</span>
                        </button>
                    </div>
                </div>

                {/* Center - Drawing tools (only show in draw mode) */}
                {currentMode === 'draw' && (
                    <div className="flex items-center space-x-1">
                        <button
                            onClick={() => onDrawingModeChange(drawingMode === 'line' ? null : 'line')}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded text-sm transition-colors ${drawingMode === 'line'
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            title="Line Tool"
                        >
                            <Minus className="h-4 w-4" />
                            <span>Line</span>
                        </button>
                        <button
                            onClick={() => onDrawingModeChange(drawingMode === 'circle' ? null : 'circle')}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded text-sm transition-colors ${drawingMode === 'circle'
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            title="Circle Tool"
                        >
                            <Circle className="h-4 w-4" />
                            <span>Circle</span>
                        </button>
                        <button
                            onClick={() => onDrawingModeChange(drawingMode === 'rectangle' ? null : 'rectangle')}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded text-sm transition-colors ${drawingMode === 'rectangle'
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            title="Rectangle Tool"
                        >
                            <Square className="h-4 w-4" />
                            <span>Rectangle</span>
                        </button>
                        <button
                            onClick={() => onDrawingModeChange(drawingMode === 'polygon' ? null : 'polygon')}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded text-sm transition-colors ${drawingMode === 'polygon'
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            title="Polygon Tool"
                        >
                            <Triangle className="h-4 w-4" />
                            <span>Polygon</span>
                        </button>
                        <button
                            onClick={() => onDrawingModeChange(drawingMode === 'fill' ? null : 'fill')}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded text-sm transition-colors ${drawingMode === 'fill'
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            title="Fill Tool"
                        >
                            <Paintbrush className="h-4 w-4" />
                            <span>Fill</span>
                        </button>

                        {/* Fill color picker (only show when fill mode is active) */}
                        {drawingMode === 'fill' && (
                            <div className="flex items-center space-x-2 ml-2">
                                <span className="text-sm text-gray-600">Color:</span>
                                <input
                                    type="color"
                                    value={fillColor}
                                    onChange={(e) => onFillColorChange(e.target.value)}
                                    className="w-6 h-6 rounded border border-gray-300 cursor-pointer"
                                    title="Fill Color"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Right side - Actions and info */}
                <div className="flex items-center space-x-2">
                    {/* Curve mode for selected polygon */}
                    {currentMode === 'select' && selectedShapeId &&
                        shapes.find(s => s.id === selectedShapeId)?.type === 'polygon' && (
                            <button
                                onClick={onToggleCurveMode}
                                className={`flex items-center space-x-1 px-3 py-1.5 rounded text-sm transition-colors ${shapes.find(s => s.id === selectedShapeId)?.curveMode
                                    ? 'bg-purple-500 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                title="Toggle Curve Mode"
                            >
                                <Waves className="h-4 w-4" />
                                <span>Curve</span>
                            </button>
                        )}

                    {/* Shape count */}
                    <div className="flex items-center space-x-1 px-2 py-1 bg-gray-100 rounded text-sm text-gray-600">
                        <FileText className="h-4 w-4" />
                        <span>{shapes.length} shapes</span>
                    </div>

                    {/* Clear buttons */}
                    <button
                        onClick={() => onShapesChange([])}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 transition-colors"
                        title="Clear Shapes"
                    >
                        <RotateCcw className="h-4 w-4" />
                        <span>Clear</span>
                    </button>
                    <button
                        onClick={onClearCanvas}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
                        title="Clear Canvas"
                    >
                        <Trash2 className="h-4 w-4" />
                        <span>Reset</span>
                    </button>
                </div>
            </div>

            {/* Tool tips for active modes */}
            {drawingMode === 'polygon' && (
                <div className="mt-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                    <strong>Polygon Tool:</strong> Click to add points, double-click to close
                </div>
            )}
            {drawingMode === 'fill' && (
                <div className="mt-2 px-3 py-1 bg-green-50 border border-green-200 rounded text-xs text-green-800">
                    <strong>Fill Tool:</strong> Click on enclosed areas to fill them
                </div>
            )}
        </div>
    );
};

export default Toolbar;

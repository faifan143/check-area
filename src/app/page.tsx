'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import components with SSR disabled for Konva
const Canvas = dynamic(() => import('../components/Canvas'), { ssr: false });
const Controls = dynamic(() => import('../components/Controls'), { ssr: false });

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

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [drawingMode, setDrawingMode] = useState<'circle' | 'rectangle' | 'polygon' | 'line' | 'fill' | null>(null);
  const [currentMode, setCurrentMode] = useState<'draw' | 'select'>('draw');
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [fillColor, setFillColor] = useState<string>('#ffeb3b'); // Default fill color (yellow)

  const handleFileUpload = (file: File) => {
    setPdfFile(file);
    setShapes([]);
  };

  const handleShapesChange = (newShapes: Shape[]) => {
    setShapes(newShapes);
  };

  const handleClearCanvas = () => {
    setPdfFile(null);
    setShapes([]);
    setSelectedShapeId(null);
  };

  const handleShapeSelect = (shapeId: string | null) => {
    setSelectedShapeId(shapeId);
    setShapes(shapes.map(shape => ({
      ...shape,
      selected: shape.id === shapeId
    })));
  };

  const toggleCurveMode = () => {
    if (!selectedShapeId) return;

    setShapes(shapes.map(shape => {
      if (shape.id === selectedShapeId && shape.type === 'polygon') {
        const newCurveMode = !shape.curveMode;
        return {
          ...shape,
          curveMode: newCurveMode,
          edgeControls: newCurveMode ? shape.edgeControls || [] : []
        };
      }
      return shape;
    }));
  };

  const handleModeChange = (mode: 'draw' | 'select') => {
    setCurrentMode(mode);
    if (mode === 'draw') {
      // Clear selection when switching to draw mode
      setSelectedShapeId(null);
      setShapes(shapes.map(shape => ({ ...shape, selected: false })));
    } else {
      // Clear drawing mode when switching to select
      setDrawingMode(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col">
          <div className="bg-white border-b border-gray-300 p-4">
            <h1 className="text-2xl font-bold text-gray-800">
              Architectural Plan Editor
            </h1>
            <p className="text-gray-600 mt-1">
              Upload PDF plans, draw shapes, and calculate measurements
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center p-4">
            <Canvas
              pdfFile={pdfFile}
              drawingMode={drawingMode}
              currentMode={currentMode}
              selectedShapeId={selectedShapeId}
              onShapesChange={handleShapesChange}
              onShapeSelect={handleShapeSelect}
              shapes={shapes}
              fillColor={fillColor}
            />
          </div>
        </div>

        {/* Controls Sidebar */}
        <Controls
          onFileUpload={handleFileUpload}
          drawingMode={drawingMode}
          onDrawingModeChange={setDrawingMode}
          currentMode={currentMode}
          onModeChange={handleModeChange}
          selectedShapeId={selectedShapeId}
          onToggleCurveMode={toggleCurveMode}
          shapes={shapes}
          onShapesChange={handleShapesChange}
          onClearCanvas={handleClearCanvas}
          fillColor={fillColor}
          onFillColorChange={setFillColor}
        />
      </div>
    </div>
  );
}

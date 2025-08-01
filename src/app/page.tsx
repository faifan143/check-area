'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import components with SSR disabled for Konva
const Canvas = dynamic(() => import('../components/Canvas'), { ssr: false });
const Controls = dynamic(() => import('../components/Controls'), { ssr: false });

interface Shape {
  id: string;
  type: 'circle' | 'rectangle' | 'polygon' | 'line';
  points: number[];
  color: string;
  strokeWidth: number;
  bezierPoints?: number[][];
}

export default function Home() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [drawingMode, setDrawingMode] = useState<'circle' | 'rectangle' | 'polygon' | 'line' | null>(null);
  const [floodFillColor, setFloodFillColor] = useState('#ff6b6b');
  const [shapes, setShapes] = useState<Shape[]>([]);

  const handleFileUpload = (file: File) => {
    setPdfFile(file);
    // Clear existing shapes when new file is uploaded
    setShapes([]);
  };

  const handleShapesChange = (newShapes: Shape[]) => {
    setShapes(newShapes);
  };

  const handleClearCanvas = () => {
    setPdfFile(null);
    setShapes([]);
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
              floodFillColor={floodFillColor}
              onShapesChange={handleShapesChange}
              shapes={shapes}
            />
          </div>
        </div>

        {/* Controls Sidebar */}
        <Controls
          onFileUpload={handleFileUpload}
          drawingMode={drawingMode}
          onDrawingModeChange={setDrawingMode}
          floodFillColor={floodFillColor}
          onFloodFillColorChange={setFloodFillColor}
          shapes={shapes}
          onShapesChange={handleShapesChange}
          onClearCanvas={handleClearCanvas}
        />
      </div>
    </div>
  );
}

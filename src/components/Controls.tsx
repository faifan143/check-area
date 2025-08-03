'use client';

import React, { useState } from 'react';
import { Upload, Circle, Square, Triangle, Minus, Trash2, RotateCcw, MousePointer, Waves, Paintbrush } from 'lucide-react';

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

interface ControlsProps {
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

const Controls: React.FC<ControlsProps> = ({
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
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
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
    <div className="w-80 bg-white border-l border-gray-300 p-6 overflow-y-auto">
      <h2 className="text-xl font-bold mb-6 text-gray-800">Architectural Plan Editor</h2>

      {/* File Upload Section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">Upload PDF Plan</h3>
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
            }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 mb-2">
            Drag and drop a PDF file here, or click to browse
          </p>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
            id="pdf-upload"
          />
          <label
            htmlFor="pdf-upload"
            className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer"
          >
            Choose PDF File
          </label>
          <p className="text-xs text-gray-500 mt-2">Max size: 10MB</p>
        </div>
      </div>

      {/* Mode Selection */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">Mode</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onModeChange('draw')}
            className={`flex items-center justify-center p-3 rounded border transition-colors ${currentMode === 'draw'
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
              }`}
          >
            <Triangle className="h-5 w-5 mr-2" />
            Draw
          </button>
          <button
            onClick={() => onModeChange('select')}
            className={`flex items-center justify-center p-3 rounded border transition-colors ${currentMode === 'select'
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
              }`}
          >
            <MousePointer className="h-5 w-5 mr-2" />
            Select
          </button>
        </div>
      </div>

      {/* Drawing Tools Section */}
      {currentMode === 'draw' && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-700">Drawing Tools</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onDrawingModeChange(drawingMode === 'line' ? null : 'line')}
              className={`flex items-center justify-center p-3 rounded border transition-colors ${drawingMode === 'line'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                }`}
            >
              <Minus className="h-5 w-5 mr-2" />
              Line
            </button>
            <button
              onClick={() => onDrawingModeChange(drawingMode === 'circle' ? null : 'circle')}
              className={`flex items-center justify-center p-3 rounded border transition-colors ${drawingMode === 'circle'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                }`}
            >
              <Circle className="h-5 w-5 mr-2" />
              Circle
            </button>
            <button
              onClick={() => onDrawingModeChange(drawingMode === 'rectangle' ? null : 'rectangle')}
              className={`flex items-center justify-center p-3 rounded border transition-colors ${drawingMode === 'rectangle'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                }`}
            >
              <Square className="h-5 w-5 mr-2" />
              Rectangle
            </button>
            <button
              onClick={() => onDrawingModeChange(drawingMode === 'polygon' ? null : 'polygon')}
              className={`flex items-center justify-center p-3 rounded border transition-colors ${drawingMode === 'polygon'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                }`}
            >
              <Triangle className="h-5 w-5 mr-2" />
              Polygon
            </button>
            <button
              onClick={() => onDrawingModeChange(drawingMode === 'fill' ? null : 'fill')}
              className={`flex items-center justify-center p-3 rounded border transition-colors ${drawingMode === 'fill'
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                }`}
            >
              <Paintbrush className="h-5 w-5 mr-2" />
              Fill
            </button>
          </div>

          {drawingMode === 'polygon' && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-800 font-medium mb-1">Polygon Tool:</p>
              <p className="text-xs text-blue-700">
                • Click to add points<br />
                • Double-click to close polygon<br />
                • Create complex shapes with unlimited sides
              </p>
            </div>
          )}

          {drawingMode === 'fill' && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs text-green-800 font-medium mb-1">Fill Tool:</p>
              <p className="text-xs text-green-700 mb-2">
                • Click on any enclosed area to fill it<br />
                • Detects boundaries automatically<br />
                • Works with both drawn shapes and PDF lines
              </p>
              <div className="flex items-center space-x-2">
                <label className="text-xs text-green-800 font-medium">Fill Color:</label>
                <input
                  type="color"
                  value={fillColor}
                  onChange={(e) => onFillColorChange(e.target.value)}
                  className="w-8 h-6 rounded border border-green-300 cursor-pointer"
                />
                <span className="text-xs text-green-700">{fillColor}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selection Tools */}
      {currentMode === 'select' && selectedShapeId && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-700">Shape Tools</h3>

          {/* Curve Mode for Polygons */}
          {shapes.find(s => s.id === selectedShapeId)?.type === 'polygon' && (
            <button
              onClick={onToggleCurveMode}
              className={`w-full flex items-center justify-center p-3 rounded border transition-colors mb-3 ${shapes.find(s => s.id === selectedShapeId)?.curveMode
                ? 'bg-green-500 text-white border-green-500'
                : 'bg-white text-gray-700 border-gray-300 hover:border-green-300'
                }`}
            >
              <Waves className="h-5 w-5 mr-2" />
              Curve Mode
            </button>
          )}

          <div className="text-xs text-gray-500 space-y-1">
            <p><strong>Selection Mode:</strong></p>
            <p>• Click shapes to select them</p>
            <p>• Drag to move shapes around</p>
            {shapes.find(s => s.id === selectedShapeId)?.type === 'polygon' && (
              <p>• Use Curve Mode to add curves to polygon edges</p>
            )}
          </div>
        </div>
      )}

      {/* Canvas Actions */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">Canvas Actions</h3>
        <div className="space-y-2">
          <button
            onClick={onClearCanvas}
            className="w-full flex items-center justify-center p-3 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            <Trash2 className="h-5 w-5 mr-2" />
            Clear Canvas
          </button>
          <button
            onClick={() => onShapesChange([])}
            className="w-full flex items-center justify-center p-3 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors"
          >
            <RotateCcw className="h-5 w-5 mr-2" />
            Clear Shapes
          </button>
        </div>
      </div>

      {/* Shapes List */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-gray-700">Drawn Shapes ({shapes.length})</h3>
        {shapes.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No shapes drawn yet</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {shapes.map((shape, index) => (
              <div
                key={shape.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded border"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: shape.color }} />
                  <span className="text-sm font-medium capitalize">
                    {shape.type} #{index + 1}
                  </span>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => deleteShape(shape.id)}
                    className="p-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                    title="Delete Shape"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>


    </div>
  );
};

export default Controls; 
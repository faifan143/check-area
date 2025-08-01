'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Image, Line, Circle, Rect, Group } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';
import * as math from 'mathjs';
import MetricsModal from './MetricsModal';

interface Shape {
  id: string;
  type: 'circle' | 'rectangle' | 'polygon' | 'line';
  points: number[];
  color: string;
  strokeWidth: number;
  bezierPoints?: number[][];
}

interface CanvasProps {
  pdfFile: File | null;
  drawingMode: 'circle' | 'rectangle' | 'polygon' | 'line' | null;
  floodFillColor: string;
  onShapesChange: (shapes: Shape[]) => void;
  shapes: Shape[];
}

const Canvas: React.FC<CanvasProps> = ({
  pdfFile,
  drawingMode,
  floodFillColor,
  onShapesChange,
  shapes
}) => {
  const stageRef = useRef<any>(null);
  const [svgImage, setSvgImage] = useState<HTMLImageElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [metricsModalOpen, setMetricsModalOpen] = useState(false);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [conversionError, setConversionError] = useState<string | null>(null);

  // Convert PDF to SVG
  const convertPdfToSvg = useCallback(async (file: File) => {
    setIsLoading(true);
    setConversionError(null);
    try {
      // Import the PDF converter utility
      const { PDFConverter } = await import('../utils/pdfConverter');

      // Use PDF.js approach for better browser compatibility
      const result = await PDFConverter.convertPDFToSVGWithPDFJS(file);

      const blob = new Blob([result.svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);

      const img = new window.Image();
      img.onload = () => {
        setSvgImage(img);
        setIsLoading(false);
      };
      img.onerror = () => {
        setConversionError('Failed to load converted image');
        setIsLoading(false);
      };
      img.src = url;
    } catch (error) {
      console.error('Error converting PDF to SVG:', error);
      setConversionError(`PDF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  }, []);

  // Handle PDF file upload or load demo
  useEffect(() => {
    if (pdfFile) {
      convertPdfToSvg(pdfFile);
    } else {
      // Load demo SVG when no PDF is uploaded
      loadDemoSVG();
    }
  }, [pdfFile, convertPdfToSvg]);

  // Load demo SVG for testing
  const loadDemoSVG = useCallback(async () => {
    setIsLoading(true);
    try {
      const { PDFConverter } = await import('../utils/pdfConverter');
      const result = PDFConverter.createDemoSVG();

      const blob = new Blob([result.svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);

      const img = new window.Image();
      img.onload = () => {
        setSvgImage(img);
        setIsLoading(false);
      };
      img.onerror = () => {
        setConversionError('Failed to load demo image');
        setIsLoading(false);
      };
      img.src = url;
    } catch (error) {
      console.error('Error loading demo SVG:', error);
      setConversionError('Failed to load demo plan');
      setIsLoading(false);
    }
  }, []);

  // Handle canvas click for drawing
  const handleCanvasClick = useCallback((e: any) => {
    if (!drawingMode) return;

    const stage = stageRef.current;
    const point = stage.getPointerPosition();
    if (!point) return;

    if (drawingMode === 'line') {
      if (drawingPoints.length === 0) {
        setDrawingPoints([point.x, point.y]);
        setIsDrawing(true);
      } else {
        const newShape: Shape = {
          id: uuidv4(),
          type: 'line',
          points: [...drawingPoints, point.x, point.y],
          color: '#3b82f6', // Blue
          strokeWidth: 2
        };
        onShapesChange([...shapes, newShape]);
        setDrawingPoints([]);
        setIsDrawing(false);
        setMousePosition(null);
      }
    } else if (drawingMode === 'circle') {
      if (drawingPoints.length === 0) {
        setDrawingPoints([point.x, point.y]);
        setIsDrawing(true);
      } else {
        const [x1, y1] = drawingPoints;
        const [x2, y2] = [point.x, point.y];
        const centerX = (x1 + x2) / 2;
        const centerY = (y1 + y2) / 2;
        const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)) / 2;

        const newShape: Shape = {
          id: uuidv4(),
          type: 'circle',
          points: [centerX, centerY, radius],
          color: '#ef4444', // Red
          strokeWidth: 2
        };
        onShapesChange([...shapes, newShape]);
        setDrawingPoints([]);
        setIsDrawing(false);
        setMousePosition(null);
      }
    } else if (drawingMode === 'rectangle') {
      if (drawingPoints.length === 0) {
        setDrawingPoints([point.x, point.y]);
        setIsDrawing(true);
      } else {
        const [x1, y1] = drawingPoints;
        const [x2, y2] = [point.x, point.y];

        const newShape: Shape = {
          id: uuidv4(),
          type: 'rectangle',
          points: [x1, y1, x2 - x1, y2 - y1],
          color: '#3b82f6', // Blue
          strokeWidth: 2
        };
        onShapesChange([...shapes, newShape]);
        setDrawingPoints([]);
        setIsDrawing(false);
        setMousePosition(null);
      }
    } else if (drawingMode === 'polygon') {
      // Add point to polygon
      setDrawingPoints([...drawingPoints, point.x, point.y]);
      setIsDrawing(true);
    }
  }, [drawingMode, drawingPoints, shapes, onShapesChange]);

  // Handle mouse move for drawing preview
  const handleMouseMove = useCallback((e: any) => {
    if (!drawingMode || !isDrawing) return;

    const stage = stageRef.current;
    const point = stage.getPointerPosition();
    if (point) {
      setMousePosition(point);
    }
  }, [drawingMode, isDrawing]);

  // Handle double click to close polygon
  const handleDoubleClick = useCallback((e: any) => {
    if (drawingMode === 'polygon' && drawingPoints.length >= 6) { // At least 3 points (6 coordinates)
      const newShape: Shape = {
        id: uuidv4(),
        type: 'polygon',
        points: [...drawingPoints],
        color: '#ef4444', // Red
        strokeWidth: 2
      };
      onShapesChange([...shapes, newShape]);
      setDrawingPoints([]);
      setIsDrawing(false);
      setMousePosition(null);
    }
  }, [drawingMode, drawingPoints, shapes, onShapesChange]);

  // Handle flood fill
  const handleFloodFill = useCallback((e: any) => {
    if (!svgImage) return;

    const stage = stageRef.current;
    const point = stage.getPointerPosition();
    if (!point) return;

    // Simple flood fill implementation
    // In a real implementation, you'd use canvas getImageData/putImageData
    console.log('Flood fill at:', point.x, point.y, 'with color:', floodFillColor);
  }, [svgImage, floodFillColor]);

  // Calculate metrics for shapes
  const calculateMetrics = useCallback(() => {
    const calculatedMetrics = shapes.map(shape => {
      let area = 0;
      let perimeter = 0;

      switch (shape.type) {
        case 'circle':
          const radius = shape.points[2];
          area = Math.PI * Math.pow(radius, 2);
          perimeter = 2 * Math.PI * radius;
          break;
        case 'rectangle':
          const [x, y, width, height] = shape.points;
          area = Math.abs(width * height);
          perimeter = 2 * (Math.abs(width) + Math.abs(height));
          break;
        case 'polygon':
          const points = [];
          for (let i = 0; i < shape.points.length; i += 2) {
            points.push([shape.points[i], shape.points[i + 1]]);
          }
          // Shoelace formula for area
          let shoelace = 0;
          for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            shoelace += points[i][0] * points[j][1];
            shoelace -= points[j][0] * points[i][1];
          }
          area = Math.abs(shoelace) / 2;

          // Calculate perimeter
          for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            perimeter += Math.sqrt(
              Math.pow(points[j][0] - points[i][0], 2) +
              Math.pow(points[j][1] - points[i][1], 2)
            );
          }
          break;
        case 'line':
          const [x1, y1, x2, y2] = shape.points;
          perimeter = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
          break;
      }

      return {
        id: shape.id,
        type: shape.type,
        area: area.toFixed(2),
        perimeter: perimeter.toFixed(2)
      };
    });

    setMetrics(calculatedMetrics);
    setMetricsModalOpen(true);
  }, [shapes]);

  return (
    <div className="flex-1 relative bg-gray-100 border border-gray-300">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <div className="text-lg">Converting PDF to SVG...</div>
            <div className="text-sm text-gray-600 mt-2">This may take a few seconds</div>
          </div>
        </div>
      )}

      {conversionError && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
          <div className="text-center max-w-md mx-4">
            <div className="text-red-500 text-lg mb-2">⚠️ Conversion Error</div>
            <div className="text-gray-700 mb-4">{conversionError}</div>
            <button
              onClick={() => setConversionError(null)}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      <Stage
        ref={stageRef}
        width={800}
        height={600}
        onClick={drawingMode ? handleCanvasClick : handleFloodFill}
        onMouseMove={handleMouseMove}
        onDblClick={handleDoubleClick}
        style={{ cursor: drawingMode ? 'crosshair' : 'pointer' }}
      >
        <Layer>
          {/* SVG Background */}
          {svgImage && (
            <Image
              image={svgImage}
              width={800}
              height={600}
            />
          )}

          {/* Drawing preview */}
          {isDrawing && drawingPoints.length > 0 && mousePosition && (
            <>
              {drawingMode === 'line' && (
                <Line
                  points={[...drawingPoints, mousePosition.x, mousePosition.y]}
                  stroke="#0066cc"
                  strokeWidth={2}
                  dash={[5, 5]}
                />
              )}
              {drawingMode === 'circle' && (
                <Circle
                  x={(drawingPoints[0] + mousePosition.x) / 2}
                  y={(drawingPoints[1] + mousePosition.y) / 2}
                  radius={Math.sqrt(Math.pow(mousePosition.x - drawingPoints[0], 2) + Math.pow(mousePosition.y - drawingPoints[1], 2)) / 2}
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="rgba(239, 68, 68, 0.2)"
                  dash={[5, 5]}
                />
              )}
              {drawingMode === 'rectangle' && (
                <Rect
                  x={drawingPoints[0]}
                  y={drawingPoints[1]}
                  width={mousePosition.x - drawingPoints[0]}
                  height={mousePosition.y - drawingPoints[1]}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="rgba(59, 130, 246, 0.2)"
                  dash={[5, 5]}
                />
              )}
                             {drawingMode === 'polygon' && (
                 <>
                   {/* Show all existing points and lines */}
                   {drawingPoints.length >= 4 && (
                     <Line
                       points={drawingPoints}
                       stroke="#ef4444"
                       strokeWidth={2}
                       dash={[5, 5]}
                     />
                   )}
                   {/* Show line from last point to current mouse position */}
                   {drawingPoints.length >= 2 && mousePosition && (
                     <Line
                       points={[
                         drawingPoints[drawingPoints.length - 2],
                         drawingPoints[drawingPoints.length - 1],
                         mousePosition.x,
                         mousePosition.y
                       ]}
                       stroke="#ef4444"
                       strokeWidth={2}
                       dash={[5, 5]}
                     />
                   )}
                   {/* Show line from current mouse position back to first point (closing the polygon) */}
                   {drawingPoints.length >= 2 && mousePosition && (
                     <Line
                       points={[
                         mousePosition.x,
                         mousePosition.y,
                         drawingPoints[0],
                         drawingPoints[1]
                       ]}
                       stroke="#ef4444"
                       strokeWidth={1}
                       dash={[3, 3]}
                       opacity={0.5}
                     />
                   )}
                   {/* Show points */}
                   {drawingPoints.map((point, index) => (
                     index % 2 === 0 && (
                       <Circle
                         key={index}
                         x={point}
                         y={drawingPoints[index + 1]}
                         radius={3}
                         fill="#ef4444"
                         stroke="#ffffff"
                         strokeWidth={1}
                       />
                     )
                   ))}
                   {/* Show current mouse position as a point */}
                   {mousePosition && (
                     <Circle
                       x={mousePosition.x}
                       y={mousePosition.y}
                       radius={3}
                       fill="#ef4444"
                       stroke="#ffffff"
                       strokeWidth={1}
                       opacity={0.7}
                     />
                   )}
                 </>
               )}
            </>
          )}

          {/* Drawn shapes */}
          {shapes.map((shape) => {
            switch (shape.type) {
              case 'circle':
                return (
                  <Circle
                    key={shape.id}
                    x={shape.points[0]}
                    y={shape.points[1]}
                    radius={shape.points[2]}
                    stroke={shape.color}
                    strokeWidth={shape.strokeWidth}
                    fill={shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}
                  />
                );
              case 'rectangle':
                return (
                  <Rect
                    key={shape.id}
                    x={shape.points[0]}
                    y={shape.points[1]}
                    width={shape.points[2]}
                    height={shape.points[3]}
                    stroke={shape.color}
                    strokeWidth={shape.strokeWidth}
                    fill={shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}
                  />
                );
              case 'polygon':
                return (
                  <Line
                    key={shape.id}
                    points={shape.points}
                    stroke={shape.color}
                    strokeWidth={shape.strokeWidth}
                    fill={shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}
                    closed={true}
                  />
                );
              case 'line':
                return (
                  <Line
                    key={shape.id}
                    points={shape.points}
                    stroke={shape.color}
                    strokeWidth={shape.strokeWidth}
                  />
                );
              default:
                return null;
            }
          })}
        </Layer>
      </Stage>

      {/* Metrics button */}
      <button
        onClick={calculateMetrics}
        className="absolute top-4 right-4 bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
      >
        Calculate Metrics
      </button>

      {/* Metrics Modal */}
      <MetricsModal
        isOpen={metricsModalOpen}
        onClose={() => setMetricsModalOpen(false)}
        metrics={metrics}
      />
    </div>
  );
};

export default Canvas; 
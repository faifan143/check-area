'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Image, Line, Circle, Rect, Group, Path } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';
import * as math from 'mathjs';


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

interface CanvasProps {
  pdfFile: File | null;
  drawingMode: 'circle' | 'rectangle' | 'polygon' | 'line' | 'fill' | null;
  currentMode: 'draw' | 'select';
  selectedShapeId: string | null;
  onShapesChange: (shapes: Shape[]) => void;
  onShapeSelect: (shapeId: string | null) => void;
  shapes: Shape[];
  fillColor: string;
}

const Canvas: React.FC<CanvasProps> = ({
  pdfFile,
  drawingMode,
  currentMode,
  selectedShapeId,
  onShapesChange,
  onShapeSelect,
  shapes,
  fillColor
}) => {
  const stageRef = useRef<any>(null);
  const [svgImage, setSvgImage] = useState<HTMLImageElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [draggingShape, setDraggingShape] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [resizing, setResizing] = useState<{ shapeId: string; handleIndex: number } | null>(null);
  const [draggedControlPoint, setDraggedControlPoint] = useState<{ shapeId: string; pointIndex: number; type: 'vertex' | 'edge' } | null>(null);
  const [isFloodFilling, setIsFloodFilling] = useState(false);

  // Convert PDF to SVG
  const convertPdfToSvg = useCallback(async (file: File) => {
    setIsLoading(true);
    setConversionError(null);
    try {
      // Import the PDF converter utility
      const { PDFConverter } = await import('../utils/pdfConverter');

      // Use the main conversion method which handles errors gracefully
      const result = await PDFConverter.convertPDFToSVG(file);

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

  // Handle PDF file upload
  useEffect(() => {
    if (pdfFile) {
      convertPdfToSvg(pdfFile);
    } else {
      // Clear any existing image when no PDF is uploaded
      setSvgImage(null);
      setConversionError(null);
    }
  }, [pdfFile, convertPdfToSvg]);

  // Flood fill algorithm to detect boundaries and create filled areas
  const performFloodFill = useCallback(async (clickPoint: { x: number; y: number }) => {
    if (!stageRef.current) return;

    setIsFloodFilling(true);

    try {
      const stage = stageRef.current;

      // Create a temporary canvas to render the current scene for pixel analysis
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 800;
      tempCanvas.height = 600;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      // Clear the temporary canvas
      tempCtx.fillStyle = 'white';
      tempCtx.fillRect(0, 0, 800, 600);

      // Draw PDF background if exists
      if (svgImage) {
        tempCtx.drawImage(svgImage, 0, 0, 800, 600);
      }

      // Draw all existing shapes to detect boundaries
      tempCtx.strokeStyle = 'black';
      tempCtx.lineWidth = 2;

      shapes.forEach(shape => {
        tempCtx.beginPath();
        switch (shape.type) {
          case 'line':
            tempCtx.moveTo(shape.points[0], shape.points[1]);
            tempCtx.lineTo(shape.points[2], shape.points[3]);
            break;
          case 'rectangle':
            const [x, y, width, height] = shape.points;
            tempCtx.rect(x, y, width, height);
            break;
          case 'circle':
            const [cx, cy, radius] = shape.points;
            tempCtx.arc(cx, cy, radius, 0, 2 * Math.PI);
            break;
          case 'polygon':
            if (shape.points.length >= 4) {
              tempCtx.moveTo(shape.points[0], shape.points[1]);
              for (let i = 2; i < shape.points.length; i += 2) {
                tempCtx.lineTo(shape.points[i], shape.points[i + 1]);
              }
              tempCtx.closePath();
            }
            break;
        }
        tempCtx.stroke();
      });

      // Get image data for pixel analysis
      const imageData = tempCtx.getImageData(0, 0, 800, 600);
      const data = imageData.data;

      // Flood fill to find the entire enclosed area
      const visited = new Set<string>();
      const targetColor = getPixelColor(data, clickPoint.x, clickPoint.y, 800);

      if (isDarkPixel(targetColor)) {
        // Clicked on a dark line/boundary - don't fill
        return;
      }

      // Flood fill to find all connected pixels in the enclosed area
      const queue: Array<{ x: number, y: number }> = [clickPoint];
      const filledPixels: Array<{ x: number, y: number }> = [];

      while (queue.length > 0) {
        const point = queue.shift()!;
        const key = `${point.x},${point.y}`;

        if (visited.has(key) || point.x < 0 || point.x >= 800 || point.y < 0 || point.y >= 600) {
          continue;
        }

        const currentColor = getPixelColor(data, point.x, point.y, 800);

        // If we hit a dark boundary, stop here
        if (isDarkPixel(currentColor)) {
          continue;
        }

        // If color doesn't match target (different area), stop here
        if (!colorsMatch(currentColor, targetColor)) {
          continue;
        }

        visited.add(key);
        filledPixels.push(point);

        // Add neighboring points (4-directional only to prevent diagonal leakage)
        queue.push({ x: point.x + 1, y: point.y });
        queue.push({ x: point.x - 1, y: point.y });
        queue.push({ x: point.x, y: point.y + 1 });
        queue.push({ x: point.x, y: point.y - 1 });
      }

      // If we found pixels to fill, create a filled area using the actual boundary
      if (filledPixels.length > 0) {
        // Check if the filled area is reasonable (not too large for a small click)
        const areaWidth = Math.max(...filledPixels.map(p => p.x)) - Math.min(...filledPixels.map(p => p.x));
        const areaHeight = Math.max(...filledPixels.map(p => p.y)) - Math.min(...filledPixels.map(p => p.y));
        const areaSize = areaWidth * areaHeight;

        // If the area is very large compared to the number of pixels, it might be a leak
        if (filledPixels.length < 100 && areaSize > filledPixels.length * 10) {
          console.log('Potential flood fill leak detected, using more conservative approach');
          // Use a more conservative approach for small areas
          const conservativePixels = filledPixels.filter(pixel => {
            // Only keep pixels that are close to the click point
            const distance = Math.sqrt(
              Math.pow(pixel.x - clickPoint.x, 2) + Math.pow(pixel.y - clickPoint.y, 2)
            );
            return distance < Math.sqrt(filledPixels.length) * 2;
          });

          if (conservativePixels.length > 0) {
            filledPixels.length = 0;
            filledPixels.push(...conservativePixels);
          }
        }

        // Create a more accurate boundary by finding the outline of filled pixels
        let boundaryPoints = findBoundaryFromFilledPixels(filledPixels);

        // Fallback: if boundary detection fails, create a simple bounding box
        if (boundaryPoints.length < 6) {
          const minX = Math.min(...filledPixels.map(p => p.x));
          const maxX = Math.max(...filledPixels.map(p => p.x));
          const minY = Math.min(...filledPixels.map(p => p.y));
          const maxY = Math.max(...filledPixels.map(p => p.y));

          boundaryPoints = [
            minX, minY,
            maxX, minY,
            maxX, maxY,
            minX, maxY
          ];
        }

        if (boundaryPoints.length >= 6) { // At least 3 points
          const newShape: Shape = {
            id: uuidv4(),
            type: 'filled-area',
            points: boundaryPoints,
            color: fillColor,
            strokeWidth: 0,
            fillColor: fillColor,
            filled: true
          };

          onShapesChange([...shapes, newShape]);
        }
      }

    } catch (error) {
      console.error('Flood fill error:', error);
    } finally {
      setIsFloodFilling(false);
    }
  }, [shapes, onShapesChange, svgImage, fillColor]);

  // Helper function to get pixel color
  const getPixelColor = (data: Uint8ClampedArray, x: number, y: number, width: number): number[] => {
    const index = (Math.floor(y) * width + Math.floor(x)) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
  };

  // Helper function to check if colors match
  const colorsMatch = (color1: number[], color2: number[], tolerance = 5): boolean => {
    return Math.abs(color1[0] - color2[0]) <= tolerance &&
      Math.abs(color1[1] - color2[1]) <= tolerance &&
      Math.abs(color1[2] - color2[2]) <= tolerance;
  };

  // Helper function to check if pixel is dark (boundary)
  const isDarkPixel = (color: number[], threshold = 128): boolean => {
    const brightness = (color[0] + color[1] + color[2]) / 3;
    return brightness < threshold;
  };

  // Helper function to find boundary from filled pixels
  const findBoundaryFromFilledPixels = (filledPixels: Array<{ x: number, y: number }>): number[] => {
    if (filledPixels.length === 0) return [];

    // For very small areas, use a more detailed approach with better corner detection
    if (filledPixels.length <= 300) { // Increased threshold for better corner detection
      return createDetailedBoundaryForSmallArea(filledPixels);
    }

    // For large areas, use a simpler approach to avoid performance issues
    if (filledPixels.length > 10000) {
      return createSimpleBoundary(filledPixels);
    }

    // Create a set of filled pixels for quick lookup
    const filledSet = new Set<string>();
    filledPixels.forEach(p => filledSet.add(`${p.x},${p.y}`));

    // Find boundary pixels (filled pixels that have at least one non-filled neighbor)
    const boundaryPixels: Array<{ x: number, y: number }> = [];

    filledPixels.forEach(pixel => {
      const neighbors = [
        { x: pixel.x + 1, y: pixel.y },
        { x: pixel.x - 1, y: pixel.y },
        { x: pixel.x, y: pixel.y + 1 },
        { x: pixel.x, y: pixel.y - 1 }
      ];

      // Check if any neighbor is not filled (i.e., this pixel is on the boundary)
      const hasNonFilledNeighbor = neighbors.some(neighbor =>
        !filledSet.has(`${neighbor.x},${neighbor.y}`)
      );

      if (hasNonFilledNeighbor) {
        boundaryPixels.push(pixel);
      }
    });

    if (boundaryPixels.length === 0) return [];

    // Use marching squares algorithm to trace the boundary in order
    const boundaryPoints = traceBoundaryWithMarchingSquares(boundaryPixels);

    return boundaryPoints;
  };

  // Helper function to create a detailed boundary for small areas
  const createDetailedBoundaryForSmallArea = (filledPixels: Array<{ x: number, y: number }>): number[] => {
    if (filledPixels.length === 0) return [];

    // Create a set of filled pixels for quick lookup
    const filledSet = new Set<string>();
    filledPixels.forEach(p => filledSet.add(`${p.x},${p.y}`));

    // Find all boundary pixels with 8-directional connectivity for small areas to catch corners
    const boundaryPixels: Array<{ x: number, y: number }> = [];

    filledPixels.forEach(pixel => {
      const neighbors = [
        { x: pixel.x + 1, y: pixel.y },     // right
        { x: pixel.x - 1, y: pixel.y },     // left
        { x: pixel.x, y: pixel.y + 1 },     // down
        { x: pixel.x, y: pixel.y - 1 },     // up
        { x: pixel.x + 1, y: pixel.y + 1 }, // diagonal down-right
        { x: pixel.x + 1, y: pixel.y - 1 }, // diagonal up-right
        { x: pixel.x - 1, y: pixel.y + 1 }, // diagonal down-left
        { x: pixel.x - 1, y: pixel.y - 1 }  // diagonal up-left
      ];

      // Check if any neighbor is not filled (i.e., this pixel is on the boundary)
      const hasNonFilledNeighbor = neighbors.some(neighbor =>
        !filledSet.has(`${neighbor.x},${neighbor.y}`)
      );

      if (hasNonFilledNeighbor) {
        boundaryPixels.push(pixel);
      }
    });

    if (boundaryPixels.length === 0) return [];

    // For very small areas, preserve all boundary pixels without simplification
    if (boundaryPixels.length <= 50) { // Increased threshold for better corner detection
      // Sort boundary pixels in a more natural order (clockwise from top-left)
      const sortedPixels = boundaryPixels.sort((a, b) => {
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });

      const result: number[] = [];
      sortedPixels.forEach(p => {
        result.push(p.x, p.y);
      });
      return result;
    }

    // Use a simpler boundary tracing for small areas
    return traceSimpleBoundary(boundaryPixels);
  };

  // Helper function to trace a simple boundary for small areas
  const traceSimpleBoundary = (boundaryPixels: Array<{ x: number, y: number }>): number[] => {
    if (boundaryPixels.length === 0) return [];

    // Find the leftmost boundary pixel as starting point
    let startPixel = boundaryPixels[0];
    for (const pixel of boundaryPixels) {
      if (pixel.x < startPixel.x || (pixel.x === startPixel.x && pixel.y < startPixel.y)) {
        startPixel = pixel;
      }
    }

    // Create a set for quick lookup
    const boundarySet = new Set<string>();
    boundaryPixels.forEach(p => boundarySet.add(`${p.x},${p.y}`));

    // Trace the boundary in clockwise order with 8-directional connectivity for better corner detection
    const tracedPoints: Array<{ x: number, y: number }> = [];
    const visited = new Set<string>();

    let currentPixel = startPixel;
    const directions = [
      [0, -1],   // up
      [1, -1],   // up-right
      [1, 0],    // right
      [1, 1],    // down-right
      [0, 1],    // down
      [-1, 1],   // down-left
      [-1, 0],   // left
      [-1, -1]   // up-left
    ];

    do {
      const key = `${currentPixel.x},${currentPixel.y}`;
      if (visited.has(key)) break;

      visited.add(key);
      tracedPoints.push(currentPixel);

      // Find the next boundary pixel in clockwise order
      let nextPixel = null;
      for (let i = 0; i < directions.length; i++) {
        const [dx, dy] = directions[i];
        const testPixel = { x: currentPixel.x + dx, y: currentPixel.y + dy };
        const testKey = `${testPixel.x},${testPixel.y}`;

        if (boundarySet.has(testKey) && !visited.has(testKey)) {
          nextPixel = testPixel;
          break;
        }
      }

      if (!nextPixel) break;
      currentPixel = nextPixel;

    } while (tracedPoints.length < boundaryPixels.length);

    // Convert to flat array
    const result: number[] = [];
    tracedPoints.forEach(p => {
      result.push(p.x, p.y);
    });

    return result;
  };

  // Helper function to create a simple boundary for large areas
  const createSimpleBoundary = (filledPixels: Array<{ x: number, y: number }>): number[] => {
    const minX = Math.min(...filledPixels.map(p => p.x));
    const maxX = Math.max(...filledPixels.map(p => p.x));
    const minY = Math.min(...filledPixels.map(p => p.y));
    const maxY = Math.max(...filledPixels.map(p => p.y));

    // Create a more detailed boundary by sampling points along the edges
    const boundaryPoints: Array<{ x: number, y: number }> = [];
    const step = Math.max(1, Math.floor((maxX - minX + maxY - minY) / 50)); // Adaptive step size

    // Top edge
    for (let x = minX; x <= maxX; x += step) {
      boundaryPoints.push({ x, y: minY });
    }

    // Right edge
    for (let y = minY; y <= maxY; y += step) {
      boundaryPoints.push({ x: maxX, y });
    }

    // Bottom edge
    for (let x = maxX; x >= minX; x -= step) {
      boundaryPoints.push({ x, y: maxY });
    }

    // Left edge
    for (let y = maxY; y >= minY; y -= step) {
      boundaryPoints.push({ x: minX, y });
    }

    // Convert to flat array
    const result: number[] = [];
    boundaryPoints.forEach(p => {
      result.push(p.x, p.y);
    });

    return result;
  };

  // Helper function to trace boundary using marching squares approach
  const traceBoundaryWithMarchingSquares = (boundaryPixels: Array<{ x: number, y: number }>): number[] => {
    if (boundaryPixels.length === 0) return [];

    // Create a grid representation of boundary pixels
    const minX = Math.min(...boundaryPixels.map(p => p.x));
    const maxX = Math.max(...boundaryPixels.map(p => p.x));
    const minY = Math.min(...boundaryPixels.map(p => p.y));
    const maxY = Math.max(...boundaryPixels.map(p => p.y));

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;

    // Create a 2D grid
    const grid: boolean[][] = Array(height).fill(null).map(() => Array(width).fill(false));

    // Mark boundary pixels in the grid
    boundaryPixels.forEach(pixel => {
      const gridX = pixel.x - minX;
      const gridY = pixel.y - minY;
      if (gridX >= 0 && gridX < width && gridY >= 0 && gridY < height) {
        grid[gridY][gridX] = true;
      }
    });

    // Find the starting point (leftmost boundary pixel)
    let startX = 0, startY = 0;
    let found = false;

    for (let y = 0; y < height && !found; y++) {
      for (let x = 0; x < width && !found; x++) {
        if (grid[y][x]) {
          startX = x;
          startY = y;
          found = true;
        }
      }
    }

    if (!found) return [];

    // Trace the boundary using a simple contour following algorithm
    const boundaryPoints: Array<{ x: number, y: number }> = [];
    const visited = new Set<string>();

    let currentX = startX;
    let currentY = startY;
    let direction = 0; // 0: right, 1: down, 2: left, 3: up

    do {
      const key = `${currentX},${currentY}`;
      if (visited.has(key)) break;

      visited.add(key);
      boundaryPoints.push({ x: currentX + minX, y: currentY + minY });

      // Try to find the next boundary pixel in clockwise order (8-directional for better corner detection)
      const directions = [
        [1, 0],    // right
        [1, 1],    // down-right
        [0, 1],    // down
        [-1, 1],   // down-left
        [-1, 0],   // left
        [-1, -1],  // up-left
        [0, -1],   // up
        [1, -1]    // up-right
      ];

      let nextFound = false;
      for (let i = 0; i < 8; i++) {
        const testDir = (direction + i) % 8;
        const [dx, dy] = directions[testDir];
        const nextX = currentX + dx;
        const nextY = currentY + dy;

        if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height && grid[nextY][nextX]) {
          currentX = nextX;
          currentY = nextY;
          direction = testDir;
          nextFound = true;
          break;
        }
      }

      if (!nextFound) break;

    } while (boundaryPoints.length < boundaryPixels.length * 2); // Safety limit

    // Simplify the boundary by removing redundant points
    const simplifiedPoints = simplifyBoundary(boundaryPoints);

    // Convert to flat array
    const result: number[] = [];
    simplifiedPoints.forEach(p => {
      result.push(p.x, p.y);
    });

    return result;
  };

  // Helper function to simplify boundary by removing redundant points
  const simplifyBoundary = (points: Array<{ x: number, y: number }>): Array<{ x: number, y: number }> => {
    if (points.length <= 3) return points;

    // For very small areas, use minimal or no simplification to preserve corner details
    if (points.length <= 50) { // Increased threshold for better corner preservation
      // For small areas, just remove exact duplicates and very close points
      const simplified: Array<{ x: number, y: number }> = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const lastPoint = simplified[simplified.length - 1];
        const currentPoint = points[i];

        // Only remove exact duplicates or very close points
        const distance = Math.sqrt(
          Math.pow(currentPoint.x - lastPoint.x, 2) + Math.pow(currentPoint.y - lastPoint.y, 2)
        );

        if (distance > 0.3) { // Even smaller tolerance for small areas to preserve corners
          simplified.push(currentPoint);
        }
      }

      // Ensure we close the polygon
      if (simplified.length > 2) {
        const firstPoint = simplified[0];
        const lastPoint = simplified[simplified.length - 1];
        const distance = Math.sqrt(
          Math.pow(lastPoint.x - firstPoint.x, 2) + Math.pow(lastPoint.y - firstPoint.y, 2)
        );

        if (distance > 0.3) {
          simplified.push(firstPoint);
        }
      }

      return simplified;
    }

    // For larger areas, use adaptive tolerance
    const simplified: Array<{ x: number, y: number }> = [points[0]];
    const tolerance = Math.max(1, Math.min(5, Math.floor(points.length / 20))); // Adaptive tolerance

    for (let i = 1; i < points.length; i++) {
      const lastPoint = simplified[simplified.length - 1];
      const currentPoint = points[i];

      const distance = Math.sqrt(
        Math.pow(currentPoint.x - lastPoint.x, 2) + Math.pow(currentPoint.y - lastPoint.y, 2)
      );

      if (distance > tolerance) {
        simplified.push(currentPoint);
      }
    }

    // Ensure we close the polygon
    if (simplified.length > 2) {
      const firstPoint = simplified[0];
      const lastPoint = simplified[simplified.length - 1];
      const distance = Math.sqrt(
        Math.pow(lastPoint.x - firstPoint.x, 2) + Math.pow(lastPoint.y - firstPoint.y, 2)
      );

      if (distance > tolerance) {
        simplified.push(firstPoint);
      }
    }

    return simplified;
  };

  // Helper function to trace boundary points into a proper polygon using convex hull
  const traceBoundary = (points: Array<{ x: number, y: number }>): number[] => {
    if (points.length === 0) return [];
    if (points.length < 3) {
      // If we have very few points, just return them
      const result: number[] = [];
      points.forEach(p => {
        result.push(p.x, p.y);
      });
      return result;
    }

    // Remove duplicate points
    const uniquePoints = points.filter((point, index, arr) =>
      index === arr.findIndex(p => Math.abs(p.x - point.x) < 2 && Math.abs(p.y - point.y) < 2)
    );

    if (uniquePoints.length < 3) {
      const result: number[] = [];
      uniquePoints.forEach(p => {
        result.push(p.x, p.y);
      });
      return result;
    }

    // Use Graham scan to find convex hull for a clean boundary
    const hull = grahamScan(uniquePoints);

    // Convert to flat array
    const result: number[] = [];
    hull.forEach(p => {
      result.push(p.x, p.y);
    });

    return result;
  };

  // Graham scan algorithm for convex hull
  const grahamScan = (points: Array<{ x: number, y: number }>): Array<{ x: number, y: number }> => {
    if (points.length < 3) return points;

    // Find the bottom-most point (or left-most in case of tie)
    let start = points[0];
    let startIndex = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].y < start.y || (points[i].y === start.y && points[i].x < start.x)) {
        start = points[i];
        startIndex = i;
      }
    }

    // Sort points by polar angle with respect to start point
    const sortedPoints = points.slice();
    sortedPoints.splice(startIndex, 1);
    sortedPoints.sort((a, b) => {
      const angleA = Math.atan2(a.y - start.y, a.x - start.x);
      const angleB = Math.atan2(b.y - start.y, b.x - start.x);
      if (Math.abs(angleA - angleB) < 1e-9) {
        // If angles are equal, sort by distance
        const distA = Math.pow(a.x - start.x, 2) + Math.pow(a.y - start.y, 2);
        const distB = Math.pow(b.x - start.x, 2) + Math.pow(b.y - start.y, 2);
        return distA - distB;
      }
      return angleA - angleB;
    });

    // Build the hull
    const hull = [start];
    for (const point of sortedPoints) {
      // Remove points that make a clockwise turn
      while (hull.length > 1 && ccw(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) {
        hull.pop();
      }
      hull.push(point);
    }

    return hull;
  };

  // Cross product to determine the turn direction (counter-clockwise test)
  const ccw = (a: { x: number, y: number }, b: { x: number, y: number }, c: { x: number, y: number }): number => {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  };

  // Helper function to create SVG path from points for solid fill
  const createSVGPath = (points: number[]): string => {
    if (points.length < 4) return '';

    let path = `M ${points[0]} ${points[1]}`;

    for (let i = 2; i < points.length; i += 2) {
      path += ` L ${points[i]} ${points[i + 1]}`;
    }

    path += ' Z'; // Close the path
    return path;
  };

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
  const handleCanvasClick = useCallback((e: any) => {
    const stage = stageRef.current;
    const point = stage.getPointerPosition();
    if (!point) return;

    // Handle selection mode
    if (currentMode === 'select') {
      // Find clicked shape (check from top to bottom)
      const clickedShape = [...shapes].reverse().find(shape => isPointInShape(point, shape));

      if (clickedShape) {
        onShapeSelect(clickedShape.id);
      } else {
        onShapeSelect(null);
      }
      return;
    }

    // Handle drawing mode
    if (!drawingMode || draggingShape || isFloodFilling) return;

    // Handle flood fill mode
    if (drawingMode === 'fill') {
      performFloodFill(point);
      return;
    }

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
  }, [drawingMode, drawingPoints, shapes, onShapesChange, draggingShape, currentMode, isPointInShape, onShapeSelect, isFloodFilling, performFloodFill]);

  // Handle shape drag start
  const handleDragStart = useCallback((e: any, shapeId: string) => {
    e.cancelBubble = true;
    setDraggingShape(shapeId);
    setDragOffset({ x: 0, y: 0 });
    onShapeSelect(shapeId);
  }, [onShapeSelect]);

  // Handle real-time drag movement for visual feedback
  const handleDragMove = useCallback((e: any, shapeId: string) => {
    e.cancelBubble = true;
    if (draggingShape === shapeId) {
      const draggedElement = e.target;
      const currentPos = draggedElement.position();
      setDragOffset({ x: currentPos.x, y: currentPos.y });
    }
  }, [draggingShape]);

  // Handle shape drag end - Apply final position changes
  const handleDragEnd = useCallback((e: any, shapeId: string) => {
    e.cancelBubble = true;
    setDraggingShape(null);
    setDragOffset(null);

    const shape = shapes.find(s => s.id === shapeId);
    if (!shape) return;

    const draggedElement = e.target;
    const newPos = draggedElement.position();

    // Reset the dragged element position to avoid double positioning
    draggedElement.position({ x: 0, y: 0 });

    const updatedShapes = shapes.map(s => {
      if (s.id === shapeId) {
        let newPoints: number[] = [];
        let newEdgeControls = s.edgeControls ? [...s.edgeControls] : [];

        switch (shape.type) {
          case 'circle':
            // For circles: update center position [centerX, centerY, radius]
            newPoints = [
              shape.points[0] + newPos.x,
              shape.points[1] + newPos.y,
              shape.points[2]
            ];
            break;
          case 'rectangle':
            // For rectangles: update top-left position [x, y, width, height]
            newPoints = [
              shape.points[0] + newPos.x,
              shape.points[1] + newPos.y,
              shape.points[2],
              shape.points[3]
            ];
            break;
          case 'line':
            // For lines: move both points by the same delta
            newPoints = [
              shape.points[0] + newPos.x,
              shape.points[1] + newPos.y,
              shape.points[2] + newPos.x,
              shape.points[3] + newPos.y
            ];
            break;
          case 'polygon':
            // For polygons: move all points by the same delta
            newPoints = [];
            for (let i = 0; i < shape.points.length; i += 2) {
              newPoints.push(shape.points[i] + newPos.x);
              newPoints.push(shape.points[i + 1] + newPos.y);
            }

            // Also move edge control points for curved polygons
            if (s.edgeControls && s.edgeControls.length > 0) {
              newEdgeControls = s.edgeControls.map(ec => ({
                ...ec,
                point: {
                  x: ec.point.x + newPos.x,
                  y: ec.point.y + newPos.y
                }
              }));
            }
            break;
          default:
            newPoints = shape.points;
        }

        return { ...s, points: newPoints, edgeControls: newEdgeControls };
      }
      return s;
    });

    onShapesChange(updatedShapes);
  }, [shapes, onShapesChange]);

  // Handle mouse move for drawing preview and interactions
  const handleMouseMove = useCallback((e: any) => {
    const stage = stageRef.current;
    const point = stage.getPointerPosition();
    if (!point) return;

    // Handle drawing preview
    if (drawingMode && isDrawing) {
      setMousePosition(point);
      return;
    }

    // Handle resize dragging
    if (resizing && currentMode === 'select') {
      const shape = shapes.find(s => s.id === resizing.shapeId);
      if (shape && shape.type === 'rectangle') {
        const [x, y, width, height] = shape.points;
        let newPoints: number[] = [...shape.points];

        const handleIndex = resizing.handleIndex;
        switch (handleIndex) {
          case 0: // nw-resize
            newPoints = [point.x, point.y, (x + width) - point.x, (y + height) - point.y];
            break;
          case 1: // ne-resize
            newPoints = [x, point.y, point.x - x, (y + height) - point.y];
            break;
          case 2: // se-resize
            newPoints = [x, y, point.x - x, point.y - y];
            break;
          case 3: // sw-resize
            newPoints = [point.x, y, (x + width) - point.x, point.y - y];
            break;
          case 4: // n-resize
            newPoints = [x, point.y, width, (y + height) - point.y];
            break;
          case 5: // s-resize
            newPoints = [x, y, width, point.y - y];
            break;
          case 6: // w-resize
            newPoints = [point.x, y, (x + width) - point.x, height];
            break;
          case 7: // e-resize
            newPoints = [x, y, point.x - x, height];
            break;
        }

        const updatedShapes = shapes.map(s =>
          s.id === resizing.shapeId ? { ...s, points: newPoints } : s
        );
        onShapesChange(updatedShapes);
      }
      return;
    }

    // Handle control point dragging
    if (draggedControlPoint && currentMode === 'select') {
      const shape = shapes.find(s => s.id === draggedControlPoint.shapeId);
      if (shape && shape.type === 'polygon') {
        if (draggedControlPoint.type === 'vertex') {
          // Update vertex position
          const newPoints = [...shape.points];
          const pointIndex = draggedControlPoint.pointIndex;
          newPoints[pointIndex] = point.x;
          newPoints[pointIndex + 1] = point.y;

          const updatedShapes = shapes.map(s =>
            s.id === draggedControlPoint.shapeId ? { ...s, points: newPoints } : s
          );
          onShapesChange(updatedShapes);
        } else if (draggedControlPoint.type === 'edge') {
          // Update edge control point
          const edgeIndex = draggedControlPoint.pointIndex / 2;
          const newEdgeControls = [...(shape.edgeControls || [])];

          const existingIndex = newEdgeControls.findIndex(ec => ec.edgeIndex === edgeIndex);
          if (existingIndex >= 0) {
            newEdgeControls[existingIndex] = { ...newEdgeControls[existingIndex], point: { x: point.x, y: point.y } };
          } else {
            newEdgeControls.push({ point: { x: point.x, y: point.y }, edgeIndex: edgeIndex });
          }

          const updatedShapes = shapes.map(s =>
            s.id === draggedControlPoint.shapeId ? { ...s, edgeControls: newEdgeControls } : s
          );
          onShapesChange(updatedShapes);
        }
      }
      return;
    }
  }, [drawingMode, isDrawing, resizing, draggedControlPoint, currentMode, shapes, onShapesChange]);

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
  }, [drawingMode, drawingPoints, shapes, onShapesChange, draggingShape]);

  // Render resize handles for selected rectangles (matching demo exactly)
  const renderResizeHandles = (shape: Shape) => {
    if (!shape.selected || shape.type !== 'rectangle') return null;

    const [x, y, width, height] = shape.points;

    // Apply drag offset for real-time visual feedback
    const isDragging = draggingShape === shape.id && dragOffset;
    const offsetX = isDragging ? dragOffset.x : 0;
    const offsetY = isDragging ? dragOffset.y : 0;

    const minX = Math.min(x, x + width) + offsetX;
    const maxX = Math.max(x, x + width) + offsetX;
    const minY = Math.min(y, y + height) + offsetY;
    const maxY = Math.max(y, y + height) + offsetY;

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
      <Rect
        key={`resize-${shape.id}-${index}`}
        x={handle.x - 4}
        y={handle.y - 4}
        width={8}
        height={8}
        fill="#fff"
        stroke="#000"
        strokeWidth={1}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          setResizing({ shapeId: shape.id, handleIndex: index });
        }}
      />
    ));
  };

  // Render control points for selected polygons (matching demo exactly)
  const renderControlPoints = (shape: Shape) => {
    if (!shape.selected || shape.type !== 'polygon') return null;

    // Apply drag offset for real-time visual feedback
    const isDragging = draggingShape === shape.id && dragOffset;
    const offsetX = isDragging ? dragOffset.x : 0;
    const offsetY = isDragging ? dragOffset.y : 0;

    const points = [];

    // Render vertex control points (main control points)
    for (let i = 0; i < shape.points.length; i += 2) {
      points.push(
        <Circle
          key={`vertex-${shape.id}-${i}`}
          x={shape.points[i] + offsetX}
          y={shape.points[i + 1] + offsetY}
          radius={5}
          fill="#fff"
          stroke="#000"
          strokeWidth={2}
          onMouseDown={(e) => {
            e.cancelBubble = true;
            setDraggedControlPoint({ shapeId: shape.id, pointIndex: i, type: 'vertex' });
          }}
        />
      );
    }

    // Render edge control points for curve mode
    if (shape.curveMode) {
      for (let i = 0; i < shape.points.length; i += 2) {
        const nextIndex = ((i + 2) % shape.points.length);
        const midX = (shape.points[i] + shape.points[nextIndex]) / 2 + offsetX;
        const midY = (shape.points[i + 1] + shape.points[nextIndex + 1]) / 2 + offsetY;

        const edgeIndex = i / 2;
        const existingControl = shape.edgeControls?.find(ec => ec.edgeIndex === edgeIndex);
        const controlPoint = existingControl
          ? { x: existingControl.point.x + offsetX, y: existingControl.point.y + offsetY }
          : { x: midX, y: midY };

        // Add dashed guide line from edge midpoint to control point (if control exists)
        if (existingControl) {
          points.push(
            <Line
              key={`guide-${shape.id}-${i}`}
              points={[midX, midY, controlPoint.x, controlPoint.y]}
              stroke="#999"
              strokeWidth={1}
              dash={[3, 3]}
            />
          );
        }

        // Edge control point
        points.push(
          <Circle
            key={`edge-${shape.id}-${i}`}
            x={controlPoint.x}
            y={controlPoint.y}
            radius={4}
            fill={existingControl ? "#4ecdc4" : "#ddd"}
            stroke="#666"
            strokeWidth={1}
            opacity={existingControl ? 1 : 0.6}
            onMouseDown={(e) => {
              e.cancelBubble = true;
              setDraggedControlPoint({ shapeId: shape.id, pointIndex: i, type: 'edge' });
            }}
          />
        );
      }
    }

    return points;
  };

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

      {isFloodFilling && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
            <div className="text-lg">Analyzing boundaries...</div>
            <div className="text-sm text-gray-600 mt-2">Detecting enclosed area to fill</div>
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

      {/* Professional placeholder when no PDF is uploaded */}
      {!pdfFile && !svgImage && !isLoading && !conversionError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="text-center max-w-md mx-4">
            <div className="mb-6">
              <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Upload Your Architectural Plan
            </h3>
            <p className="text-gray-600 mb-6">
              Get started by uploading a PDF file of your architectural plan.
              You can then draw shapes, measure areas, and analyze your design.
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Drag and drop your PDF file</span>
              </div>
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Or use the upload button in the toolbar</span>
              </div>
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Maximum file size: 10MB</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <Stage
        ref={stageRef}
        width={800}
        height={600}
        onClick={currentMode === 'select' ? handleCanvasClick : (drawingMode ? handleCanvasClick : undefined)}
        onMouseMove={handleMouseMove}
        onMouseUp={() => {
          setResizing(null);
          setDraggedControlPoint(null);
        }}
        onDblClick={handleDoubleClick}
        style={{ cursor: isFloodFilling ? 'wait' : (currentMode === 'select' ? 'pointer' : (drawingMode === 'fill' ? 'cell' : (drawingMode ? 'crosshair' : 'default'))) }}
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
                    stroke={shape.selected ? '#ff0000' : shape.color}
                    strokeWidth={shape.selected ? 3 : shape.strokeWidth}
                    fill={shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}
                    draggable={currentMode === 'select'}
                    onDragStart={(e) => handleDragStart(e, shape.id)}
                    onDragMove={(e) => handleDragMove(e, shape.id)}
                    onDragEnd={(e) => handleDragEnd(e, shape.id)}
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
                    stroke={shape.selected ? '#ff0000' : shape.color}
                    strokeWidth={shape.selected ? 3 : shape.strokeWidth}
                    fill={shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}
                    draggable={currentMode === 'select'}
                    onDragStart={(e) => handleDragStart(e, shape.id)}
                    onDragMove={(e) => handleDragMove(e, shape.id)}
                    onDragEnd={(e) => handleDragEnd(e, shape.id)}
                  />
                );
              case 'polygon':
                // Create path data for curved or straight polygon
                if (shape.curveMode && shape.edgeControls && shape.edgeControls.length > 0) {
                  // Create curved path using edge controls
                  let pathData = '';

                  for (let i = 0; i < shape.points.length; i += 2) {
                    const x = shape.points[i];
                    const y = shape.points[i + 1];

                    if (i === 0) {
                      pathData = `M ${x} ${y}`;
                    } else {
                      const edgeIndex = (i / 2) - 1;
                      const edgeControl = shape.edgeControls.find(ec => ec.edgeIndex === edgeIndex);

                      if (edgeControl) {
                        pathData += ` Q ${edgeControl.point.x} ${edgeControl.point.y}, ${x} ${y}`;
                      } else {
                        pathData += ` L ${x} ${y}`;
                      }
                    }
                  }

                  // Handle closing edge
                  const lastEdgeIndex = (shape.points.length / 2) - 1;
                  const lastEdgeControl = shape.edgeControls.find(ec => ec.edgeIndex === lastEdgeIndex);
                  if (lastEdgeControl) {
                    pathData += ` Q ${lastEdgeControl.point.x} ${lastEdgeControl.point.y}, ${shape.points[0]} ${shape.points[1]}`;
                  } else {
                    pathData += ' Z';
                  }

                  return (
                    <Group
                      key={shape.id}
                      draggable={currentMode === 'select'}
                      onDragStart={(e) => handleDragStart(e, shape.id)}
                      onDragEnd={(e) => handleDragEnd(e, shape.id)}
                    >
                      <Path
                        data={pathData}
                        stroke={shape.selected ? '#ff0000' : shape.color}
                        strokeWidth={shape.selected ? 3 : shape.strokeWidth}
                        fill={shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}
                      />
                    </Group>
                  );
                } else {
                  // Straight polygon
                  return (
                    <Group
                      key={shape.id}
                      draggable={currentMode === 'select'}
                      onDragStart={(e) => handleDragStart(e, shape.id)}
                      onDragEnd={(e) => handleDragEnd(e, shape.id)}
                    >
                      <Line
                        points={shape.points}
                        stroke={shape.selected ? '#ff0000' : shape.color}
                        strokeWidth={shape.selected ? 3 : shape.strokeWidth}
                        fill={shape.color === '#ef4444' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}
                        closed={true}
                      />
                    </Group>
                  );
                }
              case 'line':
                return (
                  <Group
                    key={shape.id}
                    draggable={currentMode === 'select'}
                    onDragStart={(e) => handleDragStart(e, shape.id)}
                    onDragMove={(e) => handleDragMove(e, shape.id)}
                    onDragEnd={(e) => handleDragEnd(e, shape.id)}
                  >
                    <Line
                      points={shape.points}
                      stroke={shape.color}
                      strokeWidth={shape.strokeWidth}
                    />
                  </Group>
                );
              case 'filled-area':
                return (
                  <Group
                    key={shape.id}
                    draggable={currentMode === 'select'}
                    onDragStart={(e) => handleDragStart(e, shape.id)}
                    onDragMove={(e) => handleDragMove(e, shape.id)}
                    onDragEnd={(e) => handleDragEnd(e, shape.id)}
                  >
                    {/* Use Line with proper fill for solid rendering */}
                    <Line
                      points={shape.points}
                      fill={shape.fillColor || fillColor}
                      stroke={shape.selected ? '#ff0000' : 'rgba(0,0,0,0.1)'}
                      strokeWidth={shape.selected ? 2 : 0}
                      closed={true}
                      opacity={0.85}
                      perfectDrawEnabled={false}
                      listening={true}
                    />
                  </Group>
                );
              default:
                return null;
            }
          })}

          {/* Resize handles for selected rectangles */}
          {shapes.filter(shape => shape.selected && shape.type === 'rectangle').map(renderResizeHandles)}

          {/* Control points for selected polygons */}
          {shapes.filter(shape => shape.selected && shape.type === 'polygon').map(renderControlPoints)}
        </Layer>
      </Stage>


    </div>
  );
};

export default Canvas; 
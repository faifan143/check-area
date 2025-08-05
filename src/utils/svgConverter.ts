// Client-side only SVG converter with architectural analysis
import { GeometricAnalyzer, Point, Line, GeometricModel } from './geometricAnalyzer';
import { ArchitecturalAnalyzer, ArchitecturalPlan } from './architecturalAnalyzer';

let pdfjs: any = null;

const getPdfjs = async () => {
    if (typeof window === 'undefined') {
        throw new Error('SVGConverter can only be used on the client side');
    }

    if (!pdfjs) {
        try {
            // Import pdfjs-dist directly with error handling
            pdfjs = await import('pdfjs-dist');

            // Set worker source
            if (pdfjs.GlobalWorkerOptions) {
                pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            }
        } catch (importError) {
            console.error('Failed to import pdfjs-dist:', importError);
            throw new Error('PDF library could not be loaded');
        }
    }

    return pdfjs;
};

export interface ConversionResult {
    svg: string;
    geometricModel: GeometricModel;
    architecturalPlan?: ArchitecturalPlan;
    analysis: {
        totalArea: number;
        totalPerimeter: number;
        roomCount: number;
        shapeTypes: {
            rectangles: number;
            circles: number;
            polygons: number;
        };
        architecturalFeatures?: {
            rooms: number;
            walls: number;
            doors: number;
            windows: number;
        };
    };
}

export class SVGConverter {
    private static async extractGeometricData(page: any): Promise<{ lines: Line[], points: Point[] }> {
        try {
            console.log('extractGeometricData: Starting extraction...');
            const operatorList = await page.getOperatorList();
            console.log('extractGeometricData: Operator list length:', operatorList.fnArray.length);

            // Check if OPS constants are available
            if (!pdfjs.OPS) {
                console.warn('extractGeometricData: OPS constants not available, using fallback method');
                return this.extractGeometricDataFallback(page);
            }

            const lines: Line[] = [];
            const points: Point[] = [];

            let currentPath: Point[] = [];
            let currentTransform: number[] = [1, 0, 0, 1, 0, 0]; // Identity matrix

            let operationCount = 0;
            let moveToCount = 0;
            let lineToCount = 0;
            let curveToCount = 0;
            let rectangleCount = 0;

            for (let i = 0; i < operatorList.fnArray.length; i++) {
                const fn = operatorList.fnArray[i];
                const args = operatorList.argsArray[i];
                operationCount++;

                try {
                    switch (fn) {
                        case pdfjs.OPS.transform:
                            if (args.length >= 6) {
                                currentTransform = args;
                            }
                            break;

                        case pdfjs.OPS.moveTo:
                            moveToCount++;
                            if (args.length >= 2) {
                                const point = this.transformPoint({ x: args[0], y: args[1] }, currentTransform);
                                currentPath = [point];
                                points.push(point);
                            }
                            break;

                        case pdfjs.OPS.lineTo:
                            lineToCount++;
                            if (args.length >= 2 && currentPath.length > 0) {
                                const point = this.transformPoint({ x: args[0], y: args[1] }, currentTransform);
                                const start = currentPath[currentPath.length - 1];
                                const end = point;

                                // Only add line if it has meaningful length
                                const length = GeometricAnalyzer.distance(start, end);
                                if (length > 0.1) {
                                    lines.push({
                                        start,
                                        end,
                                        length
                                    });
                                }

                                currentPath.push(point);
                                points.push(point);
                            }
                            break;

                        case pdfjs.OPS.curveTo:
                            curveToCount++;
                            if (args.length >= 6 && currentPath.length > 0) {
                                const start = currentPath[currentPath.length - 1];
                                const cp1 = this.transformPoint({ x: args[0], y: args[1] }, currentTransform);
                                const cp2 = this.transformPoint({ x: args[2], y: args[3] }, currentTransform);
                                const end = this.transformPoint({ x: args[4], y: args[5] }, currentTransform);

                                // Approximate curve with line segments
                                const curvePoints = this.approximateCurve(start, cp1, cp2, end, 8);

                                for (let j = 0; j < curvePoints.length - 1; j++) {
                                    const lineStart = curvePoints[j];
                                    const lineEnd = curvePoints[j + 1];

                                    const length = GeometricAnalyzer.distance(lineStart, lineEnd);
                                    if (length > 0.1) {
                                        lines.push({
                                            start: lineStart,
                                            end: lineEnd,
                                            length
                                        });
                                    }

                                    points.push(lineEnd);
                                }

                                currentPath.push(end);
                            }
                            break;

                        case pdfjs.OPS.rectangle:
                            rectangleCount++;
                            if (args.length >= 4) {
                                const [x, y, width, height] = args;
                                const rectPoints = [
                                    this.transformPoint({ x, y }, currentTransform),
                                    this.transformPoint({ x: x + width, y }, currentTransform),
                                    this.transformPoint({ x: x + width, y: y + height }, currentTransform),
                                    this.transformPoint({ x, y: y + height }, currentTransform)
                                ];

                                // Add rectangle lines
                                for (let j = 0; j < rectPoints.length; j++) {
                                    const start = rectPoints[j];
                                    const end = rectPoints[(j + 1) % rectPoints.length];

                                    const length = GeometricAnalyzer.distance(start, end);
                                    if (length > 0.1) {
                                        lines.push({
                                            start,
                                            end,
                                            length
                                        });
                                    }

                                    points.push(start);
                                }
                            }
                            break;

                        case pdfjs.OPS.stroke:
                        case pdfjs.OPS.fill:
                            // These operations complete a path, but we've already processed the path elements
                            break;
                    }
                } catch (operationError) {
                    console.warn('extractGeometricData: Error processing PDF operation:', operationError);
                    // Continue with next operation
                }
            }

            console.log('extractGeometricData: Operation summary:', {
                totalOperations: operationCount,
                moveTo: moveToCount,
                lineTo: lineToCount,
                curveTo: curveToCount,
                rectangle: rectangleCount
            });

            // Filter out duplicate or very short lines
            const filteredLines = this.filterLines(lines);
            console.log('extractGeometricData: Filtered lines:', filteredLines.length, 'from', lines.length);

            return { lines: filteredLines, points };
        } catch (error) {
            console.warn('extractGeometricData: Could not extract geometric data:', error);
            return { lines: [], points: [] };
        }
    }

    private static async extractGeometricDataFallback(page: any): Promise<{ lines: Line[], points: Point[] }> {
        try {
            console.log('extractGeometricDataFallback: Using fallback method...');

            // Try to get text content and create a simple representation
            const textContent = await page.getTextContent();
            const lines: Line[] = [];
            const points: Point[] = [];

            // Create some basic lines based on text positions
            for (let i = 0; i < textContent.items.length - 1; i++) {
                const current = textContent.items[i];
                const next = textContent.items[i + 1];

                if (current.transform && next.transform) {
                    const [a1, b1, c1, d1, e1, f1] = current.transform;
                    const [a2, b2, c2, d2, e2, f2] = next.transform;

                    const start = { x: e1, y: f1 };
                    const end = { x: e2, y: f2 };

                    const length = GeometricAnalyzer.distance(start, end);
                    if (length > 10) { // Only create lines for significant distances
                        lines.push({ start, end, length });
                        points.push(start, end);
                    }
                }
            }

            console.log('extractGeometricDataFallback: Created', lines.length, 'lines from text content');
            return { lines, points };

        } catch (error) {
            console.warn('extractGeometricDataFallback: Fallback method failed:', error);
            return { lines: [], points: [] };
        }
    }

    private static transformPoint(point: Point, transform: number[]): Point {
        const [a, b, c, d, e, f] = transform;
        return {
            x: a * point.x + c * point.y + e,
            y: b * point.x + d * point.y + f
        };
    }

    private static filterLines(lines: Line[]): Line[] {
        const filtered: Line[] = [];
        const seen = new Set<string>();

        for (const line of lines) {
            // Create a unique key for this line (normalized)
            const key1 = `${line.start.x.toFixed(2)},${line.start.y.toFixed(2)}-${line.end.x.toFixed(2)},${line.end.y.toFixed(2)}`;
            const key2 = `${line.end.x.toFixed(2)},${line.end.y.toFixed(2)}-${line.start.x.toFixed(2)},${line.start.y.toFixed(2)}`;

            if (!seen.has(key1) && !seen.has(key2) && line.length > 0.5) {
                seen.add(key1);
                filtered.push(line);
            }
        }

        return filtered;
    }

    private static approximateCurve(start: Point, cp1: Point, cp2: Point, end: Point, segments: number): Point[] {
        const points: Point[] = [start];

        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const point = this.cubicBezierPoint(start, cp1, cp2, end, t);
            points.push(point);
        }

        return points;
    }

    private static cubicBezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
        const mt = 1 - t;
        return {
            x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
            y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
        };
    }

    private static async extractTextContent(page: any): Promise<string> {
        try {
            const textContent = await page.getTextContent();
            let svgText = '';

            for (const item of textContent.items) {
                const { str, transform, height, width } = item;
                const [a, b, c, d, e, f] = transform;
                const fontSize = Math.abs(height) || Math.abs(width) || 12;

                // Only add text if it's not empty and has reasonable size
                if (str.trim() && fontSize > 2) {
                    svgText += `
                <text 
                    x="${e}" 
                    y="${f}" 
                    font-family="Arial, sans-serif" 
                            font-size="${fontSize}" 
                    fill="black"
                            transform="matrix(${a} ${b} ${c} ${d} 0 0)"
                        >${str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
            `;
                }
            }

            return svgText;
        } catch (error) {
            console.warn('Could not extract text content:', error);
            return '';
        }
    }

    /**
     * Convert PDF page to SVG with architectural analysis
     */
    public static async convertPageToSVGWithAnalysis(pdfUrl: string, pageNumber: number): Promise<ConversionResult> {
        if (typeof window === 'undefined') {
            throw new Error('SVGConverter can only be used on the client side');
        }

        try {
            console.log('SVGConverter: Starting conversion...');
            console.log('SVGConverter: PDF URL:', pdfUrl);
            console.log('SVGConverter: Page number:', pageNumber);

            // Create a canvas for processing
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 600;

            // Try architectural analysis first
            let architecturalPlan: ArchitecturalPlan | undefined;
            let architecturalSvg: string | undefined;

            try {
                console.log('SVGConverter: Attempting architectural analysis...');
                architecturalPlan = await ArchitecturalAnalyzer.analyzeArchitecturalPlan(pdfUrl, pageNumber, canvas);
                architecturalSvg = ArchitecturalAnalyzer.generateSVGFromAnalysis(architecturalPlan);
                console.log('SVGConverter: Architectural analysis successful');
            } catch (archError) {
                console.warn('SVGConverter: Architectural analysis failed, falling back to geometric analysis:', archError);
            }

            // Fallback to geometric analysis if architectural analysis fails
            if (!architecturalPlan) {
                console.log('SVGConverter: Using geometric analysis fallback...');
                return await this.fallbackToGeometricAnalysis(pdfUrl, pageNumber);
            }

            // Create analysis summary
            const analysis = {
                totalArea: architecturalPlan.totalArea,
                totalPerimeter: architecturalPlan.totalPerimeter,
                roomCount: architecturalPlan.rooms.length,
                shapeTypes: {
                    rectangles: architecturalPlan.rooms.filter(r =>
                        r.type === 'bedroom' || r.type === 'living' || r.type === 'kitchen'
                    ).length,
                    circles: 0,
                    polygons: architecturalPlan.rooms.filter(r =>
                        r.type === 'corridor' || r.type === 'bathroom'
                    ).length
                },
                architecturalFeatures: {
                    rooms: architecturalPlan.rooms.length,
                    walls: architecturalPlan.walls.length,
                    doors: architecturalPlan.doors.length,
                    windows: architecturalPlan.windows.length
                }
            };

            console.log('SVGConverter: Analysis summary:', analysis);

            const result = {
                svg: architecturalSvg!,
                geometricModel: {
                    lines: [],
                    rectangles: [],
                    circles: [],
                    polygons: [],
                    enclosedShapes: [],
                    totalArea: architecturalPlan.totalArea,
                    totalPerimeter: architecturalPlan.totalPerimeter
                },
                architecturalPlan,
                analysis
            };

            console.log('SVGConverter: Conversion completed successfully');
            return result;

        } catch (error) {
            console.error('SVGConverter: Error during conversion:', error);
            console.error('SVGConverter: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
            throw new Error(`Conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Fallback to geometric analysis if architectural analysis fails
     */
    private static async fallbackToGeometricAnalysis(pdfUrl: string, pageNumber: number): Promise<ConversionResult> {
        const pdfjsInstance = await getPdfjs();
        console.log('SVGConverter: PDF.js loaded successfully');

        // Load the PDF document
        console.log('SVGConverter: Loading PDF document...');
        const loadingTask = pdfjsInstance.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        console.log('SVGConverter: PDF document loaded, pages:', pdf.numPages);

        // Get the specific page
        console.log('SVGConverter: Getting page', pageNumber);
        const pdfPage = await pdf.getPage(pageNumber);
        console.log('SVGConverter: Page loaded successfully');

        // Set viewport for rendering
        const viewport = pdfPage.getViewport({ scale: 1.0 });
        console.log('SVGConverter: Viewport created:', viewport.width, 'x', viewport.height);

        // Extract geometric data
        console.log('SVGConverter: Extracting geometric data...');
        const { lines, points } = await this.extractGeometricData(pdfPage);
        console.log('SVGConverter: Extracted', lines.length, 'lines and', points.length, 'points');

        // Build geometric model
        console.log('SVGConverter: Building geometric model...');
        const geometricModel = GeometricAnalyzer.buildGeometricModel(lines, points);
        console.log('SVGConverter: Geometric model built:', {
            lines: geometricModel.lines.length,
            rectangles: geometricModel.rectangles.length,
            circles: geometricModel.circles.length,
            polygons: geometricModel.polygons.length,
            enclosedShapes: geometricModel.enclosedShapes.length
        });

        // Extract text content
        console.log('SVGConverter: Extracting text content...');
        const svgText = await this.extractTextContent(pdfPage);
        console.log('SVGConverter: Text content length:', svgText.length);

        // Generate SVG with geometric elements
        console.log('SVGConverter: Generating SVG...');
        const svg = this.generateSVGFromGeometricModel(geometricModel, svgText, viewport);
        console.log('SVGConverter: SVG generated, length:', svg.length);

        // Create analysis summary
        const analysis = {
            totalArea: geometricModel.totalArea,
            totalPerimeter: geometricModel.totalPerimeter,
            roomCount: geometricModel.enclosedShapes.length,
            shapeTypes: {
                rectangles: geometricModel.rectangles.length,
                circles: geometricModel.circles.length,
                polygons: geometricModel.polygons.length
            }
        };

        console.log('SVGConverter: Analysis summary:', analysis);

        const result = {
            svg,
            geometricModel,
            analysis
        };

        console.log('SVGConverter: Fallback conversion completed successfully');
        return result;
    }

    private static generateSVGFromGeometricModel(model: GeometricModel, text: string, viewport: any): string {
        let svgElements = '';

        // Add rectangles with styling
        for (const rect of model.rectangles) {
            svgElements += `
                <rect 
                    x="${rect.topLeft.x}" 
                    y="${rect.topLeft.y}" 
                    width="${rect.width}" 
                    height="${rect.height}" 
                    stroke="blue" 
                    fill="none" 
                    stroke-width="2"
                    data-area="${rect.area.toFixed(2)}"
                    data-perimeter="${rect.perimeter.toFixed(2)}"
                    class="geometric-shape rectangle"
                />
            `;
        }

        // Add circles with styling
        for (const circle of model.circles) {
            svgElements += `
                <circle 
                    cx="${circle.center.x}" 
                    cy="${circle.center.y}" 
                    r="${circle.radius}" 
                    stroke="green" 
                    fill="none" 
                    stroke-width="2"
                    data-area="${circle.area.toFixed(2)}"
                    data-perimeter="${circle.perimeter.toFixed(2)}"
                    class="geometric-shape circle"
                />
            `;
        }

        // Add polygons with styling
        for (const polygon of model.polygons) {
            const pointsStr = polygon.points.map(p => `${p.x},${p.y}`).join(' ');
            svgElements += `
                <polygon 
                    points="${pointsStr}" 
                    stroke="purple" 
                    fill="none" 
                    stroke-width="2"
                    data-area="${polygon.area.toFixed(2)}"
                    data-perimeter="${polygon.perimeter.toFixed(2)}"
                    class="geometric-shape polygon"
                />
            `;
        }

        // Add lines with styling
        for (const line of model.lines) {
            svgElements += `
                <line 
                    x1="${line.start.x}" 
                    y1="${line.start.y}" 
                    x2="${line.end.x}" 
                    y2="${line.end.y}" 
                    stroke="black" 
                    stroke-width="1"
                    data-length="${line.length.toFixed(2)}"
                    class="geometric-line"
                />
            `;
        }

        // If no geometric elements were found, create a simple placeholder
        if (!svgElements.trim()) {
            console.log('generateSVGFromGeometricModel: No geometric elements found, creating placeholder');
            svgElements = `
                <rect 
                    x="10" 
                    y="10" 
                    width="${viewport.width - 20}" 
                    height="${viewport.height - 20}" 
                    stroke="red" 
                    fill="none" 
                    stroke-width="3"
                    stroke-dasharray="5,5"
                />
                <text 
                    x="${viewport.width / 2}" 
                    y="${viewport.height / 2}" 
                    text-anchor="middle" 
                    font-family="Arial, sans-serif" 
                    font-size="16" 
                    fill="red"
                >PDF Content Detected - Geometric Analysis in Progress</text>
            `;
        }

        return `
                <svg 
                    width="${viewport.width}" 
                    height="${viewport.height}" 
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 ${viewport.width} ${viewport.height}"
                style="background: white;"
                >
                    <defs>
                    <style>
                        .geometric-shape:hover { stroke-width: 3; cursor: pointer; }
                        .geometric-line:hover { stroke-width: 2; cursor: pointer; }
                    </style>
                    </defs>
                ${svgElements}
                ${text}
                </svg>
            `;
    }

    public static async convertPageToSVGWithText(pdfUrl: string, pageNumber: number): Promise<string> {
        const result = await this.convertPageToSVGWithAnalysis(pdfUrl, pageNumber);
        return result.svg;
    }

    public static downloadSVG(svgContent: string, filename: string): void {
        if (typeof window === 'undefined') {
            throw new Error('downloadSVG can only be used on the client side');
        }

        try {
            const blob = new Blob([svgContent], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading SVG:', error);
            // Fallback: open in new window
            const newWindow = window.open();
            if (newWindow) {
                newWindow.document.write(svgContent);
                newWindow.document.close();
            }
        }
    }
}
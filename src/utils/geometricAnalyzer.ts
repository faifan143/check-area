// Geometric Analyzer for PDF to SVG conversion with calculations
export interface Point {
    x: number;
    y: number;
}

export interface Line {
    start: Point;
    end: Point;
    length: number;
}

export interface Rectangle {
    topLeft: Point;
    bottomRight: Point;
    width: number;
    height: number;
    area: number;
    perimeter: number;
}

export interface Circle {
    center: Point;
    radius: number;
    area: number;
    perimeter: number;
}

export interface Polygon {
    points: Point[];
    area: number;
    perimeter: number;
    isClosed: boolean;
}

export interface EnclosedShape {
    type: 'rectangle' | 'circle' | 'polygon' | 'complex';
    geometry: Rectangle | Circle | Polygon;
    label?: string;
    roomNumber?: string;
    area: number;
    perimeter: number;
}

export interface GeometricModel {
    lines: Line[];
    rectangles: Rectangle[];
    circles: Circle[];
    polygons: Polygon[];
    enclosedShapes: EnclosedShape[];
    totalArea: number;
    totalPerimeter: number;
}

export class GeometricAnalyzer {
    private static readonly EPSILON = 0.001; // For floating point comparisons
    private static readonly MIN_LINE_LENGTH = 0.5; // Minimum line length to consider
    private static readonly MIN_RECTANGLE_SIZE = 1.0; // Minimum rectangle size

    /**
     * Calculate distance between two points
     */
    static distance(p1: Point, p2: Point): number {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    /**
     * Calculate area of a polygon using shoelace formula
     */
    static polygonArea(points: Point[]): number {
        if (points.length < 3) return 0;

        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            area += points[i].x * points[j].y;
            area -= points[j].x * points[i].y;
        }
        return Math.abs(area) / 2;
    }

    /**
     * Calculate perimeter of a polygon
     */
    static polygonPerimeter(points: Point[]): number {
        if (points.length < 2) return 0;

        let perimeter = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            perimeter += this.distance(points[i], points[j]);
        }
        return perimeter;
    }

    /**
     * Check if a polygon is closed (first and last points are close)
     */
    static isPolygonClosed(points: Point[]): boolean {
        if (points.length < 3) return false;
        return this.distance(points[0], points[points.length - 1]) < this.EPSILON;
    }

    /**
     * Check if a point is inside a polygon using ray casting algorithm
     */
    static isPointInPolygon(point: Point, polygon: Point[], tolerance: number = 0): boolean {
        if (polygon.length < 3) return false;

        let inside = false;
        const x = point.x;
        const y = point.y;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;

            // Check if point is on the edge with tolerance
            if (tolerance > 0) {
                const distance = this.distanceToLineSegment(point, { x: xi, y: yi }, { x: xj, y: yj });
                if (distance <= tolerance) return true;
            }

            // Ray casting algorithm
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Calculate distance from point to line segment
     */
    private static distanceToLineSegment(point: Point, lineStart: Point, lineEnd: Point): number {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        if (lenSq === 0) return this.distance(point, lineStart);

        let param = dot / lenSq;

        let xx, yy;
        if (param < 0) {
            xx = lineStart.x;
            yy = lineStart.y;
        } else if (param > 1) {
            xx = lineEnd.x;
            yy = lineEnd.y;
        } else {
            xx = lineStart.x + param * C;
            yy = lineStart.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Recognize rectangles from a set of lines with improved algorithm
     */
    static recognizeRectangles(lines: Line[]): Rectangle[] {
        const rectangles: Rectangle[] = [];

        // Group lines by orientation
        const horizontalLines = lines.filter(line => this.isHorizontal(line));
        const verticalLines = lines.filter(line => this.isVertical(line));

        // Find potential rectangles from line intersections
        const intersections = this.findLineIntersections([...horizontalLines, ...verticalLines]);

        // Group intersections that might form rectangles
        const potentialRects = this.findPotentialRectangles(intersections, horizontalLines, verticalLines);

        for (const rect of potentialRects) {
            if (this.isValidRectangle(rect)) {
                rectangles.push(rect);
            }
        }

        return rectangles;
    }

    /**
     * Check if a line is approximately horizontal
     */
    private static isHorizontal(line: Line): boolean {
        const angle = Math.abs(Math.atan2(line.end.y - line.start.y, line.end.x - line.start.x) * 180 / Math.PI);
        return angle < 5 || angle > 175;
    }

    /**
     * Check if a line is approximately vertical
     */
    private static isVertical(line: Line): boolean {
        const angle = Math.abs(Math.atan2(line.end.y - line.start.y, line.end.x - line.start.x) * 180 / Math.PI);
        return angle > 85 && angle < 95;
    }

    /**
     * Find potential rectangles from intersections
     */
    private static findPotentialRectangles(intersections: Point[], horizontalLines: Line[], verticalLines: Line[]): Rectangle[] {
        const rectangles: Rectangle[] = [];

        // Find all possible combinations of 4 intersections that might form rectangles
        for (let i = 0; i < intersections.length - 3; i++) {
            for (let j = i + 1; j < intersections.length - 2; j++) {
                for (let k = j + 1; k < intersections.length - 1; k++) {
                    for (let l = k + 1; l < intersections.length; l++) {
                        const points = [intersections[i], intersections[j], intersections[k], intersections[l]];
                        const rect = this.pointsToRectangle(points);
                        if (rect) {
                            rectangles.push(rect);
                        }
                    }
                }
            }
        }

        return rectangles;
    }

    /**
     * Convert 4 points to a rectangle if they form one
     */
    private static pointsToRectangle(points: Point[]): Rectangle | null {
        if (points.length !== 4) return null;

        // Sort points to find corners
        const sortedPoints = points.sort((a, b) => {
            if (Math.abs(a.y - b.y) < this.EPSILON) {
                return a.x - b.x;
            }
            return a.y - b.y;
        });

        // Check if points form a rectangle
        const [topLeft, topRight, bottomLeft, bottomRight] = sortedPoints;

        const width1 = this.distance(topLeft, topRight);
        const width2 = this.distance(bottomLeft, bottomRight);
        const height1 = this.distance(topLeft, bottomLeft);
        const height2 = this.distance(topRight, bottomRight);

        // Check if opposite sides are equal
        if (Math.abs(width1 - width2) < this.EPSILON && Math.abs(height1 - height2) < this.EPSILON) {
            const width = width1;
            const height = height1;

            if (width > this.MIN_RECTANGLE_SIZE && height > this.MIN_RECTANGLE_SIZE) {
                return {
                    topLeft,
                    bottomRight,
                    width,
                    height,
                    area: width * height,
                    perimeter: 2 * (width + height)
                };
            }
        }

        return null;
    }

    /**
     * Validate if a rectangle is reasonable
     */
    private static isValidRectangle(rect: Rectangle): boolean {
        return rect.width > this.MIN_RECTANGLE_SIZE &&
            rect.height > this.MIN_RECTANGLE_SIZE &&
            rect.area > 0;
    }

    /**
     * Recognize circles from arcs and curves with improved detection
     */
    static recognizeCircles(points: Point[]): Circle[] {
        const circles: Circle[] = [];

        // Look for circular patterns in point sequences
        for (let i = 0; i < points.length - 5; i++) {
            const segment = points.slice(i, i + 6);
            const circle = this.fitCircleToPoints(segment);
            if (circle && circle.radius > 1) {
                // Check if it's a good circle fit
                if (this.isGoodCircleFit(segment, circle)) {
                    circles.push(circle);
                }
            }
        }

        return circles;
    }

    /**
     * Fit a circle to a set of points using least squares
     */
    private static fitCircleToPoints(points: Point[]): Circle | null {
        if (points.length < 3) return null;

        // Calculate centroid
        let sumX = 0, sumY = 0;
        for (const point of points) {
            sumX += point.x;
            sumY += point.y;
        }

        const centerX = sumX / points.length;
        const centerY = sumY / points.length;

        // Calculate average radius
        let sumRadius = 0;
        for (const point of points) {
            sumRadius += this.distance({ x: centerX, y: centerY }, point);
        }

        const radius = sumRadius / points.length;

        return {
            center: { x: centerX, y: centerY },
            radius,
            area: Math.PI * radius * radius,
            perimeter: 2 * Math.PI * radius
        };
    }

    /**
     * Check if points fit well to a circle
     */
    private static isGoodCircleFit(points: Point[], circle: Circle): boolean {
        const distances = points.map(p => this.distance(circle.center, p));
        const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;

        // If variance is low relative to radius, it's a good circle
        return variance < circle.radius * 0.1;
    }

    /**
     * Find enclosed shapes (rooms) from line intersections with improved algorithm
     */
    static findEnclosedShapes(lines: Line[]): EnclosedShape[] {
        const enclosedShapes: EnclosedShape[] = [];

        // Find line intersections
        const intersections = this.findLineIntersections(lines);

        // Find closed paths
        const closedPaths = this.findClosedPaths(lines, intersections);

        // Analyze each closed path
        for (const path of closedPaths) {
            const shape = this.analyzeEnclosedShape(path);
            if (shape && shape.area > 1) { // Only consider shapes with meaningful area
                enclosedShapes.push(shape);
            }
        }

        return enclosedShapes;
    }

    /**
     * Find intersections between lines
     */
    private static findLineIntersections(lines: Line[]): Point[] {
        const intersections: Point[] = [];

        for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
                const intersection = this.lineIntersection(lines[i], lines[j]);
                if (intersection) {
                    intersections.push(intersection);
                }
            }
        }

        return intersections;
    }

    /**
     * Find intersection point of two lines
     */
    private static lineIntersection(line1: Line, line2: Line): Point | null {
        const x1 = line1.start.x, y1 = line1.start.y;
        const x2 = line1.end.x, y2 = line1.end.y;
        const x3 = line2.start.x, y3 = line2.start.y;
        const x4 = line2.end.x, y4 = line2.end.y;

        const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denominator) < this.EPSILON) return null;

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;

        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1)
            };
        }

        return null;
    }

    /**
     * Find closed paths from lines and intersections
     */
    private static findClosedPaths(lines: Line[], intersections: Point[]): Point[][] {
        const closedPaths: Point[][] = [];

        // Start from each intersection and try to trace closed paths
        for (const intersection of intersections) {
            const paths = this.traceAllPathsFromPoint(intersection, lines);
            for (const path of paths) {
                if (path.length > 3 && this.isPolygonClosed(path)) {
                    closedPaths.push(path);
                }
            }
        }

        return closedPaths;
    }

    /**
     * Trace all possible paths from a starting point
     */
    private static traceAllPathsFromPoint(start: Point, lines: Line[]): Point[][] {
        const paths: Point[][] = [];
        const visited = new Set<string>();

        const tracePath = (currentPoint: Point, currentPath: Point[], depth: number): void => {
            if (depth > 20) return; // Prevent infinite recursion

            const pathKey = currentPath.map(p => `${p.x},${p.y}`).join('->');
            if (visited.has(pathKey)) return;
            visited.add(pathKey);

            // Check if we've formed a closed path
            if (currentPath.length > 3 && this.distance(currentPoint, start) < this.EPSILON) {
                paths.push([...currentPath]);
                return;
            }

            // Find next lines to follow
            for (const line of lines) {
                const nextPoint = this.getNextPoint(currentPoint, line);
                if (nextPoint) {
                    tracePath(nextPoint, [...currentPath, nextPoint], depth + 1);
                }
            }
        };

        tracePath(start, [start], 0);
        return paths;
    }

    /**
     * Get the next point from a line
     */
    private static getNextPoint(currentPoint: Point, line: Line): Point | null {
        if (this.distance(currentPoint, line.start) < this.EPSILON) {
            return line.end;
        }
        if (this.distance(currentPoint, line.end) < this.EPSILON) {
            return line.start;
        }
        return null;
    }

    /**
     * Analyze an enclosed shape and determine its type and properties
     */
    private static analyzeEnclosedShape(points: Point[]): EnclosedShape | null {
        if (points.length < 3) return null;

        const area = this.polygonArea(points);
        const perimeter = this.polygonPerimeter(points);

        // Try to recognize as rectangle
        if (points.length === 4) {
            const rect = this.isRectangle(points);
            if (rect) {
                return {
                    type: 'rectangle',
                    geometry: rect,
                    area,
                    perimeter
                };
            }
        }

        // Try to recognize as circle
        const circle = this.isCircle(points);
        if (circle) {
            return {
                type: 'circle',
                geometry: circle,
                area,
                perimeter
            };
        }

        // Default to polygon
        return {
            type: 'polygon',
            geometry: {
                points,
                area,
                perimeter,
                isClosed: this.isPolygonClosed(points)
            },
            area,
            perimeter
        };
    }

    /**
     * Check if points form a rectangle
     */
    private static isRectangle(points: Point[]): Rectangle | null {
        if (points.length !== 4) return null;

        // Check if opposite sides are parallel and equal length
        const sides = [
            this.distance(points[0], points[1]),
            this.distance(points[1], points[2]),
            this.distance(points[2], points[3]),
            this.distance(points[3], points[0])
        ];

        const isRect = Math.abs(sides[0] - sides[2]) < this.EPSILON &&
            Math.abs(sides[1] - sides[3]) < this.EPSILON;

        if (!isRect) return null;

        const minX = Math.min(...points.map(p => p.x));
        const minY = Math.min(...points.map(p => p.y));
        const maxX = Math.max(...points.map(p => p.x));
        const maxY = Math.max(...points.map(p => p.y));

        const width = maxX - minX;
        const height = maxY - minY;

        if (width < this.MIN_RECTANGLE_SIZE || height < this.MIN_RECTANGLE_SIZE) {
            return null;
        }

        return {
            topLeft: { x: minX, y: minY },
            bottomRight: { x: maxX, y: maxY },
            width,
            height,
            area: width * height,
            perimeter: 2 * (width + height)
        };
    }

    /**
     * Check if points form a circle
     */
    private static isCircle(points: Point[]): Circle | null {
        if (points.length < 8) return null; // Need enough points for circle detection

        const circle = this.fitCircleToPoints(points);
        if (!circle || circle.radius < 1) return null;

        // Check if all points are roughly equidistant from center
        const distances = points.map(p => this.distance(circle.center, p));
        const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;

        // If variance is low, it's likely a circle
        if (variance < avgDistance * 0.1) {
            return circle;
        }

        return null;
    }

    /**
     * Build a complete geometric model from PDF data
     */
    static buildGeometricModel(lines: Line[], points: Point[]): GeometricModel {
        // Filter out very short lines
        const filteredLines = lines.filter(line => line.length > this.MIN_LINE_LENGTH);

        const rectangles = this.recognizeRectangles(filteredLines);
        const circles = this.recognizeCircles(points);
        const enclosedShapes = this.findEnclosedShapes(filteredLines);

        // Create polygons from remaining lines
        const polygons: Polygon[] = [];

        for (const shape of enclosedShapes) {
            if (shape.type === 'polygon') {
                polygons.push(shape.geometry as Polygon);
            }
        }

        const totalArea = rectangles.reduce((sum, r) => sum + r.area, 0) +
            circles.reduce((sum, c) => sum + c.area, 0) +
            polygons.reduce((sum, p) => sum + p.area, 0);

        const totalPerimeter = rectangles.reduce((sum, r) => sum + r.perimeter, 0) +
            circles.reduce((sum, c) => sum + c.perimeter, 0) +
            polygons.reduce((sum, p) => sum + p.perimeter, 0);

        return {
            lines: filteredLines,
            rectangles,
            circles,
            polygons,
            enclosedShapes,
            totalArea,
            totalPerimeter
        };
    }
} 
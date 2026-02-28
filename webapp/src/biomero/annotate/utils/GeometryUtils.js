
/**
 * Simple implementation of Marching Squares for contour finding.
 * Converts a binary image (Canvas ImageData) to a list of polygon points.
 */

// Lookup table for Marching Squares
const MARCHING_SQUARES_LOOKUP = [
    [], // 0: No points
    [[0, 0.5], [0.5, 1]], // 1: Bottom-Left
    [[0.5, 1], [1, 0.5]], // 2: Bottom-Right
    [[0, 0.5], [1, 0.5]], // 3: Bottom-Left + Bottom-Right (horizontal)
    [[0.5, 0], [1, 0.5]], // 4: Top-Right
    [[0, 0.5], [0.5, 0], [0.5, 1], [1, 0.5]], // 5: Saddle (BL + TR) - ambiguity
    [[0.5, 0], [0.5, 1]], // 6: Top-Right + Bottom-Right (vertical)
    [[0, 0.5], [0.5, 0]], // 7: BL + BR + TR
    [[0, 0.5], [0.5, 0]], // 8: Top-Left
    [[0.5, 0], [0.5, 1]], // 9: TL + BL (vertical)
    [[0, 0.5], [0.5, 1], [0.5, 0], [1, 0.5]], // 10: Saddle (TL + BR)
    [[0.5, 0], [1, 0.5]], // 11: TL + BL + BR
    [[0, 0.5], [1, 0.5]], // 12: TL + TR (horizontal)
    [[0.5, 1], [1, 0.5]], // 13: TL + TR + BL
    [[0, 0.5], [0.5, 1]], // 14: TL + TR + BR
    [] // 15: All points
];

/**
 * Perform Marching Squares on ImageData to get contours.
 * @param {ImageData} imageData 
 * @returns {Array<Array<[number, number]>>} List of polygons (each polygon is list of points)
 */
export const traceContours = (imageData) => {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const polygons = [];
    const threshold = 128; // Alpha threshold

    // Boolean grid
    const grid = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
        // Check alpha channel (every 4th byte + 3)
        grid[i] = data[i * 4 + 3] > threshold ? 1 : 0;
    }

    const segments = [];

    // Iterate over squares
    for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width - 1; x++) {
            // Get values at corners
            const val = 
                (grid[y * width + x] << 3) |
                (grid[y * width + (x + 1)] << 2) |
                (grid[(y + 1) * width + (x + 1)] << 1) |
                (grid[(y + 1) * width + x]);

            if (val === 0 || val === 15) continue;

            // Simplified lookup - just get edge midpoints
            // 0,0 is top-left of square. Local coords 0..1
            
            // Map lookup index to segments
            // This is a simplified approach, real marching squares connects edges
            // We just store segments [start, end] in pixel coords
            
            // Standard MS Logic:
            // Edges: 0:Top, 1:Right, 2:Bottom, 3:Left
            // We map lookup to edge indices
            
            // Cases based on standard MS tables
            // 1: Left->Bottom
            // 2: Bottom->Right
            // ...
            
            // For brevity, let's just use a direct segment generator based on case
            const addSeg = (x1, y1, x2, y2) => {
                segments.push([[x + x1, y + y1], [x + x2, y + y2]]);
            };

            switch (val) {
                case 1: addSeg(0, 0.5, 0.5, 1); break;
                case 2: addSeg(0.5, 1, 1, 0.5); break;
                case 3: addSeg(0, 0.5, 1, 0.5); break;
                case 4: addSeg(0.5, 0, 1, 0.5); break;
                case 5: addSeg(0, 0.5, 0.5, 0); addSeg(0.5, 1, 1, 0.5); break; // Ambiguous
                case 6: addSeg(0.5, 0, 0.5, 1); break;
                case 7: addSeg(0, 0.5, 0.5, 0); break;
                case 8: addSeg(0, 0.5, 0.5, 0); break;
                case 9: addSeg(0.5, 0, 0.5, 1); break;
                case 10: addSeg(0.5, 0, 1, 0.5); addSeg(0, 0.5, 0.5, 1); break; // Ambiguous
                case 11: addSeg(0.5, 0, 1, 0.5); break;
                case 12: addSeg(0, 0.5, 1, 0.5); break;
                case 13: addSeg(0.5, 1, 1, 0.5); break;
                case 14: addSeg(0, 0.5, 0.5, 1); break;
                default: break;
            }
        }
    }

    // Connect segments into polygons
    if (segments.length === 0) return [];

    const resultPolys = stitchSegments(segments);
    
    // Simplify polygons (Douglas-Peucker could be added here)
    return resultPolys.map(poly => simplifyPolygon(poly, 2.0));
};

const stitchSegments = (segments) => {
    // Naively connect segments
    // A robust implementation uses a spatial hash or adjacency list
    // Since this runs in browser on arguably small images (mask size),
    // let's try a simple greedy connect.
    
    // Convert to list of points? No, order matters.
    
    // Create adjacency map
    // Key: "x,y", Value: list of other ends
    const adj = new Map();
    
    const key = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    
    segments.forEach(seg => {
        const start = seg[0];
        const end = seg[1];
        const k1 = key(start);
        const k2 = key(end);
        
        if (!adj.has(k1)) adj.set(k1, []);
        if (!adj.has(k2)) adj.set(k2, []);
        
        adj.get(k1).push(end);
        adj.get(k2).push(start);
    });
    
    const polygons = [];
    const visited = new Set();
    
    // Traverse
    for (const [startKey, neighbors] of adj) {
        if (visited.has(startKey)) continue;
        if (neighbors.length !== 2) continue; // Start tracing from node with degree 2 (loop) ? 
        // Actually for closed loops all nodes degree 2.
        
        const poly = [];
        let curr = neighbors[0]; // Pick one
        let prevKey = startKey;
        
        visited.add(startKey);
        // Recover original point from key? adj stores actual points
        // Let's just store the point we started from
        // Wait, Map iteration gives keys. Need to find point object.
        // Let's assume neighbors store [x,y] arrays.
        poly.push(neighbors[0]); // Actually push the start point? 
        // We need the point corresponding to startKey. Since we don't have it easily:
        // Let's refactor to store points in a lookup if needed.
        // Easier:
        // Just pick a seed segment.
    }
    
    // Alternative simpler stitching:
    // 1. Pick a segment.
    // 2. Find a segment that starts where this one ends.
    // 3. Repeat until closed.
    
    const pool = new Set(segments);
    const loops = [];
    
    while(pool.size > 0) {
        const firstSeg = pool.values().next().value;
        pool.delete(firstSeg);
        
        const loop = [firstSeg[0], firstSeg[1]];
        let currentHead = firstSeg[1];
        let closed = false;
        
        while(true) {
            // Find next segment starting at currentHead
            let nextSeg = null;
            let reverse = false;
            
            // Linear search - slow but works for small sets
            for (const seg of pool) {
                // Check dist
                const dist1 = Math.hypot(seg[0][0]-currentHead[0], seg[0][1]-currentHead[1]);
                const dist2 = Math.hypot(seg[1][0]-currentHead[0], seg[1][1]-currentHead[1]);
                
                if (dist1 < 0.1) {
                    nextSeg = seg;
                    reverse = false;
                    break;
                }
                if (dist2 < 0.1) {
                    nextSeg = seg; 
                    reverse = true;
                    break;
                }
            }
            
            if (nextSeg) {
                pool.delete(nextSeg);
                const nextPoint = reverse ? nextSeg[0] : nextSeg[1];
                loop.push(nextPoint);
                currentHead = nextPoint;
                
                // Check closure
                const distClose = Math.hypot(currentHead[0]-loop[0][0], currentHead[1]-loop[0][1]);
                if (distClose < 0.1) {
                    closed = true;
                    break;
                }
            } else {
                // Cannot continue
                break;
            }
        }
        
        if (closed && loop.length > 2) {
            loops.push(loop);
        }
    }
    
    return loops;
};

/**
 * Subtracts a list of existing polygons from a new polygon using rasterization.
 * 
 * @param {Array<[number, number]>} newPolyPoints List of points for the new polygon
 * @param {Array<{points: Array<[number, number]>}>} existingAnnotations List of existing annotation objects
 * @param {number} width Canvas width
 * @param {number} height Canvas height
 * @returns {Array<Array<[number, number]>>} List of resulting polygons (may be split)
 */
export const subtractAnnotations = (newPolyPoints, existingAnnotations, width, height) => {
    // 1. Create a mask for the new polygon
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Fill new polygon
    ctx.fillStyle = 'white';
    ctx.beginPath();
    if (newPolyPoints.length > 0) {
        ctx.moveTo(newPolyPoints[0][0], newPolyPoints[0][1]);
        for (let i = 1; i < newPolyPoints.length; i++) {
            ctx.lineTo(newPolyPoints[i][0], newPolyPoints[i][1]);
        }
        ctx.closePath();
        ctx.fill();
    }
    
    // 2. Erase existing polygons
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'black'; // Color doesn't matter for destination-out, alpha 1 does
    
    existingAnnotations.forEach(ann => {
        if (!ann.points || ann.points.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(ann.points[0][0], ann.points[0][1]);
        for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i][0], ann.points[i][1]);
        }
        ctx.closePath();
        ctx.fill();
    });
    
    // 3. Trace contours of the remaining result
    const imageData = ctx.getImageData(0, 0, width, height);
    return traceContours(imageData);
};

// Simple polygon simplification (Douglas-Peucker-ish)
const simplifyPolygon = (points, epsilon) => {
    if (points.length < 3) return points;
    // For now returning as is, proper DP algorithm is recursive
    // Implementing very basic distance filter
    if (!epsilon) return points;
    
    const result = [points[0]];
    for (let i = 1; i < points.length; i++) {
        const last = result[result.length - 1];
        const curr = points[i];
        const dist = Math.hypot(curr[0] - last[0], curr[1] - last[1]);
        if (dist > epsilon) {
            result.push(curr);
        }
    }
    // ensure closed
    const first = result[0];
    const last = result[result.length - 1];
    if (Math.hypot(first[0]-last[0], first[1]-last[1]) > epsilon) {
        result.push(first); // Close loop if not close enough
    } else {
        // already simplified close to start
    }
    
    return result;
};

/**
 * Subtracts an eraser polygon from a list of existing annotations.
 * Returns a NEW list of annotations (some might be removed, some modified/split).
 * 
 * @param {Array<[number, number]>} eraserPoints Points of the eraser polygon
 * @param {Array<{id: string, points: Array<[number, number]>, typeId: string}>} existingAnnotations List of existing annotations
 * @param {number} width Canvas width
 * @param {number} height Canvas height
 * @returns {Array<{id: string, points: Array<[number, number]>, typeId: string}>} New list of annotations
 */
export const eraseFromAnnotations = (eraserPoints, existingAnnotations, width, height) => {
    if (!eraserPoints || eraserPoints.length < 3) return existingAnnotations;

    // Bounding box of eraser for quick overlap check
    let minX = width, minY = height, maxX = 0, maxY = 0;
    eraserPoints.forEach(p => {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
    });
    
    // Expand slightly
    minX -= 2; minY -= 2; maxX += 2; maxY += 2;

    const resultAnnotations = [];
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    existingAnnotations.forEach(ann => {
        // Quick bbox check of annotation
        let annMinX = width, annMinY = height, annMaxX = 0, annMaxY = 0;
        if (!ann.points || ann.points.length < 3) {
             resultAnnotations.push(ann);
             return;
        }
        
        ann.points.forEach(p => {
            if (p[0] < annMinX) annMinX = p[0];
            if (p[0] > annMaxX) annMaxX = p[0];
            if (p[1] < annMinY) annMinY = p[1];
            if (p[1] > annMaxY) annMaxY = p[1];
        });
        
        // Check intersection
        if (maxX < annMinX || minX > annMaxX || maxY < annMinY || minY > annMaxY) {
            // No overlap
            resultAnnotations.push(ann);
            return;
        }
        
        // Perform subtraction
        ctx.clearRect(0, 0, width, height);
        
        // Draw Annotation (White)
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(ann.points[0][0], ann.points[0][1]);
        for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i][0], ann.points[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        
        // Draw Eraser (Black, destination-out)
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.moveTo(eraserPoints[0][0], eraserPoints[0][1]);
        for (let i = 1; i < eraserPoints.length; i++) {
            ctx.lineTo(eraserPoints[i][0], eraserPoints[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        
        // Trace Result
        const imageData = ctx.getImageData(0, 0, width, height);
        const newPolys = traceContours(imageData);
        
        if (newPolys.length === 0) {
            // Annotation completely erased
        } else if (newPolys.length === 1) {
            // Updated single polygon
            resultAnnotations.push({
                ...ann,
                points: newPolys[0]
            });
        } else {
            // Split into multiple
            newPolys.forEach(poly => {
                resultAnnotations.push({
                    ...ann,
                    id: crypto.randomUUID(), 
                    points: poly
                });
            });
        }
    });

    return resultAnnotations;
};

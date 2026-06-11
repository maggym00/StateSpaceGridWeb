/**
 * SVG State Space Grid Visualization module.
 * Ported from grid.py and customized for interactive web interfaces.
 */

// LCG seedable random to make point layouts deterministic
function createSeedableRandom(seed = 42) {
    return function() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };
}

class DataPoint {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.originalX = x; // store original state coordinate index
        this.originalY = y;
    }
}

function _group_trajectory_points_by_state(trajectoryPointsList) {
    const grouped = new Map();
    for (const trajPoints of trajectoryPointsList) {
        for (const point of trajPoints) {
            const key = `${point.x},${point.y}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(point);
        }
    }
    return grouped;
}

function _adjust_trajectory_points_list(trajectoryPointsList) {
    if (trajectoryPointsList.length === 0 || trajectoryPointsList[0].length === 0) {
        return;
    }

    const grouped = _group_trajectory_points_by_state(trajectoryPointsList);
    
    // Find normalisation factor
    let maxTotalDiameter = 0;
    for (const points of grouped.values()) {
        const sumDiameter = points.reduce((sum, p) => sum + 2 * p.radius, 0);
        if (sumDiameter > maxTotalDiameter) {
            maxTotalDiameter = sumDiameter;
        }
    }

    const normalisationFactor = maxTotalDiameter || 1.0;
    
    // Seeded random for deterministic visual scatter
    const rand = createSeedableRandom(42);

    for (const [key, points] of grouped.entries()) {
        const [cx, cy] = key.split(',').map(Number);
        
        // Scale radii
        for (const point of points) {
            point.radius /= normalisationFactor;
        }

        const len = points.length;
        for (let i = 0; i < len; i++) {
            const point = points[i];
            
            // Replicate python scattering geometry
            const randomAngle = (rand() + i) * 2 * Math.PI / len;
            const maxOffset = 0.5 - point.radius;
            const actualOffset = ((1 + rand()) / 2) * maxOffset;

            point.x = cx + actualOffset * Math.cos(randomAngle);
            point.y = cy + Math.sin(randomAngle) * actualOffset;
        }
    }
}

function _get_trajectory_points(trajs) {
    const list = [];
    for (const traj of trajs) {
        const points = [];
        const visits = traj.get_visits();
        const durations = traj.get_visit_durations();
        
        for (let i = 0; i < visits.length; i++) {
            const visit = visits[i];
            const xIdx = traj.state_space.get_x_index(visit[0]);
            const yIdx = traj.state_space.get_y_index(visit[1]);
            const radius = durations[i];
            points.push(new DataPoint(xIdx, yIdx, radius));
        }
        list.push(points);
    }
    return list;
}

function _get_adjusted_trajectory_points(trajs) {
    const trajectoryPointsList = _get_trajectory_points(trajs);
    _adjust_trajectory_points_list(trajectoryPointsList);
    return trajectoryPointsList;
}

/**
 * Generates an SVG representation of the state space grid.
 * @param {Array<Trajectory>} trajs - List of Trajectory objects.
 * @param {Object} options - Plot options (title, labels, colors, etc.)
 * @returns {string} SVG HTML string.
 */
function drawGridSVG(trajs, options = {}) {
    const SSG_core = window.SSG || require('./ssg-engine.js');
    SSG_core.validate_trajectories(...trajs);

    const {
        title = "",
        xlabel = "",
        ylabel = "",
        colours = null
    } = options;

    const xRange = trajs[0].state_space.x_range;
    const yRange = trajs[0].state_space.y_range;
    const numX = xRange.length;
    const numY = yRange.length;

    // Premium Theme Palette: Green & Orange first
    const defaultColours = [
        "hsl(140, 75%, 45%)", // Bright Green
        "hsl(25, 95%, 52%)",  // Bright Orange
        "hsl(205, 85%, 50%)", // Blue
        "hsl(275, 75%, 55%)", // Violet
        "hsl(5, 85%, 55%)"    // Coral
    ];

    const activeColours = colours || trajs.map((_, i) => defaultColours[i % defaultColours.length]);

    // Dimensions
    const width = 600;
    const height = 600;
    const margin = { top: 50, right: 40, bottom: 65, left: 65 };
    const gridW = width - margin.left - margin.right;
    const gridH = height - margin.top - margin.bottom;

    const cellW = gridW / numX;
    const cellH = gridH / numY;

    // Coordinate conversion helpers
    const pixelX = (gx) => margin.left + (gx + 0.5) * cellW;
    const pixelY = (gy) => margin.top + (numY - 0.5 - gy) * cellH;

    // Generate non-overlapping points
    const trajectoryPointsList = _get_adjusted_trajectory_points(trajs);

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="ssg-svg-container" width="100%" height="100%">`;
    
    // Add CSS inside SVG for standalone rendering
    svg += `
    <style>
        .ssg-bg { fill: #fcfcfc; }
        .grid-line { stroke: #e0e0e0; stroke-width: 1; }
        .grid-border { stroke: #cccccc; stroke-width: 1.5; fill: none; }
        .axis-text { font-family: 'Inter', system-ui, sans-serif; font-size: 13px; fill: #444444; font-weight: 500; }
        .axis-label { font-family: 'Inter', system-ui, sans-serif; font-size: 15px; fill: #222222; font-weight: 600; }
        .grid-title { font-family: 'Inter', system-ui, sans-serif; font-size: 18px; fill: #111111; font-weight: 700; text-anchor: middle; }
        .traj-line { stroke-width: 2.5; fill: none; opacity: 0.85; stroke-linecap: round; }
        .traj-arrow { fill: #333333; opacity: 0.9; }
        .visit-circle { cursor: pointer; transition: transform 0.2s ease, opacity 0.2s ease; opacity: 0.8; }
        .visit-circle:hover { transform-box: fill-box; transform-origin: center; transform: scale(1.25); opacity: 1; }
    </style>`;

    // Grid Background
    svg += `<rect class="ssg-bg" x="${margin.left}" y="${margin.top}" width="${gridW}" height="${gridH}" />`;

    // Draw gridlines (minor ticks boundaries in matplotlib)
    // Verticals
    for (let i = 0; i <= numX; i++) {
        const gx = i - 0.5;
        const px = pixelX(gx);
        svg += `<line class="grid-line" x1="${px}" y1="${margin.top}" x2="${px}" y2="${margin.top + gridH}" />`;
    }
    // Horizontals
    for (let j = 0; j <= numY; j++) {
        const gy = j - 0.5;
        const py = pixelY(gy);
        svg += `<line class="grid-line" x1="${margin.left}" y1="${py}" x2="${margin.left + gridW}" y2="${py}" />`;
    }

    // Outer boundary
    svg += `<rect class="grid-border" x="${margin.left}" y="${margin.top}" width="${gridW}" height="${gridH}" />`;

    // Draw X-axis Tick Labels
    for (let i = 0; i < numX; i++) {
        const px = pixelX(i);
        const label = xRange[i];
        svg += `<text class="axis-text" x="${px}" y="${margin.top + gridH + 20}" text-anchor="middle">${label}</text>`;
    }

    // Draw Y-axis Tick Labels
    for (let j = 0; j < numY; j++) {
        const py = pixelY(j);
        const label = yRange[j];
        svg += `<text class="axis-text" x="${margin.left - 12}" y="${py}" text-anchor="end" dominant-baseline="middle">${label}</text>`;
    }

    // Draw Axis Labels
    if (xlabel) {
        svg += `<text class="axis-label" x="${margin.left + gridW/2}" y="${height - 15}" text-anchor="middle">${xlabel}</text>`;
    }
    if (ylabel) {
        svg += `<text class="axis-label" x="${18}" y="${margin.top + gridH/2}" text-anchor="middle" transform="rotate(-90 18 ${margin.top + gridH/2})">${ylabel}</text>`;
    }

    // Title
    if (title) {
        svg += `<text class="grid-title" x="${margin.left + gridW/2}" y="${margin.top - 20}">${title}</text>`;
    }

    // Draw Trajectories
    trajectoryPointsList.forEach((trajectoryPoints, tIdx) => {
        const colour = activeColours[tIdx];
        const traj = trajs[tIdx];
        const originalVisits = traj.get_visits();

        // 1. Lines connecting visit points
        for (let i = 0; i < trajectoryPoints.length - 1; i++) {
            const p1 = trajectoryPoints[i];
            const p2 = trajectoryPoints[i + 1];

            const px1 = pixelX(p1.x);
            const py1 = pixelY(p1.y);
            const px2 = pixelX(p2.x);
            const py2 = pixelY(p2.y);

            // Line segment
            svg += `<line class="traj-line" x1="${px1}" y1="${py1}" x2="${px2}" y2="${py2}" stroke="${colour}" />`;

            // Draw arrowhead in the middle of segment
            const midX = (px1 + px2) / 2;
            const midY = (py1 + py2) / 2;
            const angle = Math.atan2(py2 - py1, px2 - px1);
            
            const arrowSize = 6;
            // Rotated triangle arrowhead
            const ax1 = midX - arrowSize * Math.cos(angle - Math.PI / 6);
            const ay1 = midY - arrowSize * Math.sin(angle - Math.PI / 6);
            const ax2 = midX - arrowSize * Math.cos(angle + Math.PI / 6);
            const ay2 = midY - arrowSize * Math.sin(angle + Math.PI / 6);

            svg += `<polygon class="traj-arrow" points="${midX},${midY} ${ax1},${ay1} ${ax2},${ay2}" fill="#333333" />`;
        }

        // 2. Circles representing visits
        trajectoryPoints.forEach((point, pIdx) => {
            const px = pixelX(point.x);
            const py = pixelY(point.y);
            const radiusInPixels = Math.max(point.radius * cellW, 3.5); // Ensure they don't disappear entirely

            const isFirst = (pIdx === 0);
            
            // Hover tooltip info
            const visitLabel = originalVisits[pIdx];
            const duration = traj.get_visit_durations()[pIdx];
            const onsetTime = traj.get_visit_times()[pIdx];
            const tooltip = `Visit #${pIdx + 1}: (${visitLabel[0]}, ${visitLabel[1]})\nOnset: ${onsetTime.toFixed(2)}\nDuration: ${duration.toFixed(2)}`;

            if (isFirst) {
                // First point: Hollow circle with border (replicates matplotlib edgecolor, facecolor='none')
                svg += `<circle class="visit-circle" cx="${px}" cy="${py}" r="${radiusInPixels}" stroke="${colour}" stroke-width="2.5" fill="none" data-tooltip="${tooltip}">
                    <title>${tooltip}</title>
                </circle>`;
            } else {
                // Regular point: Filled circle
                svg += `<circle class="visit-circle" cx="${px}" cy="${py}" r="${radiusInPixels}" fill="${colour}" data-tooltip="${tooltip}">
                    <title>${tooltip}</title>
                </circle>`;
            }
        });
    });

    svg += `</svg>`;
    return svg;
}

// Export for environments
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = {
        DataPoint,
        _adjust_trajectory_points_list,
        _get_trajectory_points,
        drawGridSVG
    };
} else {
    window.SSGVisualizer = {
        drawGridSVG
    };
}

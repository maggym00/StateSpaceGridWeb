/**
 * File parsing module for CSV, TSV, and Excel (.xlsx) files.
 * Uses PapaParse and SheetJS (XLSX) libraries in the browser.
 */

// Helper to determine if a value is empty or NaN
function isEmpty(val) {
    return val === undefined || val === null || String(val).trim() === "";
}

/**
 * Parses raw text content of CSV or TSV files.
 * @param {string} text - Raw file content.
 * @param {string} delimiter - CSV delimiter (e.g. "," or "\t").
 * @returns {Array<Object>} Rows as objects.
 */
function parseCsvTsv(text, delimiter) {
    return new Promise((resolve, reject) => {
        Papa.parse(text, {
            header: true,
            skipEmptyLines: 'greedy',
            delimiter: delimiter,
            complete: (results) => {
                if (results.errors && results.errors.length > 0 && results.data.length === 0) {
                    reject(new Error(results.errors[0].message));
                } else {
                    resolve(results.data);
                }
            },
            error: (err) => {
                reject(err);
            }
        });
    });
}

/**
 * Parses XLSX file binary data using SheetJS.
 * @param {ArrayBuffer} arrayBuffer - XLSX file binary data.
 * @returns {Array<Object>} Rows as objects from the first sheet.
 */
function parseXlsx(arrayBuffer) {
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    // Return sheet rows as JSON objects
    return XLSX.utils.sheet_to_json(worksheet, { defval: "" });
}

/**
 * Auto-detect columns in the dataset.
 * - ID: Looks for columns like 'ID', 'id', 'ParticipantID', 'DyadID'.
 * - Onset: Looks for 'Onset', 'time', 'timestamp', 'onset'.
 * - States: Any other columns (excluding ID and Onset).
 */
function detectColumns(headers) {
    let idCol = null;
    let onsetCol = null;
    const stateCols = [];

    const idRegex = /^(id|dyadid|participantid|subjectid|subject_id|dyad_id)$/i;
    const onsetRegex = /^(onset|time|timestamp)$/i;

    for (const h of headers) {
        if (idRegex.test(h)) {
            idCol = h;
        } else if (onsetRegex.test(h)) {
            onsetCol = h;
        } else {
            stateCols.push(h);
        }
    }

    // Fallbacks if not detected
    if (!onsetCol) {
        // Find first column containing "onset" or "time" case-insensitive
        onsetCol = headers.find(h => h.toLowerCase().includes("onset") || h.toLowerCase().includes("time")) || headers[0];
    }

    return { idCol, onsetCol, stateCols };
}

/**
 * Convert parsed rows into one or more Trajectory objects.
 * @param {Array<Object>} rows - Raw rows parsed from file.
 * @param {Object} mapping - Manual mapping config. E.g. { idCol, onsetCol, xCol, yCol, xRange, yRange }
 * @returns {Array<{ id: string, trajectory: Trajectory }>} List of parsed trajectories with their IDs.
 */
function buildTrajectories(rows, mapping) {
    const { idCol, onsetCol, xCol, yCol, xRange, yRange } = mapping;

    let finalXRange = xRange;
    let finalYRange = yRange;

    // Determine coordinate ranges globally if not explicitly provided
    if (!finalXRange || finalXRange.length === 0) {
        const xVals = [];
        for (const row of rows) {
            const onsetVal = row[onsetCol];
            if (isEmpty(onsetVal) || isNaN(parseFloat(onsetVal))) continue;
            const xVal = row[xCol];
            const yVal = row[yCol];
            if (!isEmpty(xVal) && !isEmpty(yVal)) {
                const xParsed = isNaN(Number(xVal)) || xVal === "" ? xVal : Number(xVal);
                xVals.push(xParsed);
            }
        }
        if (xVals.length > 0) {
            const unique = [...new Set(xVals)];
            finalXRange = unique.every(x => typeof x === 'number')
                ? unique.sort((a, b) => a - b)
                : unique.sort();
        } else {
            finalXRange = [];
        }
    }

    if (!finalYRange || finalYRange.length === 0) {
        const yVals = [];
        for (const row of rows) {
            const onsetVal = row[onsetCol];
            if (isEmpty(onsetVal) || isNaN(parseFloat(onsetVal))) continue;
            const xVal = row[xCol];
            const yVal = row[yCol];
            if (!isEmpty(xVal) && !isEmpty(yVal)) {
                const yParsed = isNaN(Number(yVal)) || yVal === "" ? yVal : Number(yVal);
                yVals.push(yParsed);
            }
        }
        if (yVals.length > 0) {
            const unique = [...new Set(yVals)];
            finalYRange = unique.every(y => typeof y === 'number')
                ? unique.sort((a, b) => a - b)
                : unique.sort();
        } else {
            finalYRange = [];
        }
    }

    // Group rows by ID if an ID column is used
    const groups = {};
    if (idCol && rows.some(r => !isEmpty(r[idCol]))) {
        for (const row of rows) {
            const id = String(row[idCol]).trim();
            if (isEmpty(id)) continue;
            if (!groups[id]) groups[id] = [];
            groups[id].push(row);
        }
    } else {
        groups["Default"] = rows;
    }

    const results = [];

    for (const [id, groupRows] of Object.entries(groups)) {
        // Sort rows by onset time
        groupRows.sort((a, b) => {
            const tA = parseFloat(a[onsetCol]);
            const tB = parseFloat(b[onsetCol]);
            return (isNaN(tA) ? 0 : tA) - (isNaN(tB) ? 0 : tB);
        });

        const times = [];
        const states = [];

        for (let i = 0; i < groupRows.length; i++) {
            const row = groupRows[i];
            const onsetVal = row[onsetCol];
            if (isEmpty(onsetVal)) continue;

            const onset = parseFloat(onsetVal);
            if (isNaN(onset)) continue;

            const xVal = row[xCol];
            const yVal = row[yCol];

            const hasX = !isEmpty(xVal);
            const hasY = !isEmpty(yVal);

            if (hasX && hasY) {
                times.push(onset);
                // Convert to number if numeric, else keep string
                const xParsed = isNaN(Number(xVal)) || xVal === "" ? xVal : Number(xVal);
                const yParsed = isNaN(Number(yVal)) || yVal === "" ? yVal : Number(yVal);
                states.push([xParsed, yParsed]);
            } else if (i === groupRows.length - 1) {
                // Last row, often just the final fencepost time
                times.push(onset);
            }
        }

        // If the last row was not the final fencepost time (i.e. states.length !== times.length - 1)
        // because the user provided states for all rows, we might need to verify or handle it.
        // Wait, if states.length === times.length, let's check:
        // Python raises ValueError if states.length !== times.length - 1.
        // If they are equal, we can synthesize a final timestamp by adding a default interval (like the last step duration)
        // or just warn the user. Let's make sure we check and if states.length === times.length, we append an extra time = last_time + last_duration.
        if (states.length === times.length && times.length > 0) {
            const lastTime = times[times.length - 1];
            const prevTime = times.length > 1 ? times[times.length - 2] : 0;
            const step = lastTime - prevTime || 1.0;
            times.push(lastTime + step);
        }

        // If we have states and times, build the Trajectory
        if (states.length > 0 && times.length === states.length + 1) {
            const trajectory = new (window.SSG || require('./ssg-engine.js')).Trajectory(
                finalXRange,
                finalYRange,
                states,
                times
            );

            results.push({ id, trajectory });
        }
    }

    return results;
}

// Export functions
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = {
        parseCsvTsv,
        parseXlsx,
        detectColumns,
        buildTrajectories
    };
} else {
    window.SSGParser = {
        parseCsvTsv,
        parseXlsx,
        detectColumns,
        buildTrajectories
    };
}

/**
 * Main application orchestrator for the State Space Grid Studio.
 */

// Global App State
let loadedFiles = [];
let nextColorIndex = 0;
let currentMeasures = null;

const PALETTE = [
    "rgb(70, 103, 48)",    // Primary Green
    "rgb(56, 102, 101)",   // Tertiary Teal
    "rgb(86, 98, 75)",     // Secondary Sage
    "rgb(186, 26, 26)",    // Error Red
    "rgb(172, 210, 143)",  // Light Green
    "rgb(160, 207, 206)",  // Light Teal
    "rgb(189, 203, 175)"   // Sage Fixed Dim
];

// Demo Dataset (Template 2)
const DEMO_CSV = `ID,Onset,Parent Affect,Child Affect
123,0.0,1,2
123,0.5,1,2
123,1.0,3,3
123,1.5,2,4
123,2.0,1,4
123,2.5,2,3
123,3.0,4,5
123,3.5,5,5
123,4.0,5,3
123,4.5,3,1
123,5.0,,
456,0.0,2,2
456,0.5,1,3
456,1.0,3,3
456,1.5,4,4
456,2.0,5,4
456,2.5,2,4
456,3.0,1,5
456,3.5,3,5
456,4.0,2,3
456,4.5,3,4
456,5.0,,`;

// Active mapping file pointer
let pendingFile = null;

document.addEventListener("DOMContentLoaded", () => {
    setupDropzone();
    setupDemoButton();

    // Set citation URL dynamically
    const citationUrlEl = document.getElementById("citation-url");
    if (citationUrlEl) {
        citationUrlEl.innerText = window.location.href.split('?')[0].split('#')[0];
    }
});

// Tab Switcher
function switchTab(tabName) {
    document.querySelectorAll(".tab-content").forEach(el => el.style.display = "none");
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
    
    if (tabName === "dashboard") {
        document.getElementById("tab-dashboard").style.display = "flex";
        document.getElementById("tab-dashboard-btn").classList.add("active");
    }
}

// Setup Drag & Drop
function setupDropzone() {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");

    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleUploadedFiles(files);
        }
    });

    fileInput.addEventListener("change", (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            handleUploadedFiles(files);
        }
    });
}

function setupDemoButton() {
    const dropzone = document.getElementById("drop-zone");
    const demoLink = document.createElement("div");
    demoLink.style.cssText = "margin-top: 0.5rem; font-size: 0.8rem; font-weight: 600; color: var(--color-orange); cursor: pointer; text-decoration: underline; transition: var(--transition);";
    demoLink.innerText = "Or load Parent-Child Demo Data";
    demoLink.addEventListener("click", (e) => {
        e.stopPropagation(); // Avoid triggering file input click
        loadDemoDataset();
    });
    dropzone.appendChild(demoLink);
}

// File Handlers
async function handleUploadedFiles(files) {
    for (const file of files) {
        try {
            let rows = [];
            const ext = file.name.split('.').pop().toLowerCase();
            
            if (ext === 'xlsx') {
                const buffer = await file.arrayBuffer();
                rows = window.SSGParser.parseXlsx(buffer);
            } else {
                const text = await file.text();
                const delim = (ext === 'tsv' || ext === 'trj' || text.includes('\t')) ? '\t' : ',';
                rows = await window.SSGParser.parseCsvTsv(text, delim);
            }

            if (rows.length === 0) {
                alert(`File "${file.name}" appears to be empty.`);
                continue;
            }

            promptMapping(file.name, rows);
            break; // Process one file mapping configuration at a time
        } catch (err) {
            alert(`Error parsing "${file.name}": ${err.message}`);
        }
    }
}

// Map Demo Data
function loadDemoDataset() {
    window.SSGParser.parseCsvTsv(DEMO_CSV, ",").then(rows => {
        promptMapping("parent_child_demo.csv", rows);
    }).catch(err => {
        alert("Demo load failed: " + err.message);
    });
}

// Display Mapping Interface
function promptMapping(fileName, rows) {
    pendingFile = { name: fileName, rows };
    
    const headers = Object.keys(rows[0] || {});
    
    // Selects in UI
    const selId = document.getElementById("select-id");
    const selOnset = document.getElementById("select-onset");
    const selX = document.getElementById("select-x");
    const selY = document.getElementById("select-y");
    
    // Clear
    selId.innerHTML = '<option value="">(None - Single Trajectory)</option>';
    selOnset.innerHTML = '';
    selX.innerHTML = '';
    selY.innerHTML = '';
    
    headers.forEach(h => {
        selId.innerHTML += `<option value="${h}">${h}</option>`;
        selOnset.innerHTML += `<option value="${h}">${h}</option>`;
        selX.innerHTML += `<option value="${h}">${h}</option>`;
        selY.innerHTML += `<option value="${h}">${h}</option>`;
    });

    // Run auto-detection
    const detected = window.SSGParser.detectColumns(headers);
    
    if (detected.idCol) selId.value = detected.idCol;
    if (detected.onsetCol) selOnset.value = detected.onsetCol;
    if (detected.stateCols.length >= 2) {
        selX.value = detected.stateCols[0];
        selY.value = detected.stateCols[1];
    } else {
        if (headers.length > 1) selX.value = headers[1];
        if (headers.length > 2) selY.value = headers[2];
    }

    document.getElementById("mapping-file-name").innerText = fileName;
    document.getElementById("mapping-panel").style.display = "flex";
    
    // Scroll to mapping panel
    document.getElementById("mapping-panel").scrollIntoView({ behavior: 'smooth' });
}

// Confirm column selections and build trajectories
function confirmMapping() {
    if (!pendingFile) return;

    const mapping = {
        idCol: document.getElementById("select-id").value,
        onsetCol: document.getElementById("select-onset").value,
        xCol: document.getElementById("select-x").value,
        yCol: document.getElementById("select-y").value,
        xRange: null, // Let builder auto-detect unique range values
        yRange: null
    };

    if (mapping.onsetCol === mapping.xCol || mapping.onsetCol === mapping.yCol || mapping.xCol === mapping.yCol) {
        alert("Onset, X-Axis, and Y-Axis columns must all be distinct!");
        return;
    }

    try {
        const trajectories = window.SSGParser.buildTrajectories(pendingFile.rows, mapping);
        
        if (trajectories.length === 0) {
            alert("No trajectories could be generated. Check column values and numbers.");
            return;
        }

        // Add colors
        trajectories.forEach(t => {
            t.color = PALETTE[nextColorIndex % PALETTE.length];
            t.active = true;
            nextColorIndex++;
        });

        // Add to active datasets list
        loadedFiles.push({
            name: pendingFile.name,
            mapping,
            trajectories
        });

        document.getElementById("mapping-panel").style.display = "none";
        pendingFile = null;

        updateDatasetsUI();
        recalculateAndRender();
    } catch (err) {
        alert("Failed building trajectories: " + err.message);
    }
}

// Render Loaded datasets list in Sidebar
function updateDatasetsUI() {
    const container = document.getElementById("datasets-container");
    if (loadedFiles.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-light); padding: 1.5rem 0; font-size: 0.8rem;">
            No data loaded yet. Drag-and-drop a file to begin.
        </div>`;
        return;
    }

    container.innerHTML = "";

    loadedFiles.forEach((fileObj, fileIdx) => {
        const item = document.createElement("div");
        item.className = "file-item";

        let togglesHtml = "";
        fileObj.trajectories.forEach((tInfo, tIdx) => {
            togglesHtml += `
            <div class="toggle-row">
                <span class="toggle-label">
                    <span class="legend-dot" style="background: ${tInfo.color};"></span>
                    ID: ${tInfo.id}
                </span>
                <label class="switch">
                    <input type="checkbox" ${tInfo.active ? "checked" : ""} onchange="toggleTrajectory(${fileIdx}, ${tIdx}, this.checked)">
                    <span class="slider"></span>
                </label>
            </div>`;
        });

        item.innerHTML = `
        <div class="file-item-header">
            <span class="file-name" title="${fileObj.name}">${fileObj.name}</span>
            <button class="file-remove-btn" onclick="removeDataset(${fileIdx})">&times;</button>
        </div>
        <div class="trajectory-toggles">
            ${togglesHtml}
        </div>`;

        container.appendChild(item);
    });
}

function toggleTrajectory(fileIdx, trajIdx, isChecked) {
    loadedFiles[fileIdx].trajectories[trajIdx].active = isChecked;
    recalculateAndRender();
}

function removeDataset(fileIdx) {
    loadedFiles.splice(fileIdx, 1);
    updateDatasetsUI();
    recalculateAndRender();
}

// Calculate and visualizer update
function recalculateAndRender() {
    const gridBox = document.getElementById("grid-box");
    
    // Find all active trajectories
    const activeTrajsInfo = [];
    loadedFiles.forEach(fileObj => {
        fileObj.trajectories.forEach(tInfo => {
            if (tInfo.active) {
                activeTrajsInfo.push({
                    trajectory: tInfo.trajectory,
                    color: tInfo.color,
                    mapping: fileObj.mapping
                });
            }
        });
    });

    if (activeTrajsInfo.length === 0) {
        gridBox.innerHTML = `
        <div class="placeholder-text">
            <h3>No Active Grid</h3>
            <p>Import and select at least one dataset from the sidebar to visualize the state space grid.</p>
        </div>`;
        resetMeasuresUI();
        return;
    }

    const trajs = activeTrajsInfo.map(info => info.trajectory);
    const colors = activeTrajsInfo.map(info => info.color);
    
    // Labels based on first active trajectory's column mapping
    const firstMapping = activeTrajsInfo[0].mapping;

    try {
        // 1. Calculate measures
        const measures = window.SSG.get_measures(...trajs);
        currentMeasures = measures;
        updateMeasuresUI(measures);

        // Show download buttons
        document.getElementById("download-grid-btn").style.display = "inline-flex";
        document.getElementById("download-measures-btn").style.display = "inline-flex";

        // 2. Draw SVG
        const svgString = window.SSGVisualizer.drawGridSVG(trajs, {
            title: trajs.length === 1 ? "Trajectory State Space Grid" : "Combined State Space Grid",
            xlabel: firstMapping.xCol,
            ylabel: firstMapping.yCol,
            colours: colors
        });
        gridBox.innerHTML = svgString;

    } catch (err) {
        gridBox.innerHTML = `
        <div class="placeholder-text" style="color: #ef4444;">
            <h3>Calculation Error</h3>
            <p>${err.message}</p>
        </div>`;
        resetMeasuresUI();
    }
}

function updateMeasuresUI(measures) {
    document.getElementById("measure-duration").innerText = measures.mean_trajectory_duration.toFixed(2);
    document.getElementById("measure-events").innerText = measures.mean_number_of_events.toFixed(1);
    document.getElementById("measure-visits").innerText = measures.mean_number_of_visits.toFixed(1);
    document.getElementById("measure-mean-range").innerText = measures.mean_state_range.toFixed(1);
    document.getElementById("measure-total-range").innerText = measures.total_state_range;
    document.getElementById("measure-event-dur").innerText = measures.mean_event_duration.toFixed(3);
    document.getElementById("measure-visit-dur").innerText = measures.mean_visit_duration.toFixed(3);
    document.getElementById("measure-state-dur").innerText = measures.mean_state_duration.toFixed(3);
    document.getElementById("measure-dispersion").innerText = measures.mean_dispersion.toFixed(4);
}

function resetMeasuresUI() {
    currentMeasures = null;
    document.getElementById("download-grid-btn").style.display = "none";
    document.getElementById("download-measures-btn").style.display = "none";

    document.getElementById("measure-duration").innerText = "-";
    document.getElementById("measure-events").innerText = "-";
    document.getElementById("measure-visits").innerText = "-";
    document.getElementById("measure-mean-range").innerText = "-";
    document.getElementById("measure-total-range").innerText = "-";
    document.getElementById("measure-event-dur").innerText = "-";
    document.getElementById("measure-visit-dur").innerText = "-";
    document.getElementById("measure-state-dur").innerText = "-";
    document.getElementById("measure-dispersion").innerText = "-";
}

// Download grid visualization as SVG
function downloadGrid() {
    const svgEl = document.querySelector("#grid-box svg");
    if (!svgEl) return;
    
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgEl);
    
    if (!svgString.startsWith('<?xml')) {
        svgString = '<?xml version="1.0" standalone="no"?>\r\n' + svgString;
    }
    
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    
    // Get active file names
    const activeFileNames = [];
    loadedFiles.forEach(fileObj => {
        if (fileObj.trajectories.some(t => t.active)) {
            activeFileNames.push(fileObj.name.replace(/\.[^/.]+$/, ""));
        }
    });
    
    const namePrefix = activeFileNames.length > 0 ? activeFileNames.join("_") : "grid";
    a.download = `ssg_${namePrefix}.svg`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Download grid measures as CSV
function downloadMeasures() {
    // Collect active trajectories with their metadata (filename and ID)
    const activeTrajsInfo = [];
    loadedFiles.forEach(fileObj => {
        fileObj.trajectories.forEach(tInfo => {
            if (tInfo.active) {
                activeTrajsInfo.push({
                    name: `${fileObj.name} (ID: ${tInfo.id})`,
                    trajectory: tInfo.trajectory
                });
            }
        });
    });

    if (activeTrajsInfo.length === 0) return;

    const headers = [
        "Dataset/ID",
        "Mean Trajectory Duration",
        "Mean Number of Events",
        "Mean Number of Visits",
        "Mean State Range",
        "Total State Range",
        "Mean Event Duration",
        "Mean Visit Duration",
        "Mean State Duration",
        "Mean Dispersion"
    ];

    const rows = [headers];

    // Helper to format a measures object to CSV row values
    function pushMeasureRow(label, m) {
        rows.push([
            label,
            m.mean_trajectory_duration,
            m.mean_number_of_events,
            m.mean_number_of_visits,
            m.mean_state_range,
            m.total_state_range,
            m.mean_event_duration,
            m.mean_visit_duration,
            m.mean_state_duration,
            m.mean_dispersion
        ]);
    }

    if (activeTrajsInfo.length === 1) {
        // Only 1 active dataset, just compute and output its individual measures
        const item = activeTrajsInfo[0];
        const m = window.SSG.get_measures(item.trajectory);
        pushMeasureRow(item.name, m);
    } else {
        // More than 1 active dataset: output each individually, then the cumulative one
        activeTrajsInfo.forEach(item => {
            const m = window.SSG.get_measures(item.trajectory);
            pushMeasureRow(item.name, m);
        });

        // Combined / Cumulative row
        const allTrajs = activeTrajsInfo.map(item => item.trajectory);
        const combinedMeasures = window.SSG.get_measures(...allTrajs);
        pushMeasureRow("Combined", combinedMeasures);
    }

    // Convert rows to CSV content
    const csvContent = rows.map(r => r.map(val => {
        if (typeof val === 'string' || val instanceof String) {
            let formatted = val.replace(/"/g, '""');
            if (formatted.includes(',') || formatted.includes('"') || formatted.includes('\n')) {
                formatted = `"${formatted}"`;
            }
            return formatted;
        }
        if (typeof val === 'number') {
            if (Number.isInteger(val)) return val.toString();
            return parseFloat(val.toFixed(4)).toString();
        }
        return val;
    }).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;

    // Get filename prefix
    const activeFileNames = [];
    loadedFiles.forEach(fileObj => {
        if (fileObj.trajectories.some(t => t.active)) {
            activeFileNames.push(fileObj.name.replace(/\.[^/.]+$/, ""));
        }
    });

    const namePrefix = activeFileNames.length > 0 ? activeFileNames.join("_") : "measures";
    a.download = `ssg_measures_${namePrefix}.csv`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


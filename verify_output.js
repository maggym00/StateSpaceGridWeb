/**
 * Verification script to validate Javascript calculations against Python outputs.
 * Reads the local example2.csv file
 * and compares it to expected outputs from python tests.
 */

const fs = require('fs');
const path = require('path');
const SSG = require('./ssg-engine.js');

function isClose(a, b, epsilon = 1e-9) {
    return Math.abs(a - b) < epsilon;
}

function assertClose(name, actual, expected) {
    if (!isClose(actual, expected)) {
        throw new Error(`Mismatch in ${name}: expected ${expected}, got ${actual}`);
    }
}

try {
    // 1. Read and parse example2.csv
    const csvPath = path.join(__dirname, 'example2.csv');
    if (!fs.existsSync(csvPath)) {
        console.error(`Error: example2.csv not found at ${csvPath}`);
        process.exit(1);
    }
    
    console.log(`Loading example data from: ${csvPath}`);
    const text = fs.readFileSync(csvPath, 'utf8');
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Parse headers
    const headers = lines[0].split(',');
    const rawRows = lines.slice(1).map(line => {
        const parts = line.split(',');
        return {
            id: parts[0] ? parseInt(parts[0], 10) : null,
            onset: parts[1] ? parseFloat(parts[1]) : null,
            parent: parts[2] ? parseInt(parts[2], 10) : null,
            child: parts[3] ? parseInt(parts[3], 10) : null
        };
    });

    // Group rows by ID (123 and 456)
    const groups = { 123: [], 456: [] };
    rawRows.forEach(row => {
        if (row.id && groups[row.id]) {
            groups[row.id].push(row);
        }
    });

    const ranges = [1, 2, 3, 4, 5];
    const buildTrajectory = (groupRows) => {
        const states = [];
        const times = [];
        
        groupRows.forEach((row, i) => {
            if (row.onset !== null && !isNaN(row.onset)) {
                if (row.parent !== null && !isNaN(row.parent) && row.child !== null && !isNaN(row.child)) {
                    times.push(row.onset);
                    states.push([row.parent, row.child]);
                } else if (i === groupRows.length - 1) {
                    // Last fencepost time
                    times.push(row.onset);
                }
            }
        });
        
        return new SSG.Trajectory(ranges, ranges, states, times);
    };

    const traj1 = buildTrajectory(groups[123]);
    const traj2 = buildTrajectory(groups[456]);

    console.log("Built trajectory 1 (ID 123):", traj1.states.length, "states,", traj1.times.length, "timestamps");
    console.log("Built trajectory 2 (ID 456):", traj2.states.length, "states,", traj2.times.length, "timestamps");

    // 2. Compute Measures
    const measures1 = SSG.get_measures(traj1);
    const measures2 = SSG.get_measures(traj2);
    const combined = SSG.get_measures(traj1, traj2);

    // 3. Expected measures from test_output.csv
    // ID 123 (Row 2):
    // 5.0, 10, 9.0, 9.0, 9, 0.5, 0.5555555555555556, 0.5555555555555556, 0.9166666666666666
    console.log("\nVerifying ID 123 measures...");
    assertClose("mean_trajectory_duration", measures1.mean_trajectory_duration, 5.0);
    assertClose("mean_number_of_events", measures1.mean_number_of_events, 10);
    assertClose("mean_number_of_visits", measures1.mean_number_of_visits, 9.0);
    assertClose("mean_state_range", measures1.mean_state_range, 9.0);
    assertClose("total_state_range", measures1.total_state_range, 9);
    assertClose("mean_event_duration", measures1.mean_event_duration, 0.5);
    assertClose("mean_visit_duration", measures1.mean_visit_duration, 0.5555555555555556);
    assertClose("mean_state_duration", measures1.mean_state_duration, 0.5555555555555556);
    assertClose("mean_dispersion", measures1.mean_dispersion, 0.9166666666666666);
    console.log("[PASS] ID 123 verified successfully.");

    // ID 456 (Row 3):
    // 5.0, 10, 10.0, 10.0, 10, 0.5, 0.5, 0.5, 0.9375
    console.log("\nVerifying ID 456 measures...");
    assertClose("mean_trajectory_duration", measures2.mean_trajectory_duration, 5.0);
    assertClose("mean_number_of_events", measures2.mean_number_of_events, 10);
    assertClose("mean_number_of_visits", measures2.mean_number_of_visits, 10.0);
    assertClose("mean_state_range", measures2.mean_state_range, 10.0);
    assertClose("total_state_range", measures2.total_state_range, 10);
    assertClose("mean_event_duration", measures2.mean_event_duration, 0.5);
    assertClose("mean_visit_duration", measures2.mean_visit_duration, 0.5);
    assertClose("mean_state_duration", measures2.mean_state_duration, 0.5);
    assertClose("mean_dispersion", measures2.mean_dispersion, 0.9375);
    console.log("[PASS] ID 456 verified successfully.");

    // Combined (Row 4):
    // 5.0, 10, 9.5, 9.5, 16, 0.5, 0.5277777777777778, 0.5277777777777778, 0.9270833333333333
    console.log("\nVerifying Combined (123 + 456) measures...");
    assertClose("mean_trajectory_duration", combined.mean_trajectory_duration, 5.0);
    assertClose("mean_number_of_events", combined.mean_number_of_events, 10);
    assertClose("mean_number_of_visits", combined.mean_number_of_visits, 9.5);
    assertClose("mean_state_range", combined.mean_state_range, 9.5);
    assertClose("total_state_range", combined.total_state_range, 16);
    assertClose("mean_event_duration", combined.mean_event_duration, 0.5);
    assertClose("mean_visit_duration", combined.mean_visit_duration, 0.5277777777777778);
    assertClose("mean_state_duration", combined.mean_state_duration, 0.5277777777777778);
    assertClose("mean_dispersion", combined.mean_dispersion, 0.9270833333333333);
    console.log("[PASS] Combined verified successfully.");

    console.log("\n=======================================================");
    console.log("SUCCESS: All Javascript calculations match Python output!");
    console.log("=======================================================");
    process.exit(0);

} catch (err) {
    console.error("\n[FAIL] Verification mismatch:");
    console.error(err.message);
    process.exit(1);
}

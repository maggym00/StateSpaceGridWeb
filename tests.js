/**
 * Replicated unit tests for the State Space Grid JS engine.
 * Matches python tests in test_trajectory.py and test_measures.py
 */

const isNode = typeof module !== 'undefined' && typeof module.exports !== 'undefined';
const SSG = isNode ? require('./ssg-engine.js') : window.SSG;

const tests = {};

// Helper assertion function
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || "Assertion failed"}: expected ${expected}, got ${actual}`);
    }
}

function assertDeepEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${message || "Assertion failed"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertThrows(fn, expectedErrorSubstring, message) {
    try {
        fn();
    } catch (e) {
        if (expectedErrorSubstring && !e.message.includes(expectedErrorSubstring)) {
            throw new Error(`${message || "Assertion failed"}: expected error containing "${expectedErrorSubstring}", got "${e.message}"`);
        }
        return; // Test passed
    }
    throw new Error(`${message || "Assertion failed"}: expected function to throw an error`);
}

function isClose(a, b, epsilon = 1e-9) {
    return Math.abs(a - b) < epsilon;
}

function assertClose(actual, expected, message) {
    if (!isClose(actual, expected)) {
        throw new Error(`${message || "Assertion failed"}: expected close to ${expected}, got ${actual}`);
    }
}

// Group 1: Trajectory Construction Tests (replicating test_trajectory.py)
tests.test_default_construction = function() {
    const traj = new SSG.Trajectory();
    assertDeepEqual(traj.state_space.x_range, [1, 2, 3, 4]);
    assertDeepEqual(traj.state_space.y_range, [1, 2, 3, 4]);
    assertDeepEqual(traj.states, []);
    assertDeepEqual(traj.times, [0.0]);
};

tests.test_state_space_definition = function() {
    const traj = new SSG.Trajectory([0, 1, 2, 3], [4, 5, 6, 7]);
    assertDeepEqual(traj.state_space.x_range, [0, 1, 2, 3]);
    assertDeepEqual(traj.state_space.y_range, [4, 5, 6, 7]);
};

tests.test_normal_use = function() {
    const traj = new SSG.Trajectory(
        ["bad", "ok", "good"],
        [0, 1, 2],
        [
            ["ok", 1], ["bad", 0], ["bad", 1], ["bad", 2], 
            ["ok", 2], ["ok", 2], ["good", 2], ["good", 1], 
            ["good", 0], ["ok", 0], ["ok", 0]
        ],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    );
    assertDeepEqual(traj.get_visits(), [
        ["ok", 1], ["bad", 0], ["bad", 1], ["bad", 2], 
        ["ok", 2], ["good", 2], ["good", 1], ["good", 0], ["ok", 0]
    ]);
};

tests.test_bad_inputs = function() {
    assertThrows(() => {
        new SSG.Trajectory([1, 2, 3, 4], [1, 2, 3, 4], [], []);
    }, "The number of states should be equal to the number of timestamps minus 1");

    assertThrows(() => {
        new SSG.Trajectory([1, 2, 3, 4], [1, 2, 3, 4], [], [0, 1, 2]);
    }, "The number of states should be equal to the number of timestamps minus 1");

    assertThrows(() => {
        new SSG.Trajectory([1, 2, 3, 4], [1, 2, 3, 4], [], ["a"]);
    }, "Times are expected as integers or floats");

    assertThrows(() => {
        new SSG.Trajectory(
            [1, 2, 3, 4], [1, 2, 3, 4], 
            [[1, 1], 2], // 2 is not a pair
            [0, 1, 2, 3]
        );
    }, "The states should be supplied as a list of (x_value, y_value) tuple or list pairs");

    assertThrows(() => {
        new SSG.Trajectory(
            [1, 2, 3, 4], [1, 2, 3, 4], 
            [[1, 1], [2]], // [2] does not have length 2
            [0, 1, 2, 3]
        );
    }, "The states should be supplied as a list of (x_value, y_value) pairs");

    assertThrows(() => {
        new SSG.Trajectory(
            [1, 2, 3, 4], [1, 2, 3, 4], 
            [[0, 10]], // outside range
            [0, 1]
        );
    }, "All provided state points should fall within the ranges provided in x_range and y_range");

    assertThrows(() => {
        new SSG.Trajectory(
            [1, 2, 3, 4], [1, 2, 3, 4], 
            [[1, 1], [2, 2]], 
            [1, 0.9, 1.5] // times not ascending
        );
    }, "Times should appear in ascending order");
};

// Group 2: Measure Calculation Tests (replicating test_measures.py)
tests.test_empty_input = function() {
    assertThrows(() => {
        SSG.get_measures();
    }, "You must provide at least 1 trajectory");
};

tests.test_mismatched_states = function() {
    const traj1 = new SSG.Trajectory(
        ["bad", "ok", "good"],
        [0, 1, 2],
        [["ok", 1], ["bad", 0], ["bad", 1], ["bad", 2], ["ok", 2], ["good", 2], ["good", 1], ["good", 0], ["ok", 0]],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    );
    const traj2 = new SSG.Trajectory(
        [0, 1, 2],
        ["bad", "ok", "good"],
        [[1, "ok"], [0, "bad"], [1, "bad"], [2, "bad"], [2, "ok"], [2, "good"], [1, "good"], [0, "good"], [0, "ok"]],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    );

    assertThrows(() => {
        SSG.get_measures(traj1, traj2);
    }, "The state spaces of all provided trajectories must match");
};

tests.test_misordered_states = function() {
    const traj1 = new SSG.Trajectory(
        ["bad", "ok", "good"],
        [0, 1, 2],
        [["ok", 1], ["bad", 0], ["bad", 1], ["bad", 2], ["ok", 2], ["good", 2], ["good", 1], ["good", 0], ["ok", 0]],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    );

    const traj2 = new SSG.Trajectory(
        ["bad", "ok", "good"],
        [0, 2, 1], // misordered y_range
        [["ok", 1], ["bad", 0], ["bad", 1], ["bad", 2], ["ok", 2], ["good", 2], ["good", 1], ["good", 0], ["ok", 0]],
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    );

    assertThrows(() => {
        SSG.get_measures(traj1, traj2);
    }, "The order of states should be the same in all state spaces in the provided trajectories");
};

tests.test_correct_values_single_trajectory = function() {
    const traj1 = new SSG.Trajectory(
        ["bad", "ok", "good"],
        ["bad", "ok", "good"],
        [["bad", "bad"], ["ok", "ok"], ["good", "good"]],
        [1, 1.1, 1.5, 2]
    );

    assertEqual(SSG.get_mean_state_range(traj1), 3);
    assertEqual(SSG.get_mean_trajectory_duration(traj1), 1);
    assertEqual(SSG.get_mean_number_of_events(traj1), 3);
    assertEqual(SSG.get_mean_number_of_visits(traj1), 3);
    assertEqual(SSG.get_total_state_range(traj1), 3);
    assertClose(SSG.get_mean_event_duration(traj1), 1 / 3);
    assertClose(SSG.get_mean_visit_duration(traj1), 1 / 3);
    assertClose(SSG.get_mean_state_duration(traj1), 1 / 3);
    assertClose(SSG.get_mean_dispersion(traj1), 0.6525);

    const traj2 = new SSG.Trajectory(
        ["bad", "ok", "good"],
        ["bad", "ok", "good"],
        [["bad", "good"], ["ok", "ok"], ["ok", "ok"], ["good", "bad"], ["bad", "good"]],
        [0, 0.9, 1, 1.5, 1.7, 2]
    );

    assertEqual(SSG.get_mean_state_range(traj2), 3);
    assertEqual(SSG.get_mean_trajectory_duration(traj2), 2);
    assertEqual(SSG.get_mean_number_of_events(traj2), 5);
    assertEqual(SSG.get_mean_number_of_visits(traj2), 4);
    assertEqual(SSG.get_total_state_range(traj2), 3);
    assertClose(SSG.get_mean_event_duration(traj2), 0.4);
    assertClose(SSG.get_mean_visit_duration(traj2), 0.5);
    assertClose(SSG.get_mean_state_duration(traj2), 2 / 3);
    assertClose(SSG.get_mean_dispersion(traj2), 0.6075);
};

tests.test_correct_values_multi_trajectory = function() {
    const traj1 = new SSG.Trajectory(
        ["bad", "ok", "good"],
        ["bad", "ok", "good"],
        [["bad", "bad"], ["ok", "ok"], ["good", "good"]],
        [1, 1.1, 1.5, 2]
    );

    const traj2 = new SSG.Trajectory(
        ["bad", "ok", "good"],
        ["bad", "ok", "good"],
        [["bad", "good"], ["ok", "ok"], ["ok", "ok"], ["good", "bad"], ["bad", "good"]],
        [0, 0.9, 1, 1.5, 1.7, 2]
    );

    assertEqual(SSG.get_mean_state_range(traj1, traj2), 3);
    assertClose(SSG.get_mean_trajectory_duration(traj1, traj2), 1.5);
    assertEqual(SSG.get_mean_number_of_events(traj1, traj2), 4);
    assertClose(SSG.get_mean_number_of_visits(traj1, traj2), 3.5);
    assertEqual(SSG.get_total_state_range(traj1, traj2), 5);
    assertClose(SSG.get_mean_event_duration(traj1, traj2), 0.3666666666666);
    assertClose(SSG.get_mean_visit_duration(traj1, traj2), 0.4166666666666);
    assertClose(SSG.get_mean_state_duration(traj1, traj2), 0.5);
    assertClose(SSG.get_mean_dispersion(traj1, traj2), 0.63);
};

// Runner function
function runAllTests() {
    const results = [];
    let passed = 0;
    let failed = 0;

    console.log("Running State Space Grid Unit Tests...");
    console.log("======================================");

    for (const testName in tests) {
        try {
            tests[testName]();
            console.log(`[PASS] ${testName}`);
            results.push({ name: testName, status: "PASS" });
            passed++;
        } catch (e) {
            console.error(`[FAIL] ${testName}: ${e.message}`);
            console.error(e.stack);
            results.push({ name: testName, status: "FAIL", error: e.message });
            failed++;
        }
    }

    console.log("======================================");
    console.log(`Summary: ${passed} passed, ${failed} failed`);

    return { results, passed, failed };
}

if (isNode) {
    const summary = runAllTests();
    process.exit(summary.failed > 0 ? 1 : 0);
} else {
    window.SSGTests = {
        tests,
        runAllTests
    };
}

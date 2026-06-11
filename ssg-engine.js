/**
 * State Space Grid core calculation engine.
 * A translation of StateSpaceGridLib python library.
 */

class StateSpace {
    constructor(x_range, y_range) {
        this.x_range = x_range;
        this.y_range = y_range;
    }

    get_x_index(x) {
        const idx = this.x_range.indexOf(x);
        if (idx === -1) throw new Error(`Value ${x} not found in x_range`);
        return idx;
    }

    get_y_index(y) {
        const idx = this.y_range.indexOf(y);
        if (idx === -1) throw new Error(`Value ${y} not found in y_range`);
        return idx;
    }
}

class Trajectory {
    constructor(x_range = [1, 2, 3, 4], y_range = [1, 2, 3, 4], states = [], times = [0.0]) {
        this.state_space = new StateSpace(x_range, y_range);
        this.states = states;
        this.times = times;

        this.__internal_validity_check();
    }

    __internal_validity_check() {
        // Checks all values in object to ensure trajectory is valid
        if (!Array.isArray(this.states) || !this.states.every(state => Array.isArray(state))) {
            throw new Error("The states should be supplied as a list of (x_value, y_value) tuple or list pairs");
        }
        if (!this.states.every(state => state.length === 2)) {
            throw new Error("The states should be supplied as a list of (x_value, y_value) pairs");
        }
        if (this.states.length !== this.times.length - 1) {
            throw new Error("The number of states should be equal to the number of timestamps minus 1");
        }
        if (!this.times.every(time => typeof time === 'number' && !isNaN(time))) {
            throw new Error("Times are expected as integers or floats");
        }
        
        // Check state points fall within ranges.
        // We use simple equality or matching. Since ranges might contain numbers or strings,
        // we check if the x and y values are included in x_range and y_range respectively.
        for (const state of this.states) {
            const [x, y] = state;
            if (!this.state_space.x_range.includes(x) || !this.state_space.y_range.includes(y)) {
                throw new Error("All provided state points should fall within the ranges provided in x_range and y_range");
            }
        }

        // Check times are in ascending order
        for (let i = 0; i < this.times.length - 1; i++) {
            if (this.times[i] >= this.times[i + 1]) {
                throw new Error("Times should appear in ascending order");
            }
        }
    }

    _stateEqual(s1, s2) {
        return s1[0] === s2[0] && s1[1] === s2[1];
    }

    get_visits() {
        if (this.states.length === 0) {
            return [];
        } else if (this.states.length === 1) {
            return [this.states[0]];
        }

        const visits = [this.states[0]];
        for (let i = 1; i < this.states.length; i++) {
            if (!this._stateEqual(this.states[i - 1], this.states[i])) {
                visits.push(this.states[i]);
            }
        }
        return visits;
    }

    get_visit_times() {
        const visitTimes = [this.times[0]];
        for (let i = 1; i < this.times.length; i++) {
            if (i === this.states.length || !this._stateEqual(this.states[i - 1], this.states[i])) {
                visitTimes.push(this.times[i]);
            }
        }
        return visitTimes;
    }

    get_visit_durations() {
        const visitTimes = this.get_visit_times();
        const durations = [];
        for (let i = 0; i < visitTimes.length - 1; i++) {
            durations.push(visitTimes[i + 1] - visitTimes[i]);
        }
        return durations;
    }
}

function validate_trajectories(...trajs) {
    if (trajs.length === 0) {
        throw new Error("You must provide at least 1 trajectory");
    }

    // Set of all x_ranges across all trajectories
    const xSetAll = new Set();
    for (const traj of trajs) {
        for (const x of traj.state_space.x_range) {
            xSetAll.add(x);
        }
    }

    // Check if each trajectory's x_range set matches the union set
    for (const traj of trajs) {
        const trajSet = new Set(traj.state_space.x_range);
        if (trajSet.size !== xSetAll.size || ![...xSetAll].every(x => trajSet.has(x))) {
            throw new Error("The state spaces of all provided trajectories must match");
        }
    }

    // Set of all y_ranges across all trajectories
    const ySetAll = new Set();
    for (const traj of trajs) {
        for (const y of traj.state_space.y_range) {
            ySetAll.add(y);
        }
    }

    for (const traj of trajs) {
        const trajSet = new Set(traj.state_space.y_range);
        if (trajSet.size !== ySetAll.size || ![...ySetAll].every(y => trajSet.has(y))) {
            throw new Error("The state spaces of all provided trajectories must match");
        }
    }

    // Check order of states
    const firstX = trajs[0].state_space.x_range;
    for (let i = 1; i < trajs.length; i++) {
        const curX = trajs[i].state_space.x_range;
        if (firstX.length !== curX.length || !firstX.every((val, idx) => val === curX[idx])) {
            throw new Error("The order of states should be the same in all state spaces in the provided trajectories");
        }
    }

    const firstY = trajs[0].state_space.y_range;
    for (let i = 1; i < trajs.length; i++) {
        const curY = trajs[i].state_space.y_range;
        if (firstY.length !== curY.length || !firstY.every((val, idx) => val === curY[idx])) {
            throw new Error("The order of states should be the same in all state spaces in the provided trajectories");
        }
    }
}

// Helpers
const mean = arr => arr.reduce((sum, val) => sum + val, 0) / arr.length;

function get_mean_trajectory_duration(...trajs) {
    validate_trajectories(...trajs);
    return mean(trajs.map(t => t.times[t.times.length - 1] - t.times[0]));
}

function get_mean_number_of_events(...trajs) {
    validate_trajectories(...trajs);
    return mean(trajs.map(t => t.states.length));
}

function get_mean_number_of_visits(...trajs) {
    validate_trajectories(...trajs);
    return mean(trajs.map(t => t.get_visits().length));
}

function get_mean_state_range(...trajs) {
    validate_trajectories(...trajs);
    return mean(trajs.map(t => {
        const unique = new Set(t.states.map(s => JSON.stringify(s)));
        return unique.size;
    }));
}

function get_total_state_range(...trajs) {
    validate_trajectories(...trajs);
    const unique = new Set();
    for (const t of trajs) {
        for (const s of t.states) {
            unique.add(JSON.stringify(s));
        }
    }
    return unique.size;
}

function get_mean_event_duration(...trajs) {
    validate_trajectories(...trajs);
    return mean(trajs.map(t => {
        const eventDurations = [];
        for (let i = 0; i < t.times.length - 1; i++) {
            eventDurations.push(t.times[i + 1] - t.times[i]);
        }
        return mean(eventDurations);
    }));
}

function get_mean_visit_duration(...trajs) {
    validate_trajectories(...trajs);
    return mean(trajs.map(t => {
        const visitTimes = t.get_visit_times();
        const durations = [];
        for (let i = 0; i < visitTimes.length - 1; i++) {
            durations.push(visitTimes[i + 1] - visitTimes[i]);
        }
        return mean(durations);
    }));
}

function __get_state_durations(traj) {
    // Map with key string representation of state (since arrays aren't hashable as object keys directly)
    // We map stringified state back to state when returning values.
    const stateDurations = new Map();
    for (let i = 0; i < traj.states.length; i++) {
        const state = traj.states[i];
        const stateKey = JSON.stringify(state);
        const duration = traj.times[i + 1] - traj.times[i];
        stateDurations.set(stateKey, (stateDurations.get(stateKey) || 0) + duration);
    }
    return stateDurations;
}

function get_mean_state_duration(...trajs) {
    validate_trajectories(...trajs);
    return mean(trajs.map(t => {
        const durations = [...__get_state_durations(t).values()];
        return mean(durations);
    }));
}

function __get_dispersion(traj) {
    const state_space_size = traj.state_space.x_range.length * traj.state_space.y_range.length;
    if (state_space_size <= 1) return 0.0;
    const totalDuration = traj.times[traj.times.length - 1] - traj.times[0];
    if (totalDuration === 0) return 0.0;
    
    const durations = [...__get_state_durations(traj).values()];
    const sumVal = durations.reduce((sum, d) => sum + Math.pow(d / totalDuration, 2), 0);
    
    return 1 - ((state_space_size * sumVal - 1) / (state_space_size - 1));
}

function get_mean_dispersion(...trajs) {
    validate_trajectories(...trajs);
    return mean(trajs.map(__get_dispersion));
}

class Measures {
    constructor(
        mean_trajectory_duration,
        mean_number_of_events,
        mean_number_of_visits,
        mean_state_range,
        total_state_range,
        mean_event_duration,
        mean_visit_duration,
        mean_state_duration,
        mean_dispersion
    ) {
        this.mean_trajectory_duration = mean_trajectory_duration;
        this.mean_number_of_events = mean_number_of_events;
        this.mean_number_of_visits = mean_number_of_visits;
        this.mean_state_range = mean_state_range;
        this.total_state_range = total_state_range;
        this.mean_event_duration = mean_event_duration;
        this.mean_visit_duration = mean_visit_duration;
        this.mean_state_duration = mean_state_duration;
        this.mean_dispersion = mean_dispersion;
    }
}

function get_measures(...trajs) {
    validate_trajectories(...trajs);
    return new Measures(
        get_mean_trajectory_duration(...trajs),
        get_mean_number_of_events(...trajs),
        get_mean_number_of_visits(...trajs),
        get_mean_state_range(...trajs),
        get_total_state_range(...trajs),
        get_mean_event_duration(...trajs),
        get_mean_visit_duration(...trajs),
        get_mean_state_duration(...trajs),
        get_mean_dispersion(...trajs)
    );
}

// Export for Node environments, or expose globally in browsers
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = {
        StateSpace,
        Trajectory,
        validate_trajectories,
        get_mean_trajectory_duration,
        get_mean_number_of_events,
        get_mean_number_of_visits,
        get_mean_state_range,
        get_total_state_range,
        get_mean_event_duration,
        get_mean_visit_duration,
        get_mean_state_duration,
        get_mean_dispersion,
        Measures,
        get_measures
    };
} else {
    window.SSG = {
        StateSpace,
        Trajectory,
        validate_trajectories,
        get_mean_trajectory_duration,
        get_mean_number_of_events,
        get_mean_number_of_visits,
        get_mean_state_range,
        get_total_state_range,
        get_mean_event_duration,
        get_mean_visit_duration,
        get_mean_state_duration,
        get_mean_dispersion,
        Measures,
        get_measures
    };
}

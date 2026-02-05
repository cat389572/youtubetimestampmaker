/**
 * Application State
 */
const state = {
    // Timer state
    timer: {
        startTime: null,      // Time when timer was started
        accumulated: 0,       // Duration accumulated from previous start/stops
        isRunning: false,
        rafId: null
    },
    // Data
    timestamps: [],           // Array of { id, rawTime (ms), description, localOffset (ms) }
    globalOffset: 0,          // Global offset in seconds (float)

    // Config
    nextId: 1
};

/**
 * Timer Logic
 * High precision timer using performance.now()
 */
const Timer = {
    start: () => {
        if (state.timer.isRunning) return;
        state.timer.startTime = performance.now();
        state.timer.isRunning = true;
        tick();
        updateControls();
    },
    pause: () => {
        if (!state.timer.isRunning) return;
        const now = performance.now();
        state.timer.accumulated += (now - state.timer.startTime);
        state.timer.isRunning = false;
        state.timer.startTime = null;
        if (state.timer.rafId) cancelAnimationFrame(state.timer.rafId);
        updateTimerDisplay(); // Ensure final frozen frame is accurate
        updateControls();
    },
    toggle: () => {
        if (state.timer.isRunning) Timer.pause();
        else Timer.start();
    },
    reset: () => {
        // Safe check
        if (state.timer.accumulated > 0 || state.timer.isRunning || state.timestamps.length > 0) {
            const confirmed = confirm("Are you sure you want to reset the timer and clear all timestamps?");
            if (!confirmed) return;
        }

        state.timer.isRunning = false;
        state.timer.accumulated = 0;
        state.timer.startTime = null;
        if (state.timer.rafId) cancelAnimationFrame(state.timer.rafId);

        // Also clear timestamps
        state.timestamps = [];
        state.nextId = 1;

        updateTimerDisplay();
        updateControls();
        renderTimestamps();
    },
    getCurrentTime: () => {
        if (!state.timer.isRunning) {
            return state.timer.accumulated;
        }
        return state.timer.accumulated + (performance.now() - state.timer.startTime);
    }
};

/**
 * UI Updates
 */
function tick() {
    if (!state.timer.isRunning) return;
    updateTimerDisplay();
    state.timer.rafId = requestAnimationFrame(tick);
}

function updateTimerDisplay() {
    const ms = Timer.getCurrentTime();
    document.getElementById('timer-display').textContent = formatTimeHighRes(ms);
}

function updateControls() {
    const img = document.getElementById('img-timer-control');
    if (!img) return;

    if (state.timer.isRunning) {
        // Show Pause image
        img.src = "image/icon-pause.jpg";
        img.alt = "Pause";
    } else {
        // Show Play image
        img.src = "image/icon-play.jpg";
        img.alt = "Play";
    }
}

/**
 * Formatting Utilities
 */
function formatTimeHighRes(ms) {
    // HH:MM:SS.m (1 decimal place)
    const date = new Date(ms);
    const m = date.getUTCHours() * 60 + date.getUTCMinutes();

    const h = Math.floor(m / 60);
    const min = m % 60;
    const s = date.getUTCSeconds();

    // 1 decimal place (100ms precision visual)
    const dec = Math.floor(date.getUTCMilliseconds() / 100);

    if (ms >= 3600000) {
        return `${pad(h)}:${pad(min)}:${pad(s)}.${dec}`;
    }
    return `${pad(min)}:${pad(s)}.${dec}`;
}

function formatTimeSimple(totalMs) {
    // MM:SS or H:MM:SS (For Timestamp Display)
    if (totalMs < 0) totalMs = 0;
    const date = new Date(totalMs);
    const h = date.getUTCHours();
    const m = date.getUTCMinutes();
    const s = date.getUTCSeconds();

    if (h > 0) {
        return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
}

function pad(num, size = 2) {
    return num.toString().padStart(size, '0');
}

/**
 * Core Logic: Timestamps
 */
function addTimestamp() {
    const rawTime = Timer.getCurrentTime();

    const newTimestamp = {
        id: state.nextId++,
        rawTime: rawTime,
        description: '',
        localOffset: 0
    };

    state.timestamps.push(newTimestamp);
    renderTimestamps();

    // Focus the last added input
    setTimeout(() => {
        const inputs = document.querySelectorAll('.ts-desc');
        if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }, 50);
}

function deleteTimestamp(id) {
    state.timestamps = state.timestamps.filter(t => t.id !== id);
    renderTimestamps();
}

function updateTimestamp(id, updates) {
    const ts = state.timestamps.find(t => t.id === id);
    if (ts) {
        Object.assign(ts, updates);
        renderTimestamps(false); // Don't full re-render
    }
}

function calculateDisplayTime(ts) {
    // Raw (ms) + LocalOffset (ms) + GlobalOffset (sec * 1000)
    const totalMs = ts.rawTime + ts.localOffset + (state.globalOffset * 1000);
    return Math.max(0, totalMs);
}

/**
 * Rendering
 */
function renderTimestamps(fullRender = true) {
    const container = document.getElementById('timestamp-list');

    if (!fullRender) {
        state.timestamps.forEach(ts => {
            const el = document.getElementById(`ts-time-${ts.id}`);
            if (el) el.textContent = formatTimeSimple(calculateDisplayTime(ts));
        });
        return;
    }

    container.innerHTML = '';

    if (state.timestamps.length === 0) {
        container.innerHTML = '<div class="empty-state">No timestamps created yet. Press "Mark Timestamp" to begin.</div>';
        return;
    }

    state.timestamps.forEach(ts => {
        const item = document.createElement('div');
        item.className = 'timestamp-item';
        item.innerHTML = `
            <div class="ts-time" id="ts-time-${ts.id}">${formatTimeSimple(calculateDisplayTime(ts))}</div>
            <input class="ts-desc" type="text" value="${ts.description}" placeholder="Description..." onchange="updateTimestamp(${ts.id}, {description: this.value})">
            <div class="ts-actions">
                <button onclick="adjustLocalOffset(${ts.id}, -1)" class="icon-btn" style="width:24px; height:24px; font-size: 1rem; display:flex; align-items:center; justify-content:center;">-</button>
                <input type="text" class="ts-offset-input" value="${ts.localOffset / 1000}" inputmode="decimal" onchange="setLocalOffset(${ts.id}, this.value)">
                <button onclick="adjustLocalOffset(${ts.id}, 1)" class="icon-btn" style="width:24px; height:24px; font-size: 1rem; display:flex; align-items:center; justify-content:center;">+</button>
                <button class="btn-delete" onclick="deleteTimestamp(${ts.id})">×</button>
            </div>
        `;

        const descInput = item.querySelector('.ts-desc');
        descInput.addEventListener('input', (e) => {
            ts.description = e.target.value;
        });

        container.appendChild(item);
    });

    container.scrollTop = container.scrollHeight;
}

/**
 * Controller Actions
 */
window.adjustLocalOffset = (id, deltaSec) => {
    const ts = state.timestamps.find(t => t.id === id);
    if (ts) {
        ts.localOffset += (deltaSec * 1000);
        renderTimestamps();
    }
};

window.setLocalOffset = (id, valSec) => {
    const ts = state.timestamps.find(t => t.id === id);
    if (ts) {
        ts.localOffset = parseFloat(valSec) * 1000;
        renderTimestamps();
    }
};

window.deleteTimestamp = deleteTimestamp;
window.updateTimestamp = updateTimestamp;

/**
 * Initialization & Event Listeners
 */
document.addEventListener('DOMContentLoaded', () => {
    // Timer Controls
    document.getElementById('btn-timer-start').addEventListener('click', Timer.toggle);
    document.getElementById('btn-timer-reset').addEventListener('click', Timer.reset);

    // Global Offset
    const globalInput = document.getElementById('global-offset');
    const updateGlobal = () => {
        state.globalOffset = parseFloat(globalInput.value) || 0;
        renderTimestamps();
    };

    document.getElementById('btn-global-plus').addEventListener('click', () => {
        let current = parseFloat(globalInput.value) || 0;
        current += 1;
        globalInput.value = current;
        updateGlobal();
    });
    document.getElementById('btn-global-minus').addEventListener('click', () => {
        let current = parseFloat(globalInput.value) || 0;
        current -= 1;
        globalInput.value = current;
        updateGlobal();
    });
    globalInput.addEventListener('change', updateGlobal);
    globalInput.addEventListener('input', updateGlobal);

    // Add Timestamp
    document.getElementById('btn-add-timestamp').addEventListener('click', addTimestamp);

    // Add Keyboard Shortcut (Space for Toggle, Enter for Mark)
    document.addEventListener('keydown', (e) => {
        // Only if not focused on input
        if (e.target.tagName === 'INPUT') return;

        if (e.code === 'Space') {
            e.preventDefault();
            Timer.toggle();
        }
        if (e.code === 'Enter') {
            e.preventDefault(); // prevent default trigger
            addTimestamp();
        }
    });

    // Copy
    document.getElementById('btn-copy-all').addEventListener('click', () => {
        // Recalculate everything before copy just in case, though state is truth
        const text = state.timestamps.map(ts => {
            const timeStr = formatTimeSimple(calculateDisplayTime(ts));
            return `${timeStr} ${ts.description}`;
        }).join('\n');

        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('btn-copy-all');
            const original = btn.textContent;
            btn.textContent = "Copied!";
            setTimeout(() => btn.textContent = original, 2000);
        });
    });
});

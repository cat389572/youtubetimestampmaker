/**
 * Application State
 */
const state = {
    // Timer state
    timer: {
        startTime: null,      // Time when timer was started (real clock time)
        accumulated: 0,       // Duration accumulated from previous sessions (scaled time)
        isRunning: false,
        rafId: null,
        speed: 1.0            // Playback speed multiplier
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
 * NOW WITH SPEED SUPPORT
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
        // Calculate accrued time at current speed
        const elapsedReal = now - state.timer.startTime;
        const elapsedScaled = elapsedReal * state.timer.speed;

        state.timer.accumulated += elapsedScaled;
        state.timer.isRunning = false;
        state.timer.startTime = null;
        if (state.timer.rafId) cancelAnimationFrame(state.timer.rafId);
        updateTimerDisplay();
        updateControls();
        saveState();
    },
    toggle: () => {
        if (state.timer.isRunning) Timer.pause();
        else Timer.start();
    },
    reset: () => {
        if (state.timer.accumulated > 0 || state.timer.isRunning || state.timestamps.length > 0) {
            const confirmed = confirm("Are you sure you want to reset the timer and clear all timestamps?");
            if (!confirmed) return;
        }

        state.timer.isRunning = false;
        state.timer.accumulated = 0;
        state.timer.startTime = null;
        if (state.timer.rafId) cancelAnimationFrame(state.timer.rafId);

        // Keep speed or reset? Usually reset speed too? Or keep?
        // Let's keep speed as a preference, but maybe reset to 1?
        // User asked to support speed "like YouTube". Usually resetting video resets everything? 
        // No, YouTube remembers speed per video or session. Let's keep the speed.

        state.timestamps = [];
        state.nextId = 1;

        // Clear saved state but preserve speed? 
        // simpler to just wipe and let loadState handle or just re-save partial?
        // `reset` implies fresh start. Let's wipe everything but maybe restore configured speed if UI says so?
        // Actually saveState() overwrites everything.

        localStorage.removeItem('yt_ts_maker_data');

        // Re-read speed from UI to be sure (state.timer.speed is current)

        updateTimerDisplay();
        updateControls();
        renderTimestamps();
    },
    setSpeed: (newSpeed) => {
        const speed = parseFloat(newSpeed);
        if (isNaN(speed) || speed <= 0) return;

        if (state.timer.isRunning) {
            // Checkpoint current time at OLD speed
            const now = performance.now();
            const elapsedReal = now - state.timer.startTime;
            const elapsedScaled = elapsedReal * state.timer.speed;

            state.timer.accumulated += elapsedScaled;
            state.timer.startTime = now; // Restart clock base
        }

        state.timer.speed = speed;
        // Optionally flash a message or update UI? The select box updates itself.
        saveState();
        if (!state.timer.isRunning) {
            updateTimerDisplay(); // Just in case, though paused time doesn't change immediately
        }
    },
    getCurrentTime: () => {
        if (!state.timer.isRunning) {
            return state.timer.accumulated;
        }
        const now = performance.now();
        const elapsedReal = now - state.timer.startTime;
        return state.timer.accumulated + (elapsedReal * state.timer.speed);
    }
};

/**
 * UI Updates
 */
function tick() {
    if (!state.timer.isRunning) return;
    updateTimerDisplay();
    // Optional: save state periodically? Might be too heavy. 
    // Rely on pause/unload saving.
    state.timer.rafId = requestAnimationFrame(tick);
}

function updateTimerDisplay() {
    const ms = Timer.getCurrentTime();
    // Use innerHTML to support span styling
    document.getElementById('timer-display').innerHTML = formatTimeHighRes(ms);
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

    // Wrap decimal in span
    const decimalPart = `<span class="timer-decimal">.${dec}</span>`;

    if (ms >= 3600000) {
        return `${pad(h)}:${pad(min)}:${pad(s)}${decimalPart}`;
    }
    return `${pad(min)}:${pad(s)}${decimalPart}`;
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
    renderTimestamps(true, true); // Scroll to bottom on add

    // Focus the last added input
    setTimeout(() => {
        const inputs = document.querySelectorAll('.ts-desc');
        if (inputs.length > 0) inputs[inputs.length - 1].focus();
    }, 50);
    saveState();
}

function deleteTimestamp(id) {
    state.timestamps = state.timestamps.filter(t => t.id !== id);
    renderTimestamps(true, false); // Don't scroll on delete
    saveState();
}

function updateTimestamp(id, updates) {
    const ts = state.timestamps.find(t => t.id === id);
    if (ts) {
        Object.assign(ts, updates);
        renderTimestamps(false); // Don't full re-render
        saveState();
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
function renderTimestamps(fullRender = true, scrollToBottom = false) {
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
        // XSS FIX: Removed value="${ts.description}" to prevent HTML injection.
        // We set the value programmatically below.
        item.innerHTML = `
            <div class="ts-delete-overlay" id="delete-overlay-${ts.id}">
                <div class="delete-progress"></div>
                <span>HOLD TO DELETE</span>
            </div>
            <div class="ts-content-row">
                <div class="ts-time" id="ts-time-${ts.id}">${formatTimeSimple(calculateDisplayTime(ts))}</div>
                <input class="ts-desc" type="text" placeholder="Description..." onchange="updateTimestamp(${ts.id}, {description: this.value})">
            </div>
            <div class="ts-actions-row">
                <div class="local-offset-control">
                    <span class="offset-label">Offset</span>
                    <button onclick="adjustLocalOffset(${ts.id}, -1)" class="icon-btn-large">-</button>
                    <input type="text" class="ts-offset-input-large" value="${ts.localOffset / 1000}" inputmode="decimal" onchange="setLocalOffset(${ts.id}, this.value)">
                    <button onclick="adjustLocalOffset(${ts.id}, 1)" class="icon-btn-large">+</button>
                </div>
            </div>
        `;

        const descInput = item.querySelector('.ts-desc');
        // Safely set the value programmatically
        descInput.value = ts.description || '';

        descInput.addEventListener('input', (e) => {
            ts.description = e.target.value;
            saveState(); // Save on input (maybe too frequent? better on change/blur or debounced? user asked for reliable saving. 'input' is safest but high freq. let's stick to updateTimestamp (change) for now or add explicit save here? updateTimestamp is onchange. Let's add saveState here too to be safe/granular, or rely on change.)
            // Actually, updateTimestamp is called on 'change' (blur/enter). For realtime safety 'input' is better but spammy.
            // Let's rely on 'change' via updateTimestamp for the bulk, but maybe debounce save?
            // For now, let's stick to 'change' (updateTimestamp) which calls saveState.
            // BUT, if user types and reloads before blurring, data loss.
            // Let's add a debounced save? Or just save on input (localStorage is fast).
            // Let's try adding explicit save here for safety.
            saveState();
        });

        // Long Press Delete Logic
        const deleteOverlay = item.querySelector(`#delete-overlay-${ts.id}`);
        // ... (rest of logic same)
        const progressBar = deleteOverlay.querySelector('.delete-progress');
        let pressTimer;
        let isPressing = false;

        const startPress = (e) => {
            if (e.target !== deleteOverlay && e.target.parentElement !== deleteOverlay) return;
            // Only trigger if clicking the overlay itself (or immediate text child if structure implies)
            // simplified: blocking propagation from children if any? The overlay covers the top area.

            isPressing = true;
            deleteOverlay.classList.add('pressing');

            // 2000ms to delete
            pressTimer = setTimeout(() => {
                if (isPressing) {
                    deleteTimestamp(ts.id);
                }
            }, 2000);
        };

        const cancelPress = () => {
            if (!isPressing) return;
            isPressing = false;
            deleteOverlay.classList.remove('pressing');
            clearTimeout(pressTimer);
        };

        // Mouse
        deleteOverlay.addEventListener('mousedown', startPress);
        deleteOverlay.addEventListener('mouseup', cancelPress);
        deleteOverlay.addEventListener('mouseleave', cancelPress);

        // Touch
        deleteOverlay.addEventListener('touchstart', (e) => {
            e.preventDefault(); // prevent mouse emulation
            startPress(e);
        });
        deleteOverlay.addEventListener('touchend', cancelPress);
        deleteOverlay.addEventListener('touchcancel', cancelPress);

        container.appendChild(item);
    });

    if (scrollToBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

/**
 * Persistence
 */
function saveState() {
    const data = {
        timestamps: state.timestamps,
        globalOffset: state.globalOffset,
        timerAccumulated: state.timer.accumulated, // Save current accumulated time
        speed: state.timer.speed // Save speed
    };
    if (state.timer.isRunning) {
        // If running, calculate current accumulated up to now
        data.timerAccumulated = Timer.getCurrentTime();
    }
    localStorage.setItem('yt_ts_maker_data', JSON.stringify(data));
}

function loadState() {
    const raw = localStorage.getItem('yt_ts_maker_data');
    if (!raw) return;

    try {
        const data = JSON.parse(raw);
        if (data.timestamps) {
            state.timestamps = data.timestamps;
            const maxId = state.timestamps.reduce((max, t) => Math.max(max, t.id), 0);
            state.nextId = maxId + 1;
        }
        if (data.globalOffset !== undefined) {
            state.globalOffset = data.globalOffset;
            const globalInput = document.getElementById('global-offset');
            if (globalInput) globalInput.value = state.globalOffset;
        }
        if (data.timerAccumulated !== undefined) {
            state.timer.accumulated = data.timerAccumulated;
            updateTimerDisplay();
        }
        if (data.speed !== undefined) {
            state.timer.speed = data.speed;
            const speedInput = document.getElementById('playback-speed');
            if (speedInput) speedInput.value = state.timer.speed;
        }
        renderTimestamps();
    } catch (e) {
        console.error("Failed to load state", e);
    }
}

/**
 * Controller Actions
 */
window.adjustLocalOffset = (id, deltaSec) => {
    const ts = state.timestamps.find(t => t.id === id);
    if (ts) {
        ts.localOffset += (deltaSec * 1000);
        renderTimestamps(true, false);
        saveState();
    }
};

window.setLocalOffset = (id, valSec) => {
    const ts = state.timestamps.find(t => t.id === id);
    if (ts) {
        ts.localOffset = parseFloat(valSec) * 1000;
        renderTimestamps(true, false);
        saveState();
    }
};

window.deleteTimestamp = deleteTimestamp;
window.updateTimestamp = updateTimestamp;

// Manual Timer Editing
function initTimerEditing() {
    const display = document.getElementById('timer-display');

    display.addEventListener('click', () => {
        if (state.timer.isRunning) Timer.pause(); // Pause to edit

        const currentText = display.innerText.split('.')[0];

        // Replace with input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentText;
        input.className = 'timer-edit-input';
        input.style.fontSize = 'inherit';
        input.style.fontFamily = 'inherit';
        input.style.color = 'inherit';
        input.style.background = 'transparent';
        input.style.border = '1px solid rgba(255,255,255,0.3)';
        input.style.borderRadius = '4px';
        input.style.textAlign = 'center';
        input.style.width = '300px';

        display.innerHTML = '';
        display.appendChild(input);
        input.focus();

        const saveEdit = () => {
            const val = input.value.trim();
            const parts = val.split(':').map(p => parseFloat(p));
            let newMs = 0;

            if (parts.length === 3) {
                // HH:MM:SS
                newMs = ((parts[0] * 3600) + (parts[1] * 60) + parts[2]) * 1000;
            } else if (parts.length === 2) {
                // MM:SS
                newMs = ((parts[0] * 60) + parts[1]) * 1000;
            } else if (parts.length === 1) {
                // SS
                newMs = parts[0] * 1000;
            }

            if (!isNaN(newMs)) {
                state.timer.accumulated = newMs;
            }

            updateTimerDisplay();
            saveState();
        };

        // Save on blur or enter
        input.addEventListener('blur', saveEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveEdit();
            }
        });
    });
}


/**
 * Initialization & Event Listeners
 */
document.addEventListener('DOMContentLoaded', () => {
    loadState(); // Load saved data
    initTimerEditing();

    // Timer Controls
    document.getElementById('btn-timer-start').addEventListener('click', Timer.toggle);
    document.getElementById('btn-timer-reset').addEventListener('click', Timer.reset);

    // Global Offset
    const globalInput = document.getElementById('global-offset');
    const updateGlobal = () => {
        state.globalOffset = parseFloat(globalInput.value) || 0;
        renderTimestamps(true, false); // Keep position
        saveState();
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

    // Playback Speed
    const speedInput = document.getElementById('playback-speed');
    if (speedInput) {
        speedInput.addEventListener('change', (e) => {
            Timer.setSpeed(e.target.value);
            // Remove focus after selection so spacebar toggles timer instead of reopening dropdown
            e.target.blur();
        });
    }

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

// Prevent accidental reload/leave
window.addEventListener('beforeunload', (e) => {
    // Check if there is anything worth saving
    // 1. Timer is running
    // 2. Timer has accumulated time
    // 3. Timestamps exist
    const isDataPresent = state.timer.isRunning || state.timer.accumulated > 0 || state.timestamps.length > 0;

    if (isDataPresent) {
        e.preventDefault();
        e.returnValue = ''; // Standard for modern browsers to trigger the prompt
    }
});


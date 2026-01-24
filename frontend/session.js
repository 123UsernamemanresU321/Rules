/**
 * Session Order OS - Session Management Module
 * Handles the session control room functionality
 */

const Session = {
    currentSession: null,
    currentStudent: null,
    timer: null,
    timerSeconds: 0,
    timerRunning: false,

    /**
     * Initialize session module
     */
    async init() {
        // Check for active session
        const activeSession = await DB.getActiveSession();
        if (activeSession) {
            this.currentSession = activeSession;
            this.currentStudent = await DB.getStudent(activeSession.studentId);
            this.timerSeconds = Math.floor((Date.now() - activeSession.startTime) / 1000);
        }
    },

    /**
     * Get current session state
     * @returns {Object} Current state
     */
    getState() {
        return {
            session: this.currentSession,
            student: this.currentStudent,
            timerSeconds: this.timerSeconds,
            timerRunning: this.timerRunning,
            hasActiveSession: this.currentSession !== null
        };
    },

    /**
     * Start a new session
     * @param {string} studentId - Student ID
     * @param {string} mode - 'in-person' or 'online'
     * @param {Array} goals - Session goals
     * @returns {Promise<Object>} New session
     */
    async startSession(studentId, mode = 'in-person', goals = []) {
        // End any active session first
        if (this.currentSession) {
            await this.endSession();
        }

        // Create new session
        this.currentSession = await DB.createSession({
            studentId,
            mode,
            goals: goals.map(g => Utils.sanitizeHTML(g))
        });

        // Load student
        this.currentStudent = await DB.getStudent(studentId);

        // Start timer
        this.timerSeconds = 0;
        this.startTimer();

        Utils.EventBus.emit('session:started', {
            session: this.currentSession,
            student: this.currentStudent
        });

        return this.currentSession;
    },

    /**
     * End the current session
     * @returns {Promise<Object>} Ended session
     */
    async endSession() {
        if (!this.currentSession) return null;

        this.stopTimer();

        const session = await DB.endSession(this.currentSession.id);

        Utils.EventBus.emit('session:ended', { session });

        const endedSession = this.currentSession;
        this.currentSession = null;
        this.currentStudent = null;
        this.timerSeconds = 0;

        return endedSession;
    },

    /**
     * Start the session timer
     */
    startTimer() {
        if (this.timerRunning) return;

        this.timerRunning = true;
        this.timer = setInterval(() => {
            this.timerSeconds++;
            Utils.EventBus.emit('session:timerTick', { seconds: this.timerSeconds });
        }, 1000);

        Utils.EventBus.emit('session:timerStarted', { seconds: this.timerSeconds });
    },

    /**
     * Pause the session timer
     */
    pauseTimer() {
        if (!this.timerRunning) return;

        this.timerRunning = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        Utils.EventBus.emit('session:timerPaused', { seconds: this.timerSeconds });
    },

    /**
     * Stop and reset timer
     */
    stopTimer() {
        this.pauseTimer();
        this.timerSeconds = 0;
    },

    /**
     * Toggle timer running state
     */
    toggleTimer() {
        if (this.timerRunning) {
            this.pauseTimer();
        } else {
            this.startTimer();
        }
    },

    /**
     * Get formatted timer display
     * @returns {string} Formatted time
     */
    getTimerDisplay() {
        return Utils.formatDuration(this.timerSeconds);
    },

    /**
     * Update session mode
     * @param {string} mode - 'in-person' or 'online'
     */
    async setMode(mode) {
        if (!this.currentSession) return;

        this.currentSession.mode = mode;
        await DB.updateSession(this.currentSession);

        Utils.EventBus.emit('session:modeChanged', { mode });
    },

    /**
     * Update session goals
     * @param {Array} goals - Array of goal strings
     */
    async updateGoals(goals) {
        if (!this.currentSession) return;

        this.currentSession.goals = goals.map(g => Utils.sanitizeHTML(g));
        await DB.updateSession(this.currentSession);

        Utils.EventBus.emit('session:goalsUpdated', { goals: this.currentSession.goals });
    },

    /**
     * Toggle a goal's completion status
     * @param {number} index - Goal index
     */
    async toggleGoal(index) {
        if (!this.currentSession || !this.currentSession.goals) return;

        const goal = this.currentSession.goals[index];
        if (typeof goal === 'string') {
            this.currentSession.goals[index] = { text: goal, completed: true };
        } else {
            this.currentSession.goals[index].completed = !this.currentSession.goals[index].completed;
        }

        await DB.updateSession(this.currentSession);
        Utils.EventBus.emit('session:goalsUpdated', { goals: this.currentSession.goals });
    },

    /**
     * Add session notes
     * @param {string} notes - Notes text
     */
    async updateNotes(notes) {
        if (!this.currentSession) return;

        this.currentSession.notes = Utils.sanitizeHTML(notes);
        await DB.updateSession(this.currentSession);
    },

    /**
     * Get discipline state for current session
     * @returns {Object} Discipline counters
     */
    getDisciplineState() {
        if (!this.currentSession) return {};
        return this.currentSession.disciplineState || {};
    },

    /**
     * Get the current grade band
     * @returns {string} Grade band (A-E)
     */
    getGradeBand() {
        if (!this.currentStudent) return 'C';
        return Utils.getGradeBand(this.currentStudent.grade);
    },

    /**
     * Get recommended next step based on current state
     * @param {string} category - Category key (optional)
     * @returns {Object} Recommendation
     */
    getNextRecommendation(category = null) {
        if (!this.currentSession) return null;

        const state = this.getDisciplineState();
        const band = this.getGradeBand();

        // If category specified, get ladder step for that category
        if (category) {
            const count = state[category] || 0;
            const step = Methodology.getLadderStep(category, count, band);
            return {
                category,
                step,
                script: Methodology.getScript(category, band, 'neutral')
            };
        }

        // Find the category with most incidents
        const topCategory = Object.entries(state)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])[0];

        if (!topCategory) {
            return {
                message: 'No incidents yet. Session proceeding well.',
                category: null
            };
        }

        const [cat, count] = topCategory;
        const step = Methodology.getLadderStep(cat, count, band);

        return {
            category: cat,
            count,
            step,
            script: Methodology.getScript(cat, band, 'neutral'),
            shouldEscalate: count >= 3
        };
    },

    /**
     * Check if should recommend session stop
     * @returns {Object} {shouldStop: boolean, reason: string}
     */
    checkSessionStop() {
        if (!this.currentSession) return { shouldStop: false };

        const state = this.getDisciplineState();
        const band = this.getGradeBand();

        // Check for critical severity (4) - would be passed in from recent incident
        // Check safety boundary count
        if (state.SAFETY_BOUNDARY >= 2) {
            return {
                shouldStop: true,
                reason: 'Multiple safety boundary incidents'
            };
        }

        // Check total vs threshold
        const bandConfig = Methodology.defaultConfig.gradeBands[band];
        const total = Object.values(state).reduce((a, b) => a + b, 0);

        if (bandConfig && total >= bandConfig.sessionStopThreshold * 2) {
            return {
                shouldStop: true,
                reason: 'High incident count for grade band'
            };
        }

        return { shouldStop: false };
    },

    /**
     * Check if should recommend parent contact
     * @returns {boolean}
     */
    shouldContactParent() {
        if (!this.currentSession) return false;
        return Methodology.shouldContactParent(
            this.getDisciplineState(),
            this.getGradeBand()
        );
    },

    /**
     * Apply de-escalation action
     * @param {string} action - Action type
     * @param {number} duration - Duration in seconds (for breaks)
     */
    async applyDeescalation(action, duration = null) {
        if (!this.currentSession) return;

        const actions = {
            'reset_break': async () => {
                this.pauseTimer();
                Utils.EventBus.emit('session:breakStarted', {
                    duration: duration || 60,
                    type: 'reset'
                });
            },
            'reduce_difficulty': async () => {
                Utils.EventBus.emit('session:difficultyReduced');
            },
            'guided_practice': async () => {
                Utils.EventBus.emit('session:switchToGuided');
            },
            'activity_switch': async () => {
                Utils.EventBus.emit('session:activitySwitch');
            }
        };

        if (actions[action]) {
            await actions[action]();

            // Log the de-escalation
            if (!this.currentSession.deescalations) {
                this.currentSession.deescalations = [];
            }
            this.currentSession.deescalations.push({
                action,
                timestamp: Date.now(),
                timeIntoSession: this.timerSeconds
            });
            await DB.updateSession(this.currentSession);
        }
    },

    /**
     * Get break timer countdown
     * @param {number} duration - Break duration in seconds
     * @param {Function} onTick - Tick callback
     * @param {Function} onComplete - Complete callback
     * @returns {Object} Timer control { stop: Function }
     */
    startBreakTimer(duration, onTick, onComplete) {
        let remaining = duration;

        const interval = setInterval(() => {
            remaining--;
            onTick(remaining);

            if (remaining <= 0) {
                clearInterval(interval);
                onComplete();
                this.startTimer();
            }
        }, 1000);

        return {
            stop: () => {
                clearInterval(interval);
                this.startTimer();
            }
        };
    },

    /**
     * Get session summary for display
     * @returns {Object} Summary data
     */
    async getSessionSummary() {
        if (!this.currentSession) return null;

        const incidents = await DB.getSessionIncidents(this.currentSession.id);

        return {
            duration: Utils.formatDuration(this.timerSeconds),
            mode: this.currentSession.mode,
            studentName: this.currentStudent?.name || 'Unknown',
            studentGrade: this.currentStudent?.grade || 'N/A',
            gradeBand: this.getGradeBand(),
            totalIncidents: incidents.length,
            disciplineState: this.getDisciplineState(),
            goals: this.currentSession.goals || [],
            goalsCompleted: (this.currentSession.goals || [])
                .filter(g => typeof g === 'object' && g.completed).length,
            incidents
        };
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Session;
}

// Attach to window for browser global access
if (typeof window !== 'undefined') {
    window.Session = Session;
}

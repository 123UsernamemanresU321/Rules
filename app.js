/**
 * Session Order OS - Main Application Controller
 * Handles routing, state management, and page rendering
 */

const App = {
    currentPage: 'session',
    initialized: false,

    /**
     * Initialize the application
     */
    async init() {
        if (this.initialized) return;

        try {
            // Initialize database
            await DB.init();

            // Initialize session module
            await Session.init();

            // Initialize methodology with default or saved config
            const savedConfig = await DB.getMethodologyConfig();
            if (!savedConfig) {
                await DB.saveMethodologyConfig(Methodology.defaultConfig);
            }

            // Set up event listeners
            this.setupEventListeners();

            // Set up keyboard shortcuts
            this.setupKeyboardShortcuts();

            // Set up online/offline detection
            this.setupOnlineDetection();

            // Load initial page
            this.navigateTo(window.location.hash.slice(1) || 'session');

            this.initialized = true;
            console.log('Session Order OS initialized');

        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Failed to initialize application. Please refresh the page.');
        }
    },

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('[data-nav]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(el.dataset.nav);
            });
        });

        // Hash change
        window.addEventListener('hashchange', () => {
            this.navigateTo(window.location.hash.slice(1) || 'session');
        });

        // Session events
        Utils.EventBus.on('session:timerTick', (data) => {
            this.updateTimerDisplay(data.seconds);
        });

        Utils.EventBus.on('incident:logged', (data) => {
            this.handleIncidentLogged(data);
        });

        Utils.EventBus.on('session:started', () => {
            if (this.currentPage === 'session') {
                this.renderSessionPage();
            }
        });

        Utils.EventBus.on('session:ended', () => {
            if (this.currentPage === 'session') {
                this.renderSessionPage();
            }
        });
    },

    /**
     * Set up keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts when not in input/textarea
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
                return;
            }

            // Quick incident logging (1-7, 0)
            if (Session.currentSession && /^[0-7]$/.test(e.key)) {
                e.preventDefault();
                const category = Incidents.handleShortcut(e.key);
                if (category) {
                    this.openQuickLogModal(category.key);
                }
            }

            // Timer toggle (Space)
            if (e.key === ' ' && Session.currentSession && this.currentPage === 'session') {
                e.preventDefault();
                Session.toggleTimer();
                this.updateTimerUI();
            }
        });
    },

    /**
     * Set up online/offline detection
     */
    setupOnlineDetection() {
        const updateStatus = () => {
            const indicator = document.getElementById('offlineIndicator');
            if (indicator) {
                indicator.classList.toggle('hidden', navigator.onLine);
            }
        };

        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        updateStatus();
    },

    /**
     * Navigate to a page
     * @param {string} pageName - Page name
     */
    navigateTo(pageName) {
        const validPages = ['session', 'rules', 'methodology', 'incidents', 'reports', 'settings'];
        if (!validPages.includes(pageName)) {
            pageName = 'session';
        }

        this.currentPage = pageName;
        window.location.hash = pageName;

        // Update navigation active state
        document.querySelectorAll('[data-nav]').forEach(el => {
            el.classList.toggle('active', el.dataset.nav === pageName);
        });

        // Render the page
        this.renderPage(pageName);
    },

    /**
     * Render a page
     * @param {string} pageName - Page name
     */
    renderPage(pageName) {
        const main = document.getElementById('mainContent');
        if (!main) return;

        const renderers = {
            session: () => this.renderSessionPage(),
            rules: () => this.renderRulesPage(),
            methodology: () => this.renderMethodologyPage(),
            incidents: () => this.renderIncidentsPage(),
            reports: () => this.renderReportsPage(),
            settings: () => this.renderSettingsPage()
        };

        if (renderers[pageName]) {
            renderers[pageName]();
        }
    },

    /**
     * Render Session Page (Control Room)
     */
    async renderSessionPage() {
        const main = document.getElementById('mainContent');
        const state = Session.getState();
        const students = await DB.getAllStudents();
        const recentStudents = await DB.getRecentStudents(5);
        const categories = Incidents.getCategoryButtons();

        if (!state.hasActiveSession) {
            // No active session - show session start UI
            main.innerHTML = `
                <div class="page-session">
                    <div class="session-start-panel glass">
                        <h2>Start New Session</h2>
                        
                        <div class="form-group">
                            <label for="studentSelect">Select Student</label>
                            <select id="studentSelect" class="form-control">
                                <option value="">-- Choose a student --</option>
                                ${students.map(s => `
                                    <option value="${s.id}">${Utils.escapeHTML(s.name)} (Grade ${s.grade})</option>
                                `).join('')}
                            </select>
                        </div>

                        ${recentStudents.length > 0 ? `
                        <div class="recent-students">
                            <label>Recent Students</label>
                            <div class="recent-student-chips">
                                ${recentStudents.map(s => `
                                    <button class="chip" data-student-id="${s.id}">
                                        ${Utils.escapeHTML(s.name)}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}

                        <div class="form-group">
                            <label>Or Add New Student</label>
                            <div class="add-student-inline">
                                <input type="text" id="newStudentName" placeholder="Student name" class="form-control">
                                <select id="newStudentGrade" class="form-control">
                                    ${Array.from({ length: 13 }, (_, i) => i + 1).map(g => `
                                        <option value="${g}">Grade ${g}</option>
                                    `).join('')}
                                </select>
                                <button id="addStudentBtn" class="btn btn-secondary">Add</button>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="sessionMode">Session Mode</label>
                            <div class="toggle-group">
                                <button class="toggle-btn active" data-mode="in-person">🏫 In-person</button>
                                <button class="toggle-btn" data-mode="online">🌐 Online</button>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Session Goals (Optional)</label>
                            <input type="text" id="goal1" placeholder="Goal 1" class="form-control">
                            <input type="text" id="goal2" placeholder="Goal 2" class="form-control">
                            <input type="text" id="goal3" placeholder="Goal 3" class="form-control">
                        </div>

                        <button id="startSessionBtn" class="btn btn-primary btn-large" disabled>
                            Start Session
                        </button>
                    </div>
                </div>
            `;

            // Set up event handlers for session start
            this.setupSessionStartHandlers();

        } else {
            // Active session - show control room
            const summary = await Session.getSessionSummary();
            const recommendation = Session.getNextRecommendation();
            const shouldStop = Session.checkSessionStop();

            main.innerHTML = `
                <div class="page-session control-room">
                    <!-- Header with timer and student info -->
                    <div class="session-header glass">
                        <div class="student-info">
                            <span class="student-name">${Utils.escapeHTML(summary.studentName)}</span>
                            <span class="grade-badge band-${summary.gradeBand.toLowerCase()}">
                                Grade ${summary.studentGrade} • Band ${summary.gradeBand}
                            </span>
                        </div>
                        <div class="session-timer">
                            <span id="timerDisplay" class="timer-display">${summary.duration}</span>
                            <div class="timer-controls">
                                <button id="timerToggle" class="btn btn-icon" title="Space to toggle">
                                    ${state.timerRunning ? '⏸️' : '▶️'}
                                </button>
                            </div>
                        </div>
                        <div class="session-mode">
                            <button class="toggle-btn ${state.session.mode === 'in-person' ? 'active' : ''}" data-mode="in-person">🏫</button>
                            <button class="toggle-btn ${state.session.mode === 'online' ? 'active' : ''}" data-mode="online">🌐</button>
                        </div>
                        <button id="endSessionBtn" class="btn btn-danger">End Session</button>
                    </div>

                    ${shouldStop.shouldStop ? `
                    <div class="alert alert-danger">
                        ⚠️ <strong>Session Stop Recommended:</strong> ${shouldStop.reason}
                        <button id="confirmEndSession" class="btn btn-danger btn-small">End Now</button>
                    </div>
                    ` : ''}

                    <div class="control-room-grid">
                        <!-- Quick Log Buttons -->
                        <div class="quick-log-panel glass">
                            <h3>Quick Log Incident <span class="hint">Press 1-7</span></h3>
                            <div class="quick-log-grid">
                                ${categories.map(cat => `
                                    <button class="quick-log-btn" data-category="${cat.key}" title="${cat.fullLabel} (${cat.shortcut})">
                                        <span class="icon">${cat.icon}</span>
                                        <span class="label">${cat.label}</span>
                                        <span class="shortcut">${cat.shortcut}</span>
                                        <span class="count">${summary.disciplineState[cat.key] || 0}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Agenda Panel -->
                        <div class="agenda-panel glass">
                            <h3>Session Goals</h3>
                            <div class="goals-list">
                                ${summary.goals.length > 0 ? summary.goals.map((goal, i) => {
                const goalText = typeof goal === 'string' ? goal : goal.text;
                const completed = typeof goal === 'object' && goal.completed;
                return `
                                        <div class="goal-item ${completed ? 'completed' : ''}" data-index="${i}">
                                            <input type="checkbox" ${completed ? 'checked' : ''}>
                                            <span>${Utils.escapeHTML(goalText)}</span>
                                        </div>
                                    `;
            }).join('') : '<p class="empty-state">No goals set for this session</p>'}
                            </div>
                        </div>

                        <!-- De-escalation Toolkit -->
                        <div class="deescalation-panel glass">
                            <h3>De-escalation Toolkit</h3>
                            <div class="deescalation-actions">
                                <div class="action-group">
                                    <span class="group-label">Reset Break</span>
                                    <div class="btn-group">
                                        <button class="btn btn-small" data-deescalate="reset_break" data-duration="60">60s</button>
                                        <button class="btn btn-small" data-deescalate="reset_break" data-duration="120">2m</button>
                                        <button class="btn btn-small" data-deescalate="reset_break" data-duration="180">3m</button>
                                    </div>
                                </div>
                                <button class="btn btn-outline" data-deescalate="reduce_difficulty">📉 Reduce Difficulty</button>
                                <button class="btn btn-outline" data-deescalate="guided_practice">🤝 Guided Practice</button>
                                <button class="btn btn-outline" data-deescalate="activity_switch">🔄 Switch Activity</button>
                            </div>
                        </div>

                        <!-- Recommendation Panel -->
                        <div class="recommendation-panel glass">
                            <h3>Next Recommended Step</h3>
                            ${recommendation.category ? `
                                <div class="recommendation">
                                    <div class="rec-header">
                                        <span class="category">${Methodology.getCategory(recommendation.category)?.label || recommendation.category}</span>
                                        <span class="count">${recommendation.count || 0} incidents</span>
                                    </div>
                                    <div class="rec-action">
                                        <strong>Action:</strong> ${recommendation.step?.action || 'Observe'}
                                    </div>
                                    <div class="script-tabs">
                                        <button class="script-tab active" data-tone="gentle">Gentle</button>
                                        <button class="script-tab" data-tone="neutral">Neutral</button>
                                        <button class="script-tab" data-tone="firm">Firm</button>
                                    </div>
                                    <div class="script-content" id="currentScript">
                                        "${this.getCurrentScript(recommendation, 'gentle')}"
                                    </div>
                                </div>
                            ` : `
                                <div class="no-recommendation">
                                    <span class="icon">✨</span>
                                    <p>${recommendation.message || 'Session proceeding well'}</p>
                                </div>
                            `}
                        </div>
                    </div>

                    <!-- Recent Incidents -->
                    <div class="recent-incidents glass">
                        <h3>Recent Incidents This Session</h3>
                        <div id="recentIncidentsList">
                            ${this.renderRecentIncidents(summary.incidents.slice(-5))}
                        </div>
                    </div>
                </div>
            `;

            // Set up event handlers for control room
            this.setupControlRoomHandlers();
            this.currentRecommendation = recommendation;
        }
    },

    /**
     * Get current script for recommendation
     */
    getCurrentScript(recommendation, tone) {
        if (!recommendation.category) return '';
        const band = Session.getGradeBand();
        return Methodology.getScript(recommendation.category, band, tone);
    },

    /**
     * Render recent incidents list
     */
    renderRecentIncidents(incidents) {
        if (!incidents || incidents.length === 0) {
            return '<p class="empty-state">No incidents logged yet</p>';
        }

        return incidents.reverse().map(i => {
            const cat = Methodology.getCategory(i.category);
            const sev = Methodology.getSeverity(i.severity);
            return `
                <div class="incident-row" data-id="${i.id}">
                    <span class="time">${Utils.formatDuration(i.timeIntoSession || 0)}</span>
                    <span class="icon">${cat?.icon || '❓'}</span>
                    <span class="category">${cat?.shortLabel || i.category}</span>
                    <span class="severity" style="color: ${sev.color}">Sev ${i.severity}</span>
                    <span class="description">${Utils.truncate(i.description, 40)}</span>
                    <span class="status">${i.resolved ? '✅' : '🔴'}</span>
                </div>
            `;
        }).join('');
    },

    /**
     * Set up session start handlers
     */
    setupSessionStartHandlers() {
        const studentSelect = document.getElementById('studentSelect');
        const startBtn = document.getElementById('startSessionBtn');
        const addStudentBtn = document.getElementById('addStudentBtn');
        const newStudentName = document.getElementById('newStudentName');
        const newStudentGrade = document.getElementById('newStudentGrade');

        // Enable start button when student selected
        studentSelect?.addEventListener('change', () => {
            startBtn.disabled = !studentSelect.value;
        });

        // Recent student chips
        document.querySelectorAll('.chip[data-student-id]').forEach(chip => {
            chip.addEventListener('click', () => {
                studentSelect.value = chip.dataset.studentId;
                startBtn.disabled = false;
            });
        });

        // Mode toggle
        document.querySelectorAll('.toggle-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.toggle-btn[data-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Add new student
        addStudentBtn?.addEventListener('click', async () => {
            const name = newStudentName.value.trim();
            const grade = newStudentGrade.value;

            if (!name) {
                this.showError('Please enter a student name');
                return;
            }

            try {
                const student = await DB.addStudent({ name, grade });
                this.renderSessionPage(); // Refresh to show new student
                this.showSuccess(`Added ${name}`);
            } catch (error) {
                this.showError('Failed to add student');
            }
        });

        // Start session
        startBtn?.addEventListener('click', async () => {
            const studentId = studentSelect.value;
            const mode = document.querySelector('.toggle-btn[data-mode].active')?.dataset.mode || 'in-person';
            const goals = [
                document.getElementById('goal1')?.value,
                document.getElementById('goal2')?.value,
                document.getElementById('goal3')?.value
            ].filter(g => g?.trim());

            try {
                await Session.startSession(studentId, mode, goals);
                this.renderSessionPage();
            } catch (error) {
                this.showError('Failed to start session');
            }
        });
    },

    /**
     * Set up control room handlers
     */
    setupControlRoomHandlers() {
        // Timer toggle
        document.getElementById('timerToggle')?.addEventListener('click', () => {
            Session.toggleTimer();
            this.updateTimerUI();
        });

        // End session
        document.getElementById('endSessionBtn')?.addEventListener('click', async () => {
            if (confirm('End this session?')) {
                await Session.endSession();
                this.renderSessionPage();
            }
        });

        document.getElementById('confirmEndSession')?.addEventListener('click', async () => {
            await Session.endSession();
            this.renderSessionPage();
        });

        // Mode toggle
        document.querySelectorAll('.session-mode .toggle-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                await Session.setMode(btn.dataset.mode);
                document.querySelectorAll('.session-mode .toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Quick log buttons
        document.querySelectorAll('.quick-log-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.openQuickLogModal(btn.dataset.category);
            });
        });

        // Goal toggles
        document.querySelectorAll('.goal-item').forEach(item => {
            item.addEventListener('click', async () => {
                const index = parseInt(item.dataset.index);
                await Session.toggleGoal(index);
                item.classList.toggle('completed');
                item.querySelector('input').checked = item.classList.contains('completed');
            });
        });

        // De-escalation actions
        document.querySelectorAll('[data-deescalate]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.deescalate;
                const duration = btn.dataset.duration ? parseInt(btn.dataset.duration) : null;
                await Session.applyDeescalation(action, duration);

                if (action === 'reset_break' && duration) {
                    this.showBreakTimer(duration);
                } else {
                    this.showSuccess(`Applied: ${action.replace('_', ' ')}`);
                }
            });
        });

        // Script tabs
        document.querySelectorAll('.script-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.script-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const tone = tab.dataset.tone;
                const scriptEl = document.getElementById('currentScript');
                if (scriptEl && this.currentRecommendation) {
                    scriptEl.textContent = `"${this.getCurrentScript(this.currentRecommendation, tone)}"`;
                }
            });
        });
    },

    /**
     * Open quick log modal
     * @param {string} category - Category key
     */
    openQuickLogModal(category) {
        const cat = Methodology.getCategory(category);
        if (!cat) return;

        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal glass">
                <div class="modal-header">
                    <h3>${cat.icon} Log ${cat.label}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Severity</label>
                        <div class="severity-buttons">
                            <button class="severity-btn" data-severity="1">1 Minor</button>
                            <button class="severity-btn active" data-severity="2">2 Moderate</button>
                            <button class="severity-btn" data-severity="3">3 Major</button>
                            <button class="severity-btn" data-severity="4">4 Critical</button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Brief Description (≤20 words)</label>
                        <input type="text" id="incidentDesc" class="form-control" 
                               placeholder="What happened?" maxlength="200" autofocus>
                        <span class="word-count">0/20 words</span>
                    </div>
                    <div class="form-group">
                        <label>Context (Optional)</label>
                        <textarea id="incidentContext" class="form-control" 
                                  placeholder="Any additional context..." rows="2"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel">Cancel</button>
                    <button class="btn btn-primary" id="logIncidentBtn">Log Incident</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Severity buttons
        modal.querySelectorAll('.severity-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.severity-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Word count
        const descInput = modal.querySelector('#incidentDesc');
        const wordCount = modal.querySelector('.word-count');
        descInput?.addEventListener('input', () => {
            const words = Utils.wordCount(descInput.value);
            wordCount.textContent = `${words}/20 words`;
            wordCount.style.color = words > 20 ? 'var(--danger)' : '';
        });

        // Close handlers
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('.modal-cancel').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Log incident
        modal.querySelector('#logIncidentBtn').addEventListener('click', async () => {
            const severity = modal.querySelector('.severity-btn.active')?.dataset.severity || 2;
            const description = descInput.value.trim();
            const context = modal.querySelector('#incidentContext').value.trim();

            if (!description) {
                this.showError('Description is required');
                return;
            }

            if (Utils.wordCount(description) > 20) {
                this.showError('Description must be 20 words or less');
                return;
            }

            try {
                const result = await Incidents.quickLog(category, severity, description, context);
                modal.remove();
                this.showIncidentResult(result);
                this.renderSessionPage(); // Refresh counters
            } catch (error) {
                this.showError(error.message);
            }
        });

        // Focus description input
        descInput?.focus();
    },

    /**
     * Show incident result with AI recommendation
     */
    showIncidentResult(result) {
        if (!result.analysis) {
            this.showSuccess('Incident logged');
            return;
        }

        const analysis = result.analysis;
        const toast = document.createElement('div');
        toast.className = 'incident-toast glass';
        toast.innerHTML = `
            <div class="toast-header">
                <span class="icon">${analysis.source === 'ai' ? '🤖' : '📊'}</span>
                <span>Incident Logged - ${analysis.source === 'ai' ? 'AI Recommendation' : 'Standard Response'}</span>
                <button class="toast-close">&times;</button>
            </div>
            <div class="toast-body">
                <div class="rec-item">
                    <strong>Immediate Action:</strong> ${analysis.recommendedStep}
                </div>
                <div class="rec-item">
                    <strong>Recommended Script:</strong>
                    <div class="script-preview">"${analysis.scripts[analysis.recommendedTone] || analysis.scripts.neutral}"</div>
                </div>
                ${analysis.preventionTip ? `
                    <div class="rec-item">
                        <strong>Prevention Tip:</strong> ${analysis.preventionTip}
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(toast);

        // Auto-remove after 10 seconds
        setTimeout(() => toast.remove(), 10000);
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    },

    /**
     * Show break timer UI
     */
    showBreakTimer(duration) {
        Session.pauseTimer();

        const overlay = document.createElement('div');
        overlay.className = 'break-overlay';
        overlay.innerHTML = `
            <div class="break-timer-display glass">
                <h2>Reset Break</h2>
                <div class="break-countdown">${Utils.formatDuration(duration)}</div>
                <p>Take a breath. Reset expectations.</p>
                <button class="btn btn-secondary" id="endBreakBtn">End Early</button>
            </div>
        `;

        document.body.appendChild(overlay);

        const control = Session.startBreakTimer(
            duration,
            (remaining) => {
                overlay.querySelector('.break-countdown').textContent = Utils.formatDuration(remaining);
            },
            () => {
                overlay.remove();
                this.showSuccess('Break complete. Resuming session.');
            }
        );

        overlay.querySelector('#endBreakBtn').addEventListener('click', () => {
            control.stop();
            overlay.remove();
        });
    },

    /**
     * Update timer display
     */
    updateTimerDisplay(seconds) {
        const display = document.getElementById('timerDisplay');
        if (display) {
            display.textContent = Utils.formatDuration(seconds);
        }
    },

    /**
     * Update timer UI (button state)
     */
    updateTimerUI() {
        const btn = document.getElementById('timerToggle');
        if (btn) {
            btn.textContent = Session.timerRunning ? '⏸️' : '▶️';
        }
    },

    /**
     * Handle incident logged event
     */
    handleIncidentLogged(data) {
        // Update counters if on session page
        if (this.currentPage === 'session') {
            const { incident } = data;
            const countEl = document.querySelector(`.quick-log-btn[data-category="${incident.category}"] .count`);
            if (countEl) {
                countEl.textContent = parseInt(countEl.textContent) + 1;
            }

            // Update recent incidents list
            const listEl = document.getElementById('recentIncidentsList');
            if (listEl) {
                Session.getSessionSummary().then(summary => {
                    listEl.innerHTML = this.renderRecentIncidents(summary.incidents.slice(-5));
                });
            }
        }
    },

    /**
     * Render Rules Page
     */
    async renderRulesPage() {
        const main = document.getElementById('mainContent');
        const band = Session.currentStudent ? Utils.getGradeBand(Session.currentStudent.grade) : 'C';
        const rules = Methodology.getRules(band);

        main.innerHTML = `
            <div class="page-rules">
                <div class="rules-header glass">
                    <h2>Universal Session Rules</h2>
                    <p>These rules apply to all tutoring sessions.</p>
                    <div class="band-selector">
                        <label>Display for:</label>
                        <select id="ruleBandSelect" class="form-control">
                            <option value="A" ${band === 'A' ? 'selected' : ''}>Band A (Gr 1-2)</option>
                            <option value="B" ${band === 'B' ? 'selected' : ''}>Band B (Gr 3-5)</option>
                            <option value="C" ${band === 'C' ? 'selected' : ''}>Band C (Gr 6-8)</option>
                            <option value="D" ${band === 'D' ? 'selected' : ''}>Band D (Gr 9-10)</option>
                            <option value="E" ${band === 'E' ? 'selected' : ''}>Band E (Gr 11-13)</option>
                        </select>
                    </div>
                </div>

                <div class="rules-grid" id="rulesGrid">
                    ${rules.map(r => `
                        <div class="rule-card glass">
                            <span class="rule-icon">${r.icon}</span>
                            <h3>${r.rule}</h3>
                            <p>${r.description}</p>
                        </div>
                    `).join('')}
                </div>

                <div class="rules-actions">
                    <button id="fullscreenRulesBtn" class="btn btn-primary btn-large">
                        📺 Show Fullscreen Rules Card
                    </button>
                </div>
            </div>
        `;

        // Band selector
        document.getElementById('ruleBandSelect')?.addEventListener('change', (e) => {
            const newRules = Methodology.getRules(e.target.value);
            document.getElementById('rulesGrid').innerHTML = newRules.map(r => `
                <div class="rule-card glass">
                    <span class="rule-icon">${r.icon}</span>
                    <h3>${r.rule}</h3>
                    <p>${r.description}</p>
                </div>
            `).join('');
        });

        // Fullscreen button
        document.getElementById('fullscreenRulesBtn')?.addEventListener('click', () => {
            this.showFullscreenRules(document.getElementById('ruleBandSelect').value);
        });
    },

    /**
     * Show fullscreen rules card
     */
    showFullscreenRules(band) {
        const rules = Methodology.getRules(band);

        const overlay = document.createElement('div');
        overlay.className = 'fullscreen-overlay';
        overlay.innerHTML = `
            <div class="fullscreen-rules">
                <h1>📚 Session Rules</h1>
                <div class="fullscreen-rules-grid">
                    ${rules.map(r => `
                        <div class="fullscreen-rule">
                            <span class="icon">${r.icon}</span>
                            <span class="text">${r.rule}</span>
                        </div>
                    `).join('')}
                </div>
                <p class="fullscreen-cta">Let's have a great session! 🌟</p>
            </div>
        `;

        document.body.appendChild(overlay);

        // Enter fullscreen if possible
        if (overlay.requestFullscreen) {
            overlay.requestFullscreen();
        }

        overlay.addEventListener('click', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            }
            overlay.remove();
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                overlay.remove();
            }
        }, { once: true });
    },

    /**
     * Render Methodology Page
     */
    async renderMethodologyPage() {
        const main = document.getElementById('mainContent');
        const config = await Methodology.getConfig();
        const categories = Methodology.getCategoryKeys();

        main.innerHTML = `
            <div class="page-methodology">
                <div class="methodology-header glass">
                    <h2>Discipline Methodology</h2>
                    <p>Grade-aware discipline ladder system with escalation paths and scripts.</p>
                </div>

                <div class="methodology-tabs">
                    <button class="tab-btn active" data-tab="bands">Grade Bands</button>
                    <button class="tab-btn" data-tab="categories">Categories</button>
                    <button class="tab-btn" data-tab="severity">Severity Levels</button>
                </div>

                <div class="methodology-content" id="methodologyContent">
                    ${this.renderMethodologyBands(config)}
                </div>
            </div>
        `;

        // Tab handlers
        document.querySelectorAll('.methodology-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.methodology-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const content = document.getElementById('methodologyContent');
                switch (btn.dataset.tab) {
                    case 'bands':
                        content.innerHTML = this.renderMethodologyBands(config);
                        break;
                    case 'categories':
                        content.innerHTML = this.renderMethodologyCategories(config);
                        break;
                    case 'severity':
                        content.innerHTML = this.renderMethodologySeverity(config);
                        break;
                }
            });
        });
    },

    renderMethodologyBands(config) {
        return `
            <div class="bands-grid">
                ${Object.entries(config.gradeBands).map(([key, band]) => `
                    <div class="band-card glass band-${key.toLowerCase()}">
                        <h3>Band ${key}: ${band.name}</h3>
                        <p class="grades">Grades ${band.grades.join(', ')}</p>
                        <p class="description">${band.description}</p>
                        <ul class="band-details">
                            <li>Max Ladder Step: ${band.maxLadderStep}</li>
                            <li>Parent Contact: After ${band.parentContactThreshold} incidents</li>
                            <li>Session Stop: Consider at ${band.sessionStopThreshold * 2} incidents</li>
                        </ul>
                    </div>
                `).join('')}
            </div>
        `;
    },

    renderMethodologyCategories(config) {
        return `
            <div class="categories-accordion">
                ${Object.entries(config.categories).map(([key, cat]) => `
                    <details class="category-item glass">
                        <summary>
                            <span class="icon">${cat.icon}</span>
                            <span class="label">${cat.label}</span>
                            <span class="shortcut">Key: ${cat.keyboardShortcut}</span>
                        </summary>
                        <div class="category-details">
                            <p class="description">${cat.description}</p>
                            
                            <h4>Discipline Ladder</h4>
                            <ol class="ladder-list">
                                ${cat.ladder.map(step => `
                                    <li>
                                        <strong>${step.name}</strong>
                                        <span class="bands">(Bands: ${step.bands.join(', ')})</span>
                                        <p>${step.action}</p>
                                    </li>
                                `).join('')}
                            </ol>

                            <h4>Sample Scripts (Band C)</h4>
                            <div class="scripts-preview">
                                <div class="script gentle">
                                    <span class="tone">Gentle:</span>
                                    "${cat.scripts.gentle.C}"
                                </div>
                                <div class="script neutral">
                                    <span class="tone">Neutral:</span>
                                    "${cat.scripts.neutral.C}"
                                </div>
                                <div class="script firm">
                                    <span class="tone">Firm:</span>
                                    "${cat.scripts.firm.C}"
                                </div>
                            </div>
                        </div>
                    </details>
                `).join('')}
            </div>
        `;
    },

    renderMethodologySeverity(config) {
        return `
            <div class="severity-grid">
                ${Object.entries(config.severityLevels).map(([level, info]) => `
                    <div class="severity-card glass" style="border-color: ${info.color}">
                        <div class="severity-header" style="background: ${info.color}">
                            <span class="level">${level}</span>
                            <span class="name">${info.name}</span>
                        </div>
                        <p class="description">${info.description}</p>
                        <p class="action"><strong>Immediate:</strong> ${info.immediateAction}</p>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Render Incidents Page
     */
    async renderIncidentsPage() {
        const main = document.getElementById('mainContent');
        const incidents = await Incidents.getAllIncidents();
        const categories = Methodology.getCategoryButtons();

        main.innerHTML = `
            <div class="page-incidents">
                <div class="incidents-header glass">
                    <h2>Incident History</h2>
                    <div class="incidents-filters">
                        <select id="filterCategory" class="form-control">
                            <option value="">All Categories</option>
                            ${categories.map(c => `<option value="${c.key}">${c.icon} ${c.label}</option>`).join('')}
                        </select>
                        <select id="filterSeverity" class="form-control">
                            <option value="">All Severities</option>
                            <option value="1">1 Minor</option>
                            <option value="2">2 Moderate</option>
                            <option value="3">3 Major</option>
                            <option value="4">4 Critical</option>
                        </select>
                        <select id="filterResolved" class="form-control">
                            <option value="">All Status</option>
                            <option value="false">Unresolved</option>
                            <option value="true">Resolved</option>
                        </select>
                    </div>
                </div>

                <div class="incidents-list glass" id="incidentsList">
                    ${this.renderIncidentsList(incidents)}
                </div>
            </div>
        `;

        // Filter handlers
        const applyFilters = async () => {
            const filters = {
                category: document.getElementById('filterCategory').value || null,
                severity: document.getElementById('filterSeverity').value || null,
                resolved: document.getElementById('filterResolved').value === '' ? undefined :
                    document.getElementById('filterResolved').value === 'true'
            };
            const filtered = await Incidents.getAllIncidents(filters);
            document.getElementById('incidentsList').innerHTML = this.renderIncidentsList(filtered);
            this.setupIncidentRowHandlers();
        };

        document.getElementById('filterCategory')?.addEventListener('change', applyFilters);
        document.getElementById('filterSeverity')?.addEventListener('change', applyFilters);
        document.getElementById('filterResolved')?.addEventListener('change', applyFilters);

        this.setupIncidentRowHandlers();
    },

    renderIncidentsList(incidents) {
        if (!incidents || incidents.length === 0) {
            return '<p class="empty-state">No incidents found</p>';
        }

        return `
            <table class="incidents-table">
                <thead>
                    <tr>
                        <th>Date/Time</th>
                        <th>Category</th>
                        <th>Sev</th>
                        <th>Description</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${incidents.map(i => {
            const cat = Methodology.getCategory(i.category);
            const sev = Methodology.getSeverity(i.severity);
            return `
                            <tr class="incident-row" data-id="${i.id}">
                                <td>${Utils.formatDateTime(i.timestamp)}</td>
                                <td>${cat?.icon || '❓'} ${cat?.shortLabel || i.category}</td>
                                <td style="color: ${sev.color}">${i.severity}</td>
                                <td>${Utils.truncate(i.description, 50)}</td>
                                <td>${i.resolved ? '✅ Resolved' : '🔴 Open'}</td>
                            </tr>
                        `;
        }).join('')}
                </tbody>
            </table>
        `;
    },

    setupIncidentRowHandlers() {
        document.querySelectorAll('.incidents-table .incident-row').forEach(row => {
            row.addEventListener('click', () => this.showIncidentDetail(row.dataset.id));
        });
    },

    async showIncidentDetail(incidentId) {
        const detail = await Incidents.getIncidentDetails(incidentId);
        if (!detail) return;

        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal modal-large glass">
                <div class="modal-header">
                    <h3>${detail.categoryIcon} ${detail.categoryLabel}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="incident-detail-grid">
                        <div class="detail-section">
                            <h4>Incident Information</h4>
                            <p><strong>Date:</strong> ${detail.formattedTimestamp}</p>
                            <p><strong>Time into Session:</strong> ${detail.formattedTimeInSession}</p>
                            <p><strong>Severity:</strong> <span style="color: ${detail.severityInfo.color}">${detail.severityInfo.name} (${detail.severity})</span></p>
                            <p><strong>Description:</strong> ${Utils.escapeHTML(detail.description)}</p>
                            ${detail.context ? `<p><strong>Context:</strong> ${Utils.escapeHTML(detail.context)}</p>` : ''}
                        </div>

                        ${detail.session ? `
                        <div class="detail-section">
                            <h4>Session Information</h4>
                            <p><strong>Student:</strong> ${Utils.escapeHTML(detail.student?.name || 'Unknown')}</p>
                            <p><strong>Grade:</strong> ${detail.student?.grade || 'N/A'}</p>
                            <p><strong>Session Date:</strong> ${detail.session.date}</p>
                            <p><strong>Mode:</strong> ${detail.session.mode}</p>
                        </div>
                        ` : ''}

                        ${detail.analysis ? `
                        <div class="detail-section full-width">
                            <h4>AI Analysis ${detail.analysis.source === 'deterministic' ? '(Fallback)' : ''}</h4>
                            <p><strong>Confidence:</strong> ${detail.analysis.confidence}%</p>
                            <p><strong>Intent Hypothesis:</strong> ${detail.analysis.hypothesis}</p>
                            <p><strong>Recommended Action:</strong> ${detail.analysis.recommendedStep}</p>
                            ${detail.analysis.preventionTip ? `<p><strong>Prevention Tip:</strong> ${detail.analysis.preventionTip}</p>` : ''}
                        </div>
                        ` : ''}

                        ${detail.tutorDecision ? `
                        <div class="detail-section">
                            <h4>Tutor Decision</h4>
                            <p><strong>Action Taken:</strong> ${Utils.escapeHTML(detail.tutorDecision.action)}</p>
                            <p><strong>Tone Used:</strong> ${detail.tutorDecision.tone}</p>
                            ${detail.tutorDecision.notes ? `<p><strong>Notes:</strong> ${Utils.escapeHTML(detail.tutorDecision.notes)}</p>` : ''}
                        </div>
                        ` : ''}

                        ${detail.resolved ? `
                        <div class="detail-section">
                            <h4>Resolution</h4>
                            <p><strong>Outcome:</strong> ${Utils.escapeHTML(detail.outcome)}</p>
                            <p><strong>Resolved At:</strong> ${Utils.formatDateTime(detail.resolvedAt)}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="modal-footer">
                    ${!detail.resolved ? `
                        <button class="btn btn-primary" id="resolveIncidentBtn">Mark Resolved</button>
                    ` : ''}
                    <button class="btn btn-secondary modal-cancel">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('.modal-cancel').addEventListener('click', () => modal.remove());

        // Resolve handler
        modal.querySelector('#resolveIncidentBtn')?.addEventListener('click', async () => {
            const outcome = prompt('Enter resolution outcome:');
            if (outcome) {
                await Incidents.resolveIncident(incidentId, outcome);
                modal.remove();
                this.renderIncidentsPage();
            }
        });
    },

    /**
     * Render Reports Page
     */
    async renderReportsPage() {
        const main = document.getElementById('mainContent');
        const sessions = await DB.getAllSessions();
        const allIncidents = await DB.getAllIncidents();
        const patterns = Incidents.analyzePatterns(allIncidents);

        main.innerHTML = `
            <div class="page-reports">
                <div class="reports-header glass">
                    <h2>Reports & Insights</h2>
                </div>

                <div class="reports-grid">
                    <div class="report-card glass">
                        <h3>📊 Pattern Insights</h3>
                        ${patterns.hasPatterns ? `
                            <div class="insights-list">
                                ${patterns.insights.map(i => `<p class="insight">💡 ${i}</p>`).join('')}
                            </div>
                            ${patterns.topCategories.length > 0 ? `
                                <h4>Top Categories</h4>
                                <ul>
                                    ${patterns.topCategories.map(c => `<li>${c.label}: ${c.count} (${c.percentage}%)</li>`).join('')}
                                </ul>
                            ` : ''}
                            ${patterns.severityTrend.trend !== 'insufficient_data' ? `
                                <h4>Severity Trend: ${patterns.severityTrend.trend}</h4>
                            ` : ''}
                        ` : `
                            <p class="empty-state">Not enough data for pattern analysis</p>
                        `}
                    </div>

                    <div class="report-card glass">
                        <h3>📋 Session Reports</h3>
                        <p>Generate detailed reports for individual sessions.</p>
                        <select id="sessionReportSelect" class="form-control">
                            <option value="">Select a session...</option>
                            ${sessions.slice(0, 20).map(s => `
                                <option value="${s.id}">
                                    ${Utils.formatDateTime(s.startTime)} - ${s.status}
                                </option>
                            `).join('')}
                        </select>
                        <div class="report-actions">
                            <button id="viewReportBtn" class="btn btn-primary" disabled>View Report</button>
                            <button id="printReportBtn" class="btn btn-secondary" disabled>Print Report</button>
                        </div>
                    </div>

                    <div class="report-card glass">
                        <h3>📈 Overview Stats</h3>
                        <div class="stats-grid">
                            <div class="stat">
                                <span class="value">${sessions.length}</span>
                                <span class="label">Total Sessions</span>
                            </div>
                            <div class="stat">
                                <span class="value">${allIncidents.length}</span>
                                <span class="label">Total Incidents</span>
                            </div>
                            <div class="stat">
                                <span class="value">${allIncidents.filter(i => i.resolved).length}</span>
                                <span class="label">Resolved</span>
                            </div>
                            <div class="stat">
                                <span class="value">${sessions.length > 0 ? (allIncidents.length / sessions.length).toFixed(1) : 0}</span>
                                <span class="label">Avg per Session</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Report handlers
        const select = document.getElementById('sessionReportSelect');
        const viewBtn = document.getElementById('viewReportBtn');
        const printBtn = document.getElementById('printReportBtn');

        select?.addEventListener('change', () => {
            const hasSelection = !!select.value;
            viewBtn.disabled = !hasSelection;
            printBtn.disabled = !hasSelection;
        });

        viewBtn?.addEventListener('click', async () => {
            const sessionId = select.value;
            if (!sessionId) return;

            const session = await DB.getSession(sessionId);
            const student = await DB.getStudent(session.studentId);
            const incidents = await DB.getSessionIncidents(sessionId);
            const report = await Export.generateSessionReport(session, student, incidents);

            Export.openPrintReport(report);
        });

        printBtn?.addEventListener('click', async () => {
            const sessionId = select.value;
            if (!sessionId) return;

            const session = await DB.getSession(sessionId);
            const student = await DB.getStudent(session.studentId);
            const incidents = await DB.getSessionIncidents(sessionId);
            const report = await Export.generateSessionReport(session, student, incidents);

            Export.downloadReportHTML(report);
        });
    },

    /**
     * Render Settings Page
     */
    async renderSettingsPage() {
        const main = document.getElementById('mainContent');
        const settings = await DB.getSettings();

        main.innerHTML = `
            <div class="page-settings">
                <div class="settings-section glass">
                    <h2>⚙️ Settings</h2>

                    <div class="setting-group">
                        <h3>AI Configuration</h3>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="aiEnabled" ${settings.aiEnabled ? 'checked' : ''}>
                                Enable AI-powered recommendations
                            </label>
                            <p class="hint">When disabled, the app uses deterministic methodology logic only.</p>
                        </div>
                        <div class="form-group">
                            <label for="workerEndpoint">Worker Endpoint URL</label>
                            <input type="url" id="workerEndpoint" class="form-control" 
                                   value="${settings.workerEndpoint || ''}" 
                                   placeholder="https://your-worker.workers.dev">
                            <button id="testConnectionBtn" class="btn btn-small">Test Connection</button>
                            <span id="connectionStatus"></span>
                        </div>
                    </div>

                    <div class="setting-group">
                        <h3>Data Management</h3>
                        <div class="data-actions">
                            <button id="exportDataBtn" class="btn btn-primary">📤 Export All Data</button>
                            <label class="btn btn-secondary">
                                📥 Import Data
                                <input type="file" id="importDataInput" accept=".json" hidden>
                            </label>
                        </div>
                        <div class="danger-zone">
                            <h4>⚠️ Danger Zone</h4>
                            <button id="wipeDataBtn" class="btn btn-danger">🗑️ Wipe All Data</button>
                            <p class="hint">This cannot be undone. Export your data first!</p>
                        </div>
                    </div>

                    <div class="setting-group">
                        <h3>Privacy Information</h3>
                        <div class="privacy-info">
                            <p>✅ All data is stored locally in your browser (IndexedDB)</p>
                            <p>✅ No data is sent to any server except when AI is enabled</p>
                            <p>✅ AI requests go through your Cloudflare Worker only</p>
                            <p>✅ No tracking, no analytics, no cookies</p>
                            <p>✅ Works offline (AI features degrade gracefully)</p>
                        </div>
                    </div>

                    <button id="saveSettingsBtn" class="btn btn-primary btn-large">Save Settings</button>
                </div>
            </div>
        `;

        // Save settings
        document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
            const newSettings = {
                aiEnabled: document.getElementById('aiEnabled').checked,
                workerEndpoint: document.getElementById('workerEndpoint').value.trim()
            };

            await DB.saveSettings(newSettings);
            this.showSuccess('Settings saved');
        });

        // Test connection
        document.getElementById('testConnectionBtn')?.addEventListener('click', async () => {
            const endpoint = document.getElementById('workerEndpoint').value.trim();
            const status = document.getElementById('connectionStatus');

            status.textContent = 'Testing...';
            status.className = '';

            const result = await AI.testConnection(endpoint);
            status.textContent = result.message;
            status.className = result.success ? 'success' : 'error';
        });

        // Export data
        document.getElementById('exportDataBtn')?.addEventListener('click', async () => {
            await Export.downloadJSON();
            this.showSuccess('Data exported');
        });

        // Import data
        document.getElementById('importDataInput')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!confirm('This will replace all existing data. Continue?')) {
                e.target.value = '';
                return;
            }

            const result = await Export.importJSON(file);
            if (result.success) {
                this.showSuccess(result.message);
            } else {
                this.showError(result.message);
            }
            e.target.value = '';
        });

        // Wipe data
        document.getElementById('wipeDataBtn')?.addEventListener('click', async () => {
            const confirm1 = confirm('Are you sure you want to delete ALL data? This cannot be undone!');
            if (!confirm1) return;

            const confirm2 = prompt('Type "DELETE" to confirm:');
            if (confirm2 !== 'DELETE') {
                this.showError('Deletion cancelled');
                return;
            }

            await DB.clearAll();
            this.showSuccess('All data deleted');
            this.navigateTo('session');
        });
    },

    /**
     * Show success toast
     */
    showSuccess(message) {
        this.showToast(message, 'success');
    },

    /**
     * Show error toast
     */
    showError(message) {
        this.showToast(message, 'error');
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = App;
}

// Attach to window for browser global access
if (typeof window !== 'undefined') {
    window.App = App;
}

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
                            <button id="aiSuggestGoalsBtn" class="btn btn-ai btn-small" style="margin-top: 0.5rem;" disabled>
                                Suggest Goals
                            </button>
                        </div>

                        <div class="ai-quick-actions">
                            <button id="aiPrepBriefingBtn" class="btn btn-ai" disabled>
                                Session Prep Briefing
                            </button>
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

            if (!summary) {
                console.error('Active session found but summary is null');
                // Fallback to start screen if data is corrupt
                this.renderStartScreen();
                return;
            }

            const recommendation = Session.getNextRecommendation();
            const shouldStop = Session.checkSessionStop();

            main.innerHTML = `
                <div class="page-session control-room">
                    <!-- Header with timer and student info -->
                    <div class="session-header glass">
                        <div class="student-info">
                            <span class="student-name">${Utils.escapeHTML(summary.studentName || 'Student')}</span>
                            <span class="grade-badge band-${(summary.gradeBand || '3-5').toLowerCase()}">
                                Grade ${summary.studentGrade || '?'} • Band ${summary.gradeBand || '?'}
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
                        <!-- Recommendation Panel -->
                        <div class="recommendation-panel glass" id="recPanelContent">
                            ${this.renderRecommendationPanelContent(recommendation)}
                        </div>
                    </div>

                    <!-- AI Quick Actions -->
                    <div class="ai-insights-panel glass">
                        <h3>✨ AI Assistant</h3>
                        <div class="ai-quick-actions">
                            <button id="aiDeescalationBtn" class="btn btn-ai">🧘 De-escalation Coach</button>
                            <button id="aiSummaryBtn" class="btn btn-ai">📋 Generate Summary</button>
                            <button id="aiScriptBtn" class="btn btn-ai">📝 Get Script</button>
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
        if (!recommendation.category || !recommendation) return '';
        const band = Session.getGradeBand();
        return Methodology.getScript(recommendation.category, band, tone);
    },

    /**
     * Render the content of the recommendation panel
     */
    renderRecommendationPanelContent(recommendation) {
        if (!recommendation) return '';
        return `
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
        `;
    },

    /**
     * Update recommendation panel without full re-render
     */
    updateRecommendationPanel() {
        const panelEl = document.getElementById('recPanelContent');
        if (panelEl) {
            const recommendation = Session.getNextRecommendation();
            this.currentRecommendation = recommendation;
            panelEl.innerHTML = this.renderRecommendationPanelContent(recommendation);

            // Re-bind script tabs specifically in the new HTML
            const tabs = panelEl.querySelectorAll('.script-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');

                    const tone = tab.dataset.tone;
                    const scriptEl = panelEl.querySelector('#currentScript');
                    if (scriptEl && this.currentRecommendation) {
                        scriptEl.textContent = `"${this.getCurrentScript(this.currentRecommendation, tone)}"`;
                    }
                });
            });
        }
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
                            < div class="incident-row" data - id="${i.id}" >
                    <span class="time">${Utils.formatDuration(i.timeIntoSession || 0)}</span>
                    <span class="icon">${cat?.icon || '❓'}</span>
                    <span class="category">${cat?.shortLabel || i.category}</span>
                    <span class="severity" style="color: ${sev.color}">Sev ${i.severity}</span>
                    <span class="description">${Utils.truncate(i.description, 40)}</span>
                    <span class="status">${i.resolved ? '✅' : '🔴'}</span>
                </div >
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
                this.showSuccess(`Added ${name} `);
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
                this.showDeescalationCoachButton(); // Show floating coach button
                this.renderSessionPage();
            } catch (error) {
                this.showError('Failed to start session');
            }
        });

        // AI Prep Briefing button
        const prepBriefingBtn = document.getElementById('aiPrepBriefingBtn');
        const suggestGoalsBtn = document.getElementById('aiSuggestGoalsBtn');

        // Enable AI buttons when student is selected
        studentSelect?.addEventListener('change', () => {
            const hasStudent = !!studentSelect.value;
            if (prepBriefingBtn) prepBriefingBtn.disabled = !hasStudent;
            if (suggestGoalsBtn) suggestGoalsBtn.disabled = !hasStudent;
        });

        prepBriefingBtn?.addEventListener('click', async () => {
            const studentId = studentSelect.value;
            if (!studentId) return;
            const student = await DB.getStudent(studentId);
            if (student) {
                this.openPrepBriefing(student);
            }
        });

        suggestGoalsBtn?.addEventListener('click', async () => {
            const studentId = studentSelect.value;
            if (!studentId) return;
            const student = await DB.getStudent(studentId);
            if (student) {
                this.openGoalSuggestions(student);
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
                    this.showSuccess(`Applied: ${action.replace('_', ' ')} `);
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

        // AI feature buttons
        document.getElementById('aiDeescalationBtn')?.addEventListener('click', () => {
            this.openDeescalationCoach();
        });

        document.getElementById('aiSummaryBtn')?.addEventListener('click', () => {
            this.openSessionSummary();
        });

        document.getElementById('aiScriptBtn')?.addEventListener('click', async () => {
            const student = Session.currentStudent;
            if (!student) return;

            const situation = {
                description: prompt('What situation do you need a script for?') || 'General behavior redirection',
                category: this.currentRecommendation?.category
            };

            if (situation.description) {
                this.showAILoading('Generating Scripts');
                const result = await AI.generateScript(situation, student);

                if (!result) {
                    this.closeAIModal();
                    this.showError('AI scripts unavailable');
                    return;
                }

                const modal = document.querySelector('.ai-modal');
                if (modal) {
                    modal.querySelector('.ai-modal-body').innerHTML = `
    < div class="ai-scripts" >
        <div class="ai-script-item gentle">
            <div class="tone-label">Gentle</div>
            <p class="script-text">"${result.gentle}"</p>
            <button class="copy-script-btn" onclick="navigator.clipboard.writeText('${result.gentle.replace(/'/g, "\\'").replace(/"/g, '')}'); this.textContent='Copied!'">📋 Copy</button>
                            </div >
    <div class="ai-script-item neutral">
        <div class="tone-label">Neutral</div>
        <p class="script-text">"${result.neutral}"</p>
        <button class="copy-script-btn" onclick="navigator.clipboard.writeText('${result.neutral.replace(/'/g, "\\'").replace(/"/g, '')}'); this.textContent='Copied!'">📋 Copy</button>
                            </div >
    <div class="ai-script-item firm">
        <div class="tone-label">Firm</div>
        <p class="script-text">"${result.firm}"</p>
        <button class="copy-script-btn" onclick="navigator.clipboard.writeText('${result.firm.replace(/'/g, "\\'").replace(/"/g, '')}'); this.textContent='Copied!'">📋 Copy</button>
                            </div >
                        </div >
    ${result.tips?.length ? `
                        <div class="insight-item" style="margin-top: 1rem;">
                            <div class="icon">💡</div>
                            <div class="content">
                                <h4>Delivery Tips</h4>
                                <ul>${result.tips.map(t => `<li>${t}</li>`).join('')}</ul>
                            </div>
                        </div>
                        ` : ''
                        }
`;
                }
            }
        });

        // Show floating de-escalation button
        this.showDeescalationCoachButton();
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
    < div class="modal glass" >
                <div class="modal-header">
                    <h3>${cat.icon} Log ${cat.label}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="ai-severity-notice">
                        <span class="icon">🤖</span>
                        <span>AI will automatically determine severity based on context</span>
                    </div>
                    <div class="form-group">
                        <label>Brief Description (Optional)</label>
                        <input type="text" id="incidentDesc" class="form-control" 
                               placeholder="What happened? (AI will analyze)" maxlength="200" autofocus>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel">Cancel</button>
                    <button class="btn btn-primary" id="logIncidentBtn">
                        <span class="btn-text">Log & Analyze</span>
                        <span class="btn-loading hidden">Analyzing...</span>
                    </button>
                </div>
            </div >
    `;

        document.body.appendChild(modal);

        const descInput = modal.querySelector('#incidentDesc');
        const logBtn = modal.querySelector('#logIncidentBtn');

        // Close handlers
        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('.modal-cancel').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Log incident with smart analysis
        logBtn.addEventListener('click', async () => {
            const description = descInput.value.trim() || `${cat.label} incident`;

            // Show loading state
            logBtn.querySelector('.btn-text').classList.add('hidden');
            logBtn.querySelector('.btn-loading').classList.remove('hidden');
            logBtn.disabled = true;

            try {
                // Get session context for AI analysis
                const sessionSummary = await Session.getSessionSummary();
                const sessionContext = {
                    student: Session.currentStudent,
                    timeIntoSession: Math.floor(sessionSummary.durationSeconds / 60),
                    incidents: sessionSummary.incidents || [],
                    additionalContext: description,
                    currentIncidentDescription: description
                };

                // Get AI analysis (or deterministic fallback)
                const analysis = await AI.smartAnalyzeIncident(category, sessionContext);

                // Log the incident with AI-determined severity
                const result = await Incidents.quickLog(
                    category,
                    analysis.severity,
                    description,
                    analysis.severityReasoning
                );

                modal.remove();

                // Handle based on severity level
                if (analysis.severity >= 5) {
                    // Level 5: Terminating - show termination overlay and draft email
                    this.showTerminationOverlay(analysis, result.incident);
                } else if (analysis.severity >= 4) {
                    // Level 4: Critical - auto session stop, draft email, but timer continues
                    this.showSessionStopOverlay(analysis, result.incident);
                } else {
                    // Level 1-3: Show feedback
                    this.showSmartAnalysisResult(analysis, cat);
                }

            } catch (error) {
                this.showError(error.message);
                logBtn.querySelector('.btn-text').classList.remove('hidden');
                logBtn.querySelector('.btn-loading').classList.add('hidden');
                logBtn.disabled = false;
            }
        });

        // Focus description input
        descInput?.focus();
    },

    /**
     * Show smart analysis result with action recommendation
     * Grade-aware: prominent for younger students, subtle for older
     */
    showSmartAnalysisResult(analysis, category) {
        const urgencyColors = {
            low: 'var(--success)',
            medium: 'var(--warning)',
            high: 'var(--danger)',
            critical: '#ff0000'
        };

        const warningColors = {
            green: 'var(--success)',
            yellow: 'var(--warning)',
            orange: '#ff8c00',
            red: 'var(--danger)'
        };

        const isYounger = analysis.gradeApproach === 'external_structure' ||
            (Session.currentStudent?.grade && Session.currentStudent.grade <= 6);

        if (isYounger) {
            // PROMINENT VISUAL FEEDBACK for younger students
            this.showYoungerStudentFeedback(analysis, category, urgencyColors, warningColors);
        } else {
            // SUBTLE FEEDBACK for older students
            this.showOlderStudentFeedback(analysis, category, urgencyColors, warningColors);
        }
    },

    /**
     * Prominent visual feedback for younger students (Grades 1-6)
     * External structure: visible, immediate, clear
     * Features milestone-based progress bar toward consequences
     */
    /**
     * Prominent visual feedback for younger students (Grades 1-6)
     * External structure: visible, immediate, clear
     * Features milestone-based progress bar toward consequences
     */
    async showYoungerStudentFeedback(analysis, category, urgencyColors, warningColors) {
        // Remove any existing overlay
        document.querySelector('.severity-overlay')?.remove();

        const severityInfo = Methodology.getSeverity(analysis.severity);

        // Calculate progress based on cumulative severity
        // Ensure we have fresh incidents from session summary
        const sessionSummary = await Session.getSessionSummary();
        const incidents = sessionSummary.incidents || [];
        const progressPercent = this.calculateConsequenceProgress(incidents);

        const overlay = document.createElement('div');
        overlay.className = `severity - overlay severity - ${analysis.severity} `;
        overlay.innerHTML = `
    < div class="severity-display glass" >
                <div class="severity-header">
                    <div class="severity-number" style="background: ${severityInfo.color}">${analysis.severity}</div>
                    <div class="severity-info">
                        <h2>${category.label}</h2>
                        <div class="severity-name">${severityInfo.name}</div>
                    </div>
                    <button class="overlay-close">&times;</button>
                </div>
                
                <div class="script-to-say">
                    <div class="script-label">📢 Say to student:</div>
                    <div class="script-text">${analysis.actionPlan?.scriptForStudent || 'Focus on our work now.'}</div>
                </div>
                
                <!--Milestone Progress Bar-- >
                <div class="consequence-progress-milestones">
                    <div class="progress-label">⚡ Consequence Progress</div>
                    <div class="milestone-bar" style="--progress: ${progressPercent}%">
                        <div class="milestone-fill" style="width: ${progressPercent}%"></div>
                        <div class="milestone-markers">
                            <div class="milestone" style="left: 25%">
                                <div class="milestone-tick ${progressPercent >= 25 ? 'reached' : ''}"></div>
                                <div class="milestone-label">Verbal</div>
                            </div>
                            <div class="milestone" style="left: 50%">
                                <div class="milestone-tick ${progressPercent >= 50 ? 'reached' : ''}"></div>
                                <div class="milestone-label">Consequence</div>
                            </div>
                            <div class="milestone" style="left: 75%">
                                <div class="milestone-tick ${progressPercent >= 75 ? 'reached' : ''}"></div>
                                <div class="milestone-label">Parent</div>
                            </div>
                            <div class="milestone" style="left: 100%">
                                <div class="milestone-tick ${progressPercent >= 100 ? 'reached' : ''}"></div>
                                <div class="milestone-label">Stop</div>
                            </div>
                        </div>
                    </div>
                    <div class="progress-status ${progressPercent >= 100 ? 'critical' : progressPercent >= 75 ? 'warning' : ''}">
                        ${progressPercent >= 100 ? '🛑 Session Stop Reached' :
                progressPercent >= 75 ? '⚠️ Next: Session Stop' :
                    progressPercent >= 50 ? '📞 Next: Parent Contact' :
                        progressPercent >= 25 ? '⚡ Next: Consequence' :
                            '🔔 Next: Verbal Warning'}
                    </div>
                </div>
                
                <div class="action-section" style="border-left-color: ${urgencyColors[analysis.actionPlan?.urgency || 'low']}">
                    <div class="action-label" style="color: ${urgencyColors[analysis.actionPlan?.urgency || 'low']}">
                        ${analysis.actionPlan?.urgency?.toUpperCase() || 'ACTION'}
                    </div>
                    <p>${analysis.actionPlan?.message || 'Continue monitoring.'}</p>
                    ${analysis.actionPlan?.type === 'break' && analysis.actionPlan?.duration ? `
                        <button class="btn btn-primary start-break-btn" data-duration="${analysis.actionPlan.duration}">
                            ⏱️ Start ${analysis.actionPlan.duration}s Timer
                        </button>
                    ` : ''}
                </div>
                
                <button class="btn btn-secondary close-overlay-btn">Got it</button>
            </div >
    `;

        document.body.appendChild(overlay);

        // Close handlers
        overlay.querySelector('.overlay-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('.close-overlay-btn').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        // Break button handler
        overlay.querySelector('.start-break-btn')?.addEventListener('click', (e) => {
            const duration = parseInt(e.target.dataset.duration);
            overlay.remove();
            this.showBreakTimer(duration);
        });

        // Auto-close after 10 seconds for minor incidents
        if (analysis.severity <= 2) {
            setTimeout(() => overlay.remove(), 10000);
        }
    },

    /**
     * Calculate consequence progress as percentage (0-100)
     * Based on cumulative severity: L1=+10%, L2=+25%, L3=+50%, L4=100%
     */
    calculateConsequenceProgress(incidents = null) {
        // Use provided incidents or fallback to current session
        const incidentList = incidents || Session.currentSession?.incidents || [];
        if (!incidentList || incidentList.length === 0) return 0;

        let progress = 0;

        for (const incident of incidentList) {
            switch (incident.severity) {
                case 1: progress += 10; break;
                case 2: progress += 25; break;
                case 3: progress += 50; break;
                case 4: progress = 100; break; // L4 = instant full
                case 5: progress = 100; break; // L5 not on bar but still full
            }
        }

        return Math.min(100, progress);
    },

    /**
     * Subtle feedback for older students (Grades 7-12)
     * Internal accountability: dignified, logical, ownership-focused
     */
    showOlderStudentFeedback(analysis, category, urgencyColors, warningColors) {
        const toast = document.createElement('div');
        toast.className = 'action-recommendation-toast glass subtle';
        toast.innerHTML = `
    < div class="toast-header" >
                <span class="severity-indicator" style="background: ${Methodology.getSeverity(analysis.severity).color}"></span>
                <span class="title">${category.label}</span>
                <button class="toast-close">&times;</button>
            </div >
    <div class="toast-body">
        ${analysis.actionPlan?.scriptForStudent ? `
                    <p class="script-suggestion">"${analysis.actionPlan.scriptForStudent.replace(/"/g, '')}"</p>
                ` : ''}

        <div class="action-hint" style="color: ${urgencyColors[analysis.actionPlan?.urgency || 'low']}">
            ${analysis.actionPlan?.message || 'Continue as planned.'}
        </div>

        ${analysis.patternDetected ? `
                    <div class="pattern-note">
                        📊 ${analysis.patternDetected}
                    </div>
                ` : ''}

        ${analysis.actionPlan?.type === 'break' && analysis.actionPlan?.duration ? `
                    <button class="btn btn-small btn-secondary start-break-btn" data-duration="${analysis.actionPlan.duration}">
                        Quick break
                    </button>
                ` : ''}
    </div>
`;

        document.body.appendChild(toast);

        // Close handler
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());

        // Break button handler
        toast.querySelector('.start-break-btn')?.addEventListener('click', (e) => {
            const duration = parseInt(e.target.dataset.duration);
            this.showBreakTimer(duration);
            toast.remove();
        });

        // Auto-remove after 8 seconds (shorter for older students)
        setTimeout(() => toast.remove(), 8000);
    },

    /**
     * Show Level 4 Session Stop Overlay
     * Session timer CONTINUES after dismissal (doesn't auto-end)
     * Triggers AI email drafting for parent notification
     */
    async showSessionStopOverlay(analysis, incident) {
        // Pause the timer temporarily but session continues
        Session.pauseTimer();

        // Remove any existing overlays
        document.querySelector('.emergency-stop-overlay')?.remove();
        document.querySelector('.session-stop-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'session-stop-overlay level-4';
        overlay.innerHTML = `
    < div class="stop-content glass" >
                <div class="stop-header">
                    <div class="stop-icon">🛑</div>
                    <h1>LEVEL 4 - SESSION STOP</h1>
                </div>
                
                <div class="stop-details">
                    <div class="severity-badge critical">CRITICAL</div>
                    <p class="stop-reason">${analysis.severityReasoning || 'Critical incident requires session pause'}</p>
                    <div class="stop-time">${new Date().toLocaleTimeString()}</div>
                </div>
                
                <div class="stop-script">
                    <div class="script-label">📢 Say to student:</div>
                    <div class="script-text">${analysis.actionPlan?.scriptForStudent || 'Our lesson is stopping now. We will try again next time.'}</div>
                </div>
                
                <div class="email-draft-section">
                    <div class="email-status">
                        <span class="loading-spinner"></span>
                        <span>AI is drafting parent email...</span>
                    </div>
                    <div class="email-preview hidden"></div>
                </div>
                
                <div class="stop-actions">
                    <button class="btn btn-secondary continue-session-btn">Continue Session (Timer Runs)</button>
                    <button class="btn btn-primary end-session-btn">End Session Now</button>
                </div>
            </div >
    `;

        document.body.appendChild(overlay);

        // Play alert sound
        this.playAlertSound();

        // Draft AI email in background with robust error handling
        this.draftCriticalIncidentEmail(incident, overlay).catch(err => {
            console.error("Email draft failed:", err);
            const emailSection = overlay.querySelector('.email-draft-section');
            if (emailSection) {
                const statusEl = emailSection.querySelector('.email-status');
                if (statusEl) statusEl.innerHTML = '<span style="color: var(--warning)">⚠️ Email draft unavailable</span>';
            }
        });

        // Continue session handler (timer keeps running for more incidents)
        overlay.querySelector('.continue-session-btn').addEventListener('click', () => {
            overlay.remove();
            Session.resumeTimer(); // Resume the timer
            this.renderSessionPage();
            this.showSuccess('Session continuing. Timer is running. You can log more incidents if needed.');
        });

        // End session handler
        overlay.querySelector('.end-session-btn').addEventListener('click', async () => {
            overlay.remove();
            await Session.endSession();
            this.hideDeescalationCoachButton();
            this.renderSessionPage();
            this.showSuccess('Session ended. Email draft is ready.');
        });
    },

    /**
     * Show Level 5 Termination Overlay
     * Triggers AI email drafting for service termination notice
     */
    async showTerminationOverlay(analysis, incident) {
        // Pause timer
        Session.pauseTimer();

        // Remove any existing overlays
        document.querySelector('.emergency-stop-overlay')?.remove();
        document.querySelector('.session-stop-overlay')?.remove();
        document.querySelector('.termination-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'termination-overlay level-5';
        overlay.innerHTML = `
    < div class="termination-content glass" >
                <div class="termination-header">
                    <div class="termination-icon">⛔</div>
                    <h1>LEVEL 5 - SERVICE TERMINATION</h1>
                </div>
                
                <div class="termination-details">
                    <div class="severity-badge terminating">TERMINATING</div>
                    <p class="termination-reason">${analysis.severityReasoning || 'Severe or repeated violations - tutoring relationship cannot continue'}</p>
                    <div class="termination-time">${new Date().toLocaleTimeString()}</div>
                </div>
                
                <div class="termination-script">
                    <div class="script-label">📢 Say to student:</div>
                    <div class="script-text">${analysis.actionPlan?.scriptForStudent || 'I need to discuss with your parents. Our tutoring arrangement will need to end.'}</div>
                </div>
                
                <div class="email-draft-section">
                    <div class="email-status">
                        <span class="loading-spinner"></span>
                        <span>AI is drafting termination notice...</span>
                    </div>
                    <div class="email-preview hidden"></div>
                </div>
                
                <div class="termination-actions">
                    <button class="btn btn-primary end-session-btn">End Session & Confirm Termination</button>
                </div>
            </div >
    `;

        document.body.appendChild(overlay);

        // Play critical alert sound
        this.playAlertSound();

        // Draft AI termination email
        this.draftTerminationEmail(incident, overlay).catch(err => {
            console.error("Termination email draft failed:", err);
            const emailSection = overlay.querySelector('.email-draft-section');
            if (emailSection) {
                const statusEl = emailSection.querySelector('.email-status');
                if (statusEl) statusEl.innerHTML = '<span style="color: var(--warning)">⚠️ Email draft unavailable</span>';
            }
        });

        // End session handler
        overlay.querySelector('.end-session-btn').addEventListener('click', async () => {
            overlay.remove();
            await Session.endSession();
            this.hideDeescalationCoachButton();
            this.renderSessionPage();
            this.showSuccess('Session ended. Termination email draft is ready.');
        });
    },

    /**
     * Draft critical incident email (Level 4) via AI
     */
    async draftCriticalIncidentEmail(incident, overlay) {
        const emailSection = overlay.querySelector('.email-draft-section');
        if (!emailSection) return;

        const statusEl = emailSection.querySelector('.email-status');
        const previewEl = emailSection.querySelector('.email-preview');

        try {
            // Get all session incidents
            const sessionSummary = await Session.getSessionSummary();
            const allIncidents = sessionSummary.incidents || [];

            // Call AI to draft email
            const emailResult = await AI.draftCriticalIncidentEmail(
                incident,
                Session.currentStudent,
                allIncidents
            );

            // Hide loading state immediately
            statusEl.classList.add('hidden');

            if (emailResult) {
                previewEl.classList.remove('hidden');
                previewEl.innerHTML = `
    < div class="email-preview-card" >
                        <div class="email-subject"><strong>Subject:</strong> ${emailResult.subject}</div>
                        <div class="email-body">${emailResult.email.substring(0, 300)}...</div>
                        <div class="email-actions">
                            <button class="btn btn-small copy-email-btn">📋 Copy Full Email</button>
                            <button class="btn btn-small view-email-btn">👁️ View Full</button>
                        </div>
                    </div >
    `;

                // Copy email handler
                previewEl.querySelector('.copy-email-btn')?.addEventListener('click', () => {
                    const fullText = `Subject: ${emailResult.subject} \n\n${emailResult.email} `;
                    navigator.clipboard.writeText(fullText);
                    this.showSuccess('Email copied to clipboard');
                });

                // View full email handler
                previewEl.querySelector('.view-email-btn')?.addEventListener('click', () => {
                    this.showFullEmailModal(emailResult);
                });
            } else {
                // Should not happen as AI.js has fallback, but just in case
                statusEl.classList.remove('hidden');
                statusEl.innerHTML = '<span style="color: var(--warning)">⚠️ Email draft unavailable</span>';
            }
        } catch (error) {
            console.error("Error in draftCriticalIncidentEmail:", error);
            statusEl.classList.remove('hidden');
            statusEl.innerHTML = '<span style="color: var(--warning)">⚠️ Email draft unavailable</span>';
        }
    },

    /**
     * Draft termination email (Level 5) via AI
     */
    async draftTerminationEmail(incident, overlay) {
        const emailSection = overlay.querySelector('.email-draft-section');
        if (!emailSection) return;

        const statusEl = emailSection.querySelector('.email-status');
        const previewEl = emailSection.querySelector('.email-preview');

        try {
            // Get ALL incidents for this student (not just session)
            const allStudentIncidents = await DB.getIncidentsByStudent(Session.currentStudent.id);

            // Call AI to draft termination email
            const emailResult = await AI.draftTerminationEmail(
                incident,
                Session.currentStudent,
                allStudentIncidents
            );

            // Hide loading state
            statusEl.classList.add('hidden');

            if (emailResult) {
                previewEl.classList.remove('hidden');
                previewEl.innerHTML = `
    < div class="email-preview-card termination" >
                        <div class="email-subject"><strong>Subject:</strong> ${emailResult.subject}</div>
                        <div class="email-body">${emailResult.email.substring(0, 300)}...</div>
                        <div class="email-actions">
                            <button class="btn btn-small copy-email-btn">📋 Copy Full Email</button>
                            <button class="btn btn-small view-email-btn">👁️ View Full</button>
                        </div>
                    </div >
    `;

                // Copy email handler
                previewEl.querySelector('.copy-email-btn')?.addEventListener('click', () => {
                    const fullText = `Subject: ${emailResult.subject} \n\n${emailResult.email} `;
                    navigator.clipboard.writeText(fullText);
                    this.showSuccess('Termination email copied to clipboard');
                });

                // View full email handler
                previewEl.querySelector('.view-email-btn')?.addEventListener('click', () => {
                    this.showFullEmailModal(emailResult);
                });
            } else {
                statusEl.classList.remove('hidden');
                statusEl.innerHTML = '<span style="color: var(--warning)">⚠️ Email draft unavailable</span>';
            }
        } catch (error) {
            console.error("Error in draftTerminationEmail:", error);
            statusEl.classList.remove('hidden');
            statusEl.innerHTML = '<span style="color: var(--warning)">⚠️ Email draft unavailable</span>';
        }
    },

    /**
     * Show full email in a modal
     */
    showFullEmailModal(emailResult) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
    < div class="modal glass email-modal" >
                <div class="modal-header">
                    <h3>📧 ${emailResult.subject}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="full-email-content">${emailResult.email.replace(/\n/g, '<br>')}</div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary copy-all-btn">📋 Copy to Clipboard</button>
                    <button class="btn btn-secondary close-btn">Close</button>
                </div>
            </div >
    `;

        document.body.appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
        modal.querySelector('.close-btn').addEventListener('click', () => modal.remove());
        modal.querySelector('.copy-all-btn').addEventListener('click', () => {
            const fullText = `Subject: ${emailResult.subject} \n\n${emailResult.email} `;
            navigator.clipboard.writeText(fullText);
            this.showSuccess('Email copied!');
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    /**
     * Play alert sound for critical incidents
     */
    playAlertSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQ==');
            audio.play().catch(() => { });
        } catch (e) { }
    },

    /**
     * Show emergency session stop overlay (legacy - kept for compatibility)
     */
    showEmergencyStop(reason) {
        // Pause the timer
        Session.pauseTimer();

        // Remove any existing overlay
        document.querySelector('.emergency-stop-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'emergency-stop-overlay';
        overlay.innerHTML = `
    < div class="emergency-content" >
                <div class="stop-icon">🛑</div>
                <h1>SESSION STOPPED</h1>
                <p class="stop-reason">${reason || 'Critical threshold reached'}</p>
                <div class="stop-time">${new Date().toLocaleTimeString()}</div>
                <button class="btn btn-large acknowledge-btn">Acknowledge & End Session</button>
            </div >
    `;

        document.body.appendChild(overlay);

        // Play alert sound if available
        this.playAlertSound();

        // Acknowledge handler
        overlay.querySelector('.acknowledge-btn').addEventListener('click', async () => {
            overlay.remove();
            await Session.endSession();
            this.hideDeescalationCoachButton();
            this.renderSessionPage();
            this.showSuccess('Session ended. Take a moment before starting a new one.');
        });
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
    < div class="toast-header" >
                <span class="icon">${analysis.source === 'ai' ? '🤖' : '📊'}</span>
                <span>Incident Logged - ${analysis.source === 'ai' ? 'AI Recommendation' : 'Standard Response'}</span>
                <button class="toast-close">&times;</button>
            </div >
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
    < div class="break-timer-display glass" >
                <h2>Reset Break</h2>
                <div class="break-countdown">${Utils.formatDuration(duration)}</div>
                <p>Take a breath. Reset expectations.</p>
                <button class="btn btn-secondary" id="endBreakBtn">End Early</button>
            </div >
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
            const countEl = document.querySelector(`.quick - log - btn[data - category="${incident.category}"] .count`);
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

            // Update recommendation panel dynamically without full refresh
            this.updateRecommendationPanel();
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
    < div class="page-rules" >
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
            </div >
    `;

        // Band selector
        document.getElementById('ruleBandSelect')?.addEventListener('change', (e) => {
            const newRules = Methodology.getRules(e.target.value);
            document.getElementById('rulesGrid').innerHTML = newRules.map(r => `
    < div class="rule-card glass" >
                    <span class="rule-icon">${r.icon}</span>
                    <h3>${r.rule}</h3>
                    <p>${r.description}</p>
                </div >
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
    < div class="fullscreen-rules" >
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
            </div >
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
    < div class="page-methodology" >
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
            </div >
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
    < div class="bands-grid" >
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
                `).join('')
            }
            </div >
    `;
    },

    renderMethodologyCategories(config) {
        return `
    < div class="categories-accordion" >
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
                `).join('')
            }
            </div >
    `;
    },

    renderMethodologySeverity(config) {
        return `
    < div class="severity-intro glass" style = "margin-bottom: var(--space-4); padding: var(--space-4);" >
                <h3 style="margin-bottom: var(--space-2);">Formal Severity Definitions</h3>
                <p style="color: var(--text-secondary); margin: 0;">Severity levels are age-agnostic. Only the <em>mapping</em> of behaviors to levels changes by grade.</p>
            </div >
    <div class="severity-grid">
        ${Object.entries(config.severityLevels).map(([level, info]) => `
                    <div class="severity-card glass" style="border-color: ${info.color}">
                        <div class="severity-header" style="background: ${info.color}">
                            <span class="level">${level}</span>
                            <span class="name">${info.name}</span>
                        </div>
                        <p class="description">${info.description}</p>
                        ${info.characteristics ? `
                            <ul class="severity-characteristics" style="margin: var(--space-2) 0; padding-left: var(--space-4); color: var(--text-secondary); font-size: var(--font-size-sm);">
                                ${info.characteristics.map(c => `<li>${c}</li>`).join('')}
                            </ul>
                        ` : ''}
                        <p class="action" style="background: var(--bg-tertiary); padding: var(--space-2); border-radius: var(--radius-sm); margin-top: var(--space-2);"><strong>Immediate:</strong> ${info.immediateAction}</p>
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
        const students = await DB.getAllStudents();
        const sessions = await DB.getAllSessions();
        const categories = Methodology.getCategoryButtons();

        // Create map of sessionId -> studentId for fallback
        const sessionStudentMap = {};
        sessions.forEach(s => sessionStudentMap[s.id] = s.studentId);

        // Group incidents by student
        const incidentsByStudent = {};
        incidents.forEach(inc => {
            let studentId = inc.studentId;

            // Fallback: try to resolve studentId from session
            if (!studentId && inc.sessionId) {
                studentId = sessionStudentMap[inc.sessionId];
            }

            studentId = studentId || 'unknown';

            if (!incidentsByStudent[studentId]) {
                incidentsByStudent[studentId] = [];
            }
            incidentsByStudent[studentId].push(inc);
        });

        main.innerHTML = `
    < div class="page-incidents" >
                <div class="incidents-header glass">
                    <h2>Incident History</h2>
                    <div class="incidents-filters">
                        <select id="filterStudent" class="form-control">
                            <option value="">All Students</option>
                            ${students.map(s => `<option value="${s.id}">${Utils.escapeHTML(s.name)} (Grade ${s.grade})</option>`).join('')}
                        </select>
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
                            <option value="5">5 Terminating</option>
                        </select>
                    </div>
                </div>

                <div class="incidents-by-student" id="incidentsByStudent">
                    ${this.renderIncidentsByStudent(incidentsByStudent, students)}
                </div>
            </div >
    `;

        // Filter handlers
        const applyFilters = async () => {
            const studentFilter = document.getElementById('filterStudent').value || null;
            const categoryFilter = document.getElementById('filterCategory').value || null;
            const severityFilter = document.getElementById('filterSeverity').value || null;

            const filters = {
                studentId: studentFilter,
                category: categoryFilter,
                severity: severityFilter ? parseInt(severityFilter) : null
            };

            const filtered = await Incidents.getAllIncidents(filters);

            // Regroup by student
            const filteredByStudent = {};
            filtered.forEach(inc => {
                const studentId = inc.studentId || 'unknown';
                if (!filteredByStudent[studentId]) {
                    filteredByStudent[studentId] = [];
                }
                filteredByStudent[studentId].push(inc);
            });

            document.getElementById('incidentsByStudent').innerHTML =
                this.renderIncidentsByStudent(filteredByStudent, students, studentFilter);
            this.setupIncidentRowHandlers();
            this.setupPdfExportHandlers();
        };

        document.getElementById('filterStudent')?.addEventListener('change', applyFilters);
        document.getElementById('filterCategory')?.addEventListener('change', applyFilters);
        document.getElementById('filterSeverity')?.addEventListener('change', applyFilters);

        this.setupIncidentRowHandlers();
        this.setupPdfExportHandlers();
    },

    /**
     * Render incidents grouped by student
     */
    renderIncidentsByStudent(incidentsByStudent, students, filterStudentId = null) {
        const studentMap = {};
        students.forEach(s => studentMap[s.id] = s);

        // If filtering by specific student, show only that student
        const studentIds = filterStudentId
            ? [filterStudentId]
            : Object.keys(incidentsByStudent);

        if (studentIds.length === 0 || (filterStudentId && !incidentsByStudent[filterStudentId])) {
            return '<p class="empty-state">No incidents found</p>';
        }

        return studentIds.map(studentId => {
            const studentIncidents = incidentsByStudent[studentId] || [];
            if (studentIncidents.length === 0) return '';

            const student = studentMap[studentId];
            const studentName = student?.name || 'Unknown Student';
            const studentGrade = student?.grade || 'N/A';

            // Calculate stats
            const criticalCount = studentIncidents.filter(i => i.severity >= 4).length;
            const unresolvedCount = studentIncidents.filter(i => !i.resolved).length;

            return `
    < div class="student-incidents-section glass" data - student - id="${studentId}" >
                    <div class="student-header">
                        <div class="student-info">
                            <h3>${Utils.escapeHTML(studentName)}</h3>
                            <span class="student-grade">Grade ${studentGrade}</span>
                            <span class="incident-count">${studentIncidents.length} incident${studentIncidents.length !== 1 ? 's' : ''}</span>
                            ${criticalCount > 0 ? `<span class="critical-badge">${criticalCount} critical</span>` : ''}
                            ${unresolvedCount > 0 ? `<span class="unresolved-badge">${unresolvedCount} unresolved</span>` : ''}
                        </div>
                        <div class="student-actions">
                            <button class="btn btn-small btn-secondary export-pdf-btn" data-student-id="${studentId}">
                                📄 Export PDF
                            </button>
                        </div>
                    </div>
                    <div class="student-incidents-table">
                        ${this.renderIncidentsList(studentIncidents)}
                    </div>
                </div >
    `;
        }).join('');
    },

    /**
     * Setup PDF export button handlers
     */
    setupPdfExportHandlers() {
        document.querySelectorAll('.export-pdf-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const studentId = btn.dataset.studentId;
                await this.exportStudentIncidentsPDF(studentId);
            });
        });
    },

    /**
     * Export student's incident history as PDF (uses browser print)
     */
    async exportStudentIncidentsPDF(studentId) {
        // Open window IMMEDIATELY to satisfy popup blockers
        const printWindow = window.open('', '_blank');

        if (!printWindow) {
            this.showError('Popup blocked. Please allow popups for this site.');
            return;
        }

        printWindow.document.write('<h1>Generating Report...</h1>');

        try {
            const student = await DB.getStudent(studentId);
            const incidents = await DB.getIncidentsByStudent(studentId);

            if (!student || incidents.length === 0) {
                printWindow.close();
                this.showError('No incidents to export');
                return;
            }

            // Create printable content
            const content = this.generateIncidentReportHTML(student, incidents);

            printWindow.document.open();
            printWindow.document.write(content);
            printWindow.document.close();

            // Wait for content to load then print
            printWindow.onload = () => {
                printWindow.focus();
                printWindow.print();
            };
        } catch (e) {
            printWindow.close();
            console.error('Export failed:', e);
            this.showError('Failed to generate export');
        }
    },

    /**
     * Generate HTML for incident report PDF
     */
    generateIncidentReportHTML(student, incidents) {
        const categories = {};
        const severityCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

        incidents.forEach(inc => {
            categories[inc.category] = (categories[inc.category] || 0) + 1;
            severityCounts[inc.severity] = (severityCounts[inc.severity] || 0) + 1;
        });

        return `
    < !DOCTYPE html >
        <html>
            <head>
                <title>Incident Report - ${Utils.escapeHTML(student.name)}</title>
                <style>
                    body {font - family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                    h1 {color: #333; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px; }
                    h2 {color: #555; margin-top: 30px; }
                    .header-info {display: flex; justify-content: space-between; margin-bottom: 20px; background: #f5f5f5; padding: 15px; border-radius: 8px; }
                    .header-info p {margin: 5px 0; }
                    table {width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th, td {border: 1px solid #ddd; padding: 10px; text-align: left; }
                    th {background: #8b5cf6; color: white; }
                    tr:nth-child(even) {background: #f9f9f9; }
                    .severity-1 {color: #22c55e; }
                    .severity-2 {color: #eab308; }
                    .severity-3 {color: #f97316; }
                    .severity-4 {color: #ef4444; }
                    .severity-5 {color: #7f1d1d; font-weight: bold; }
                    .summary-grid {display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
                    .summary-card {background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: center; }
                    .summary-card h3 {margin: 0; font-size: 24px; color: #8b5cf6; }
                    .summary-card p {margin: 5px 0 0; color: #666; }
                    .footer {margin - top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #888; text-align: center; }
                    @media print {body {padding: 0; } }
                </style>
            </head>
            <body>
                <h1>📊 Incident Report</h1>

                <div class="header-info">
                    <div>
                        <p><strong>Student:</strong> ${Utils.escapeHTML(student.name)}</p>
                        <p><strong>Grade:</strong> ${student.grade}</p>
                    </div>
                    <div>
                        <p><strong>Report Generated:</strong> ${new Date().toLocaleDateString()}</p>
                        <p><strong>Total Incidents:</strong> ${incidents.length}</p>
                    </div>
                </div>

                <div class="summary-grid">
                    <div class="summary-card">
                        <h3>${severityCounts[4] + severityCounts[5]}</h3>
                        <p>Critical/Terminating</p>
                    </div>
                    <div class="summary-card">
                        <h3>${incidents.filter(i => !i.resolved).length}</h3>
                        <p>Unresolved</p>
                    </div>
                    <div class="summary-card">
                        <h3>${Object.keys(categories).length}</h3>
                        <p>Categories</p>
                    </div>
                </div>

                <h2>All Incidents</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Category</th>
                            <th>Severity</th>
                            <th>Description</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${incidents.map(inc => {
            const cat = Methodology.getCategory(inc.category);
            return `
                                <tr>
                                    <td>${Utils.formatDateTime(inc.timestamp)}</td>
                                    <td>${cat?.label || inc.category}</td>
                                    <td class="severity-${inc.severity}">${inc.severity}</td>
                                    <td>${Utils.escapeHTML(inc.description || '')}</td>
                                    <td>${inc.resolved ? '✅ Resolved' : '⏳ Open'}</td>
                                </tr>
                            `;
        }).join('')}
                    </tbody>
                </table>

                <div class="footer">
                    <p>Generated by Session Order OS | Confidential Student Record</p>
                </div>
            </body>
        </html>
`;
    },

    renderIncidentsList(incidents) {
        if (!incidents || incidents.length === 0) {
            return '<p class="empty-state">No incidents found</p>';
        }

        return `
    < table class="incidents-table" >
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
            </table >
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
    < div class="modal modal-large glass" >
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
            </div >
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
    < div class="page-reports" >
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
                        <button id="aiPatternInsightsBtn" class="btn btn-ai" style="margin-top: 1rem;">
                            🤖 Get AI Pattern Insights
                        </button>
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
            </div >
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

        // AI Pattern Insights button
        document.getElementById('aiPatternInsightsBtn')?.addEventListener('click', () => {
            this.openPatternInsights();
        });
    },

    /**
     * Render Settings Page
     */
    async renderSettingsPage() {
        const main = document.getElementById('mainContent');
        const settings = await DB.getSettings();

        main.innerHTML = `
    < div class="page-settings" >
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
            </div >
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

    // ========================================
    // AI FEATURE UI HELPERS
    // ========================================

    /**
     * Show AI modal with content
     */
    showAIModal(title, content, footer = '') {
        // Remove existing modal
        document.querySelector('.ai-modal')?.remove();

        const modal = document.createElement('div');
        modal.className = 'ai-modal';
        modal.innerHTML = `
    < div class="ai-modal-content glass" >
                <div class="ai-modal-header">
                    <h3>✨ ${title}</h3>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="ai-modal-body">
                    ${content}
                </div>
                ${footer ? `<div class="ai-modal-footer">${footer}</div>` : ''}
            </div >
    `;

        document.body.appendChild(modal);

        // Close handlers
        modal.querySelector('.close-btn').addEventListener('click', () => this.closeAIModal());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeAIModal();
        });

        return modal;
    },

    /**
     * Close AI modal
     */
    closeAIModal() {
        document.querySelector('.ai-modal')?.remove();
    },

    /**
     * Show AI loading modal
     */
    showAILoading(title) {
        return this.showAIModal(title, `
    < div class="ai-loading" >
                <div class="spinner"></div>
                <p>AI is thinking...</p>
            </div >
    `);
    },

    /**
     * Open De-escalation Coach
     */
    async openDeescalationCoach() {
        const student = Session.currentStudent;
        if (!student) {
            this.showError('No active session');
            return;
        }

        const modal = this.showAILoading('De-escalation Coach');

        const situation = {
            description: prompt('Briefly describe the situation:') || 'Student is becoming frustrated',
            currentState: 'Escalating'
        };

        if (!situation.description) {
            this.closeAIModal();
            return;
        }

        const result = await AI.getDeescalationCoaching(situation, student);

        if (!result) {
            modal.querySelector('.ai-modal-body').innerHTML = `
    < div class="ai-unavailable" >
                    <div class="icon">🤖</div>
                    <p>AI is currently unavailable. Try these steps:</p>
                    <ul style="text-align:left">
                        <li>Take a deep breath</li>
                        <li>Lower your voice and slow down</li>
                        <li>Ask: "What do you need right now?"</li>
                        <li>Consider a short break</li>
                    </ul>
                </div >
    `;
            return;
        }

        modal.querySelector('.ai-modal-body').innerHTML = `
    < div class="ai-response-card" style = "margin-top: 1.5rem;" >
                <h4>🚨 Immediate Action</h4>
                <p><strong>${result.immediateAction}</strong></p>
            </div >
            
            <div class="ai-script-item neutral">
                <div class="tone-label">Say This</div>
                <p class="script-text">"${result.script}"</p>
            </div>
            
            <div class="insight-item">
                <div class="icon">🧘</div>
                <div class="content">
                    <h4>Breathing Prompt</h4>
                    <p>${result.breathingPrompt}</p>
                </div>
            </div>
            
            <div class="insight-item">
                <div class="icon">🎮</div>
                <div class="content">
                    <h4>Activity Suggestion</h4>
                    <p>${result.activitySuggestion}</p>
                </div>
            </div>
            
            ${result.dontDo?.length ? `
            <div class="insight-item">
                <div class="icon">⚠️</div>
                <div class="content">
                    <h4>Avoid Doing</h4>
                    <ul>${result.dontDo.map(d => `<li>${d}</li>`).join('')}</ul>
                </div>
            </div>
            ` : ''
            }

<div class="insight-item">
    <div class="icon">🔄</div>
    <div class="content">
        <h4>Recovery Plan</h4>
        <p>${result.recoveryPlan}</p>
    </div>
</div>
`;
    },

    /**
     * Open Session Prep Briefing
     */
    async openPrepBriefing(student) {
        const modal = this.showAILoading('Session Prep Briefing');

        // Get student's incident history
        const incidents = await Incidents.getStudentIncidents(student.id);
        const result = await AI.getSessionPrepBriefing(student, incidents);

        if (!result) {
            modal.querySelector('.ai-modal-body').innerHTML = `
    < div class="ai-unavailable" >
                    <div class="icon">🤖</div>
                    <p>AI prep briefing unavailable. No prior incidents to analyze.</p>
                </div >
    `;
            return;
        }

        modal.querySelector('.ai-modal-body').innerHTML = `
    < div class="risk-indicator ${result.riskLevel?.toLowerCase() || 'low'}" >
        Risk Level: ${result.riskLevel || 'Low'}
            </div >

    ${result.keyPatterns?.length ? `
            <div class="ai-response-card" style="margin-top: 1.5rem;">
                <h4>📊 Key Patterns</h4>
                <ul>${result.keyPatterns.map(p => `<li>${p}</li>`).join('')}</ul>
            </div>
            ` : ''
            }
            
            ${result.proactiveStrategies?.length ? `
            <div class="ai-response-card">
                <h4>🎯 Proactive Strategies</h4>
                <ul>${result.proactiveStrategies.map(s => `<li>${s}</li>`).join('')}</ul>
            </div>
            ` : ''
            }
            
            ${result.watchTimes?.length ? `
            <div class="insight-item">
                <div class="icon">⏰</div>
                <div class="content">
                    <h4>Watch Times</h4>
                    <p>${result.watchTimes.join(', ')}</p>
                </div>
            </div>
            ` : ''
            }
            
            ${result.positiveNotes?.length ? `
            <div class="insight-item">
                <div class="icon">✨</div>
                <div class="content">
                    <h4>Positive Notes</h4>
                    <ul>${result.positiveNotes.map(n => `<li>${n}</li>`).join('')}</ul>
                </div>
            </div>
            ` : ''
            }

<div class="insight-item">
    <div class="icon">💡</div>
    <div class="content">
        <h4>Suggested Approach</h4>
        <p>${result.suggestedApproach || 'Start positive and establish rapport.'}</p>
    </div>
</div>
`;
    },

    /**
     * Open AI Goal Suggestions modal
     */
    async openGoalSuggestions(student) {
        const modal = this.showAILoading('AI Goal Suggestions');

        const incidents = await Incidents.getStudentIncidents(student.id);
        const result = await AI.suggestGoals(student, incidents.slice(-10), []);

        if (!result) {
            modal.querySelector('.ai-modal-body').innerHTML = `
    < div class="ai-unavailable" >
                    <div class="icon">🤖</div>
                    <p>AI goal suggestions unavailable.</p>
                </div >
    `;
            return;
        }

        modal.querySelector('.ai-modal-body').innerHTML = `
    < div class="ai-goals-list" >
        <div class="ai-goal-item primary" onclick="this.classList.toggle('selected')">
            <div class="goal-check">✓</div>
            <div class="goal-text">
                <h4>🎯 ${result.primaryGoal}</h4>
                <p>Primary goal for this session</p>
            </div>
        </div>
                ${result.secondaryGoals?.map(g => `
                    <div class="ai-goal-item" onclick="this.classList.toggle('selected')">
                        <div class="goal-check"></div>
                        <div class="goal-text">
                            <h4>${g}</h4>
                        </div>
                    </div>
                `).join('') || ''
            }
                ${result.microGoals?.map(g => `
                    <div class="ai-goal-item" onclick="this.classList.toggle('selected')">
                        <div class="goal-check"></div>
                        <div class="goal-text">
                            <h4>⚡ ${g}</h4>
                            <p>Quick win goal</p>
                        </div>
                    </div>
                `).join('') || ''
            }
            </div >

    ${result.rationale ? `
            <div class="insight-item" style="margin-top: 1rem;">
                <div class="icon">💭</div>
                <div class="content">
                    <h4>Why These Goals?</h4>
                    <p>${result.rationale}</p>
                </div>
            </div>
            ` : ''
            }
`;

        modal.querySelector('.ai-modal-footer')?.remove();
        const footer = document.createElement('div');
        footer.className = 'ai-modal-footer';
        footer.innerHTML = `< button class="btn btn-primary" id = "applyGoalsBtn" > Apply Selected Goals</button > `;
        modal.querySelector('.ai-modal-content').appendChild(footer);

        footer.querySelector('#applyGoalsBtn').addEventListener('click', () => {
            const selected = modal.querySelectorAll('.ai-goal-item.selected .goal-text h4');
            const goals = Array.from(selected).map(el => el.textContent.replace(/^[🎯⚡]\s*/, ''));

            // Update goal inputs
            goals.slice(0, 3).forEach((goal, i) => {
                const input = document.getElementById(`goal${i + 1} `);
                if (input) input.value = goal;
            });

            this.closeAIModal();
            this.showSuccess(`${goals.length} goals applied`);
        });
    },

    /**
     * Open Session Summary generator
     */
    async openSessionSummary() {
        const summary = await Session.getSessionSummary();
        if (!summary) {
            this.showError('No active session');
            return;
        }

        const modal = this.showAILoading('Session Summary Generator');

        const student = Session.currentStudent;
        const incidents = summary.incidents || [];
        const result = await AI.generateSessionSummary(summary, student, incidents);

        if (!result) {
            modal.querySelector('.ai-modal-body').innerHTML = `
    < div class="ai-unavailable" >
                    <div class="icon">🤖</div>
                    <p>AI summary generation unavailable.</p>
                </div >
    `;
            return;
        }

        modal.querySelector('.ai-modal-body').innerHTML = `
    < div class="risk-indicator ${result.overallRating === 'excellent' ? 'low' : result.overallRating === 'good' ? 'low' : result.overallRating === 'challenging' ? 'medium' : 'high'}" >
        Session Rating: ${result.overallRating?.charAt(0).toUpperCase() + result.overallRating?.slice(1)}
            </div >

    <div class="ai-response-card" style="margin-top: 1.5rem;">
        <h4>📋 Summary</h4>
        <p>${result.summary}</p>
    </div>
            
            ${result.positiveHighlights?.length ? `
            <div class="insight-item">
                <div class="icon">✨</div>
                <div class="content">
                    <h4>Positive Highlights</h4>
                    <ul>${result.positiveHighlights.map(h => `<li>${h}</li>`).join('')}</ul>
                </div>
            </div>
            ` : ''
            }
            
            ${result.recommendationsForNextSession?.length ? `
            <div class="insight-item">
                <div class="icon">📝</div>
                <div class="content">
                    <h4>For Next Session</h4>
                    <ul>${result.recommendationsForNextSession.map(r => `<li>${r}</li>`).join('')}</ul>
                </div>
            </div>
            ` : ''
            }
            
            ${result.parentFriendlyVersion ? `
            <div class="ai-response-card">
                <h4>👨‍👩‍👧 Parent-Friendly Version</h4>
                <p style="font-style: italic;">${result.parentFriendlyVersion}</p>
                <button class="copy-script-btn" onclick="navigator.clipboard.writeText('${result.parentFriendlyVersion.replace(/'/g, "\\'")}'); this.textContent='Copied!'">📋 Copy</button>
            </div>
            ` : ''
            }
`;
    },

    /**
     * Open Pattern Insights
     */
    async openPatternInsights() {
        const modal = this.showAILoading('AI Pattern Insights');

        const incidents = await DB.getAllIncidents();
        const result = await AI.getPatternInsights(incidents, 30);

        if (!result) {
            modal.querySelector('.ai-modal-body').innerHTML = `
    < div class="ai-unavailable" >
                    <div class="icon">🤖</div>
                    <p>AI pattern analysis unavailable or insufficient data.</p>
                </div >
    `;
            return;
        }

        modal.querySelector('.ai-modal-body').innerHTML = `
    < div class="risk-indicator ${result.overallTrend === 'improving' ? 'low' : result.overallTrend === 'stable' ? 'medium' : 'high'}" >
        Trend: ${result.overallTrend?.charAt(0).toUpperCase() + result.overallTrend?.slice(1)}
            </div >

    <p style="margin: 1rem 0;">${result.trendSummary}</p>
            
            ${result.topCategories?.length ? `
            <div class="ai-response-card">
                <h4>📊 Top Categories</h4>
                <div class="ai-predictions">
                    ${result.topCategories.map(c => `
                        <div class="prediction-item ${c.trend === 'up' ? 'high' : c.trend === 'down' ? 'low' : 'medium'}">
                            <span class="category">${c.category}</span>
                            <span class="percentage">${c.count} incidents (${c.trend})</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''
            }
            
            ${result.improvingAreas?.length ? `
            <div class="insight-item">
                <div class="icon">📈</div>
                <div class="content">
                    <h4>Improving Areas</h4>
                    <ul>${result.improvingAreas.map(a => `<li>${a}</li>`).join('')}</ul>
                </div>
            </div>
            ` : ''
            }
            
            ${result.concerningPatterns?.length ? `
            <div class="insight-item">
                <div class="icon">⚠️</div>
                <div class="content">
                    <h4>Concerning Patterns</h4>
                    <ul>${result.concerningPatterns.map(p => `<li>${p}</li>`).join('')}</ul>
                </div>
            </div>
            ` : ''
            }
            
            ${result.methodologyAdjustments?.length ? `
            <div class="ai-response-card">
                <h4>💡 Suggested Adjustments</h4>
                <ul>${result.methodologyAdjustments.map(a => `<li>${a}</li>`).join('')}</ul>
            </div>
            ` : ''
            }
`;
    },

    /**
     * Show floating de-escalation coach button during session
     */
    showDeescalationCoachButton() {
        // Remove existing
        document.getElementById('deescalationCoachBtn')?.remove();

        const btn = document.createElement('button');
        btn.id = 'deescalationCoachBtn';
        btn.className = 'deescalation-coach-btn';
        btn.innerHTML = '🧘';
        btn.title = 'De-escalation Coach';
        btn.addEventListener('click', () => this.openDeescalationCoach());

        document.body.appendChild(btn);
    },

    /**
     * Hide floating de-escalation coach button
     */
    hideDeescalationCoachButton() {
        document.getElementById('deescalationCoachBtn')?.remove();
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
        toast.className = `toast toast - ${type} `;
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

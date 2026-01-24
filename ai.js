/**
 * Session Order OS - AI Communication Module
 * Handles all AI-related communication through Cloudflare Worker
 * NEVER communicates directly with DeepSeek
 */

const AI = {
    /**
     * Check if AI is enabled and configured
     * @returns {Promise<boolean>}
     */
    async isEnabled() {
        const settings = await DB.getSettings();
        return settings.aiEnabled && settings.workerEndpoint && Utils.isOnline();
    },

    /**
     * Get the worker endpoint URL
     * @returns {Promise<string|null>}
     */
    async getEndpoint() {
        const settings = await DB.getSettings();
        return settings.workerEndpoint || null;
    },

    /**
     * Build the context payload for AI analysis
     * @param {Object} incident - Incident data
     * @param {Object} student - Student data
     * @param {Object} session - Session data
     * @returns {Object} Context payload
     */
    buildContextPayload(incident, student, session) {
        const grade = student.grade;
        const band = Utils.getGradeBand(grade);
        const bandInfo = Methodology.defaultConfig.gradeBands[band];
        const category = Methodology.getCategory(incident.category);

        return {
            // Student context
            student: {
                grade: grade,
                band: band,
                bandName: bandInfo ? bandInfo.name : 'Unknown'
            },

            // Session context
            session: {
                mode: session.mode,
                timeIntoSession: incident.timeIntoSession || 0,
                disciplineState: session.disciplineState
            },

            // Incident details
            incident: {
                category: incident.category,
                categoryLabel: category ? category.label : incident.category,
                severityGuess: incident.severity,
                description: incident.description,
                context: incident.context || ''
            },

            // Methodology constraints
            methodology: {
                maxLadderStep: bandInfo ? bandInfo.maxLadderStep : 5,
                parentContactThreshold: bandInfo ? bandInfo.parentContactThreshold : 5,
                allowedConsequences: category ? category.consequences.allowed : [],
                notAllowedConsequences: category ? category.consequences.notAllowed : [],
                ladderSummary: category ? category.ladder.filter(s => s.bands.includes(band)).map(s => ({
                    step: s.step,
                    action: s.action
                })) : []
            }
        };
    },

    /**
     * Analyze an incident using AI
     * @param {Object} incident - Incident data
     * @param {Object} student - Student data  
     * @param {Object} session - Session data
     * @returns {Promise<Object>} Analysis result or fallback
     */
    async analyzeIncident(incident, student, session) {
        // Check if AI is available
        if (!(await this.isEnabled())) {
            console.log('AI not enabled or offline, using deterministic fallback');
            return this.getFallbackAnalysis(incident, session);
        }

        const endpoint = await this.getEndpoint();
        if (!endpoint) {
            console.log('No worker endpoint configured, using deterministic fallback');
            return this.getFallbackAnalysis(incident, session);
        }

        try {
            // Build the context payload
            const payload = this.buildContextPayload(incident, student, session);

            // Call the worker
            const response = await this.callWorker(endpoint, payload);

            // Validate the response
            const validation = Validate.validateAIResponse(response);
            if (!validation.valid) {
                console.warn('AI response validation failed:', validation.errors);
                return {
                    ...this.getFallbackAnalysis(incident, session),
                    aiErrors: validation.errors
                };
            }

            return {
                ...validation.sanitized,
                source: 'ai'
            };

        } catch (error) {
            console.error('AI analysis failed:', error.message);
            return {
                ...this.getFallbackAnalysis(incident, session),
                aiError: error.message
            };
        }
    },

    /**
     * Call the Cloudflare Worker
     * @param {string} endpoint - Worker URL
     * @param {Object} payload - Request payload
     * @returns {Promise<Object>} AI response
     */
    async callWorker(endpoint, payload) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

        try {
            const response = await fetch(`${endpoint}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Worker error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            clearTimeout(timeout);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            throw error;
        }
    },

    /**
     * Get deterministic fallback analysis when AI is unavailable
     * @param {Object} incident - Incident data
     * @param {Object} session - Session data
     * @returns {Object} Fallback analysis
     */
    getFallbackAnalysis(incident, session) {
        const student = session.studentId ? { grade: 6 } : { grade: 6 }; // Default if unknown
        const band = Utils.getGradeBand(student.grade);

        const recommendation = Methodology.getDeterministicRecommendation(
            incident,
            session.disciplineState,
            band
        );

        // Convert to AI response format
        return {
            category: incident.category,
            severity: incident.severity,
            confidence: 0.7, // Lower confidence for deterministic
            intentHypothesis: {
                label: 'Unable to determine - using standard response',
                confidence: 0.5,
                alternatives: []
            },
            recommendedResponse: {
                immediateStep: recommendation.immediateAction,
                ladderAction: recommendation.ladderStep ? recommendation.ladderStep.action : 'Redirect attention',
                ladderStepSuggested: recommendation.ladderStep ? recommendation.ladderStep.step : 1,
                restorative: recommendation.restorative,
                consequence: null
            },
            script: recommendation.scripts,
            preventionTip: 'Consider environmental factors and check for underlying issues.',
            fairnessNotes: ['Using standard methodology - AI was unavailable for personalized analysis'],
            source: 'deterministic',
            recommendedTone: recommendation.recommendedTone
        };
    },

    /**
     * Test connection to worker
     * @param {string} endpoint - Worker URL to test
     * @returns {Promise<Object>} {success: boolean, message: string}
     */
    async testConnection(endpoint) {
        if (!Validate.validateWorkerEndpoint(endpoint)) {
            return { success: false, message: 'Invalid endpoint URL' };
        }

        try {
            const response = await fetch(`${endpoint}/health`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    message: `Connected successfully. Worker version: ${data.version || 'unknown'}`
                };
            } else {
                return {
                    success: false,
                    message: `Worker responded with status ${response.status}`
                };
            }
        } catch (error) {
            return {
                success: false,
                message: `Connection failed: ${error.message}`
            };
        }
    },

    /**
     * Format AI analysis for display
     * @param {Object} analysis - AI analysis result
     * @returns {Object} Formatted for UI display
     */
    formatForDisplay(analysis) {
        if (!analysis) return null;

        const severity = Methodology.getSeverity(analysis.severity);

        return {
            category: analysis.category,
            categoryLabel: Methodology.getCategory(analysis.category)?.label || analysis.category,
            severity: {
                level: analysis.severity,
                name: severity.name,
                color: severity.color
            },
            confidence: Math.round((analysis.confidence || 0) * 100),
            source: analysis.source,
            hypothesis: analysis.intentHypothesis?.label || 'Unknown',
            recommendedStep: analysis.recommendedResponse?.immediateStep || 'No recommendation',
            ladderStep: analysis.recommendedResponse?.ladderStepSuggested || 1,
            scripts: analysis.script || {},
            restorative: analysis.recommendedResponse?.restorative,
            consequence: analysis.recommendedResponse?.consequence,
            preventionTip: analysis.preventionTip,
            fairnessNotes: analysis.fairnessNotes || [],
            recommendedTone: analysis.recommendedTone || 'neutral'
        };
    },

    // ========================================
    // NEW AI FEATURES (10 features)
    // ========================================

    /**
     * Call the unified /ai endpoint
     * @param {string} action - The AI action type
     * @param {Object} context - Context for the action
     * @returns {Promise<Object>} AI result or null on failure
     */
    async callAIFeature(action, context) {
        if (!(await this.isEnabled())) {
            console.log('AI not enabled or offline');
            return null;
        }

        const endpoint = await this.getEndpoint();
        if (!endpoint) {
            console.log('No worker endpoint configured');
            return null;
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 20000);

            const response = await fetch(`${endpoint}/ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, context }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('AI feature error:', errorText);
                return null;
            }

            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('AI feature call failed:', error.message);
            return null;
        }
    },

    /**
     * 1. Session Prep Briefing
     * Get AI-generated briefing before starting a session
     * @param {Object} student - Student data
     * @param {Array} incidentHistory - Past incidents for this student
     * @returns {Promise<Object>} Prep briefing
     */
    async getSessionPrepBriefing(student, incidentHistory = []) {
        const band = Utils.getGradeBand(student.grade);
        const bandInfo = Methodology.defaultConfig.gradeBands[band];

        // Summarize incident history
        const categoryCounts = {};
        incidentHistory.forEach(i => {
            categoryCounts[i.category] = (categoryCounts[i.category] || 0) + 1;
        });

        const incidentSummary = incidentHistory.slice(-10).map(i =>
            `- ${i.category} (Sev ${i.severity}): ${i.description?.substring(0, 50) || 'No description'}`
        ).join('\n');

        const patterns = Object.entries(categoryCounts)
            .map(([cat, count]) => `${cat}: ${count} incidents`)
            .join(', ');

        const context = {
            grade: student.grade,
            bandName: bandInfo?.name || 'Unknown',
            incidentCount: incidentHistory.length,
            incidentSummary: incidentSummary || 'No prior incidents',
            patterns: patterns || 'No patterns detected'
        };

        return await this.callAIFeature('prep-briefing', context);
    },

    /**
     * 2. Smart Incident Description Generator
     * Auto-generate incident description from category/severity
     * @param {Object} incidentInfo - Category, severity, time context
     * @param {Object} student - Student data
     * @returns {Promise<Object>} Generated description
     */
    async generateDescription(incidentInfo, student) {
        const category = Methodology.getCategory(incidentInfo.category);

        const context = {
            category: incidentInfo.category,
            categoryLabel: category?.label || incidentInfo.category,
            severity: incidentInfo.severity,
            timeIntoSession: incidentInfo.timeIntoSession || 0,
            grade: student?.grade || 6,
            additionalContext: incidentInfo.additionalContext || ''
        };

        return await this.callAIFeature('generate-description', context);
    },

    /**
     * 3. Real-time De-escalation Coach
     * Get immediate de-escalation guidance
     * @param {Object} situation - Current situation details
     * @param {Object} student - Student data
     * @returns {Promise<Object>} De-escalation guidance
     */
    async getDeescalationCoaching(situation, student) {
        const band = Utils.getGradeBand(student?.grade || 6);
        const bandInfo = Methodology.defaultConfig.gradeBands[band];

        const context = {
            situation: situation.description || 'Student is becoming upset',
            grade: student?.grade || 6,
            bandName: bandInfo?.name || 'Unknown',
            currentState: situation.currentState || 'Escalating',
            whatHappened: situation.whatHappened || 'Behavior escalating'
        };

        return await this.callAIFeature('deescalation-coach', context);
    },

    /**
     * 4. Session Summary Generator
     * Generate end-of-session summary
     * @param {Object} session - Session data
     * @param {Object} student - Student data
     * @param {Array} incidents - Incidents from this session
     * @returns {Promise<Object>} Session summary
     */
    async generateSessionSummary(session, student, incidents = []) {
        const context = {
            studentName: student?.name || 'Student',
            grade: student?.grade || 6,
            duration: session.duration || 0,
            mode: session.mode || 'in-person',
            incidents: incidents.map(i => ({
                category: i.category,
                description: i.description,
                severity: i.severity
            })),
            goals: session.goals || [],
            goalsMet: session.goalsMet || 'Not tracked'
        };

        return await this.callAIFeature('session-summary', context);
    },

    /**
     * 5. Weekly Pattern Insights
     * Analyze patterns across sessions
     * @param {Array} incidents - All incidents to analyze
     * @param {number} daysToAnalyze - Number of days to analyze
     * @returns {Promise<Object>} Pattern insights
     */
    async getPatternInsights(incidents = [], daysToAnalyze = 30) {
        // Build category breakdown
        const categoryCounts = {};
        incidents.forEach(i => {
            categoryCounts[i.category] = (categoryCounts[i.category] || 0) + 1;
        });
        const categoryBreakdown = Object.entries(categoryCounts)
            .map(([cat, count]) => `${cat}: ${count}`)
            .join('\n');

        // Build time patterns
        const timePatterns = incidents.reduce((acc, i) => {
            const hour = new Date(i.createdAt).getHours();
            const key = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        const timePatternsStr = Object.entries(timePatterns)
            .map(([time, count]) => `${time}: ${count}`)
            .join(', ');

        const context = {
            daysAnalyzed: daysToAnalyze,
            totalIncidents: incidents.length,
            categoryBreakdown: categoryBreakdown || 'No data',
            timePatterns: timePatternsStr || 'No data',
            studentCount: 1
        };

        return await this.callAIFeature('pattern-insights', context);
    },

    /**
     * 6. Custom Script Generator
     * Generate personalized discipline scripts
     * @param {Object} situation - Situation details
     * @param {Object} student - Student data
     * @returns {Promise<Object>} Generated scripts
     */
    async generateScript(situation, student) {
        const band = Utils.getGradeBand(student?.grade || 6);
        const bandInfo = Methodology.defaultConfig.gradeBands[band];

        const context = {
            situation: situation.description || 'General behavior issue',
            grade: student?.grade || 6,
            bandName: bandInfo?.name || 'Unknown',
            category: situation.category || 'General',
            desiredOutcome: situation.desiredOutcome || 'Return to task',
            tonePreference: situation.tone || 'balanced'
        };

        return await this.callAIFeature('generate-script', context);
    },

    /**
     * 7. Parent Email Drafter
     * Draft professional parent communication
     * @param {Object} student - Student data
     * @param {Array} incidents - Incidents to include
     * @param {Object} options - Email options
     * @returns {Promise<Object>} Drafted emails
     */
    async draftParentEmail(student, incidents = [], options = {}) {
        const context = {
            studentName: student?.name || 'Your child',
            grade: student?.grade || 6,
            incidents: incidents.map(i => ({
                category: i.category,
                description: i.description
            })),
            actionsTaken: options.actionsTaken || 'Addressed in session',
            tutorNotes: options.tutorNotes || '',
            tone: options.tone || 'informational'
        };

        return await this.callAIFeature('draft-email', context);
    },

    /**
     * 8. AI Goal Suggestions
     * Suggest session goals based on history
     * @param {Object} student - Student data
     * @param {Array} recentIncidents - Recent incidents
     * @param {Array} previousGoals - Goals from past sessions
     * @returns {Promise<Object>} Goal suggestions
     */
    async suggestGoals(student, recentIncidents = [], previousGoals = []) {
        const band = Utils.getGradeBand(student?.grade || 6);
        const bandInfo = Methodology.defaultConfig.gradeBands[band];

        const recentSummary = recentIncidents.slice(-5).map(i =>
            `- ${i.category}: ${i.description?.substring(0, 40) || ''}`
        ).join('\n');

        const context = {
            grade: student?.grade || 6,
            bandName: bandInfo?.name || 'Unknown',
            recentIncidents: recentSummary || 'None',
            previousGoals: previousGoals.join(', ') || 'None set',
            goalSuccess: 'Not tracked',
            sessionType: 'Regular tutoring'
        };

        return await this.callAIFeature('suggest-goals', context);
    },

    /**
     * 9. Behavior Prediction
     * Predict likely behavior issues
     * @param {Object} student - Student data
     * @param {Array} historicalIncidents - Past incidents
     * @param {Object} sessionContext - Current session context
     * @returns {Promise<Object>} Behavior predictions
     */
    async predictBehavior(student, historicalIncidents = [], sessionContext = {}) {
        const band = Utils.getGradeBand(student?.grade || 6);
        const bandInfo = Methodology.defaultConfig.gradeBands[band];

        // Build historical patterns
        const categoryCounts = {};
        historicalIncidents.forEach(i => {
            categoryCounts[i.category] = (categoryCounts[i.category] || 0) + 1;
        });
        const patterns = Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([cat, count]) => `${cat} (${count} times)`)
            .join(', ');

        const now = new Date();
        const context = {
            grade: student?.grade || 6,
            bandName: bandInfo?.name || 'Unknown',
            sessionTime: now.getHours() < 12 ? 'Morning' : now.getHours() < 17 ? 'Afternoon' : 'Evening',
            plannedDuration: sessionContext.duration || 60,
            historicalPatterns: patterns || 'No history',
            dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()],
            daysSinceLastSession: sessionContext.daysSinceLastSession || 'Unknown',
            lastSessionSummary: sessionContext.lastSessionSummary || 'Unknown'
        };

        return await this.callAIFeature('predict-behavior', context);
    },

    /**
     * 10. Resolution Advisor
     * Get step-by-step incident resolution
     * @param {Object} incident - The incident to resolve
     * @param {Object} student - Student data
     * @param {Object} actionsTaken - Actions already taken
     * @returns {Promise<Object>} Resolution steps
     */
    async getResolutionSteps(incident, student, actionsTaken = {}) {
        const band = Utils.getGradeBand(student?.grade || 6);
        const bandInfo = Methodology.defaultConfig.gradeBands[band];
        const category = Methodology.getCategory(incident.category);

        const context = {
            category: incident.category,
            categoryLabel: category?.label || incident.category,
            description: incident.description || 'No description',
            severity: incident.severity,
            grade: student?.grade || 6,
            bandName: bandInfo?.name || 'Unknown',
            actionsTaken: actionsTaken.description || 'None yet',
            studentResponse: actionsTaken.studentResponse || 'Unknown'
        };

        return await this.callAIFeature('resolution-steps', context);
    }
};


// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AI;
}

// Attach to window for browser global access
if (typeof window !== 'undefined') {
    window.AI = AI;
}

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
    },

    /**
     * 11. Smart Analyze Incident
     * Auto-determines severity and provides session intelligence
     * @param {string} category - Incident category
     * @param {Object} sessionContext - Current session state
     * @returns {Promise<Object>} Severity, action plan, and session status
     */
    async smartAnalyzeIncident(category, sessionContext) {
        const student = sessionContext.student;
        const band = Utils.getGradeBand(student?.grade || 6);
        const bandInfo = Methodology.defaultConfig.gradeBands[band];
        const categoryInfo = Methodology.getCategory(category);

        const context = {
            category: category,
            categoryLabel: categoryInfo?.label || category,
            grade: student?.grade || 6,
            bandName: bandInfo?.name || 'Unknown',
            timeIntoSession: sessionContext.timeIntoSession || 0,
            sessionIncidents: sessionContext.incidents || [],
            additionalContext: sessionContext.additionalContext || ''
        };

        // Try AI first
        const result = await this.callAIFeature('smart-analyze', context);

        // If AI available, return result
        if (result) {
            return result;
        }

        // Fallback: deterministic severity calculation
        return this.getDeterministicSmartAnalysis(category, sessionContext);
    },

    /**
     * Deterministic fallback for smart analysis when AI unavailable
     */
    getDeterministicSmartAnalysis(category, sessionContext) {
        const incidents = sessionContext.incidents || [];
        const timeIntoSession = sessionContext.timeIntoSession || 0;
        const student = sessionContext.student || {};
        const grade = student.grade || 6;

        // Determine grade approach
        const isYounger = grade <= 6;
        const gradeApproach = isYounger ? 'external_structure' : 'internal_accountability';

        // Count incidents of same type
        const sameTypeCount = incidents.filter(i => i.category === category).length;

        // Count recent incidents (last 10 min)
        const recentIncidents = incidents.filter(i => {
            const incTime = i.timeIntoSession || 0;
            return (timeIntoSession - incTime) <= 10;
        });

        // Get grade-aware BASE severity (not starting at 1!)
        let severity = this.getGradeAwareBaseSeverity(category, grade);

        // Escalation factors (can still increase from base)
        if (sameTypeCount >= 2) severity = Math.min(4, severity + 1);
        if (recentIncidents.length >= 3) severity = Math.min(4, severity + 1);
        if (timeIntoSession > 45) severity = Math.min(4, severity + 1); // Late session fatigue
        if (incidents.some(i => i.severity >= 3)) severity = Math.min(4, severity + 1); // Prior major incident

        // Get category info for messaging
        const categoryInfo = Methodology.getCategory(category);
        const categoryLabel = categoryInfo?.label || category;

        // Grade-appropriate scripts
        const scripts = this.getGradeAppropriateScripts(categoryLabel, severity, isYounger, incidents.length);

        // Determine action plan based on grade
        let actionPlan = {
            type: 'continue',
            urgency: 'low',
            message: scripts.tutorMessage,
            scriptForStudent: scripts.studentScript,
            duration: null,
            showVisualFeedback: isYounger
        };

        if (severity >= 2 || recentIncidents.length >= 2) {
            actionPlan = {
                type: 'break',
                urgency: 'medium',
                message: isYounger
                    ? 'Time for a reset break. Use the visual timer.'
                    : 'Consider a brief pause to refocus.',
                scriptForStudent: isYounger
                    ? "We're going to take a short break to reset. Watch the timer."
                    : "Let's pause for a moment. Take a breath and refocus.",
                duration: 60,
                showVisualFeedback: isYounger
            };
        }

        if (severity >= 3 || recentIncidents.length >= 4) {
            actionPlan = {
                type: 'reduce_difficulty',
                urgency: 'high',
                message: isYounger
                    ? 'Switch to an easier activity. Structure is needed.'
                    : 'Time to adjust our approach. What would help you focus?',
                scriptForStudent: isYounger
                    ? "We're going to try something different now. I need you to follow along."
                    : "The current approach isn't working. What do you need to get back on track?",
                duration: null,
                showVisualFeedback: isYounger
            };
        }

        // Determine if session should stop
        let shouldStop = false;
        let stopReason = null;
        let warningLevel = 'green';
        let warningMessage = 'Session proceeding normally';
        let incidentsToConsequence = isYounger ? Math.max(0, 5 - incidents.length - 1) : null;

        if (incidents.length >= 3 && severity >= 2) {
            warningLevel = 'yellow';
            warningMessage = isYounger
                ? `${incidentsToConsequence} more before consequence`
                : 'Multiple incidents - watch the pattern';
        }

        if (recentIncidents.length >= 4 || incidents.filter(i => i.severity >= 3).length >= 2) {
            warningLevel = 'orange';
            warningMessage = isYounger
                ? 'Close to session end - one more major incident'
                : 'Escalation pattern - discuss with student';
            incidentsToConsequence = isYounger ? 1 : null;
        }

        if (incidents.length >= 5 && severity >= 3 || incidents.filter(i => i.severity >= 4).length >= 1) {
            shouldStop = true;
            stopReason = isYounger
                ? 'Too many incidents. We need to stop and reset for next time.'
                : 'Session isn\'t productive. Better to end and try fresh next time.';
            warningLevel = 'red';
            warningMessage = 'SESSION STOP RECOMMENDED';
            incidentsToConsequence = 0;
        }

        return {
            severity,
            severityConfidence: 0.7,
            severityReasoning: 'Determined by methodology rules (AI unavailable)',
            gradeApproach,
            actionPlan,
            sessionStatus: {
                shouldStop,
                stopReason,
                warningLevel,
                warningMessage,
                incidentsToConsequence
            },
            patternDetected: sameTypeCount >= 2 ? `Repeated ${category} incidents (${sameTypeCount + 1} total)` : null,
            source: 'deterministic'
        };
    },

    /**
     * Get grade-appropriate scripts for discipline
     */
    getGradeAppropriateScripts(categoryLabel, severity, isYounger, incidentCount) {
        if (isYounger) {
            // External structure - clear, direct, immediate
            const scripts = {
                1: {
                    tutorMessage: `Redirect immediately. Clear expectation.`,
                    studentScript: `"We need to focus on our work right now."`
                },
                2: {
                    tutorMessage: `State consequence. Be consistent.`,
                    studentScript: `"If this happens again, we take a 2-minute reset break."`
                },
                3: {
                    tutorMessage: `Apply consequence. Stay calm but firm.`,
                    studentScript: `"We talked about this. Now we need to take a reset break."`
                },
                4: {
                    tutorMessage: `Stop session. This is non-negotiable.`,
                    studentScript: `"Our lesson is stopping now. We'll try again next time."`
                }
            };
            return scripts[severity] || scripts[1];
        } else {
            // Internal accountability - ownership, logical, respectful
            const scripts = {
                1: {
                    tutorMessage: `Let it pass. Focus on the work.`,
                    studentScript: `"Let's get back to it."`
                },
                2: {
                    tutorMessage: `Name the pattern. Appeal to their goals.`,
                    studentScript: `"This is the ${incidentCount + 1}th time. What's going on?"`
                },
                3: {
                    tutorMessage: `Discuss impact. Ask what they need.`,
                    studentScript: `"We've lost about 10 minutes. How do we get back on track?"`
                },
                4: {
                    tutorMessage: `End with dignity. No lectures.`,
                    studentScript: `"This isn't working today. Let's pick it up next time."`
                }
            };
            return scripts[severity] || scripts[1];
        }
    },

    /**
     * Grade-aware base severity matrix
     * Based on pedagogical principle: same behavior = higher severity as grade increases
     * because understanding, accountability, and stakes increase with age.
     * 
     * Grade bands: 1-2, 3-5, 6-8, 9-10, 11-13
     * Severity: 1 (Minor), 2 (Moderate), 3 (Major), 4 (Critical)
     */
    getGradeAwareBaseSeverity(category, grade) {
        // Severity matrix by category and grade band
        // Format: [G1-2, G3-5, G6-8, G9-10, G11-13]
        const severityMatrix = {
            // Off-task: Minor for young, increases with age
            'FOCUS_OFF_TASK': [1, 1, 2, 2, 3],

            // Interrupting: More serious as student should know better with age
            'INTERRUPTING': [1, 1, 2, 2, 3],

            // Disrespect/Tone: Personal abuse - scales significantly with age
            'DISRESPECT_TONE': [2, 3, 4, 4, 4],

            // Non-compliance/Refusal: Defiance becomes more serious with age
            'NON_COMPLIANCE': [2, 3, 3, 4, 4],

            // Device misuse: Willful distraction - scales with age
            'TECH_MISUSE': [2, 3, 4, 4, 4],

            // Academic integrity: Severity increases dramatically with age
            // Young kids don't understand authorship; older students know it's wrong
            'ACADEMIC_INTEGRITY': [1, 2, 3, 4, 4],

            // Safety: Always serious, but even more so with age
            'SAFETY_BOUNDARY': [3, 3, 4, 4, 4],

            // Other: Default progression
            'OTHER': [1, 1, 2, 2, 3]
        };

        // Determine grade band index (0-4)
        let bandIndex;
        if (grade <= 2) bandIndex = 0;      // Grades 1-2
        else if (grade <= 5) bandIndex = 1; // Grades 3-5
        else if (grade <= 8) bandIndex = 2; // Grades 6-8
        else if (grade <= 10) bandIndex = 3; // Grades 9-10
        else bandIndex = 4;                  // Grades 11-13

        // Look up base severity
        const categoryMatrix = severityMatrix[category] || severityMatrix['OTHER'];
        return categoryMatrix[bandIndex] || 1;
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

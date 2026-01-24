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

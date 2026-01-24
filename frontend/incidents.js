/**
 * Session Order OS - Incidents Management Module
 * Handles incident logging, display, and resolution
 */

const Incidents = {
    /**
     * Quick log an incident (minimal input)
     * @param {string} category - Category key
     * @param {number} severity - Severity 1-4
     * @param {string} description - Brief description
     * @param {string} context - Optional context
     * @returns {Promise<Object>} Created incident with analysis
     */
    async quickLog(category, severity, description, context = '') {
        const session = Session.currentSession;
        if (!session) {
            throw new Error('No active session');
        }

        // Validate input
        const validation = Validate.validateIncident({
            category,
            severity,
            description,
            context
        });

        if (!validation.valid) {
            throw new Error(validation.errors.join(', '));
        }

        // Create the incident
        const incident = await DB.createIncident({
            sessionId: session.id,
            category,
            severity: parseInt(severity),
            description,
            context,
            timeIntoSession: Session.timerSeconds
        });

        // Get AI analysis (or deterministic fallback)
        let aiPacket = null;
        try {
            aiPacket = await AI.analyzeIncident(
                incident,
                Session.currentStudent,
                session
            );

            // Update incident with AI packet
            incident.aiPacket = aiPacket;
            await DB.updateIncident(incident);
        } catch (error) {
            console.error('AI analysis failed:', error);
            // Use deterministic fallback
            aiPacket = AI.getFallbackAnalysis(incident, session);
            incident.aiPacket = aiPacket;
            await DB.updateIncident(incident);
        }

        // Emit event for UI update
        Utils.EventBus.emit('incident:logged', {
            incident,
            analysis: aiPacket
        });

        return {
            incident,
            analysis: AI.formatForDisplay(aiPacket)
        };
    },

    /**
     * Get all incidents for current session
     * @returns {Promise<Array>} Incidents array
     */
    async getSessionIncidents() {
        if (!Session.currentSession) return [];
        return await DB.getSessionIncidents(Session.currentSession.id);
    },

    /**
     * Get all incidents with optional filters
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} Filtered incidents
     */
    async getAllIncidents(filters = {}) {
        let incidents = await DB.getAllIncidents();

        // Apply filters
        if (filters.category) {
            incidents = incidents.filter(i => i.category === filters.category);
        }
        if (filters.severity) {
            incidents = incidents.filter(i => i.severity === parseInt(filters.severity));
        }
        if (filters.resolved !== undefined) {
            incidents = incidents.filter(i => i.resolved === filters.resolved);
        }
        if (filters.sessionId) {
            incidents = incidents.filter(i => i.sessionId === filters.sessionId);
        }
        if (filters.startDate) {
            const start = new Date(filters.startDate).getTime();
            incidents = incidents.filter(i => i.timestamp >= start);
        }
        if (filters.endDate) {
            const end = new Date(filters.endDate).getTime() + 86400000; // Include full day
            incidents = incidents.filter(i => i.timestamp < end);
        }

        return incidents;
    },

    /**
     * Get incident details with enriched data
     * @param {string} incidentId - Incident ID
     * @returns {Promise<Object>} Enriched incident data
     */
    async getIncidentDetails(incidentId) {
        const incident = await DB.getIncident(incidentId);
        if (!incident) return null;

        // Get related session and student
        const session = await DB.getSession(incident.sessionId);
        const student = session ? await DB.getStudent(session.studentId) : null;

        // Get category info
        const categoryInfo = Methodology.getCategory(incident.category);

        return {
            ...incident,
            categoryLabel: categoryInfo?.label || incident.category,
            categoryIcon: categoryInfo?.icon || '❓',
            severityInfo: Methodology.getSeverity(incident.severity),
            session: session ? {
                id: session.id,
                date: Utils.formatDateTime(session.startTime),
                mode: session.mode
            } : null,
            student: student ? {
                id: student.id,
                name: student.name,
                grade: student.grade
            } : null,
            formattedTimestamp: Utils.formatDateTime(incident.timestamp),
            formattedTimeInSession: Utils.formatDuration(incident.timeIntoSession || 0),
            analysis: incident.aiPacket ? AI.formatForDisplay(incident.aiPacket) : null
        };
    },

    /**
     * Resolve an incident
     * @param {string} incidentId - Incident ID
     * @param {string} outcome - Resolution outcome
     * @param {string} tutorDecision - Tutor's actual decision
     * @returns {Promise<Object>} Updated incident
     */
    async resolveIncident(incidentId, outcome, tutorDecision = null) {
        const incident = await DB.getIncident(incidentId);
        if (!incident) {
            throw new Error('Incident not found');
        }

        incident.resolved = true;
        incident.outcome = Utils.sanitizeHTML(outcome);
        incident.tutorDecision = tutorDecision ? Utils.sanitizeHTML(tutorDecision) : null;
        incident.resolvedAt = Date.now();

        await DB.updateIncident(incident);

        Utils.EventBus.emit('incident:resolved', { incident });

        return incident;
    },

    /**
     * Record tutor's decision for an incident
     * @param {string} incidentId - Incident ID
     * @param {Object} decision - Decision data
     * @returns {Promise<Object>} Updated incident
     */
    async recordDecision(incidentId, decision) {
        const incident = await DB.getIncident(incidentId);
        if (!incident) {
            throw new Error('Incident not found');
        }

        incident.tutorDecision = {
            action: Utils.sanitizeHTML(decision.action),
            script: decision.script || null,
            tone: decision.tone || 'neutral',
            timestamp: Date.now(),
            followedRecommendation: decision.followedRecommendation || false,
            notes: decision.notes ? Utils.sanitizeHTML(decision.notes) : null
        };

        await DB.updateIncident(incident);

        Utils.EventBus.emit('incident:decisionRecorded', { incident });

        return incident;
    },

    /**
     * Get pattern insights for incidents
     * @param {Array} incidents - Incidents to analyze
     * @returns {Object} Pattern insights
     */
    analyzePatterns(incidents) {
        if (!incidents || incidents.length === 0) {
            return {
                hasPatterns: false,
                message: 'Not enough data for pattern analysis'
            };
        }

        // Category frequency
        const categoryFreq = {};
        incidents.forEach(i => {
            categoryFreq[i.category] = (categoryFreq[i.category] || 0) + 1;
        });

        const topCategories = Object.entries(categoryFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([cat, count]) => ({
                category: cat,
                label: Methodology.getCategory(cat)?.label || cat,
                count,
                percentage: Math.round((count / incidents.length) * 100)
            }));

        // Time patterns (if timeIntoSession available)
        const timePatterns = this.analyzeTimePatterns(incidents);

        // Severity trend
        const severityTrend = this.analyzeSeverityTrend(incidents);

        // Category correlations (which categories occur together in sessions)
        const correlations = this.analyzeCorrelations(incidents);

        return {
            hasPatterns: true,
            totalIncidents: incidents.length,
            topCategories,
            timePatterns,
            severityTrend,
            correlations,
            insights: this.generateInsights(topCategories, timePatterns, severityTrend)
        };
    },

    /**
     * Analyze time-based patterns
     * @param {Array} incidents - Incidents array
     * @returns {Object} Time pattern analysis
     */
    analyzeTimePatterns(incidents) {
        const buckets = {
            'first5': { label: 'First 5 min', count: 0, range: [0, 300] },
            'early': { label: '5-15 min', count: 0, range: [300, 900] },
            'mid': { label: '15-30 min', count: 0, range: [900, 1800] },
            'late': { label: '30-45 min', count: 0, range: [1800, 2700] },
            'end': { label: '45+ min', count: 0, range: [2700, Infinity] }
        };

        incidents.forEach(i => {
            const time = i.timeIntoSession || 0;
            for (const [key, bucket] of Object.entries(buckets)) {
                if (time >= bucket.range[0] && time < bucket.range[1]) {
                    bucket.count++;
                    break;
                }
            }
        });

        // Find peak time
        let peakTime = null;
        let peakCount = 0;
        for (const [key, bucket] of Object.entries(buckets)) {
            if (bucket.count > peakCount) {
                peakCount = bucket.count;
                peakTime = bucket.label;
            }
        }

        return {
            buckets,
            peakTime,
            peakCount,
            isEarlyHeavy: (buckets.first5.count + buckets.early.count) > incidents.length / 2,
            isLateHeavy: (buckets.late.count + buckets.end.count) > incidents.length / 2
        };
    },

    /**
     * Analyze severity trends
     * @param {Array} incidents - Incidents array
     * @returns {Object} Severity trend analysis
     */
    analyzeSeverityTrend(incidents) {
        if (incidents.length < 3) {
            return { trend: 'insufficient_data' };
        }

        // Sort by timestamp
        const sorted = [...incidents].sort((a, b) => a.timestamp - b.timestamp);

        // Compare first half to second half
        const mid = Math.floor(sorted.length / 2);
        const firstHalf = sorted.slice(0, mid);
        const secondHalf = sorted.slice(mid);

        const avgFirst = firstHalf.reduce((sum, i) => sum + i.severity, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((sum, i) => sum + i.severity, 0) / secondHalf.length;

        let trend = 'stable';
        if (avgSecond > avgFirst + 0.3) {
            trend = 'escalating';
        } else if (avgSecond < avgFirst - 0.3) {
            trend = 'deescalating';
        }

        return {
            trend,
            avgFirst: avgFirst.toFixed(1),
            avgSecond: avgSecond.toFixed(1),
            overall: ((avgFirst + avgSecond) / 2).toFixed(1)
        };
    },

    /**
     * Analyze category correlations
     * @param {Array} incidents - Incidents array
     * @returns {Array} Correlation pairs
     */
    analyzeCorrelations(incidents) {
        // Group by session
        const sessionGroups = {};
        incidents.forEach(i => {
            if (!sessionGroups[i.sessionId]) {
                sessionGroups[i.sessionId] = new Set();
            }
            sessionGroups[i.sessionId].add(i.category);
        });

        // Count co-occurrences
        const pairs = {};
        Object.values(sessionGroups).forEach(categories => {
            const cats = Array.from(categories);
            for (let i = 0; i < cats.length; i++) {
                for (let j = i + 1; j < cats.length; j++) {
                    const key = [cats[i], cats[j]].sort().join('|');
                    pairs[key] = (pairs[key] || 0) + 1;
                }
            }
        });

        return Object.entries(pairs)
            .filter(([_, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([key, count]) => {
                const [cat1, cat2] = key.split('|');
                return {
                    categories: [
                        Methodology.getCategory(cat1)?.shortLabel || cat1,
                        Methodology.getCategory(cat2)?.shortLabel || cat2
                    ],
                    count
                };
            });
    },

    /**
     * Generate human-readable insights
     * @param {Array} topCategories - Top categories
     * @param {Object} timePatterns - Time pattern analysis
     * @param {Object} severityTrend - Severity trend analysis
     * @returns {Array} Insight strings
     */
    generateInsights(topCategories, timePatterns, severityTrend) {
        const insights = [];

        // Top category insight
        if (topCategories.length > 0) {
            const top = topCategories[0];
            if (top.percentage >= 40) {
                insights.push(`${top.label} accounts for ${top.percentage}% of incidents. Consider targeted strategies for this behavior.`);
            }
        }

        // Time pattern insight
        if (timePatterns.isEarlyHeavy) {
            insights.push('Most incidents occur early in sessions. Consider stronger warm-up routines or expectation setting at the start.');
        } else if (timePatterns.isLateHeavy) {
            insights.push('Incidents cluster toward session end. Consider shorter sessions, more breaks, or energy management strategies.');
        }

        // Severity trend insight
        if (severityTrend.trend === 'escalating') {
            insights.push('Severity appears to be increasing over time. Review de-escalation strategies and early intervention.');
        } else if (severityTrend.trend === 'deescalating') {
            insights.push('Good news: severity is trending downward. Current strategies appear effective.');
        }

        if (insights.length === 0) {
            insights.push('No significant patterns detected. Continue monitoring.');
        }

        return insights;
    },

    /**
     * Get category quick buttons for UI
     * @returns {Array} Button configurations
     */
    getCategoryButtons() {
        return Methodology.getCategoryButtons().filter(b => b.key !== 'OTHER');
    },

    /**
     * Handle keyboard shortcut for quick logging
     * @param {string} key - Pressed key
     * @returns {Object|null} Category info if valid shortcut
     */
    handleShortcut(key) {
        const buttons = Methodology.getCategoryButtons();
        const match = buttons.find(b => b.shortcut === key);
        return match || null;
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Incidents;
}

// Attach to window for browser global access
if (typeof window !== 'undefined') {
    window.Incidents = Incidents;
}

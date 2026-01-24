/**
 * Session Order OS - Export/Import Module
 * Handles data portability and report generation
 */

const Export = {
    /**
     * Export all data as JSON
     * @returns {Promise<string>} JSON string
     */
    async exportAllJSON() {
        const data = await DB.exportAllData();
        return JSON.stringify(data, null, 2);
    },

    /**
     * Download JSON export
     * @returns {Promise<void>}
     */
    async downloadJSON() {
        const json = await this.exportAllJSON();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `session-order-os-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Import data from JSON file
     * @param {File} file - File to import
     * @returns {Promise<Object>} {success: boolean, message: string}
     */
    async importJSON(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);

                    // Validate the data structure
                    const validation = Validate.validateExportData(data);
                    if (!validation.valid) {
                        resolve({
                            success: false,
                            message: `Invalid data format: ${validation.errors.join(', ')}`
                        });
                        return;
                    }

                    // Import the data
                    await DB.importAllData(data);

                    resolve({
                        success: true,
                        message: `Successfully imported ${data.students.length} students, ${data.sessions.length} sessions, and ${data.incidents.length} incidents.`
                    });
                } catch (error) {
                    resolve({
                        success: false,
                        message: `Import failed: ${error.message}`
                    });
                }
            };

            reader.onerror = () => {
                resolve({
                    success: false,
                    message: 'Failed to read file'
                });
            };

            reader.readAsText(file);
        });
    },

    /**
     * Generate session summary report
     * @param {Object} session - Session object
     * @param {Object} student - Student object
     * @param {Array} incidents - Session incidents
     * @returns {Object} Report data
     */
    async generateSessionReport(session, student, incidents) {
        const duration = session.endTime
            ? Math.round((session.endTime - session.startTime) / 1000)
            : Math.round((Date.now() - session.startTime) / 1000);

        const totalIncidents = Object.values(session.disciplineState).reduce((a, b) => a + b, 0);
        const incidentsPer10Min = duration > 0 ? (totalIncidents / (duration / 600)).toFixed(1) : 0;

        // Analyze time buckets
        const timeBuckets = this.analyzeTimeBuckets(incidents, session.startTime);

        // Category breakdown
        const categoryBreakdown = Object.entries(session.disciplineState)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => ({
                category: cat,
                label: Methodology.getCategory(cat)?.label || cat,
                count
            }));

        // Severity breakdown
        const severityBreakdown = this.analyzeSeverity(incidents);

        return {
            session: {
                id: session.id,
                date: new Date(session.startTime).toLocaleDateString(),
                startTime: Utils.formatTime(session.startTime),
                endTime: session.endTime ? Utils.formatTime(session.endTime) : 'Ongoing',
                duration: Utils.formatDuration(duration),
                mode: session.mode
            },
            student: {
                name: student?.name || 'Unknown',
                grade: student?.grade || 'N/A',
                band: Utils.getGradeBand(student?.grade || 6)
            },
            metrics: {
                totalIncidents,
                incidentsPer10Min,
                avgSeverity: this.calculateAvgSeverity(incidents),
                resolvedCount: incidents.filter(i => i.resolved).length,
                unresolvedCount: incidents.filter(i => !i.resolved).length
            },
            categoryBreakdown,
            severityBreakdown,
            timeBuckets,
            incidents: incidents.map(i => ({
                time: Utils.formatTime(i.timestamp),
                timeIntoSession: Utils.formatDuration(i.timeIntoSession || 0),
                category: Methodology.getCategory(i.category)?.label || i.category,
                severity: i.severity,
                description: i.description,
                resolved: i.resolved,
                aiSource: i.aiPacket?.source || 'none'
            })),
            goals: session.goals || [],
            notes: session.notes || ''
        };
    },

    /**
     * Analyze incidents by time buckets (5-minute intervals)
     * @param {Array} incidents - Incidents array
     * @param {number} sessionStart - Session start timestamp
     * @returns {Array} Time bucket analysis
     */
    analyzeTimeBuckets(incidents, sessionStart) {
        const buckets = {};

        incidents.forEach(incident => {
            const minutesIn = Math.floor((incident.timestamp - sessionStart) / 60000);
            const bucketStart = Math.floor(minutesIn / 5) * 5;
            const bucketKey = `${bucketStart}-${bucketStart + 5}`;

            if (!buckets[bucketKey]) {
                buckets[bucketKey] = { count: 0, categories: {} };
            }
            buckets[bucketKey].count++;
            buckets[bucketKey].categories[incident.category] =
                (buckets[bucketKey].categories[incident.category] || 0) + 1;
        });

        return Object.entries(buckets).map(([range, data]) => ({
            range: `${range} min`,
            count: data.count,
            topCategory: Object.entries(data.categories)
                .sort((a, b) => b[1] - a[1])[0]?.[0] || null
        }));
    },

    /**
     * Analyze severity distribution
     * @param {Array} incidents - Incidents array
     * @returns {Object} Severity breakdown
     */
    analyzeSeverity(incidents) {
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        incidents.forEach(i => {
            counts[i.severity] = (counts[i.severity] || 0) + 1;
        });

        return Object.entries(counts).map(([level, count]) => ({
            level: parseInt(level),
            name: Methodology.getSeverity(parseInt(level)).name,
            count,
            percentage: incidents.length > 0
                ? Math.round((count / incidents.length) * 100)
                : 0
        }));
    },

    /**
     * Calculate average severity
     * @param {Array} incidents - Incidents array
     * @returns {number} Average severity
     */
    calculateAvgSeverity(incidents) {
        if (incidents.length === 0) return 0;
        const sum = incidents.reduce((acc, i) => acc + (i.severity || 1), 0);
        return (sum / incidents.length).toFixed(1);
    },

    /**
     * Generate student history report
     * @param {string} studentId - Student ID
     * @returns {Promise<Object>} History report
     */
    async generateStudentHistory(studentId) {
        const student = await DB.getStudent(studentId);
        const sessions = await DB.getStudentSessions(studentId);

        let totalIncidents = 0;
        const categoryTotals = {};
        const recentPatterns = [];

        for (const session of sessions.slice(0, 10)) {
            const incidents = await DB.getSessionIncidents(session.id);
            totalIncidents += incidents.length;

            incidents.forEach(i => {
                categoryTotals[i.category] = (categoryTotals[i.category] || 0) + 1;
            });

            if (recentPatterns.length < 5 && incidents.length > 0) {
                recentPatterns.push({
                    date: new Date(session.startTime).toLocaleDateString(),
                    incidentCount: incidents.length,
                    topCategory: Object.entries(session.disciplineState)
                        .sort((a, b) => b[1] - a[1])[0]?.[0] || null
                });
            }
        }

        return {
            student: {
                name: student?.name || 'Unknown',
                grade: student?.grade,
                band: Utils.getGradeBand(student?.grade || 6)
            },
            summary: {
                totalSessions: sessions.length,
                totalIncidents,
                avgIncidentsPerSession: sessions.length > 0
                    ? (totalIncidents / sessions.length).toFixed(1)
                    : 0
            },
            topCategories: Object.entries(categoryTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([cat, count]) => ({
                    category: cat,
                    label: Methodology.getCategory(cat)?.label || cat,
                    count
                })),
            recentPatterns
        };
    },

    /**
     * Generate print-friendly HTML report
     * @param {Object} report - Report data from generateSessionReport
     * @returns {string} HTML string
     */
    generatePrintHTML(report) {
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Session Report - ${report.student.name} - ${report.session.date}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.5;
            padding: 2rem;
            max-width: 800px;
            margin: 0 auto;
        }
        h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #1e293b; }
        h2 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.25rem; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
        .meta { color: #64748b; font-size: 0.9rem; }
        .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin: 1rem 0; }
        .metric { background: #f8fafc; border-radius: 8px; padding: 1rem; text-align: center; }
        .metric-value { font-size: 1.5rem; font-weight: 700; color: #1e293b; }
        .metric-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f1f5f9; font-weight: 600; }
        .severity-1 { color: #ca8a04; }
        .severity-2 { color: #ea580c; }
        .severity-3 { color: #dc2626; }
        .severity-4 { color: #991b1b; font-weight: bold; }
        .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
        .badge-resolved { background: #dcfce7; color: #166534; }
        .badge-unresolved { background: #fef2f2; color: #991b1b; }
        .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #94a3b8; }
        @media print {
            body { padding: 1rem; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>Session Report</h1>
            <div class="meta">
                <strong>${Utils.escapeHTML(report.student.name)}</strong> • 
                Grade ${report.student.grade} (Band ${report.student.band})
            </div>
        </div>
        <div class="meta" style="text-align: right;">
            ${report.session.date}<br>
            ${report.session.startTime} - ${report.session.endTime}<br>
            ${report.session.mode === 'online' ? '🌐 Online' : '🏫 In-person'}
        </div>
    </div>

    <div class="metrics">
        <div class="metric">
            <div class="metric-value">${report.session.duration}</div>
            <div class="metric-label">Duration</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.metrics.totalIncidents}</div>
            <div class="metric-label">Total Incidents</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.metrics.incidentsPer10Min}</div>
            <div class="metric-label">Per 10 min</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.metrics.avgSeverity}</div>
            <div class="metric-label">Avg Severity</div>
        </div>
    </div>

    ${report.categoryBreakdown.length > 0 ? `
    <h2>Category Breakdown</h2>
    <table>
        <thead>
            <tr><th>Category</th><th style="text-align:right">Count</th></tr>
        </thead>
        <tbody>
            ${report.categoryBreakdown.map(c => `
                <tr><td>${Utils.escapeHTML(c.label)}</td><td style="text-align:right">${c.count}</td></tr>
            `).join('')}
        </tbody>
    </table>
    ` : ''}

    ${report.incidents.length > 0 ? `
    <h2>Incident Log</h2>
    <table>
        <thead>
            <tr><th>Time</th><th>Category</th><th>Sev</th><th>Description</th><th>Status</th></tr>
        </thead>
        <tbody>
            ${report.incidents.map(i => `
                <tr>
                    <td>${i.timeIntoSession}</td>
                    <td>${Utils.escapeHTML(i.category)}</td>
                    <td class="severity-${i.severity}">${i.severity}</td>
                    <td>${Utils.escapeHTML(i.description)}</td>
                    <td><span class="badge ${i.resolved ? 'badge-resolved' : 'badge-unresolved'}">${i.resolved ? 'Resolved' : 'Open'}</span></td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    ` : '<p style="color: #64748b; margin: 1rem 0;">No incidents recorded this session.</p>'}

    ${report.notes ? `
    <h2>Session Notes</h2>
    <p>${Utils.escapeHTML(report.notes)}</p>
    ` : ''}

    <div class="footer">
        Generated by Session Order OS • ${new Date().toLocaleString()}
    </div>
</body>
</html>`;
        return html;
    },

    /**
     * Open print-friendly report in new window
     * @param {Object} report - Report data
     */
    openPrintReport(report) {
        const html = this.generatePrintHTML(report);
        const printWindow = window.open('', '_blank');
        printWindow.document.write(html);
        printWindow.document.close();
    },

    /**
     * Download report as HTML file
     * @param {Object} report - Report data
     */
    downloadReportHTML(report) {
        const html = this.generatePrintHTML(report);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `session-report-${report.student.name.replace(/\s+/g, '-')}-${report.session.date}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Export;
}

// Attach to window for browser global access
if (typeof window !== 'undefined') {
    window.Export = Export;
}

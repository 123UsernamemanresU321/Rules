/**
 * Session Order OS - IndexedDB Wrapper
 * Handles all persistent storage operations
 */

const DB = {
    name: 'SessionOrderOS',
    version: 1,
    db: null,

    /**
     * Initialize the database
     * @returns {Promise} Resolves when DB is ready
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.onerror = () => {
                console.error('Failed to open database:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database initialized');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Students store
                if (!db.objectStoreNames.contains('students')) {
                    const studentsStore = db.createObjectStore('students', { keyPath: 'id' });
                    studentsStore.createIndex('name', 'name', { unique: false });
                    studentsStore.createIndex('grade', 'grade', { unique: false });
                    studentsStore.createIndex('lastSession', 'lastSession', { unique: false });
                }

                // Sessions store
                if (!db.objectStoreNames.contains('sessions')) {
                    const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
                    sessionsStore.createIndex('studentId', 'studentId', { unique: false });
                    sessionsStore.createIndex('startTime', 'startTime', { unique: false });
                    sessionsStore.createIndex('status', 'status', { unique: false });
                }

                // Incidents store
                if (!db.objectStoreNames.contains('incidents')) {
                    const incidentsStore = db.createObjectStore('incidents', { keyPath: 'id' });
                    incidentsStore.createIndex('sessionId', 'sessionId', { unique: false });
                    incidentsStore.createIndex('category', 'category', { unique: false });
                    incidentsStore.createIndex('severity', 'severity', { unique: false });
                    incidentsStore.createIndex('timestamp', 'timestamp', { unique: false });
                    incidentsStore.createIndex('resolved', 'resolved', { unique: false });
                }

                // Config store
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config', { keyPath: 'key' });
                }

                console.log('Database schema created/upgraded');
            };
        });
    },

    /**
     * Generic add operation
     * @param {string} storeName - Store name
     * @param {Object} data - Data to add
     * @returns {Promise} Resolves with the added data
     */
    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);

            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Generic put (add or update) operation
     * @param {string} storeName - Store name
     * @param {Object} data - Data to put
     * @returns {Promise} Resolves with the data
     */
    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Generic get by ID operation
     * @param {string} storeName - Store name
     * @param {string} id - ID to get
     * @returns {Promise} Resolves with the data
     */
    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get all items from a store
     * @param {string} storeName - Store name
     * @returns {Promise<Array>} Resolves with array of items
     */
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get items by index
     * @param {string} storeName - Store name
     * @param {string} indexName - Index name
     * @param {*} value - Value to match
     * @returns {Promise<Array>} Resolves with array of matches
     */
    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Delete by ID
     * @param {string} storeName - Store name
     * @param {string} id - ID to delete
     * @returns {Promise} Resolves when deleted
     */
    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Clear a store
     * @param {string} storeName - Store name
     * @returns {Promise} Resolves when cleared
     */
    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Clear all stores (wipe all data)
     * @returns {Promise} Resolves when all cleared
     */
    async clearAll() {
        const stores = ['students', 'sessions', 'incidents', 'config'];
        for (const store of stores) {
            await this.clear(store);
        }
    },

    // ========== STUDENT OPERATIONS ==========

    async addStudent(student) {
        const data = {
            id: student.id || Utils.generateId(),
            name: Utils.sanitizeHTML(student.name),
            grade: parseInt(student.grade),
            notes: Utils.sanitizeHTML(student.notes || ''),
            createdAt: Date.now(),
            lastSession: null
        };
        return this.add('students', data);
    },

    async updateStudent(student) {
        const existing = await this.get('students', student.id);
        if (!existing) throw new Error('Student not found');

        const data = {
            ...existing,
            name: Utils.sanitizeHTML(student.name),
            grade: parseInt(student.grade),
            notes: Utils.sanitizeHTML(student.notes || ''),
            updatedAt: Date.now()
        };
        return this.put('students', data);
    },

    async getStudent(id) {
        return this.get('students', id);
    },

    async getAllStudents() {
        const students = await this.getAll('students');
        return students.sort((a, b) => a.name.localeCompare(b.name));
    },

    async getRecentStudents(limit = 5) {
        const students = await this.getAll('students');
        return students
            .filter(s => s.lastSession)
            .sort((a, b) => b.lastSession - a.lastSession)
            .slice(0, limit);
    },

    async deleteStudent(id) {
        return this.delete('students', id);
    },

    // ========== SESSION OPERATIONS ==========

    async createSession(session) {
        const data = {
            id: session.id || Utils.generateId(),
            studentId: session.studentId,
            startTime: Date.now(),
            endTime: null,
            mode: session.mode || 'in-person',
            status: 'active',
            goals: session.goals || [],
            disciplineState: {
                FOCUS_OFF_TASK: 0,
                INTERRUPTING: 0,
                DISRESPECT_TONE: 0,
                NON_COMPLIANCE: 0,
                TECH_MISUSE: 0,
                ACADEMIC_INTEGRITY: 0,
                SAFETY_BOUNDARY: 0,
                OTHER: 0
            },
            notes: ''
        };

        // Update student's last session
        const student = await this.getStudent(session.studentId);
        if (student) {
            student.lastSession = Date.now();
            await this.put('students', student);
        }

        return this.add('sessions', data);
    },

    async updateSession(session) {
        return this.put('sessions', session);
    },

    async getSession(id) {
        return this.get('sessions', id);
    },

    async getActiveSession() {
        const sessions = await this.getByIndex('sessions', 'status', 'active');
        return sessions[0] || null;
    },

    async getStudentSessions(studentId) {
        const sessions = await this.getByIndex('sessions', 'studentId', studentId);
        return sessions.sort((a, b) => b.startTime - a.startTime);
    },

    async endSession(sessionId) {
        const session = await this.get('sessions', sessionId);
        if (session) {
            session.status = 'completed';
            session.endTime = Date.now();
            return this.put('sessions', session);
        }
    },

    async getAllSessions() {
        const sessions = await this.getAll('sessions');
        return sessions.sort((a, b) => b.startTime - a.startTime);
    },

    // ========== INCIDENT OPERATIONS ==========

    async createIncident(incident) {
        const data = {
            id: incident.id || Utils.generateId(),
            sessionId: incident.sessionId,
            category: incident.category,
            severity: parseInt(incident.severity) || 1,
            description: Utils.sanitizeHTML(incident.description),
            context: Utils.sanitizeHTML(incident.context || ''),
            timestamp: Date.now(),
            timeIntoSession: incident.timeIntoSession || 0,
            aiPacket: incident.aiPacket || null,
            tutorDecision: incident.tutorDecision || null,
            outcome: incident.outcome || null,
            resolved: false
        };

        // Update session discipline state
        const session = await this.getSession(incident.sessionId);
        if (session && session.disciplineState) {
            session.disciplineState[incident.category] =
                (session.disciplineState[incident.category] || 0) + 1;
            await this.put('sessions', session);
        }

        return this.add('incidents', data);
    },

    async updateIncident(incident) {
        return this.put('incidents', incident);
    },

    async getIncident(id) {
        return this.get('incidents', id);
    },

    async getSessionIncidents(sessionId) {
        const incidents = await this.getByIndex('incidents', 'sessionId', sessionId);
        return incidents.sort((a, b) => a.timestamp - b.timestamp);
    },

    async getAllIncidents() {
        const incidents = await this.getAll('incidents');
        return incidents.sort((a, b) => b.timestamp - a.timestamp);
    },

    async resolveIncident(incidentId, outcome) {
        const incident = await this.get('incidents', incidentId);
        if (incident) {
            incident.resolved = true;
            incident.outcome = Utils.sanitizeHTML(outcome);
            incident.resolvedAt = Date.now();
            return this.put('incidents', incident);
        }
    },

    // ========== CONFIG OPERATIONS ==========

    async getConfig(key) {
        const config = await this.get('config', key);
        return config ? config.value : null;
    },

    async setConfig(key, value) {
        return this.put('config', { key, value, updatedAt: Date.now() });
    },

    async getSettings() {
        const settings = await this.getConfig('settings');
        return settings || {
            aiEnabled: true,
            workerEndpoint: '',
            theme: 'dark',
            soundEnabled: false
        };
    },

    async saveSettings(settings) {
        return this.setConfig('settings', settings);
    },

    async getMethodologyConfig() {
        const config = await this.getConfig('methodology');
        return config || null;
    },

    async saveMethodologyConfig(config) {
        return this.setConfig('methodology', config);
    },

    // ========== EXPORT/IMPORT ==========

    async exportAllData() {
        const data = {
            exportedAt: Date.now(),
            version: this.version,
            students: await this.getAll('students'),
            sessions: await this.getAll('sessions'),
            incidents: await this.getAll('incidents'),
            config: await this.getAll('config')
        };
        return data;
    },

    async importAllData(data) {
        if (!data || data.version !== this.version) {
            throw new Error('Invalid or incompatible data format');
        }

        // Clear existing data
        await this.clearAll();

        // Import all data
        for (const student of (data.students || [])) {
            await this.put('students', student);
        }
        for (const session of (data.sessions || [])) {
            await this.put('sessions', session);
        }
        for (const incident of (data.incidents || [])) {
            await this.put('incidents', incident);
        }
        for (const config of (data.config || [])) {
            await this.put('config', config);
        }

        return true;
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DB;
}

// Attach to window for browser global access
if (typeof window !== 'undefined') {
    window.DB = DB;
}

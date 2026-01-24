/**
 * Session Order OS - Utility Functions
 * Common utilities for sanitization, formatting, and helpers
 */

const Utils = {
    /**
     * Sanitize HTML to prevent XSS attacks
     * @param {string} text - Raw text input
     * @returns {string} Sanitized text
     */
    sanitizeHTML(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Escape HTML entities
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHTML(str) {
        if (typeof str !== 'string') return '';
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;'
        };
        return str.replace(/[&<>"'/]/g, char => escapeMap[char]);
    },

    /**
     * Truncate text with ellipsis
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     */
    truncate(text, maxLength = 50) {
        if (typeof text !== 'string') return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    },

    /**
     * Format duration in seconds to MM:SS or HH:MM:SS
     * @param {number} seconds - Duration in seconds
     * @returns {string} Formatted duration
     */
    formatDuration(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    /**
     * Format timestamp to readable date/time
     * @param {number|Date} timestamp - Timestamp or Date object
     * @returns {string} Formatted date/time
     */
    formatDateTime(timestamp) {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Format timestamp to time only
     * @param {number|Date} timestamp - Timestamp or Date object
     * @returns {string} Formatted time
     */
    formatTime(timestamp) {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Debounce function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function} Debounced function
     */
    debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in ms
     * @returns {Function} Throttled function
     */
    throttle(func, limit = 300) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Generate unique ID
     * @returns {string} Unique ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Deep clone object
     * @param {Object} obj - Object to clone
     * @returns {Object} Cloned object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * Check if online
     * @returns {boolean} Online status
     */
    isOnline() {
        return navigator.onLine;
    },

    /**
     * Get grade band from grade number
     * @param {number} grade - Grade number (1-13)
     * @returns {string} Band letter (A-E)
     */
    getGradeBand(grade) {
        if (grade <= 2) return 'A';
        if (grade <= 5) return 'B';
        if (grade <= 8) return 'C';
        if (grade <= 10) return 'D';
        return 'E';
    },

    /**
     * Get grade band name
     * @param {string} band - Band letter
     * @returns {string} Band name
     */
    getGradeBandName(band) {
        const names = {
            'A': 'Early Primary (Gr 1-2)',
            'B': 'Upper Primary (Gr 3-5)',
            'C': 'Middle School (Gr 6-8)',
            'D': 'Early High (Gr 9-10)',
            'E': 'Senior High (Gr 11-13)'
        };
        return names[band] || 'Unknown';
    },

    /**
     * Calculate word count
     * @param {string} text - Text to count
     * @returns {number} Word count
     */
    wordCount(text) {
        if (!text || typeof text !== 'string') return 0;
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    },

    /**
     * Simple event emitter for module communication
     */
    EventBus: {
        events: {},

        on(event, callback) {
            if (!this.events[event]) {
                this.events[event] = [];
            }
            this.events[event].push(callback);
        },

        off(event, callback) {
            if (!this.events[event]) return;
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        },

        emit(event, data) {
            if (!this.events[event]) return;
            this.events[event].forEach(callback => callback(data));
        }
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}

// Attach to window for browser global access
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}

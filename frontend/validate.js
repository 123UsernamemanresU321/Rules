/**
 * Session Order OS - JSON Schema Validation
 * Validates AI analysis responses against strict schema
 */

const Validate = {
    /**
     * AI Analysis Response Schema
     */
    aiResponseSchema: {
        type: 'object',
        required: ['category', 'severity', 'confidence', 'recommendedResponse', 'script'],
        properties: {
            category: {
                type: 'string',
                enum: [
                    'FOCUS_OFF_TASK',
                    'INTERRUPTING',
                    'DISRESPECT_TONE',
                    'NON_COMPLIANCE',
                    'TECH_MISUSE',
                    'ACADEMIC_INTEGRITY',
                    'SAFETY_BOUNDARY',
                    'OTHER'
                ]
            },
            severity: {
                type: 'integer',
                minimum: 1,
                maximum: 4
            },
            confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1
            },
            intentHypothesis: {
                type: 'object',
                properties: {
                    label: { type: 'string', maxLength: 100 },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    alternatives: {
                        type: 'array',
                        items: { type: 'string', maxLength: 100 },
                        maxItems: 3
                    }
                }
            },
            recommendedResponse: {
                type: 'object',
                required: ['immediateStep'],
                properties: {
                    immediateStep: { type: 'string', maxLength: 200 },
                    ladderAction: { type: 'string', maxLength: 200 },
                    ladderStepSuggested: { type: 'integer', minimum: 1, maximum: 5 },
                    restorative: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', maxLength: 50 },
                            prompt: { type: 'string', maxLength: 300 }
                        }
                    },
                    consequence: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', maxLength: 50 },
                            detail: { type: 'string', maxLength: 200 }
                        }
                    }
                }
            },
            script: {
                type: 'object',
                required: ['gentle', 'neutral', 'firm'],
                properties: {
                    gentle: { type: 'string', maxLength: 300 },
                    neutral: { type: 'string', maxLength: 300 },
                    firm: { type: 'string', maxLength: 300 }
                }
            },
            preventionTip: {
                type: 'string',
                maxLength: 300
            },
            fairnessNotes: {
                type: 'array',
                items: { type: 'string', maxLength: 200 },
                maxItems: 5
            }
        }
    },

    /**
     * Validate a value against a type
     * @param {*} value - Value to validate
     * @param {string} type - Expected type
     * @returns {boolean} Is valid
     */
    validateType(value, type) {
        switch (type) {
            case 'string':
                return typeof value === 'string';
            case 'number':
                return typeof value === 'number' && !isNaN(value);
            case 'integer':
                return Number.isInteger(value);
            case 'boolean':
                return typeof value === 'boolean';
            case 'object':
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            case 'array':
                return Array.isArray(value);
            default:
                return true;
        }
    },

    /**
     * Validate a value against a schema definition
     * @param {*} value - Value to validate
     * @param {Object} schema - Schema definition
     * @param {string} path - Current path for error messages
     * @returns {Object} {valid: boolean, errors: string[]}
     */
    validateValue(value, schema, path = '') {
        const errors = [];

        // Check type
        if (schema.type && !this.validateType(value, schema.type)) {
            errors.push(`${path}: Expected ${schema.type}, got ${typeof value}`);
            return { valid: false, errors };
        }

        // Check enum
        if (schema.enum && !schema.enum.includes(value)) {
            errors.push(`${path}: Value must be one of: ${schema.enum.join(', ')}`);
        }

        // Check minimum/maximum for numbers
        if (schema.type === 'number' || schema.type === 'integer') {
            if (schema.minimum !== undefined && value < schema.minimum) {
                errors.push(`${path}: Value must be >= ${schema.minimum}`);
            }
            if (schema.maximum !== undefined && value > schema.maximum) {
                errors.push(`${path}: Value must be <= ${schema.maximum}`);
            }
        }

        // Check maxLength for strings
        if (schema.type === 'string' && schema.maxLength && value.length > schema.maxLength) {
            errors.push(`${path}: String exceeds max length of ${schema.maxLength}`);
        }

        // Check array items
        if (schema.type === 'array' && schema.items) {
            if (schema.maxItems && value.length > schema.maxItems) {
                errors.push(`${path}: Array exceeds max items of ${schema.maxItems}`);
            }
            value.forEach((item, index) => {
                const itemResult = this.validateValue(item, schema.items, `${path}[${index}]`);
                errors.push(...itemResult.errors);
            });
        }

        // Check object properties
        if (schema.type === 'object' && schema.properties) {
            // Check required properties
            if (schema.required) {
                for (const reqProp of schema.required) {
                    if (value[reqProp] === undefined) {
                        errors.push(`${path}.${reqProp}: Required property missing`);
                    }
                }
            }

            // Validate each property
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                if (value[propName] !== undefined) {
                    const propResult = this.validateValue(
                        value[propName],
                        propSchema,
                        `${path}.${propName}`
                    );
                    errors.push(...propResult.errors);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Validate AI analysis response
     * @param {Object} response - AI response to validate
     * @returns {Object} {valid: boolean, errors: string[], sanitized: Object|null}
     */
    validateAIResponse(response) {
        // Check if response is an object
        if (!response || typeof response !== 'object') {
            return {
                valid: false,
                errors: ['Response must be an object'],
                sanitized: null
            };
        }

        // Validate against schema
        const result = this.validateValue(response, this.aiResponseSchema, 'response');

        if (!result.valid) {
            return {
                valid: false,
                errors: result.errors,
                sanitized: null
            };
        }

        // Sanitize the response
        const sanitized = this.sanitizeAIResponse(response);

        return {
            valid: true,
            errors: [],
            sanitized
        };
    },

    /**
     * Sanitize AI response to prevent XSS
     * @param {Object} response - AI response
     * @returns {Object} Sanitized response
     */
    sanitizeAIResponse(response) {
        const sanitize = (obj) => {
            if (typeof obj === 'string') {
                return Utils.sanitizeHTML(obj);
            }
            if (Array.isArray(obj)) {
                return obj.map(item => sanitize(item));
            }
            if (typeof obj === 'object' && obj !== null) {
                const result = {};
                for (const [key, value] of Object.entries(obj)) {
                    result[key] = sanitize(value);
                }
                return result;
            }
            return obj;
        };

        return sanitize(response);
    },

    /**
     * Validate incident input
     * @param {Object} incident - Incident data
     * @returns {Object} {valid: boolean, errors: string[]}
     */
    validateIncident(incident) {
        const errors = [];

        if (!incident.category) {
            errors.push('Category is required');
        } else if (!this.aiResponseSchema.properties.category.enum.includes(incident.category)) {
            errors.push('Invalid category');
        }

        if (!incident.severity) {
            errors.push('Severity is required');
        } else if (incident.severity < 1 || incident.severity > 4) {
            errors.push('Severity must be between 1 and 4');
        }

        if (!incident.description) {
            errors.push('Description is required');
        } else if (incident.description.length > 200) {
            errors.push('Description must be 200 characters or less');
        }

        if (incident.context && incident.context.length > 500) {
            errors.push('Context must be 500 characters or less');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Validate student input
     * @param {Object} student - Student data
     * @returns {Object} {valid: boolean, errors: string[]}
     */
    validateStudent(student) {
        const errors = [];

        if (!student.name || student.name.trim().length === 0) {
            errors.push('Student name is required');
        } else if (student.name.length > 100) {
            errors.push('Student name must be 100 characters or less');
        }

        if (!student.grade) {
            errors.push('Grade is required');
        } else {
            const grade = parseInt(student.grade);
            if (isNaN(grade) || grade < 1 || grade > 13) {
                errors.push('Grade must be between 1 and 13');
            }
        }

        if (student.notes && student.notes.length > 500) {
            errors.push('Notes must be 500 characters or less');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Validate Worker endpoint URL
     * @param {string} url - URL to validate
     * @returns {boolean} Is valid URL
     */
    validateWorkerEndpoint(url) {
        if (!url || typeof url !== 'string') return false;

        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:' || parsed.hostname === 'localhost';
        } catch {
            return false;
        }
    },

    /**
     * Validate export data structure
     * @param {Object} data - Exported data
     * @returns {Object} {valid: boolean, errors: string[]}
     */
    validateExportData(data) {
        const errors = [];

        if (!data || typeof data !== 'object') {
            errors.push('Data must be an object');
            return { valid: false, errors };
        }

        if (!data.version || typeof data.version !== 'number') {
            errors.push('Missing or invalid version');
        }

        if (!data.exportedAt || typeof data.exportedAt !== 'number') {
            errors.push('Missing or invalid exportedAt timestamp');
        }

        if (!Array.isArray(data.students)) {
            errors.push('Students must be an array');
        }

        if (!Array.isArray(data.sessions)) {
            errors.push('Sessions must be an array');
        }

        if (!Array.isArray(data.incidents)) {
            errors.push('Incidents must be an array');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
};

// Export for module use and testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Validate;
}

/**
 * Session Order OS - Unit Test Suite
 * Run in browser by opening tests/test.html
 */

const TestSuite = {
    results: [],
    passed: 0,
    failed: 0,

    /**
     * Run a test
     */
    test(name, fn) {
        try {
            fn();
            this.results.push({ name, status: 'pass' });
            this.passed++;
            console.log(`✅ PASS: ${name}`);
        } catch (error) {
            this.results.push({ name, status: 'fail', error: error.message });
            this.failed++;
            console.error(`❌ FAIL: ${name}`, error);
        }
    },

    /**
     * Assert equality
     */
    assertEqual(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`${message} Expected ${expected}, got ${actual}`);
        }
    },

    /**
     * Assert truthy
     */
    assertTrue(value, message = '') {
        if (!value) {
            throw new Error(`${message} Expected truthy value, got ${value}`);
        }
    },

    /**
     * Assert falsy
     */
    assertFalse(value, message = '') {
        if (value) {
            throw new Error(`${message} Expected falsy value, got ${value}`);
        }
    },

    /**
     * Assert array length
     */
    assertLength(arr, expected, message = '') {
        if (arr.length !== expected) {
            throw new Error(`${message} Expected length ${expected}, got ${arr.length}`);
        }
    },

    /**
     * Assert includes
     */
    assertIncludes(arr, value, message = '') {
        if (!arr.includes(value)) {
            throw new Error(`${message} Array does not include ${value}`);
        }
    },

    /**
     * Reset results
     */
    reset() {
        this.results = [];
        this.passed = 0;
        this.failed = 0;
    },

    /**
     * Render results to page
     */
    render() {
        const container = document.getElementById('results');
        if (!container) return;

        let html = `
            <div class="summary">
                <h3>Test Results</h3>
                <div class="stat pass">
                    <div class="stat-value">${this.passed}</div>
                    <div class="stat-label">Passed</div>
                </div>
                <div class="stat fail">
                    <div class="stat-value">${this.failed}</div>
                    <div class="stat-label">Failed</div>
                </div>
            </div>
        `;

        // Group by category
        const groups = {};
        this.results.forEach(r => {
            const [category] = r.name.split(':');
            if (!groups[category]) groups[category] = [];
            groups[category].push(r);
        });

        for (const [group, tests] of Object.entries(groups)) {
            html += `<h2>${group}</h2><div class="test-group">`;
            for (const test of tests) {
                html += `
                    <div class="test ${test.status}">
                        <span class="icon">${test.status === 'pass' ? '✅' : '❌'}</span>
                        <span class="name">${test.name.split(':').slice(1).join(':').trim()}</span>
                        ${test.error ? `<span class="error">(${test.error})</span>` : ''}
                    </div>
                `;
            }
            html += '</div>';
        }

        container.innerHTML = html;
    },

    /**
     * Run all tests
     */
    runAll() {
        this.reset();
        console.log('\n🧪 Running Session Order OS Tests...\n');

        // =====================
        // UTILS TESTS
        // =====================

        this.test('Utils: sanitizeHTML removes script tags', () => {
            const input = '<script>alert("xss")</script>';
            const result = Utils.sanitizeHTML(input);
            this.assertFalse(result.includes('<script>'));
        });

        this.test('Utils: sanitizeHTML escapes HTML entities', () => {
            const input = '<div>Hello</div>';
            const result = Utils.sanitizeHTML(input);
            this.assertTrue(result.includes('&lt;'));
            this.assertTrue(result.includes('&gt;'));
        });

        this.test('Utils: sanitizeHTML handles empty string', () => {
            this.assertEqual(Utils.sanitizeHTML(''), '');
        });

        this.test('Utils: sanitizeHTML handles non-string input', () => {
            this.assertEqual(Utils.sanitizeHTML(null), '');
            this.assertEqual(Utils.sanitizeHTML(undefined), '');
            this.assertEqual(Utils.sanitizeHTML(123), '');
        });

        this.test('Utils: escapeHTML escapes special characters', () => {
            const input = '<script>&"\'</script>';
            const result = Utils.escapeHTML(input);
            this.assertTrue(result.includes('&lt;'));
            this.assertTrue(result.includes('&amp;'));
            this.assertTrue(result.includes('&quot;'));
        });

        this.test('Utils: truncate shortens long strings', () => {
            const input = 'This is a very long string that should be truncated';
            const result = Utils.truncate(input, 20);
            this.assertEqual(result.length, 20);
            this.assertTrue(result.endsWith('...'));
        });

        this.test('Utils: truncate leaves short strings unchanged', () => {
            const input = 'Short';
            const result = Utils.truncate(input, 20);
            this.assertEqual(result, input);
        });

        this.test('Utils: formatDuration formats seconds correctly', () => {
            this.assertEqual(Utils.formatDuration(0), '0:00');
            this.assertEqual(Utils.formatDuration(65), '1:05');
            this.assertEqual(Utils.formatDuration(3661), '1:01:01');
        });

        this.test('Utils: getGradeBand returns correct band', () => {
            this.assertEqual(Utils.getGradeBand(1), 'A');
            this.assertEqual(Utils.getGradeBand(2), 'A');
            this.assertEqual(Utils.getGradeBand(3), 'B');
            this.assertEqual(Utils.getGradeBand(5), 'B');
            this.assertEqual(Utils.getGradeBand(6), 'C');
            this.assertEqual(Utils.getGradeBand(8), 'C');
            this.assertEqual(Utils.getGradeBand(9), 'D');
            this.assertEqual(Utils.getGradeBand(10), 'D');
            this.assertEqual(Utils.getGradeBand(11), 'E');
            this.assertEqual(Utils.getGradeBand(13), 'E');
        });

        this.test('Utils: wordCount counts words correctly', () => {
            this.assertEqual(Utils.wordCount('one two three'), 3);
            this.assertEqual(Utils.wordCount(''), 0);
            this.assertEqual(Utils.wordCount('single'), 1);
            this.assertEqual(Utils.wordCount('  multiple   spaces  '), 2);
        });

        this.test('Utils: generateId creates unique IDs', () => {
            const id1 = Utils.generateId();
            const id2 = Utils.generateId();
            this.assertTrue(id1.length > 0);
            this.assertTrue(id1 !== id2);
        });

        // =====================
        // VALIDATE TESTS
        // =====================

        this.test('Validate: valid AI response passes', () => {
            const validResponse = {
                category: 'FOCUS_OFF_TASK',
                severity: 2,
                confidence: 0.85,
                intentHypothesis: {
                    label: 'Student distracted by phone',
                    confidence: 0.8,
                    alternatives: ['Boredom', 'Anxiety']
                },
                recommendedResponse: {
                    immediateStep: 'Redirect attention',
                    ladderAction: 'Verbal redirect',
                    ladderStepSuggested: 2,
                    restorative: { type: 'reflection', prompt: 'What distracted you?' },
                    consequence: null
                },
                script: {
                    gentle: 'Hey, let\'s refocus.',
                    neutral: 'Please look here.',
                    firm: 'Devices down now.'
                },
                preventionTip: 'Set device rules at session start',
                fairnessNotes: ['Consider if work was too challenging']
            };

            const result = Validate.validateAIResponse(validResponse);
            this.assertTrue(result.valid);
            this.assertLength(result.errors, 0);
            this.assertTrue(result.sanitized !== null);
        });

        this.test('Validate: missing required fields fails', () => {
            const invalidResponse = {
                category: 'FOCUS_OFF_TASK'
                // Missing severity, confidence, recommendedResponse, script
            };

            const result = Validate.validateAIResponse(invalidResponse);
            this.assertFalse(result.valid);
            this.assertTrue(result.errors.length > 0);
        });

        this.test('Validate: invalid category fails', () => {
            const invalidResponse = {
                category: 'INVALID_CATEGORY',
                severity: 2,
                confidence: 0.85,
                recommendedResponse: { immediateStep: 'test' },
                script: { gentle: 'a', neutral: 'b', firm: 'c' }
            };

            const result = Validate.validateAIResponse(invalidResponse);
            this.assertFalse(result.valid);
            this.assertTrue(result.errors.some(e => e.includes('category')));
        });

        this.test('Validate: severity out of range fails', () => {
            const invalidResponse = {
                category: 'FOCUS_OFF_TASK',
                severity: 5, // Invalid
                confidence: 0.85,
                recommendedResponse: { immediateStep: 'test' },
                script: { gentle: 'a', neutral: 'b', firm: 'c' }
            };

            const result = Validate.validateAIResponse(invalidResponse);
            this.assertFalse(result.valid);
            this.assertTrue(result.errors.some(e => e.includes('severity')));
        });

        this.test('Validate: confidence out of range fails', () => {
            const invalidResponse = {
                category: 'FOCUS_OFF_TASK',
                severity: 2,
                confidence: 1.5, // Invalid
                recommendedResponse: { immediateStep: 'test' },
                script: { gentle: 'a', neutral: 'b', firm: 'c' }
            };

            const result = Validate.validateAIResponse(invalidResponse);
            this.assertFalse(result.valid);
        });

        this.test('Validate: non-object response fails', () => {
            const result = Validate.validateAIResponse('not an object');
            this.assertFalse(result.valid);
            this.assertTrue(result.errors.some(e => e.includes('object')));
        });

        this.test('Validate: null response fails', () => {
            const result = Validate.validateAIResponse(null);
            this.assertFalse(result.valid);
        });

        this.test('Validate: incident validation works', () => {
            const validIncident = {
                category: 'FOCUS_OFF_TASK',
                severity: 2,
                description: 'Student was looking at phone'
            };

            const result = Validate.validateIncident(validIncident);
            this.assertTrue(result.valid);
        });

        this.test('Validate: incident without category fails', () => {
            const invalidIncident = {
                severity: 2,
                description: 'Test'
            };

            const result = Validate.validateIncident(invalidIncident);
            this.assertFalse(result.valid);
            this.assertTrue(result.errors.some(e => e.includes('Category')));
        });

        this.test('Validate: incident with long description fails', () => {
            const invalidIncident = {
                category: 'FOCUS_OFF_TASK',
                severity: 2,
                description: 'x'.repeat(250) // Too long
            };

            const result = Validate.validateIncident(invalidIncident);
            this.assertFalse(result.valid);
            this.assertTrue(result.errors.some(e => e.includes('200')));
        });

        this.test('Validate: student validation works', () => {
            const validStudent = {
                name: 'John Doe',
                grade: 5
            };

            const result = Validate.validateStudent(validStudent);
            this.assertTrue(result.valid);
        });

        this.test('Validate: student without name fails', () => {
            const invalidStudent = {
                name: '',
                grade: 5
            };

            const result = Validate.validateStudent(invalidStudent);
            this.assertFalse(result.valid);
        });

        this.test('Validate: student with invalid grade fails', () => {
            const invalidStudent = {
                name: 'John',
                grade: 15 // Too high
            };

            const result = Validate.validateStudent(invalidStudent);
            this.assertFalse(result.valid);
        });

        this.test('Validate: worker endpoint validation', () => {
            this.assertTrue(Validate.validateWorkerEndpoint('https://example.workers.dev'));
            this.assertTrue(Validate.validateWorkerEndpoint('http://localhost:8787'));
            this.assertFalse(Validate.validateWorkerEndpoint('http://example.com'));
            this.assertFalse(Validate.validateWorkerEndpoint('not a url'));
            this.assertFalse(Validate.validateWorkerEndpoint(''));
        });

        this.test('Validate: export data validation', () => {
            const validData = {
                version: 1,
                exportedAt: Date.now(),
                students: [],
                sessions: [],
                incidents: [],
                config: []
            };

            const result = Validate.validateExportData(validData);
            this.assertTrue(result.valid);
        });

        this.test('Validate: export data missing version fails', () => {
            const invalidData = {
                exportedAt: Date.now(),
                students: [],
                sessions: [],
                incidents: []
            };

            const result = Validate.validateExportData(invalidData);
            this.assertFalse(result.valid);
        });

        // =====================
        // METHODOLOGY TESTS (if Methodology is loaded)
        // =====================

        if (typeof Methodology !== 'undefined') {
            this.test('Methodology: default config has all categories', () => {
                const config = Methodology.defaultConfig;
                this.assertTrue('categories' in config);
                this.assertTrue('FOCUS_OFF_TASK' in config.categories);
                this.assertTrue('INTERRUPTING' in config.categories);
                this.assertTrue('DISRESPECT_TONE' in config.categories);
                this.assertTrue('SAFETY_BOUNDARY' in config.categories);
            });

            this.test('Methodology: grade bands cover all grades', () => {
                const bands = Methodology.defaultConfig.gradeBands;
                const allGrades = new Set();
                Object.values(bands).forEach(band => {
                    band.grades.forEach(g => allGrades.add(g));
                });
                for (let i = 1; i <= 13; i++) {
                    this.assertTrue(allGrades.has(i), `Grade ${i} not covered`);
                }
            });

            this.test('Methodology: getCategory returns valid category', () => {
                const cat = Methodology.getCategory('FOCUS_OFF_TASK');
                this.assertTrue(cat !== null);
                this.assertTrue('label' in cat);
                this.assertTrue('ladder' in cat);
                this.assertTrue('scripts' in cat);
            });

            this.test('Methodology: getCategory returns null for invalid', () => {
                const cat = Methodology.getCategory('INVALID');
                this.assertTrue(cat === null);
            });

            this.test('Methodology: getLadderStep returns appropriate step', () => {
                const step = Methodology.getLadderStep('FOCUS_OFF_TASK', 0, 'C');
                this.assertTrue(step !== null);
                this.assertEqual(step.step, 1);
            });

            this.test('Methodology: getLadderStep escalates with count', () => {
                const step1 = Methodology.getLadderStep('FOCUS_OFF_TASK', 0, 'C');
                const step2 = Methodology.getLadderStep('FOCUS_OFF_TASK', 2, 'C');
                this.assertTrue(step2.step > step1.step);
            });

            this.test('Methodology: getScript returns string for all tones', () => {
                const gentle = Methodology.getScript('FOCUS_OFF_TASK', 'C', 'gentle');
                const neutral = Methodology.getScript('FOCUS_OFF_TASK', 'C', 'neutral');
                const firm = Methodology.getScript('FOCUS_OFF_TASK', 'C', 'firm');
                this.assertTrue(gentle.length > 0);
                this.assertTrue(neutral.length > 0);
                this.assertTrue(firm.length > 0);
            });

            this.test('Methodology: getSeverity returns valid info', () => {
                const sev = Methodology.getSeverity(2);
                this.assertTrue('name' in sev);
                this.assertTrue('color' in sev);
                this.assertEqual(sev.name, 'Moderate');
            });

            this.test('Methodology: deterministic recommendation works', () => {
                const incident = {
                    category: 'FOCUS_OFF_TASK',
                    severity: 2
                };
                const state = { FOCUS_OFF_TASK: 1, INTERRUPTING: 0 };
                const rec = Methodology.getDeterministicRecommendation(incident, state, 'C');

                this.assertTrue('category' in rec);
                this.assertTrue('ladderStep' in rec);
                this.assertTrue('scripts' in rec);
            });

            this.test('Methodology: getRules returns rules for band', () => {
                const rules = Methodology.getRules('A');
                this.assertTrue(Array.isArray(rules));
                this.assertTrue(rules.length > 0);
                this.assertTrue('rule' in rules[0]);
                this.assertTrue('icon' in rules[0]);
            });
        }

        // Render results
        this.render();

        console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed\n`);
        return { passed: this.passed, failed: this.failed };
    }
};

// Auto-run on button click
document.getElementById('runTests')?.addEventListener('click', () => {
    TestSuite.runAll();
});

// Export for console use
window.TestSuite = TestSuite;

// Log ready message
console.log('🧪 Test suite loaded. Click "Run All Tests" or call TestSuite.runAll() in console.');

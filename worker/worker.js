/**
 * Session Order OS - Cloudflare Worker
 * Secure proxy for DeepSeek AI API calls
 * 
 * SECURITY:
 * - API key stored as Cloudflare Worker secret (never in code)
 * - CORS restricted to allowed origins
 * - Request validation and size limits
 * - Rate limiting per IP
 * - No content logging
 */

// Rate limiting store (in-memory, resets on cold start)
const rateLimitStore = new Map();

// Configuration
const CONFIG = {
    // Maximum requests per IP per minute
    RATE_LIMIT: 10,
    RATE_LIMIT_WINDOW: 60000, // 1 minute in ms

    // Maximum request body size (10KB)
    MAX_REQUEST_SIZE: 10240,

    // DeepSeek API endpoint
    DEEPSEEK_API_URL: 'https://api.deepseek.com/chat/completions',

    // DeepSeek model
    MODEL: 'deepseek-chat',

    // Maximum tokens in response
    MAX_TOKENS: 1000,

    // Response timeout (ms)
    TIMEOUT: 30000
};

/**
 * System prompt for DeepSeek
 */
const SYSTEM_PROMPT = `You are an expert educational discipline advisor for K-12 tutoring sessions. Your role is to analyze student behavior incidents and recommend proportionate, restorative responses.

CRITICAL GUIDELINES:
1. These are MINORS - never recommend humiliation, threats, or unsafe practices
2. The TUTOR makes the final decision - you only recommend
3. Prefer de-escalation over punishment
4. Consider the student's age/grade band when making recommendations
5. Restorative practices should be the primary approach
6. Escalate only for severity 4 (critical) or repeated severity 3 incidents
7. If uncertain, choose the lower-impact intervention and note the uncertainty
8. Be culturally sensitive and avoid assumptions

You MUST respond with valid JSON only, matching this exact structure:
{
  "category": "FOCUS_OFF_TASK|INTERRUPTING|DISRESPECT_TONE|NON_COMPLIANCE|TECH_MISUSE|ACADEMIC_INTEGRITY|SAFETY_BOUNDARY|OTHER",
  "severity": 1-4,
  "confidence": 0.0-1.0,
  "intentHypothesis": {
    "label": "brief hypothesis about student's intent",
    "confidence": 0.0-1.0,
    "alternatives": ["alternative interpretation 1", "alternative interpretation 2"]
  },
  "recommendedResponse": {
    "immediateStep": "what to do right now",
    "ladderAction": "discipline ladder action to take",
    "ladderStepSuggested": 1-5,
    "restorative": { "type": "type of restorative practice", "prompt": "specific prompt or question to use" },
    "consequence": { "type": "consequence type if any", "detail": "specific details" }
  },
  "script": {
    "gentle": "script for gentle approach",
    "neutral": "script for neutral approach", 
    "firm": "script for firm approach"
  },
  "preventionTip": "tip to prevent this in future sessions",
  "fairnessNotes": ["any fairness considerations"]
}

Do not include any text before or after the JSON object.`;

/**
 * AI Feature Prompts - prompts for each AI feature
 */
const AI_PROMPTS = {
    // Session Prep Briefing
    'prep-briefing': `You are an expert educational advisor preparing a tutor for a session.

Based on the student's incident history and patterns, provide a pre-session briefing.

Respond with JSON:
{
  "riskLevel": "low|medium|high",
  "keyPatterns": ["pattern 1", "pattern 2"],
  "likelyIssues": ["issue 1", "issue 2"],
  "proactiveStrategies": ["strategy 1", "strategy 2"],
  "positiveNotes": ["positive observation 1"],
  "watchTimes": ["After 15 minutes focus may drop"],
  "suggestedApproach": "brief overall approach recommendation"
}`,

    // Smart Incident Description
    'generate-description': `You are helping a tutor document an incident objectively and concisely.

Based on the incident category, severity, and context, generate a brief, objective incident description.

Respond with JSON:
{
  "description": "2-3 sentence objective description of the incident",
  "alternateDescriptions": ["alternative wording 1", "alternative wording 2"]
}`,

    // De-escalation Coach
    'deescalation-coach': `You are a real-time de-escalation coach for tutors. The tutor needs IMMEDIATE, practical guidance.

Be concise and actionable. This is a tense moment.

Respond with JSON:
{
  "immediateAction": "what to do RIGHT NOW (1 sentence)",
  "breathingPrompt": "quick breathing or grounding technique",
  "script": "exact words to say to the student",
  "bodyLanguage": "physical positioning advice",
  "activitySuggestion": "quick activity to defuse tension",
  "dontDo": ["thing to avoid 1", "thing to avoid 2"],
  "recoveryPlan": "how to recover the session after de-escalation"
}`,

    // Session Summary Generator
    'session-summary': `You are generating a professional session summary for tutor records and parent communication.

Summarize the session balanced, highlighting both challenges and positives.

Respond with JSON:
{
  "overallRating": "excellent|good|challenging|difficult",
  "summary": "2-3 paragraph professional summary",
  "incidentSummary": "brief summary of any incidents",
  "positiveHighlights": ["positive 1", "positive 2"],
  "areasForImprovement": ["area 1"],
  "recommendationsForNextSession": ["recommendation 1"],
  "parentFriendlyVersion": "1 paragraph version suitable for parents"
}`,

    // Pattern Insights
    'pattern-insights': `You are an educational data analyst identifying behavior patterns across sessions.

Analyze the incident history and provide actionable insights.

Respond with JSON:
{
  "overallTrend": "improving|stable|concerning",
  "trendSummary": "1-2 sentence trend description",
  "topCategories": [{"category": "name", "count": 0, "trend": "up|down|stable"}],
  "peakProblemTimes": ["time pattern 1"],
  "improvingAreas": ["area 1"],
  "concerningPatterns": ["pattern 1"],
  "methodologyAdjustments": ["suggestion 1"],
  "crossStudentInsights": "any patterns across multiple students"
}`,

    // Custom Script Generator
    'generate-script': `You are an expert at crafting age-appropriate discipline scripts for tutors.

Generate scripts that are respectful, clear, and effective for the specific situation.

Respond with JSON:
{
  "gentle": "script for gentle approach",
  "neutral": "script for neutral approach",
  "firm": "script for firm approach",
  "followUp": "script for following up later",
  "parentVersion": "how to explain to parent if needed",
  "tips": ["delivery tip 1", "delivery tip 2"]
}`,

    // Parent Email Drafter
    'draft-email': `You are drafting a professional parent/guardian communication about tutoring session incidents.

The email should be professional, non-blaming, and solution-focused.

Respond with JSON:
{
  "subject": "email subject line",
  "informational": "full email in informational tone",
  "concerned": "full email in concerned tone",
  "positive": "full email highlighting positives while addressing issues",
  "callToAction": "suggested next steps for parent",
  "doNotInclude": ["things to avoid mentioning"]
}`,

    // Goal Suggestions
    'suggest-goals': `You are helping set achievable behavioral goals for a tutoring session.

Based on the student's history, suggest specific, measurable goals.

Respond with JSON:
{
  "primaryGoal": "main goal for this session",
  "secondaryGoals": ["goal 2", "goal 3"],
  "measurableCriteria": ["how to measure success 1"],
  "microGoals": ["small achievable goal for first 10 min"],
  "rewardSuggestion": "appropriate positive reinforcement",
  "rationale": "why these goals were chosen"
}`,

    // Behavior Prediction
    'predict-behavior': `You are predicting likely behavior patterns for an upcoming or current session.

Be probabilistic and helpful, not alarming.

Respond with JSON:
{
  "overallRisk": "low|moderate|elevated",
  "predictions": [
    {"category": "FOCUS_OFF_TASK", "likelihood": 0.0-1.0, "peakTime": "when most likely", "triggers": ["trigger 1"]}
  ],
  "protectiveFactors": ["factor that reduces risk"],
  "proactiveMeasures": ["what to do to prevent issues"],
  "earlyWarningSign": "what to watch for"
}`,

    // Resolution Advisor
    'resolution-steps': `You are advising on how to resolve a specific incident and prevent recurrence.

Provide a concrete step-by-step plan.

Respond with JSON:
{
  "immediateResolution": ["step 1", "step 2", "step 3"],
  "sameSessionFollowUp": "what to do later in this session",
  "nextSessionFollowUp": "what to do at start of next session",
  "preventionPlan": ["strategy to prevent recurrence 1"],
  "parentInvolvement": "whether/how to involve parent",
  "successIndicators": ["how to know it's resolved"],
  "ifItHappensAgain": "what to do if the behavior repeats"
}`,

    // Smart Analyze - Auto-severity and session intelligence
    'smart-analyze': `You are analyzing a tutoring session incident to determine severity and provide real-time guidance.

CRITICAL: You will receive:
1. The CURRENT INCIDENT with its description - analyze WHAT ACTUALLY HAPPENED
2. ALL PAST INCIDENTS in this session with their details - look for patterns

Your job:
1. READ and ANALYZE the current incident description carefully - don't just use the category
2. Determine severity (1-5) based on WHAT HAPPENED + grade + session context
3. Consider ALL past incidents for pattern detection
4. Provide immediate action recommendation
5. Adapt language for the student's grade level

---
FORMAL SEVERITY DEFINITIONS (1-5):
---

LEVEL 1 — MINOR
Definition: A brief, low-impact disruption that is easily correctable with redirection and does not significantly interfere with learning.
Characteristics: Short duration, No intent to defy or harm, Stops immediately when corrected
Immediate response: Redirect attention

LEVEL 2 — MODERATE  
Definition: A repeated or intentional disruption that interferes with learning flow but does not involve disrespect, refusal, or integrity violations.
Characteristics: Patterned behavior, Requires pausing instruction, Student understands expectations but is not meeting them
Immediate response: Pause and address directly

LEVEL 3 — MAJOR
Definition: A behavior that significantly disrupts instruction, shows disrespect, refusal, or misuse of systems, and requires formal intervention.
Characteristics: Clear choice by the student, Undermines tutor authority or session effectiveness, Cannot be resolved with simple redirection
Immediate response: Stop activity, formal intervention

LEVEL 4 — CRITICAL
Definition: A violation of safety, personal boundaries, or academic integrity that prevents the session from continuing under acceptable conditions.
Characteristics: Non-negotiable boundary crossed, Teaching cannot continue productively or safely, Requires documentation and parent involvement
Immediate response: Immediate session stop protocol

LEVEL 5 — TERMINATING
Definition: A severe or repeated critical violation indicating that the tutoring relationship cannot continue.
Characteristics: Abuse, threats, or repeated integrity violations; Refusal to comply after Level 4; Risk to tutor, student, or program integrity
Immediate response: Termination of services

---
BASE SEVERITY BY CATEGORY AND GRADE (starting point - can escalate):
---
| Behavior         | G1-2 | G3-5 | G6-8 | G9-10 | G11-13 |
|------------------|------|------|------|-------|--------|
| Off-task         | 1    | 1    | 2    | 2     | 2      |
| Interrupting     | 1    | 2    | 2    | 3     | 3      |
| Disrespect/Tone  | 2    | 2    | 3    | 4     | 4      |
| Refusal          | 2    | 3    | 3    | 4     | 4      |
| Device misuse    | 2    | 3    | 3    | 4     | 4      |
| AI/Cheating      | 1    | 2    | 3    | 4     | 4 (→5) |
| Safety           | 4    | 4    | 4    | 4     | 4      |

Note: Safety is always Level 4 minimum. Can escalate to Level 5 if threats/abuse/repeated.
AI/Cheating for G11-13 can escalate to 5 if repeated.

---
ESCALATION FACTORS (increase severity):
---
- Incident description shows INTENT or MALICE
- Personal attacks, insults, or verbal abuse in description
- Multiple incidents of same type in session
- Incidents occurring rapidly (3+ in 10 min)
- Explicit defiance or refusal in description
- Prior Level 4 incident already occurred
- Description mentions threats, harassment, or safety issues

---
GRADE-AWARE RESPONSE APPROACH:
---
FOR GRADES 1-6 - EXTERNAL STRUCTURE:
- Clear, direct language
- Immediate consequences
- Visual feedback

FOR GRADES 7-12 - INTERNAL ACCOUNTABILITY:
- Ownership-focused language
- Logical consequences
- Treat as adults-in-training

Respond with JSON only:
{
  "severity": 1-5,
  "severityConfidence": 0.0-1.0,
  "severityReasoning": "explanation referencing the ACTUAL incident description and why this severity",
  "gradeApproach": "external_structure|internal_accountability",
  "actionPlan": {
    "type": "continue|break|reduce_difficulty|guided_practice|switch_activity|end_session|terminate_services",
    "urgency": "low|medium|high|critical|terminating",
    "message": "What to say/do RIGHT NOW - age-appropriate",
    "scriptForStudent": "Exact words to say to the student",
    "duration": null or seconds for break,
    "showVisualFeedback": true/false
  },
  "sessionStatus": {
    "shouldStop": true/false,
    "shouldTerminate": true/false,
    "stopReason": "reason if stopping, else null",
    "warningLevel": "green|yellow|orange|red|black",
    "warningMessage": "status for tutor",
    "incidentsToConsequence": number or null
  },
  "patternDetected": "description of pattern from past incidents or null"
}\``,

    // Critical Incident Email (Level 4) - Session stop notification
    'critical-incident-email': `You are drafting a professional parent/guardian email about a CRITICAL (Level 4) incident that required stopping the tutoring session.

The email should:
- Be professional, clear, and non-accusatory
- Explain what happened factually
- Describe why the session was stopped
- Emphasize concern for the student's learning
- Suggest next steps and path forward
- NOT blame the student but describe the behavior

Respond with JSON:
{
  "subject": "Important: Tutoring Session Update - [Date]",
  "email": "Full professional email body",
  "keyPoints": ["point 1", "point 2"],
  "suggestedNextSteps": ["step 1", "step 2"],
  "toneUsed": "concerned|informational|serious"
}`,

    // Termination Email (Level 5) - Service termination notification
    'termination-email': `You are drafting a professional parent/guardian email about SERVICE TERMINATION due to severe/repeated critical violations (Level 5).

The email should:
- Be formal, clear, and professional
- Document the pattern of incidents that led to this decision
- Explain that services are being terminated
- NOT be punitive in tone but factual
- Provide any remaining administrative details
- Express hope for the student's future success elsewhere

This is a FINAL communication. Be respectful but firm.

Respond with JSON:
{
  "subject": "Notice: Tutoring Services Conclusion",
  "email": "Full professional email body",
  "incidentSummary": "Brief summary of incidents leading to termination",
  "effectiveDate": "Immediate",
  "closingWishes": "Professional closing sentiment",
  "legalNote": "Any suggested disclaimer about decision being final"
}`
};




/**
 * Build user prompt from context
 */
function buildUserPrompt(payload) {
    return `Analyze this tutoring session incident:

STUDENT CONTEXT:
- Grade: ${payload.student.grade}
- Grade Band: ${payload.student.band} (${payload.student.bandName})

SESSION CONTEXT:
- Mode: ${payload.session.mode}
- Time into session: ${Math.floor(payload.session.timeIntoSession / 60)} minutes
- Current discipline state: ${JSON.stringify(payload.session.disciplineState)}

INCIDENT:
- Category (tutor's initial classification): ${payload.incident.category} (${payload.incident.categoryLabel})
- Severity guess: ${payload.incident.severityGuess}
- Description: "${payload.incident.description}"
${payload.incident.context ? `- Additional context: "${payload.incident.context}"` : ''}

METHODOLOGY CONSTRAINTS:
- Maximum ladder step for this band: ${payload.methodology.maxLadderStep}
- Parent contact threshold: ${payload.methodology.parentContactThreshold} incidents
- Allowed consequences: ${payload.methodology.allowedConsequences.join(', ')}
- NOT allowed: ${payload.methodology.notAllowedConsequences.join(', ')}

LADDER STEPS AVAILABLE:
${payload.methodology.ladderSummary.map(s => `Step ${s.step}: ${s.action}`).join('\n')}

Provide your analysis as a JSON object following the exact schema specified.`;
}

/**
 * Check rate limit for an IP
 */
function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - CONFIG.RATE_LIMIT_WINDOW;

    // Get or create entry for this IP
    let entry = rateLimitStore.get(ip);
    if (!entry) {
        entry = { requests: [], blocked: false };
        rateLimitStore.set(ip, entry);
    }

    // Remove old requests outside the window
    entry.requests = entry.requests.filter(time => time > windowStart);

    // Check if over limit
    if (entry.requests.length >= CONFIG.RATE_LIMIT) {
        return false;
    }

    // Add this request
    entry.requests.push(now);
    return true;
}

/**
 * Validate request payload
 */
function validatePayload(payload) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
        errors.push('Request body must be a JSON object');
        return errors;
    }

    // Required fields
    if (!payload.student || typeof payload.student !== 'object') {
        errors.push('Missing student context');
    } else {
        if (typeof payload.student.grade !== 'number' || payload.student.grade < 1 || payload.student.grade > 13) {
            errors.push('Invalid student grade (must be 1-13)');
        }
    }

    if (!payload.session || typeof payload.session !== 'object') {
        errors.push('Missing session context');
    }

    if (!payload.incident || typeof payload.incident !== 'object') {
        errors.push('Missing incident data');
    } else {
        if (!payload.incident.category) {
            errors.push('Missing incident category');
        }
        if (!payload.incident.description || payload.incident.description.length > 500) {
            errors.push('Invalid incident description (required, max 500 chars)');
        }
    }

    return errors;
}

/**
 * Get allowed origins from environment or default
 */
function getAllowedOrigins(env) {
    // Check for custom allowed origins in environment
    if (env.ALLOWED_ORIGINS) {
        return env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
    }

    // Default: allow localhost for development
    return [
        'http://localhost:8080',
        'http://localhost:3000',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:3000'
    ];
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin, env) {
    if (!origin) return false;
    const allowedOrigins = getAllowedOrigins(env);
    return allowedOrigins.some(allowed => {
        if (allowed === '*') return true;
        if (allowed.endsWith('*')) {
            return origin.startsWith(allowed.slice(0, -1));
        }
        return origin === allowed;
    });
}

/**
 * Create CORS headers
 */
function corsHeaders(origin, env) {
    const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };

    if (isOriginAllowed(origin, env)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }

    return headers;
}

/**
 * Handle CORS preflight
 */
function handleOptions(request, env) {
    const origin = request.headers.get('Origin');
    return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, env)
    });
}

/**
 * Handle health check
 */
function handleHealth(request, env) {
    const origin = request.headers.get('Origin');
    return new Response(JSON.stringify({
        status: 'ok',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin, env)
        }
    });
}

/**
 * Handle analyze request
 */
async function handleAnalyze(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
        'Content-Type': 'application/json',
        ...corsHeaders(origin, env)
    };

    // Check origin
    if (!isOriginAllowed(origin, env)) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
            status: 403,
            headers
        });
    }

    // Check rate limit
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(clientIP)) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait.' }), {
            status: 429,
            headers: {
                ...headers,
                'Retry-After': '60'
            }
        });
    }

    // Check API key is configured
    if (!env.DEEPSEEK_API_KEY) {
        return new Response(JSON.stringify({ error: 'AI service not configured' }), {
            status: 503,
            headers
        });
    }

    // Check content length
    const contentLength = parseInt(request.headers.get('Content-Length') || '0');
    if (contentLength > CONFIG.MAX_REQUEST_SIZE) {
        return new Response(JSON.stringify({ error: 'Request too large' }), {
            status: 413,
            headers
        });
    }

    // Parse body
    let payload;
    try {
        payload = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers
        });
    }

    // Validate payload
    const validationErrors = validatePayload(payload);
    if (validationErrors.length > 0) {
        return new Response(JSON.stringify({
            error: 'Validation failed',
            details: validationErrors
        }), {
            status: 400,
            headers
        });
    }

    // Build prompts
    const userPrompt = buildUserPrompt(payload);

    // Call DeepSeek API
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

        const deepseekResponse = await fetch(CONFIG.DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: CONFIG.MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: CONFIG.MAX_TOKENS,
                temperature: 0.3,
                response_format: { type: 'json_object' }
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!deepseekResponse.ok) {
            const errorText = await deepseekResponse.text();
            console.error('DeepSeek API error:', deepseekResponse.status, errorText);
            return new Response(JSON.stringify({
                error: 'AI service error',
                status: deepseekResponse.status
            }), {
                status: 502,
                headers
            });
        }

        const deepseekData = await deepseekResponse.json();

        // Extract the content
        const content = deepseekData.choices?.[0]?.message?.content;
        if (!content) {
            return new Response(JSON.stringify({ error: 'Empty response from AI' }), {
                status: 502,
                headers
            });
        }

        // Parse the JSON response
        let analysisResult;
        try {
            analysisResult = JSON.parse(content);
        } catch (e) {
            console.error('Failed to parse AI response:', content);
            return new Response(JSON.stringify({
                error: 'Invalid response format from AI',
                raw: content.substring(0, 200)
            }), {
                status: 502,
                headers
            });
        }

        // Return the analysis
        return new Response(JSON.stringify(analysisResult), {
            status: 200,
            headers
        });

    } catch (error) {
        if (error.name === 'AbortError') {
            return new Response(JSON.stringify({ error: 'Request timeout' }), {
                status: 504,
                headers
            });
        }

        console.error('Unexpected error:', error);
        return new Response(JSON.stringify({ error: 'Internal error' }), {
            status: 500,
            headers
        });
    }
}

/**
 * Build AI user prompt based on action and context
 */
function buildAIUserPrompt(action, payload) {
    const context = payload.context || {};

    switch (action) {
        case 'prep-briefing':
            return `Prepare a session briefing for:

STUDENT: Grade ${context.grade} (${context.bandName})
INCIDENT HISTORY (${context.incidentCount || 0} total incidents):
${context.incidentSummary || 'No prior incidents'}

PATTERNS OBSERVED:
${context.patterns || 'None identified yet'}

Provide actionable briefing for the upcoming session.`;

        case 'generate-description':
            return `Generate an incident description:

CATEGORY: ${context.category} (${context.categoryLabel})
SEVERITY: ${context.severity}
TIME INTO SESSION: ${context.timeIntoSession || 0} minutes
STUDENT GRADE: ${context.grade}
ADDITIONAL CONTEXT: ${context.additionalContext || 'None provided'}

Generate a concise, objective description.`;

        case 'deescalation-coach':
            return `URGENT: Tutor needs de-escalation help NOW.

SITUATION: ${context.situation}
STUDENT: Grade ${context.grade} (${context.bandName})
CURRENT STATE: ${context.currentState || 'Escalating'}
WHAT HAPPENED: ${context.whatHappened || 'Behavior escalating'}

Provide IMMEDIATE, practical de-escalation guidance.`;

        case 'session-summary':
            return `Generate session summary:

STUDENT: ${context.studentName || 'Student'}, Grade ${context.grade}
SESSION DURATION: ${context.duration || 0} minutes
MODE: ${context.mode || 'in-person'}

INCIDENTS (${context.incidents?.length || 0}):
${context.incidents?.map(i => `- ${i.category}: ${i.description} (Severity ${i.severity})`).join('\n') || 'None'}

GOALS SET: ${context.goals?.join(', ') || 'None specified'}
GOALS MET: ${context.goalsMet || 'Not tracked'}

Generate a professional, balanced summary.`;

        case 'pattern-insights':
            return `Analyze behavior patterns:

DATA RANGE: Last ${context.daysAnalyzed || 30} days
TOTAL INCIDENTS: ${context.totalIncidents || 0}

INCIDENT BREAKDOWN BY CATEGORY:
${context.categoryBreakdown || 'No data'}

TIME PATTERNS:
${context.timePatterns || 'No data'}

STUDENT(S) INCLUDED: ${context.studentCount || 1}

Identify actionable patterns and recommendations.`;

        case 'generate-script':
            return `Generate discipline scripts:

SITUATION: ${context.situation}
STUDENT: Grade ${context.grade} (${context.bandName})
BEHAVIOR CATEGORY: ${context.category || 'General'}
DESIRED OUTCOME: ${context.desiredOutcome || 'Return to task'}
TONE PREFERENCE: ${context.tonePreference || 'balanced'}

Generate age-appropriate scripts in gentle, neutral, and firm tones.`;

        case 'draft-email':
            return `Draft parent email:

STUDENT: ${context.studentName || 'Student'}, Grade ${context.grade}
INCIDENT(S):
${context.incidents?.map(i => `- ${i.category}: ${i.description}`).join('\n') || 'General behavior concern'}

ACTIONS TAKEN: ${context.actionsTaken || 'Addressed in session'}
TUTOR NOTES: ${context.tutorNotes || 'None'}
EMAIL TONE REQUESTED: ${context.tone || 'informational'}

Draft professional, non-blaming parent communication.`;

        case 'suggest-goals':
            return `Suggest session goals:

STUDENT: Grade ${context.grade} (${context.bandName})
RECENT INCIDENTS (last 5 sessions):
${context.recentIncidents || 'None'}

PREVIOUS GOALS: ${context.previousGoals || 'None set'}
PREVIOUS GOAL SUCCESS: ${context.goalSuccess || 'Not tracked'}
SESSION TYPE: ${context.sessionType || 'Regular tutoring'}

Suggest specific, achievable behavioral goals.`;

        case 'predict-behavior':
            return `Predict session behavior:

STUDENT: Grade ${context.grade} (${context.bandName})
SESSION TIME: ${context.sessionTime || 'Afternoon'}
SESSION DURATION PLANNED: ${context.plannedDuration || 60} minutes

HISTORICAL PATTERNS:
${context.historicalPatterns || 'No history'}

CURRENT CONDITIONS:
- Day of week: ${context.dayOfWeek || 'Unknown'}
- Time since last session: ${context.daysSinceLastSession || 'Unknown'}
- Last session summary: ${context.lastSessionSummary || 'Unknown'}

Predict likely behavior patterns and provide proactive measures.`;

        case 'resolution-steps':
            return `Advise on incident resolution:

INCIDENT: ${context.category} (${context.categoryLabel})
DESCRIPTION: ${context.description}
SEVERITY: ${context.severity}
STUDENT: Grade ${context.grade} (${context.bandName})
ACTIONS ALREADY TAKEN: ${context.actionsTaken || 'None yet'}
STUDENT RESPONSE: ${context.studentResponse || 'Unknown'}

Provide step-by-step resolution plan.`;

        case 'smart-analyze':
            // Build incident history with FULL DETAILS
            const incidents = context.sessionIncidents || [];
            const incidentHistory = incidents.map((inc, i) =>
                `  ${i + 1}. [${inc.category}] Severity ${inc.severity} @ ${inc.timeIntoSession || 0}min
     Description: "${inc.description || 'No description provided'}"`
            ).join('\n') || '  None';

            // Calculate incident rate
            const recentIncidents = incidents.filter(inc => {
                const incTime = inc.timeIntoSession || 0;
                const currentTime = context.timeIntoSession || 0;
                return (currentTime - incTime) <= 10; // Last 10 minutes
            });

            // Check for prior Level 4 incidents
            const priorCritical = incidents.filter(inc => inc.severity >= 4).length;

            return `Analyze this incident and determine severity (1-5) + action guidance:

===== CURRENT INCIDENT (ANALYZE THIS) =====
- Category: ${context.category} (${context.categoryLabel})
- Description of what happened: "${context.description || 'No description provided'}"
- Time into session: ${context.timeIntoSession || 0} minutes
${context.additionalContext ? `- Additional context: "${context.additionalContext}"` : ''}

READ THE DESCRIPTION CAREFULLY. The severity depends on WHAT ACTUALLY HAPPENED, not just the category.

===== STUDENT INFO =====
- Grade: ${context.grade} (${context.bandName})

===== SESSION STATE =====
- Total incidents so far: ${incidents.length}
- Incidents in last 10 min: ${recentIncidents.length}
- Prior Critical (Level 4+) incidents: ${priorCritical}
- Session duration: ${context.timeIntoSession || 0} minutes

===== ALL PRIOR INCIDENTS THIS SESSION (with details) =====
${incidentHistory}

Look for patterns across all incidents. Determine severity 1-5 based on:
1. What the current description says happened
2. Pattern from prior incidents
3. Student's grade
4. Whether this escalates prior incidents`;

        case 'critical-incident-email':
            return `Draft a Level 4 Critical Incident email for parent/guardian:

STUDENT: ${context.studentName || 'Student'}, Grade ${context.grade}
SESSION DATE: ${context.sessionDate || new Date().toLocaleDateString()}

THE CRITICAL INCIDENT:
- Category: ${context.incident?.category || 'Critical violation'}
- Description: ${context.incident?.description || 'A critical incident occurred'}
- Severity Level: 4 (Critical)

ALL SESSION INCIDENTS:
${context.allIncidents?.map(i => `- ${i.category}: ${i.description} (Severity ${i.severity})`).join('\n') || 'This was the only incident'}

ACTIONS TAKEN:
- Session was stopped for student safety/learning integrity
- Incident documented
- Parent notification being sent

Draft a professional email explaining what happened and next steps.`;

        case 'termination-email':
            return `Draft a Level 5 Service Termination email:

STUDENT: ${context.studentName || 'Student'}, Grade ${context.grade}
TERMINATION DATE: ${new Date().toLocaleDateString()}

THE TERMINATING INCIDENT:
- Category: ${context.incident?.category || 'Severe violation'}
- Description: ${context.incident?.description || 'A severe incident occurred'}
- Severity Level: 5 (Terminating)

FULL INCIDENT HISTORY LEADING TO TERMINATION:
${context.allIncidents?.map(i => `- ${new Date(i.timestamp).toLocaleDateString()}: ${i.category} - ${i.description} (Severity ${i.severity})`).join('\n') || 'Multiple critical incidents'}

REASON FOR TERMINATION:
${context.terminationReason || 'Repeated critical violations making the tutoring relationship untenable'}

Draft a formal, professional termination notice.`;

        default:
            return `Context: ${JSON.stringify(context)}`;
    }
}

/**
 * Handle unified AI endpoint for all AI features
 */
async function handleAI(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
        'Content-Type': 'application/json',
        ...corsHeaders(origin, env)
    };

    // Check origin
    if (!isOriginAllowed(origin, env)) {
        return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
            status: 403,
            headers
        });
    }

    // Check rate limit
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(clientIP)) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait.' }), {
            status: 429,
            headers: {
                ...headers,
                'Retry-After': '60'
            }
        });
    }

    // Check API key is configured
    if (!env.DEEPSEEK_API_KEY) {
        return new Response(JSON.stringify({ error: 'AI service not configured' }), {
            status: 503,
            headers
        });
    }

    // Parse body
    let payload;
    try {
        payload = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers
        });
    }

    // Validate action
    const action = payload.action;
    if (!action || !AI_PROMPTS[action]) {
        return new Response(JSON.stringify({
            error: 'Invalid or missing action',
            validActions: Object.keys(AI_PROMPTS)
        }), {
            status: 400,
            headers
        });
    }

    // Build prompts
    const systemPrompt = AI_PROMPTS[action];
    const userPrompt = buildAIUserPrompt(action, payload);

    // Call DeepSeek API
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

        const deepseekResponse = await fetch(CONFIG.DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: CONFIG.MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: CONFIG.MAX_TOKENS,
                temperature: 0.4,
                response_format: { type: 'json_object' }
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!deepseekResponse.ok) {
            const errorText = await deepseekResponse.text();
            console.error('DeepSeek API error:', deepseekResponse.status, errorText);
            return new Response(JSON.stringify({
                error: 'AI service error',
                status: deepseekResponse.status
            }), {
                status: 502,
                headers
            });
        }

        const deepseekData = await deepseekResponse.json();

        // Extract the content
        const content = deepseekData.choices?.[0]?.message?.content;
        if (!content) {
            return new Response(JSON.stringify({ error: 'Empty response from AI' }), {
                status: 502,
                headers
            });
        }

        // Parse the JSON response
        let result;
        try {
            result = JSON.parse(content);
        } catch (e) {
            console.error('Failed to parse AI response:', content);
            return new Response(JSON.stringify({
                error: 'Invalid response format from AI',
                raw: content.substring(0, 200)
            }), {
                status: 502,
                headers
            });
        }

        // Return the result with action metadata
        return new Response(JSON.stringify({
            action,
            result,
            timestamp: new Date().toISOString()
        }), {
            status: 200,
            headers
        });

    } catch (error) {
        if (error.name === 'AbortError') {
            return new Response(JSON.stringify({ error: 'Request timeout' }), {
                status: 504,
                headers
            });
        }

        console.error('Unexpected error:', error);
        return new Response(JSON.stringify({ error: 'Internal error' }), {
            status: 500,
            headers
        });
    }
}

/**
 * Main request handler
 */
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Handle CORS preflight for all paths
        if (request.method === 'OPTIONS') {
            return handleOptions(request, env);
        }

        // Route requests
        switch (path) {
            case '/health':
            case '/':
                return handleHealth(request, env);

            case '/analyze':
                if (request.method !== 'POST') {
                    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                        status: 405,
                        headers: {
                            'Content-Type': 'application/json',
                            'Allow': 'POST, OPTIONS'
                        }
                    });
                }
                return handleAnalyze(request, env);

            case '/ai':
                if (request.method !== 'POST') {
                    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                        status: 405,
                        headers: {
                            'Content-Type': 'application/json',
                            'Allow': 'POST, OPTIONS'
                        }
                    });
                }
                return handleAI(request, env);

            default:
                return new Response(JSON.stringify({ error: 'Not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
        }
    }
};

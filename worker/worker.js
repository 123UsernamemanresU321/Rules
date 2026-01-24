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

            default:
                return new Response(JSON.stringify({ error: 'Not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
        }
    }
};

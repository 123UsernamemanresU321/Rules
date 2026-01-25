/**
 * Session Order OS - Methodology Configuration
 * Comprehensive discipline methodology for Grades 1-13
 */

const Methodology = {
    /**
     * Default methodology configuration
     */
    defaultConfig: {
        version: 1,
        lastUpdated: null,

        // Grade bands
        gradeBands: {
            A: {
                grades: [1, 2],
                name: 'Early Primary',
                description: 'Immediate, visual, short cycles',
                maxLadderStep: 3,
                parentContactThreshold: 3,
                sessionStopThreshold: 2
            },
            B: {
                grades: [3, 4, 5],
                name: 'Upper Primary',
                description: 'Structured choices, early accountability',
                maxLadderStep: 4,
                parentContactThreshold: 4,
                sessionStopThreshold: 3
            },
            C: {
                grades: [6, 7, 8],
                name: 'Middle School',
                description: 'Contracts and restorative routines',
                maxLadderStep: 5,
                parentContactThreshold: 5,
                sessionStopThreshold: 3
            },
            D: {
                grades: [9, 10],
                name: 'Early High School',
                description: 'Professional norms, performance accountability',
                maxLadderStep: 5,
                parentContactThreshold: 6,
                sessionStopThreshold: 4
            },
            E: {
                grades: [11, 12, 13],
                name: 'Senior High School',
                description: 'Partnership model with firm boundaries',
                maxLadderStep: 5,
                parentContactThreshold: 6,
                sessionStopThreshold: 4
            }
        },

        // Severity definitions (formal 5-level system)
        severityLevels: {
            1: {
                name: 'Minor',
                description: 'A brief, low-impact disruption that is easily correctable with redirection and does not significantly interfere with learning.',
                characteristics: ['Short duration', 'No intent to defy or harm', 'Stops immediately when corrected'],
                color: '#fbbf24',
                immediateAction: 'Redirect attention'
            },
            2: {
                name: 'Moderate',
                description: 'A repeated or intentional disruption that interferes with learning flow but does not involve disrespect, refusal, or integrity violations.',
                characteristics: ['Patterned behavior', 'Requires pausing instruction', 'Student understands expectations but is not meeting them'],
                color: '#f97316',
                immediateAction: 'Pause and address directly'
            },
            3: {
                name: 'Major',
                description: 'A behavior that significantly disrupts instruction, shows disrespect, refusal, or misuse of systems, and requires formal intervention.',
                characteristics: ['Clear choice by the student', 'Undermines tutor authority or session effectiveness', 'Cannot be resolved with simple redirection'],
                color: '#ef4444',
                immediateAction: 'Stop activity, formal intervention'
            },
            4: {
                name: 'Critical',
                description: 'A violation of safety, personal boundaries, or academic integrity that prevents the session from continuing under acceptable conditions.',
                characteristics: ['Non-negotiable boundary crossed', 'Teaching cannot continue productively or safely', 'Requires documentation and parent involvement'],
                color: '#dc2626',
                immediateAction: 'Immediate session stop protocol'
            },
            5: {
                name: 'Terminating',
                description: 'A severe or repeated critical violation indicating that the tutoring relationship cannot continue.',
                characteristics: ['Abuse, threats, or repeated integrity violations', 'Refusal to comply after Level 4', 'Risk to tutor, student, or program integrity'],
                color: '#7f1d1d',
                immediateAction: 'Termination of services'
            }
        },

        // Categories with ladders and scripts
        categories: {
            FOCUS_OFF_TASK: {
                label: 'Off-Task Behavior',
                shortLabel: 'Off-task',
                icon: '👀',
                keyboardShortcut: '1',
                description: 'Looking away, daydreaming, distracted',

                ladder: [
                    {
                        step: 1,
                        name: 'Proximity/Visual Redirect',
                        action: 'Move closer, use visual cue, gentle tap on desk',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 2,
                        name: 'Verbal Redirect',
                        action: 'Use student name, brief verbal prompt',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 3,
                        name: 'Choice Offering',
                        action: 'Offer two acceptable choices for re-engagement',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 4,
                        name: 'Reset Break',
                        action: 'Short break to reset, followed by fresh start',
                        bands: ['B', 'C', 'D', 'E']
                    },
                    {
                        step: 5,
                        name: 'Session Modification',
                        action: 'Reduce difficulty, switch activity type',
                        bands: ['C', 'D', 'E']
                    }
                ],

                scripts: {
                    gentle: {
                        A: "Eyes here, sweetie. Let's look at this together.",
                        B: "I notice your eyes wandering. Let's bring focus back here.",
                        C: "Hey, I'm losing you. What's on your mind?",
                        D: "Let's pause. Where are we in the problem?",
                        E: "I notice you've drifted. Want to take a quick break or push through?"
                    },
                    neutral: {
                        A: "Look here please. This is important.",
                        B: "Focus here now. We have 10 more minutes of this.",
                        C: "I need your attention on this. What's the next step?",
                        D: "We're losing time. Let's refocus on the goal.",
                        E: "Time check—we have limited session time. Let's use it well."
                    },
                    firm: {
                        A: "Eyes on me. We need to finish this first.",
                        B: "This is the third time I've asked for focus. What's happening?",
                        C: "This is becoming a pattern. We need to address it now.",
                        D: "This isn't working. Let's stop and reset expectations.",
                        E: "We need to have a direct conversation about session focus."
                    }
                },

                restorative: {
                    type: 'reflection',
                    prompt: 'What was pulling your attention away? How can we make the work more engaging?'
                },

                consequences: {
                    allowed: ['reset_break', 'activity_switch', 'difficulty_reduction'],
                    notAllowed: ['session_end', 'parent_contact']
                }
            },

            INTERRUPTING: {
                label: 'Interrupting',
                shortLabel: 'Interrupting',
                icon: '🗣️',
                keyboardShortcut: '2',
                description: 'Speaking over, not waiting turn, derailing conversation',

                ladder: [
                    {
                        step: 1,
                        name: 'Hand Signal',
                        action: 'Use quiet hand signal to pause, then continue',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 2,
                        name: 'Verbal Reminder',
                        action: 'Brief reminder about turn-taking',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 3,
                        name: 'Wait Time Practice',
                        action: 'Explicit practice of waiting and signal use',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 4,
                        name: 'Discussion',
                        action: 'Brief discussion about impact of interrupting',
                        bands: ['B', 'C', 'D', 'E']
                    },
                    {
                        step: 5,
                        name: 'Structure Change',
                        action: 'Implement turn-taking structure or timer',
                        bands: ['C', 'D', 'E']
                    }
                ],

                scripts: {
                    gentle: {
                        A: "Wait for me to finish, then you can share.",
                        B: "Hold that thought! I'll come back to you in just a moment.",
                        C: "I want to hear your idea—let me finish this point first.",
                        D: "Good thought—but let me complete this before we discuss.",
                        E: "Let me pause you there—we'll circle back to your point."
                    },
                    neutral: {
                        A: "My turn first, then yours.",
                        B: "Remember our rule: wait, then speak.",
                        C: "I need you to wait until I'm done explaining.",
                        D: "Please hold. I'll address that in a moment.",
                        E: "Let's maintain our discussion structure."
                    },
                    firm: {
                        A: "Stop. I'm talking now.",
                        B: "This is the third interrupt. We need to practice waiting.",
                        C: "Interrupting is making this harder. Let's reset how we talk.",
                        D: "We can't proceed productively with constant interruptions.",
                        E: "I need you to demonstrate you can wait before I continue."
                    }
                },

                restorative: {
                    type: 'practice',
                    prompt: "Let's practice: I'll speak for 30 seconds, then you respond. Ready?"
                },

                consequences: {
                    allowed: ['wait_time', 'turn_taking_structure'],
                    notAllowed: ['session_end']
                }
            },

            DISRESPECT_TONE: {
                label: 'Disrespect/Tone',
                shortLabel: 'Tone',
                icon: '😤',
                keyboardShortcut: '3',
                description: 'Eye rolling, sighing, rude tone, dismissive language',

                ladder: [
                    {
                        step: 1,
                        name: 'Acknowledge Emotion',
                        action: 'Name the emotion, validate frustration if present',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 2,
                        name: 'Tone Check',
                        action: 'Calmly note the tone and request reset',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 3,
                        name: 'Direct Address',
                        action: 'Stop and directly address the disrespect',
                        bands: ['B', 'C', 'D', 'E']
                    },
                    {
                        step: 4,
                        name: 'Cool Down',
                        action: 'Provide time to cool down before continuing',
                        bands: ['B', 'C', 'D', 'E']
                    },
                    {
                        step: 5,
                        name: 'Relationship Repair',
                        action: 'Discussion about mutual respect and next steps',
                        bands: ['C', 'D', 'E']
                    }
                ],

                scripts: {
                    gentle: {
                        A: "I can see you're frustrated. Let's take a breath together.",
                        B: "That sigh tells me something's bothering you. Want to share?",
                        C: "I hear frustration in your voice. What's going on?",
                        D: "That came across pretty harshly. Can we reset?",
                        E: "I sense some tension. Let's address it before we continue."
                    },
                    neutral: {
                        A: "That tone isn't kind. Let's try again nicely.",
                        B: "That response was disrespectful. Try again.",
                        C: "That wasn't appropriate. I need respectful communication.",
                        D: "That tone isn't acceptable in our sessions.",
                        E: "We need to maintain professional communication."
                    },
                    firm: {
                        A: "We don't speak like that. Take a breath and try again.",
                        B: "That's disrespectful. We're pausing until you can be kind.",
                        C: "I won't continue with that tone. This is your reset moment.",
                        D: "We can't work together if there's disrespect. Choose: reset or end.",
                        E: "This crosses a line. We need to resolve this before continuing."
                    }
                },

                restorative: {
                    type: 'conversation',
                    prompt: "What's really frustrating you right now? How can we work through it together?"
                },

                consequences: {
                    allowed: ['cool_down', 'relationship_repair', 'parent_contact'],
                    notAllowed: ['humiliation', 'public_shaming']
                }
            },

            NON_COMPLIANCE: {
                label: 'Non-Compliance',
                shortLabel: 'Refusal',
                icon: '🚫',
                keyboardShortcut: '4',
                description: 'Refusing to start, ignoring instructions, work avoidance',

                ladder: [
                    {
                        step: 1,
                        name: 'Repeat with Wait Time',
                        action: 'Calmly repeat instruction, provide processing time',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 2,
                        name: 'Choice Offering',
                        action: 'Offer two acceptable paths forward',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 3,
                        name: 'Explore Barrier',
                        action: 'Gently explore what is blocking compliance',
                        bands: ['B', 'C', 'D', 'E']
                    },
                    {
                        step: 4,
                        name: 'Modify Task',
                        action: 'Adjust difficulty or format of task',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 5,
                        name: 'Session Pause',
                        action: 'Pause session to discuss expectations',
                        bands: ['C', 'D', 'E']
                    }
                ],

                scripts: {
                    gentle: {
                        A: "Let's try this together. I'll start, you follow.",
                        B: "This feels hard, huh? What if we break it into tiny pieces?",
                        C: "I get that you don't want to. What would make this easier?",
                        D: "You're resisting. Let's figure out why together.",
                        E: "What's the barrier here? Help me understand."
                    },
                    neutral: {
                        A: "We start in 3, 2, 1... let's go.",
                        B: "The choice is: this version or the easier version. Pick one.",
                        C: "I need an attempt. Even a small one. Show me you're trying.",
                        D: "We can't skip this. What's your first step?",
                        E: "This is required. How do you want to approach it?"
                    },
                    firm: {
                        A: "We need to do this. Let's count together and start.",
                        B: "Not doing the work isn't an option. Choose how, not whether.",
                        C: "This is your second chance. Start now or we discuss with your parent.",
                        D: "We're at an impasse. Let's pause and talk about what's happening.",
                        E: "Refusal isn't sustainable. We need to address this directly."
                    }
                },

                restorative: {
                    type: 'problem_solving',
                    prompt: 'What would need to change for you to engage with this task?'
                },

                consequences: {
                    allowed: ['task_modification', 'parent_contact', 'session_pause'],
                    notAllowed: ['humiliation', 'threats']
                }
            },

            TECH_MISUSE: {
                label: 'Device Misuse',
                shortLabel: 'Device',
                icon: '📱',
                keyboardShortcut: '5',
                description: 'Using phone, off-task apps, games during session',

                ladder: [
                    {
                        step: 1,
                        name: 'Device Check',
                        action: 'Request device to be placed in designated spot',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 2,
                        name: 'Verbal Warning',
                        action: 'Remind about session tech rules',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 3,
                        name: 'Device Away',
                        action: 'Device must be placed out of sight/reach',
                        bands: ['B', 'C', 'D', 'E']
                    },
                    {
                        step: 4,
                        name: 'Parent Notification',
                        action: 'Brief note to parent about device use',
                        bands: ['B', 'C', 'D', 'E']
                    },
                    {
                        step: 5,
                        name: 'Tech Ban',
                        action: 'All non-essential tech removed for remainder',
                        bands: ['C', 'D', 'E']
                    }
                ],

                scripts: {
                    gentle: {
                        A: "Let's put the tablet away for now. Work first, play later.",
                        B: "Phone goes face-down, remember? Then we can focus.",
                        C: "I saw that. Device down. We've got 20 minutes left.",
                        D: "Hey, we talked about this. Phone away.",
                        E: "Let's keep tech for study tools only right now."
                    },
                    neutral: {
                        A: "Device down. Now.",
                        B: "This is your warning. Phone away or I hold it.",
                        C: "Device off my table, please. Second warning.",
                        D: "Phone goes to me for the rest of the session.",
                        E: "No more devices except what we need for the work."
                    },
                    firm: {
                        A: "Give me the tablet. You'll get it back after.",
                        B: "That's three times. I'm taking the phone until pickup.",
                        C: "I'll be messaging your parent about the device issue today.",
                        D: "We're losing too much time to this. Device comes to me.",
                        E: "This pattern needs to stop. We'll discuss with your parents."
                    }
                },

                restorative: {
                    type: 'agreement',
                    prompt: "Let's create a device agreement for our sessions. What's fair?"
                },

                consequences: {
                    allowed: ['device_removal', 'parent_contact'],
                    notAllowed: ['confiscation_beyond_session']
                }
            },

            ACADEMIC_INTEGRITY: {
                label: 'Academic Integrity',
                shortLabel: 'Integrity',
                icon: '📝',
                keyboardShortcut: '6',
                description: 'Copying, AI misuse, hiding work, deception about completion',

                ladder: [
                    {
                        step: 1,
                        name: 'Clarify Expectations',
                        action: 'Explain what constitutes own work vs. help',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 2,
                        name: 'Redo Opportunity',
                        action: 'Provide chance to redo work authentically',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 3,
                        name: 'Direct Discussion',
                        action: 'Discuss why integrity matters',
                        bands: ['B', 'C', 'D', 'E']
                    },
                    {
                        step: 4,
                        name: 'Scaffolded Redo',
                        action: 'Work through problem together to ensure understanding',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 5,
                        name: 'Parent Conference',
                        action: 'Formal discussion with parent about integrity',
                        bands: ['C', 'D', 'E']
                    }
                ],

                scripts: {
                    gentle: {
                        A: "Did you do this yourself? It's okay to ask for help!",
                        B: "This looks really different from your usual work. Tell me about it.",
                        C: "I'm noticing this doesn't match how you normally explain things.",
                        D: "Let's talk through how you got this answer.",
                        E: "Walk me through your thinking on this problem."
                    },
                    neutral: {
                        A: "Let's do this one together so I can see your thinking.",
                        B: "This needs to be redone. I'll help, but you do the work.",
                        C: "I need to see your process, not just the final answer.",
                        D: "This doesn't demonstrate your understanding. Try again.",
                        E: "I'm concerned this isn't your work. Let's discuss."
                    },
                    firm: {
                        A: "This isn't your work. We're going to do it again together.",
                        B: "Copying isn't allowed. This whole section needs to be redone.",
                        C: "This is a serious integrity issue. We need to address it now.",
                        D: "We can't continue until we discuss what happened here.",
                        E: "I have to be honest with you and your parents about this."
                    }
                },

                restorative: {
                    type: 'reflection',
                    prompt: "Why is it important to show your own thinking, even when it's hard?"
                },

                consequences: {
                    allowed: ['redo_work', 'parent_contact', 'reduced_credit'],
                    notAllowed: ['public_shaming', 'permanent_record_threat']
                }
            },

            SAFETY_BOUNDARY: {
                label: 'Safety/Boundary',
                shortLabel: 'Safety',
                icon: '⚠️',
                keyboardShortcut: '7',
                description: 'Physical safety issues, inappropriate content, boundary violations',

                ladder: [
                    {
                        step: 1,
                        name: 'Immediate Stop',
                        action: 'Stop activity immediately with calm urgency',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 2,
                        name: 'Safety Correction',
                        action: 'Address specific safety concern',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 3,
                        name: 'Session Pause',
                        action: 'Pause session to ensure safety is established',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 4,
                        name: 'Immediate Parent Contact',
                        action: 'Contact parent/guardian immediately',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 5,
                        name: 'Session Termination',
                        action: 'End session with documentation',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    }
                ],

                scripts: {
                    gentle: {
                        A: "Stop. Let's be safe. We don't do that.",
                        B: "Hold up. That's not safe. Let me show you the right way.",
                        C: "We need to pause. This isn't safe or appropriate.",
                        D: "Stop what you're doing. This is a safety issue.",
                        E: "We need to stop and address what just happened."
                    },
                    neutral: {
                        A: "That's dangerous. Stop now.",
                        B: "That's not okay. We're stopping this activity.",
                        C: "This is a boundary issue. We pause until it's addressed.",
                        D: "This behavior needs to stop immediately.",
                        E: "This crosses a line. We need to discuss before continuing."
                    },
                    firm: {
                        A: "No. That hurts. We're done with this until it's safe.",
                        B: "That's not acceptable. I'm contacting your parent now.",
                        C: "Session is paused. We need to involve your parent.",
                        D: "This is serious. The session is ending early.",
                        E: "We cannot continue today. This will be documented."
                    }
                },

                restorative: {
                    type: 'safety_plan',
                    prompt: "Let's create a plan so everyone stays safe. What do you need?"
                },

                consequences: {
                    allowed: ['session_pause', 'session_end', 'parent_contact', 'safety_plan'],
                    notAllowed: ['physical_restraint', 'isolation']
                }
            },

            OTHER: {
                label: 'Other',
                shortLabel: 'Other',
                icon: '❓',
                keyboardShortcut: '0',
                description: 'Behavior not fitting other categories',

                ladder: [
                    {
                        step: 1,
                        name: 'Observation',
                        action: 'Observe and note the behavior',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 2,
                        name: 'Gentle Inquiry',
                        action: 'Ask about the behavior curiously',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 3,
                        name: 'Set Expectation',
                        action: 'Clarify expected behavior going forward',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 4,
                        name: 'Follow Up',
                        action: 'Check in and redirect as needed',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    },
                    {
                        step: 5,
                        name: 'Documentation',
                        action: 'Document for pattern tracking',
                        bands: ['A', 'B', 'C', 'D', 'E']
                    }
                ],

                scripts: {
                    gentle: {
                        A: "I noticed something different. What's going on?",
                        B: "That was interesting. Tell me about it.",
                        C: "I want to understand what just happened.",
                        D: "Help me understand what you were going for there.",
                        E: "That was unexpected. What's your thinking?"
                    },
                    neutral: {
                        A: "Let's focus on our work now.",
                        B: "That's not what we do during sessions.",
                        C: "That doesn't fit our session expectations.",
                        D: "Let's redirect to what we're supposed to be doing.",
                        E: "We should get back on track."
                    },
                    firm: {
                        A: "We don't do that here. Let's get back to work.",
                        B: "That needs to stop. Focus here.",
                        C: "This is distracting from our goals. Stop and refocus.",
                        D: "We're off course. This isn't productive.",
                        E: "We need to address this pattern."
                    }
                },

                restorative: {
                    type: 'conversation',
                    prompt: 'What was happening for you in that moment?'
                },

                consequences: {
                    allowed: ['redirect', 'documentation'],
                    notAllowed: []
                }
            }
        },

        // Universal rules (display-friendly)
        universalRules: [
            {
                icon: '👂',
                rule: 'Listen and Wait',
                simplifiedA: 'Wait for your turn to talk',
                simplified: 'Listen when the tutor is speaking',
                full: 'Listen actively when the tutor is speaking; wait for your turn to share'
            },
            {
                icon: '🎯',
                rule: 'Stay Focused',
                simplifiedA: 'Eyes on your work',
                simplified: 'Keep your attention on the task',
                full: 'Maintain focus on the current task; avoid unrelated activities'
            },
            {
                icon: '🤝',
                rule: 'Be Respectful',
                simplifiedA: 'Use kind words',
                simplified: 'Speak respectfully to everyone',
                full: 'Communicate respectfully; disagree without being disagreeable'
            },
            {
                icon: '💪',
                rule: 'Try Your Best',
                simplifiedA: 'Try even when it\'s hard!',
                simplified: 'Give honest effort on all tasks',
                full: 'Put forth genuine effort; ask for help when stuck'
            },
            {
                icon: '📵',
                rule: 'Devices Down',
                simplifiedA: 'No playing on phones/tablets',
                simplified: 'Use devices only for learning',
                full: 'Personal devices are only for session-related use unless otherwise permitted'
            },
            {
                icon: '✋',
                rule: 'Follow Instructions',
                simplifiedA: 'Do what the tutor asks',
                simplified: 'Follow directions the first time',
                full: 'Follow instructions promptly; ask questions if unclear'
            }
        ],

        // De-escalation options
        deescalation: {
            resetBreak: {
                label: 'Reset Break',
                options: [60, 120, 180],
                description: 'Short break to reset and return fresh'
            },
            reduceDifficulty: {
                label: 'Reduce Difficulty',
                description: 'Step back to an easier level'
            },
            guidedPractice: {
                label: 'Switch to Guided Practice',
                description: 'Work through problems together instead of independently'
            },
            activitySwitch: {
                label: 'Activity Switch',
                description: 'Change to a different type of task'
            },
            choiceOffering: {
                label: 'Choice Offering',
                script: 'You can choose: [Option A] or [Option B]. Which works better for you?'
            }
        }
    },

    /**
     * Get the current config (from DB or default)
     * @returns {Object} Methodology config
     */
    async getConfig() {
        const customConfig = await DB.getMethodologyConfig();
        if (!customConfig) {
            return this.defaultConfig;
        }
        // Always use the latest severityLevels from defaultConfig (code-defined, not user-customizable)
        // This ensures new severity levels (like Level 5) are always available
        return {
            ...customConfig,
            severityLevels: this.defaultConfig.severityLevels
        };
    },

    /**
     * Save custom config
     * @param {Object} config - Config to save
     */
    async saveConfig(config) {
        config.lastUpdated = Date.now();
        await DB.saveMethodologyConfig(config);
    },

    /**
     * Reset to default config
     */
    async resetToDefault() {
        await DB.saveMethodologyConfig(null);
    },

    /**
     * Get category info
     * @param {string} categoryKey - Category key
     * @returns {Object} Category info
     */
    getCategory(categoryKey) {
        return this.defaultConfig.categories[categoryKey] || null;
    },

    /**
     * Get all category keys
     * @returns {Array} Category keys
     */
    getCategoryKeys() {
        return Object.keys(this.defaultConfig.categories);
    },

    /**
     * Get category display info for quick buttons
     * @returns {Array} Array of {key, label, icon, shortcut}
     */
    getCategoryButtons() {
        const cats = this.defaultConfig.categories;
        return Object.keys(cats).map(key => ({
            key,
            label: cats[key].shortLabel,
            fullLabel: cats[key].label,
            icon: cats[key].icon,
            shortcut: cats[key].keyboardShortcut
        }));
    },

    /**
     * Get ladder step for a category and state
     * @param {string} category - Category key
     * @param {number} incidentCount - Number of incidents in this category
     * @param {string} band - Grade band (A-E)
     * @returns {Object} Ladder step info
     */
    getLadderStep(category, incidentCount, band) {
        const cat = this.getCategory(category);
        if (!cat || !cat.ladder) return null;

        // Find the appropriate step based on incident count
        // Generally: step = min(incidentCount + 1, maxLadderStep for band)
        const bandConfig = this.defaultConfig.gradeBands[band];
        const maxStep = bandConfig ? bandConfig.maxLadderStep : 5;

        const stepNum = Math.min(incidentCount + 1, maxStep);

        // Find the ladder step that matches
        const step = cat.ladder.find(s => s.step === stepNum && s.bands.includes(band));

        return step || cat.ladder[0];
    },

    /**
     * Get script for a category, band, and tone
     * @param {string} category - Category key
     * @param {string} band - Grade band
     * @param {string} tone - Tone: gentle, neutral, firm
     * @returns {string} Script text
     */
    getScript(category, band, tone = 'neutral') {
        const cat = this.getCategory(category);
        if (!cat || !cat.scripts || !cat.scripts[tone]) return '';
        return cat.scripts[tone][band] || cat.scripts[tone].C || '';
    },

    /**
     * Get deterministic recommendation (no AI)
     * @param {Object} incident - Incident data
     * @param {Object} disciplineState - Current discipline counters
     * @param {string} band - Grade band
     * @returns {Object} Recommendation
     */
    getDeterministicRecommendation(incident, disciplineState, band) {
        const cat = this.getCategory(incident.category);
        if (!cat) {
            return { error: 'Unknown category' };
        }

        const incidentCount = disciplineState[incident.category] || 0;
        const step = this.getLadderStep(incident.category, incidentCount, band);
        const severity = incident.severity || 1;

        // Get scripts
        const scripts = {
            gentle: this.getScript(incident.category, band, 'gentle'),
            neutral: this.getScript(incident.category, band, 'neutral'),
            firm: this.getScript(incident.category, band, 'firm')
        };

        // Determine recommended tone based on severity and count
        let recommendedTone = 'gentle';
        if (severity >= 3 || incidentCount >= 3) {
            recommendedTone = 'firm';
        } else if (severity >= 2 || incidentCount >= 2) {
            recommendedTone = 'neutral';
        }

        return {
            category: incident.category,
            severity: severity,
            ladderStep: step,
            scripts: scripts,
            recommendedTone: recommendedTone,
            immediateAction: step ? step.action : 'Observe and address',
            restorative: cat.restorative,
            allowedConsequences: cat.consequences.allowed,
            source: 'deterministic'
        };
    },

    /**
     * Check if parent contact threshold is reached
     * @param {Object} disciplineState - Current counters
     * @param {string} band - Grade band
     * @returns {boolean}
     */
    shouldContactParent(disciplineState, band) {
        const bandConfig = this.defaultConfig.gradeBands[band];
        if (!bandConfig) return false;

        const threshold = bandConfig.parentContactThreshold;
        const totalIncidents = Object.values(disciplineState).reduce((a, b) => a + b, 0);

        return totalIncidents >= threshold;
    },

    /**
     * Check if session should be stopped
     * @param {Object} disciplineState - Current counters
     * @param {string} band - Grade band
     * @param {number} severity - Current incident severity
     * @returns {boolean}
     */
    shouldStopSession(disciplineState, band, severity) {
        // Always stop for severity 4
        if (severity >= 4) return true;

        const bandConfig = this.defaultConfig.gradeBands[band];
        if (!bandConfig) return false;

        // Check safety incidents
        if (disciplineState.SAFETY_BOUNDARY >= 2) return true;

        // Check total incidents vs threshold
        const totalIncidents = Object.values(disciplineState).reduce((a, b) => a + b, 0);
        return totalIncidents >= bandConfig.sessionStopThreshold * 2;
    },

    /**
     * Get universal rules for display
     * @param {string} band - Grade band for simplified wording
     * @returns {Array} Rules array
     */
    getRules(band = 'C') {
        return this.defaultConfig.universalRules.map(r => ({
            icon: r.icon,
            rule: r.rule,
            description: band === 'A' ? r.simplifiedA : (band === 'B' ? r.simplified : r.full)
        }));
    },

    /**
     * Get severity info
     * @param {number} level - Severity level (1-4)
     * @returns {Object} Severity info
     */
    getSeverity(level) {
        return this.defaultConfig.severityLevels[level] || this.defaultConfig.severityLevels[1];
    }
};

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Methodology;
}

// Attach to window for browser global access
if (typeof window !== 'undefined') {
    window.Methodology = Methodology;
}
